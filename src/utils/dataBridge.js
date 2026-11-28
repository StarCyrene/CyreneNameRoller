import { isTauri, tauriAPI } from './tauriAPI.js'
import { decryptCyreneData, encryptCyreneData } from './cyreneCrypto.js'
import { emitFileNotice } from './desktopFiles.js'
import { idbClear, idbDelete, idbEntries, idbGet, idbSet, isIndexedDbAvailable } from './webStorage.js'

const TAURI_CORE_INPUT_KEYS = new Set(['lists', 'currentListId', 'balance', 'prizes'])

// 扫码同步只需要「名单 / 记录 / 设置」这类轻数据。插件数据往往有好几 MB，
// 而接收端本来就有自己的插件，传过去既慢又没意义。
export const SYNC_EXCLUDED_KEYS = new Set(['pluginData', 'pluginState', 'tts-voice-sample'])

// localStorage 只作为兼容镜像（旧版本 / 测试脚本仍会读它），超过这个大小
// 就不再镜像，避免 5 MB 配额被记录或插件数据撑爆；真正的数据在 IndexedDB。
const LOCAL_MIRROR_LIMIT = 256 * 1024

function mirrorToLocal(key, data) {
  try {
    const raw = JSON.stringify(data)
    if (raw.length > LOCAL_MIRROR_LIMIT) {
      localStorage.removeItem(key)
      return { ok: false, skipped: true }
    }
    localStorage.setItem(key, raw)
    return { ok: true }
  } catch (error) {
    // 配额不足时让 IndexedDB 独自承担；两者都失败才把原因抛给调用方。
    return { ok: false, error }
  }
}

function localEntries(storage) {
  const entries = new Map()
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key != null) entries.set(key, storage.getItem(key))
  }
  return entries
}

export const dataBridge = {
  async load(key) {
    // Tauri
    if (isTauri()) {
      try {
        const val = await tauriAPI.storageGet(key)
        return val ?? null
      } catch (e) {
        console.warn(`[dataBridge] Tauri load failed for "${key}":`, e)
        return null
      }
    }

    // Browser: 小数据以 localStorage 镜像为准（同步写入，重载不会抢跑），
    // 大数据（记录/插件/语音样本超过镜像上限）只落在 IndexedDB。
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) {
        const parsed = JSON.parse(raw)
        // 顺手补一份到 IndexedDB，供容量不足或清理缓存后兜底。
        void idbSet(key, parsed)
        return parsed
      }
      const stored = await idbGet(key)
      return stored === undefined ? null : (stored ?? null)
    } catch {
      return null
    }
  },

  // Password checks must distinguish an absent password from a failed read.
  async loadDataPassword() {
    const value = isTauri()
      ? await tauriAPI.invokeStrict('storage_get', { key: 'password' })
      : await dataBridge.load('password')
    if (value == null) return null
    if (!/^[a-f0-9]{64}$/.test(value.hash)) throw new Error('数据操作密码记录无效 / Invalid password record')
    return value.hash
  },

  async save(key, data) {
    // Tauri
    if (isTauri()) {
      const result = TAURI_CORE_INPUT_KEYS.has(key)
        ? await tauriAPI.coreStateSet(key, data)
        : await tauriAPI.storageSet(key, data)
      if (result === true || result?.success === true) return result
      throw Object.assign(new Error(result?.error || `Tauri save failed for "${key}"`), { code: result?.code || 'CORE_TRANSACTION_REJECTED' })
    }

    // Browser: 小数据先同步写 localStorage，再补 IndexedDB；大数据直接走 IndexedDB。
    const mirror = mirrorToLocal(key, data)
    if (mirror.ok) {
      void idbSet(key, data)
      return true
    }
    if (await idbSet(key, data)) return true
    const reason = mirror.error?.message || '浏览器存储不可用'
    throw Object.assign(new Error(`Web save failed for "${key}": ${reason}`), { code: 'CORE_TRANSACTION_REJECTED' })
  },

  async remove(key) {
    if (isTauri()) {
      try {
        return await tauriAPI.storageDelete(key)
      } catch (e) {
        console.warn(`[dataBridge] Tauri remove failed for "${key}":`, e)
        return false
      }
    }
    await idbDelete(key)
    try {
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  },

  async clearAll() {
    if (isTauri()) {
      return tauriAPI.coreMaintenanceExecute('reset-all')
    }
    await idbClear()
    try { localStorage.clear() } catch {}
  },

  async loadNames() {
    if (isTauri()) {
      try {
        const result = await tauriAPI.loadNames()
        if (result && result.names) return result
      } catch {}
    }
    try {
      const res = await fetch('./names.json')
      return await res.json()
    } catch {
      return { names: [] }
    }
  },

  async loadChangelog() {
    if (isTauri()) {
      try {
        const result = await tauriAPI.loadChangelog()
        if (Array.isArray(result)) return result
      } catch {}
    }
    try {
      const res = await fetch('./updatelogs/up.json')
      return await res.json()
    } catch {
      try {
        const res = await fetch('./up.json')
        return await res.json()
      } catch {
        return []
      }
    }
  },

  async exportData() {
    if (isTauri()) {
      try {
        const result = await tauriAPI.exportDataFile()
        return result
      } catch (error) {
        return { success: false, error: error.message }
      }
    }

    // Browser fallback: keep the same encrypted container format.
    downloadEncryptedFile(await dataBridge.exportDataBytes())
    return { success: true }
  },

  // QR and file backups use the same .cyrene bytes, including native core state.
  // options.sync=true 时剔除插件数据与语音样本，只带名单/记录/设置。
  async exportDataBytes({ sync = false } = {}) {
    if (isTauri()) {
      const encoded = sync
        ? await tauriAPI.exportSyncData()
        : await tauriAPI.exportEncryptedData()
      if (!encoded || typeof encoded !== 'string') throw new Error('未能读取程序备份 / Could not read backup')
      return base64ToBytes(encoded)
    }
    const allData = Object.create(null)
    // 先收 localStorage 的兼容镜像，再让 IndexedDB 覆盖，保证导出的是最新值。
    try {
      for (const [key, raw] of localEntries(localStorage)) {
        if (sync && SYNC_EXCLUDED_KEYS.has(key)) continue
        try { allData[key] = JSON.parse(raw) } catch {}
      }
    } catch {}
    for (const [key, value] of await idbEntries()) {
      if (sync && SYNC_EXCLUDED_KEYS.has(key)) continue
      allData[key] = value
    }
    return encryptCyreneData(allData)
  },

  async importData() {
    if (isTauri()) {
      try {
        const result = await tauriAPI.importDataFile()
        if (result?.success && result.filePath) emitFileNotice(`程序数据已导入：${result.filePath}`, result.filePath)
        return result
      } catch (error) { return { success: false, error: error.message } }
    }
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = '.cyrene'
      input.oncancel = () => resolve({ success: false, cancelled: true })
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) { resolve({ success: false, cancelled: true }); return }
        try {
          resolve(await dataBridge.importDataBytes(await file.arrayBuffer()))
        } catch (error) { resolve({ success: false, error: error.message || 'Parse error' }) }
      }
      input.click()
    })
  },

  async importDataBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (isTauri()) {
      try {
        const success = await tauriAPI.importEncryptedData(bytesToBase64(bytes))
        return { success: !!success }
      } catch (error) {
        return { success: false, error: error.message || String(error) }
      }
    }
    try {
      const values = await decryptCyreneData(bytes)
      await restoreBrowserBackup(values)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message || 'Parse error' }
    }
  }
}

function validateBrowserBackup(values) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const listsValid = lists => object(lists) && Object.values(lists).every(list =>
    object(list) && typeof list.name === 'string' && Array.isArray(list.prizes)
      && list.prizes.every(prize => object(prize) && typeof prize.name === 'string'))
  if ('prizes' in values && !(object(values.prizes) && listsValid(values.prizes.lists) && Array.isArray(values.prizes.records))) {
    throw new Error('备份中的奖池数据无效')
  }
  if (!Object.keys(values.prizes?.lists || {}).length
    && (('prizeLists' in values && !listsValid(values.prizeLists)) || ('prizeRecords' in values && !Array.isArray(values.prizeRecords)))) {
    throw new Error('备份中的旧版奖品单或抽奖记录无效')
  }
  return new Map(Object.entries(values))
}

async function restoreBrowserBackup(values) {
  const next = validateBrowserBackup(values)
  if (!isIndexedDbAvailable()) {
    restoreLocalBackup(next, localStorage)
    return
  }
  const previousIdb = new Map(await idbEntries())
  let previousLocal
  try { previousLocal = localEntries(localStorage) } catch { previousLocal = new Map() }
  try {
    if (!await idbClear()) throw new Error('浏览器存储不可用，无法导入备份')
    for (const [key, value] of next) {
      if (!await idbSet(key, value)) throw new Error(`写入失败：${key}`)
      mirrorToLocal(key, value)
    }
    // 备份是完整替换：旧数据里不在备份中的键要清掉，避免旧奖池在迁移时复活。
    for (const key of previousLocal.keys()) {
      if (!next.has(key)) { try { localStorage.removeItem(key) } catch {} }
    }
  } catch (error) {
    await idbClear()
    for (const [key, value] of previousIdb) await idbSet(key, value)
    for (const [key, raw] of previousLocal) { try { localStorage.setItem(key, raw) } catch {} }
    throw error
  }
}

function restoreLocalBackup(next, storage) {
  const serialized = new Map([...next].map(([key, value]) => [key, JSON.stringify(value)]))
  const previous = localEntries(storage)
  // A full backup replaces the data set. In particular, an old backup without
  // "prizes" must remove the current snapshot so its legacy pool can migrate.
  const touched = []
  try {
    for (const key of previous.keys()) {
      if (!serialized.has(key)) { storage.removeItem(key); touched.push(key) }
    }
    for (const [key, raw] of serialized) {
      if (previous.get(key) === raw) continue
      storage.setItem(key, raw)
      touched.push(key)
    }
  } catch (error) {
    // Remove the partial import first; the originals already fit the quota.
    touched.forEach(key => storage.removeItem(key))
    touched.forEach(key => { if (previous.has(key)) storage.setItem(key, previous.get(key)) })
    throw error
  }
}

function downloadEncryptedFile(bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'cyrene-data.cyrene'; a.click()
  URL.revokeObjectURL(url)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
