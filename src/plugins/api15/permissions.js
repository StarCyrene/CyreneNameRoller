const UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM'
const MAX_REDIRECTS = 3
const MAX_AUDIT_RECORDS = 1000
const MAX_AUDIT_BYTES = 1024 * 1024
const MAX_REQUEST_BODY_BYTES = 1024 * 1024

function platformMatches(platforms, platform) {
  return !Array.isArray(platforms) || !platforms.length || platforms.includes(platform.runtime) || (platform.runtime === 'tauri' && platforms.includes(platform.os))
}

function unavailable(id, platform) {
  return { id, available: false, code: UNSUPPORTED_PLATFORM, platform: platform.runtime, os: platform.os }
}

function availableOn(id, platform) {
  if (id.startsWith('window:') || id.startsWith('files:') || id === 'system:execute') return platform.runtime === 'tauri'
  return platform.runtime === 'web' || platform.runtime === 'tauri'
}

export function resolveApi15Capabilities(manifest = {}, platform = { runtime: 'web', os: 'unknown' }) {
  const capabilities = {}
  const requiredUnavailable = []
  for (const declaration of Array.isArray(manifest.permissions) ? manifest.permissions : []) {
    if (!declaration?.id) continue
    const applies = platformMatches(declaration.platforms, platform)
    const available = applies && availableOn(declaration.id, platform)
    const status = available
      ? { id: declaration.id, available: true, code: 'AVAILABLE', applies, platform: platform.runtime, os: platform.os }
      : { ...unavailable(declaration.id, platform), applies }
    capabilities[declaration.id] = status
    if (declaration.required && applies && !available) requiredUnavailable.push(status)
  }
  return { compatible: requiredUnavailable.length === 0, platform, capabilities, requiredUnavailable }
}

function pathError(code, message) { return Object.assign(new Error(message || code), { code }) }

function builtin(name) {
  return globalThis.process?.getBuiltinModule?.(name)
}

function pathTools(pathApi) {
  const api = pathApi || builtin('node:path')
  if (!api) throw pathError('PATH_RUNTIME_UNAVAILABLE')
  return api
}

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function rejectWindowsSpelling(value) {
  const input = String(value)
  if (/^(?:\\\\|\/\/|\\\?\\|\\\.\\)/.test(input) || /^[A-Za-z]:$/.test(input) || /^[A-Za-z]:[^\\/]/.test(input)) throw pathError('PATH_SPELLING_REJECTED')
  if (input.includes('~')) throw pathError('PATH_SPELLING_REJECTED')
}

function inside(candidate, root, pathApi) {
  const relative = pathApi.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

export async function canonicalizePluginPath(value, { root, scope = 'app', platform = {}, protectedRoots = [], fsApi, pathApi } = {}) {
  if (!root || !value) throw pathError('PATH_INVALID')
  if (platform.os === 'windows' || platform.runtime === 'windows') rejectWindowsSpelling(value)
  const paths = pathTools(pathApi)
  const fs = fsApi || builtin('node:fs/promises')
  if (!fs?.realpath) throw pathError('PATH_RUNTIME_UNAVAILABLE')
  const lexicalCandidate = paths.resolve(String(value))
  const lexicalProtected = protectedRoots.map(item => paths.resolve(item))
  if (lexicalProtected.some(item => lexicalCandidate === item || inside(lexicalCandidate, item, paths))) throw pathError('PROTECTED_ROOT')
  const canonicalRoot = await fs.realpath(root).catch(() => { throw pathError('PATH_ROOT_MISSING') })
  const candidate = await fs.realpath(String(value)).catch(() => { throw pathError('PATH_NOT_FOUND') })
  const canonicalProtected = await Promise.all(protectedRoots.map(item => fs.realpath(item).catch(() => paths.resolve(item))))
  if (canonicalProtected.some(item => candidate === item || inside(candidate, item, paths))) throw pathError('PROTECTED_ROOT')
  if (!inside(candidate, canonicalRoot, paths)) throw pathError('PATH_OUTSIDE_ROOT')
  return { scope, path: candidate }
}

export function validateExecutableDeclaration(command = {}, declaration = {}) {
  const declared = Array.isArray(declaration.executables) ? declaration.executables : []
  if (typeof command.path !== 'string' || !declared.includes(command.path)) return { ok: false, code: 'EXECUTABLE_NOT_DECLARED' }
  if (!Array.isArray(command.args) || command.args.some(arg => typeof arg !== 'string' || /[\0\r\n]|\$\(|`|&&|\|\||[<>]/.test(arg))) return { ok: false, code: 'EXECUTABLE_ARGUMENT_REJECTED' }
  return { ok: true, path: command.path, args: [...command.args] }
}

function privateIp(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/^0+/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return true
  if (/^(?:0x[0-9a-f]+|[0-9]+)$/.test(host)) {
    const value = /^0x/i.test(host) ? Number.parseInt(host, 16) : Number(host)
    if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) return privateIp(`${value >>> 24}.${value >>> 16 & 255}.${value >>> 8 & 255}.${value & 255}`)
  }
  const parts = host.split('.').map(part => {
    if (!/^[0-9a-f]+$/i.test(part)) return NaN
    return /^0x/i.test(part) ? Number.parseInt(part, 16) : Number(part)
  })
  if (parts.length === 4 && parts.every(Number.isInteger)) return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice(7)
    if (mapped.includes(':')) {
      const groups = mapped.split(':').map(value => Number.parseInt(value || '0', 16))
      if (groups.length === 2 && groups.every(Number.isInteger)) return privateIp(`${groups[0] >> 8}.${groups[0] & 255}.${groups[1] >> 8}.${groups[1] & 255}`)
    }
    return privateIp(mapped)
  }
  return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')
}

export function validateNetworkUrl(value, { allowPrivate = false } = {}) {
  let url
  try { url = new URL(String(value)) } catch { return { ok: false, code: 'NETWORK_URL_INVALID' } }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, code: 'NETWORK_PROTOCOL_DENIED' }
  if (!allowPrivate && privateIp(url.hostname)) return { ok: false, code: 'NETWORK_ADDRESS_DENIED' }
  return { ok: true, url: url.href, hostname: url.hostname }
}

function validateResolved(result, addresses, allowPrivate) {
  if (!result.ok || allowPrivate) return result
  if (!addresses.length || addresses.some(privateIp)) return { ok: false, code: 'NETWORK_ADDRESS_DENIED' }
  return result
}

export function validateNetworkUrlResolved(value, { allowPrivate = false, resolver } = {}) {
  const result = validateNetworkUrl(value, { allowPrivate })
  if (!result.ok) return result
  if (typeof resolver !== 'function') return { ok: false, code: 'NETWORK_RESOLUTION_UNAVAILABLE' }
  return Promise.resolve(resolver(result.hostname)).then(addresses => validateResolved(result, Array.isArray(addresses) ? addresses : [addresses], allowPrivate), () => ({ ok: false, code: 'NETWORK_RESOLUTION_FAILED' }))
}

export function requireNetworkAddressBinding(handler) {
  return handler?.addressBinding === true
    ? { ok: true }
    : { ok: false, code: 'NETWORK_ADDRESS_BINDING_UNAVAILABLE' }
}

export function followNetworkRedirect(previous, next, redirectCount = 0, options = {}) {
  const from = validateNetworkUrlResolved(previous, options)
  const to = validateNetworkUrlResolved(next, options)
  const check = (fromResult, toResult) => {
    if (!fromResult.ok) return fromResult
    if (!toResult.ok) return toResult
    if (redirectCount > MAX_REDIRECTS) return { ok: false, code: 'NETWORK_REDIRECT_LIMIT' }
    if (new URL(fromResult.url).protocol !== new URL(toResult.url).protocol) return { ok: false, code: 'NETWORK_REDIRECT_DENIED' }
    return { ok: true, url: toResult.url }
  }
  return from?.then ? Promise.all([from, to]).then(([fromResult, toResult]) => check(fromResult, toResult)) : check(from, to)
}

export class NetworkLimiter {
  constructor({ maxConcurrent = 4, timeoutMs = 15000, maxBodyBytes = 1024 * 1024 } = {}) {
    this.maxConcurrent = maxConcurrent; this.timeoutMs = timeoutMs; this.maxBodyBytes = maxBodyBytes; this.active = 0
  }
  acquire() {
    if (this.active >= this.maxConcurrent) return Promise.reject(pathError('RESOURCE_LIMIT', 'network concurrency limit exceeded'))
    this.active += 1
    let released = false
    return Promise.resolve(() => { if (!released) { released = true; this.active -= 1 } })
  }
  validateResponse({ status, bodyBytes } = {}) {
    if (!Number.isInteger(status) || status < 100 || status > 599) return { ok: false, code: 'NETWORK_RESPONSE_INVALID' }
    return bodyBytes > this.maxBodyBytes ? { ok: false, code: 'RESPONSE_SIZE_LIMIT' } : { ok: true }
  }
  async run(request, signal) {
    const release = await this.acquire()
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const task = Promise.resolve().then(() => request(controller.signal))
    try {
      let timer
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(pathError('TIMEOUT', 'network request timeout')) }, this.timeoutMs) })
      const result = await Promise.race([task, timeout])
      clearTimeout(timer)
      if (result?.status !== undefined) {
        const checked = this.validateResponse({ status: result.status, bodyBytes: result.bodyBytes ?? result.bytes })
        if (!checked.ok) throw pathError(checked.code)
      }
      return result
    } finally {
      await task.catch(() => {})
      signal?.removeEventListener('abort', abort)
      release()
    }
  }

  static validateRequest({ body = '', headers = {} } = {}) {
    if (new TextEncoder().encode(String(body)).byteLength > MAX_REQUEST_BODY_BYTES || !headers || typeof headers !== 'object' || Object.entries(headers).length > 64 || Object.entries(headers).some(([key, value]) => new TextEncoder().encode(String(key)).byteLength > 256 || new TextEncoder().encode(String(value)).byteLength > 8192)) {
      throw pathError('REQUEST_SIZE_LIMIT', 'network request exceeds limits')
    }
  }
}

export class AuditLog {
  constructor({ maxRecords = MAX_AUDIT_RECORDS, maxBytes = MAX_AUDIT_BYTES, onRecord = null } = {}) { this.maxRecords = maxRecords; this.maxBytes = maxBytes; this.onRecord = onRecord; this.records = []; this.bytes = 0 }
  append(entry = {}) {
    let resource = String(entry.resource || '')
    if (String(entry.method || '') === 'net.request') {
      try { resource = new URL(resource.includes('://') ? resource : `https://${resource}`).hostname } catch { resource = '' }
    } else resource = resource.split(/[?#]/, 1)[0].split(/[\\/]/).pop().slice(0, 128)
    const record = { time: new Date().toISOString(), correlationId: entry.correlationId || randomId(), pluginId: String(entry.pluginId || ''), instanceId: String(entry.instanceId || ''), method: String(entry.method || ''), resource, decision: String(entry.decision || ''), resultCode: String(entry.resultCode || ''), bytes: Number(entry.bytes) || 0, durationMs: Number(entry.durationMs) || 0 }
    const size = new TextEncoder().encode(JSON.stringify(record)).byteLength
    this.records.push(record); this.bytes += size
    while (this.records.length > this.maxRecords || this.bytes > this.maxBytes) this.bytes -= new TextEncoder().encode(JSON.stringify(this.records.shift())).byteLength
    this.onRecord?.(record)
    return record
  }
}

export function summarizeInstallationRisk(manifest = {}) {
  const externalRoots = Array.isArray(manifest.files?.external) ? manifest.files.external : []
  return { network: manifest.network?.internet === true, externalRoots, execute: (manifest.permissions || []).some(item => (item.id || item) === 'system:execute') }
}
