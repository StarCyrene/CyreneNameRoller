const SAFE_MODE_STORAGE_KEY = 'cyrene.host.safe-mode.last-known.v1'

function frozenStatus(value) {
  return Object.freeze({
    enabled: value.enabled === true,
    source: value.source || 'default',
    stale: value.stale === true,
    errorCode: value.errorCode || '',
    diagnostic: value.diagnostic || '',
    path: value.path || '',
    loadedAt: Number.isFinite(value.loadedAt) ? value.loadedAt : 0
  })
}

export function parseSafeModeConfig(raw, path = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.enable !== 'boolean') {
    return frozenStatus({ enabled: true, source: 'invalid', errorCode: 'SAFE_MODE_CONFIG_INVALID', diagnostic: 'safemode.json 必须包含布尔值 enable', path, loadedAt: Date.now() })
  }
  if (raw.schemaVersion !== undefined && (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1)) {
    return frozenStatus({ enabled: true, source: 'invalid', errorCode: 'SAFE_MODE_CONFIG_INVALID', diagnostic: 'safemode.json 的 schemaVersion 必须是正整数', path, loadedAt: Date.now() })
  }
  const unknown = Object.keys(raw).filter(key => key !== 'enable' && key !== 'schemaVersion')
  return frozenStatus({
    enabled: raw.enable,
    source: 'file',
    diagnostic: unknown.length ? `safemode.json 已忽略未知字段：${unknown.join(', ')}` : '',
    path,
    loadedAt: Date.now()
  })
}

function readHistory(storage, path) {
  try {
    const value = JSON.parse(storage?.getItem(SAFE_MODE_STORAGE_KEY) || '')
    return value?.version === 1 && value.path === path && typeof value.enabled === 'boolean' ? value : null
  } catch { return null }
}

function writeHistory(storage, status) {
  try { storage?.setItem(SAFE_MODE_STORAGE_KEY, JSON.stringify({ version: 1, enabled: status.enabled, path: status.path, loadedAt: status.loadedAt })) } catch {}
}

export async function loadSafeModeStatus({ platform = 'web', fetchImpl = globalThis.fetch, storage = globalThis.localStorage, baseUrl = './', tauriStatus = null } = {}) {
  const path = platform === 'tauri' ? '<appConfigDir>/safemode.json' : new URL('safemode.json', new URL(baseUrl || './', globalThis.location?.href || 'http://localhost/')).href
  if (platform === 'tauri' && typeof tauriStatus === 'function') {
    try {
      const status = await tauriStatus()
      if (status && typeof status.enabled === 'boolean') return frozenStatus({ ...status, path: status.path || path })
    } catch {}
  }
  try {
    const response = await fetchImpl(path, { cache: 'no-store' })
    if (response?.status === 404) return frozenStatus({ enabled: false, source: 'missing', path, loadedAt: Date.now() })
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`)
    let raw
    try {
      raw = await response.json()
    } catch {
      return parseSafeModeConfig(null, path)
    }
    const status = parseSafeModeConfig(raw, path)
    if (status.source === 'invalid') return status
    writeHistory(storage, status)
    return status
  } catch (error) {
    const history = readHistory(storage, path)
    if (history) return frozenStatus({ ...history, source: 'stale', stale: true, errorCode: 'SAFE_MODE_CONFIG_UNAVAILABLE', diagnostic: `safemode.json 不可访问：${error.message || error}`, path })
    return frozenStatus({ enabled: false, source: 'unavailable', stale: true, errorCode: 'SAFE_MODE_CONFIG_UNAVAILABLE', diagnostic: `safemode.json 不可访问：${error.message || error}`, path, loadedAt: Date.now() })
  }
}

export function safeModeStorageKey() { return SAFE_MODE_STORAGE_KEY }
