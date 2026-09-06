const OPERATIONS = new Set(['name-draw', 'card-flip', 'lottery-draw', 'prize-assignment'])
const FILTER_FIELDS = new Set(['listId', 'count', 'gender', 'allowDuplicates'])
const FAILURE_WINDOW_MS = 10 * 60 * 1000

function error(code, message) { return Object.assign(new Error(message), { code }) }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) freeze(child)
  return value
}

export class CoreHookCoordinator {
  constructor({ now = () => Date.now(), cumulativeTimeoutMs = 5000, onDisable } = {}) {
    this.now = now
    this.cumulativeTimeoutMs = cumulativeTimeoutMs
    this.hooks = []
    this.failures = new Map()
    this.audit = []
    this.onDisable = onDisable
  }

  register({ pluginId, operation, timeoutMs = 1000, loadOrder = 0, phase = 'before', invoke }) {
    if (!pluginId || !OPERATIONS.has(operation) || typeof invoke !== 'function') throw error('PLUGIN_HOOK_INVALID', 'hook declaration is invalid')
    this.hooks.push({ pluginId: String(pluginId), operation, phase, timeoutMs: Math.max(1, Math.min(1000, timeoutMs)), loadOrder, invoke })
    this.hooks.sort((a, b) => a.loadOrder - b.loadOrder || a.pluginId.localeCompare(b.pluginId))
  }

  isEnabled(pluginId) { return !this.failures.get(pluginId)?.disabled }

  unregister(pluginId) { this.hooks = this.hooks.filter(hook => hook.pluginId !== pluginId) }

  recordFailure(pluginId, kind) {
    const cutoff = this.now() - FAILURE_WINDOW_MS
    const record = this.failures.get(pluginId) || { errors: [], aborts: [], disabled: false }
    record.errors = record.errors.filter(time => time >= cutoff)
    record.aborts = record.aborts.filter(time => time >= cutoff)
    record[kind === 'abort' ? 'aborts' : 'errors'].push(this.now())
    if (record.errors.length >= 3 || record.aborts.length >= 5) {
      if (!record.disabled) this.onDisable?.(pluginId, clone(record))
      record.disabled = true
    }
    this.failures.set(pluginId, record)
  }

  async before(operation, rawContext = {}) {
    if (!OPERATIONS.has(operation)) throw error('PLUGIN_HOOK_INVALID', 'operation is invalid')
    const source = clone(rawContext)
    const filter = Object.fromEntries(Object.entries(source).filter(([key]) => FILTER_FIELDS.has(key)))
    const immutable = clone(source)
    delete immutable.listId; delete immutable.count; delete immutable.gender; delete immutable.allowDuplicates
    const audit = []
    const started = this.now()
    for (const hook of this.hooks.filter(item => item.operation === operation && item.phase === 'before' && this.isEnabled(item.pluginId))) {
      const elapsed = this.now() - started
      const remaining = this.cumulativeTimeoutMs - elapsed
      if (remaining <= 0) throw error('PLUGIN_HOOK_TIMEOUT', 'hook cumulative deadline exceeded')
      const context = { operation, filter: clone(filter), state: freeze(clone(source.state || immutable)), input: freeze(clone(source)) }
      const begun = this.now()
      let response
      try {
        response = await Promise.race([
          Promise.resolve().then(() => hook.invoke(context)),
          new Promise((_, reject) => setTimeout(() => reject(error('PLUGIN_HOOK_TIMEOUT', 'hook deadline exceeded')), Math.min(hook.timeoutMs, remaining)))
        ])
        if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).some(key => !['allow', 'reason', 'patch'].includes(key)) || typeof response.allow !== 'boolean') throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook response is invalid')
        const patch = response.patch === undefined ? {} : response.patch
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !FILTER_FIELDS.has(key))) throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook patch contains protected fields')
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'count' && (!Number.isInteger(value) || value < 1 || value > 100)) throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook count is invalid')
          if (key === 'gender' && !['all', 'male', 'female'].includes(value)) throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook gender is invalid')
          if (key === 'allowDuplicates' && typeof value !== 'boolean') throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook duplicate policy is invalid')
          if (key === 'listId' && (typeof value !== 'string' || value.length > 256)) throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'hook list is invalid')
          filter[key] = value
        }
        audit.push({ pluginId: hook.pluginId, operation, decision: response.allow ? 'allow' : 'abort', patch: clone(patch), elapsedMs: this.now() - begun })
        if (!response.allow) throw error('PLUGIN_HOOK_ABORTED', response.reason || 'operation aborted by plugin')
      } catch (cause) {
        const failure = cause.code === 'PLUGIN_HOOK_ABORTED' ? cause : error(cause.code || 'PLUGIN_HOOK_FAILED', cause.message || String(cause))
        this.recordFailure(hook.pluginId, failure.code === 'PLUGIN_HOOK_ABORTED' ? 'abort' : 'error')
        audit.push({ pluginId: hook.pluginId, operation, decision: 'reject', code: failure.code, elapsedMs: this.now() - begun })
        this.audit.push(...audit)
        throw failure
      }
    }
    this.audit.push(...audit)
    return { filter, audit: clone(audit) }
  }

  async after(operation, receipt, audit = [], metadata = {}) {
    const result = []
    const filterDiff = { original: clone(metadata.originalFilter || {}), final: clone(metadata.finalFilter || metadata.originalFilter || {}) }
    for (const hook of this.hooks.filter(item => item.operation === operation && item.phase === 'after' && this.isEnabled(item.pluginId))) {
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => hook.invoke({ operation, operationId: receipt?.operationId || '', receipt: freeze(clone(receipt)), filterDiff: freeze(clone(filterDiff)), committed: true, audit: freeze(clone(audit)) })),
          new Promise((_, reject) => setTimeout(() => reject(error('PLUGIN_HOOK_TIMEOUT', 'hook deadline exceeded')), hook.timeoutMs))
        ])
        if (response !== undefined && (!response || typeof response !== 'object' || Object.keys(response).some(key => !['allow', 'reason'].includes(key)))) throw error('PLUGIN_HOOK_INVALID_RESPONSE', 'after hook response is invalid')
        result.push({ pluginId: hook.pluginId, operation, decision: response?.allow === false ? 'abort' : 'allow' })
      } catch (cause) {
        this.recordFailure(hook.pluginId, 'error')
        result.push({ pluginId: hook.pluginId, operation, decision: 'reject', code: cause.code || 'PLUGIN_HOOK_FAILED' })
      }
    }
    this.audit.push(...result)
    return result
  }
}

export const CORE_HOOK_OPERATIONS = Object.freeze([...OPERATIONS])
export const CORE_HOOK_FILTER_FIELDS = Object.freeze([...FILTER_FIELDS])
