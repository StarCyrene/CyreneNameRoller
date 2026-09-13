export const PLUGIN_PRINCIPAL_KINDS = Object.freeze(['worker', 'page', 'visual', 'native-view', 'command'])

function principalError(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

function readonlySet(values) {
  const set = new Set(values)
  return Object.freeze({
    get size() { return set.size },
    has: value => set.has(value),
    entries: () => set.entries(),
    keys: () => set.keys(),
    values: () => set.values(),
    forEach: callback => set.forEach(value => callback(value, value)),
    [Symbol.iterator]: () => set[Symbol.iterator]()
  })
}

export function createPluginPrincipal({ pluginId, instanceId, kind, contributionId, grants = [], platform, legacyPrincipal = false }) {
  const normalizedPluginId = String(pluginId || '')
  const normalizedInstanceId = String(instanceId || '')
  const normalizedContributionId = String(contributionId || '')
  if (!normalizedPluginId || !normalizedInstanceId || !normalizedContributionId || !PLUGIN_PRINCIPAL_KINDS.includes(kind)) {
    throw principalError('PLUGIN_INSTANCE_REVOKED', '插件实例身份无效')
  }
  const principal = {
    pluginId: normalizedPluginId,
    instanceId: normalizedInstanceId,
    kind,
    contributionId: normalizedContributionId,
    grants: readonlySet([...grants].map(String)),
    platform: platform === 'tauri' ? 'tauri' : 'web',
    legacyPrincipal: legacyPrincipal === true,
    active: true
  }
  return principal
}

export function createLegacyPrincipal(plugin, platform = 'web') {
  return createPluginPrincipal({
    pluginId: plugin?.manifest?.id,
    instanceId: `legacy:${plugin?.manifest?.id || 'unknown'}`,
    kind: 'worker',
    contributionId: 'legacy',
    grants: (plugin?.manifest?.permissions || []).map(permission => typeof permission === 'string' ? permission : permission?.id).filter(Boolean),
    platform,
    legacyPrincipal: true
  })
}

export function describePrincipal(principal) {
  if (!principal) return null
  return Object.freeze({
    pluginId: principal.pluginId,
    instanceId: principal.instanceId,
    kind: principal.kind,
    contributionId: principal.contributionId,
    grants: Object.freeze([...principal.grants]),
    platform: principal.platform,
    legacyPrincipal: principal.legacyPrincipal === true
  })
}

export function assertActivePrincipal(principal) {
  if (!principal || principal.active !== true) throw principalError('PLUGIN_INSTANCE_REVOKED', '插件实例已撤销')
  return principal
}

export function revokePrincipal(principal) {
  if (!principal) return false
  principal.active = false
  try { principal.port?.close?.() } catch {}
  return true
}

export function hasPrincipalPermission(principal, permission) {
  return !permission || principal?.grants?.has(permission)
}
