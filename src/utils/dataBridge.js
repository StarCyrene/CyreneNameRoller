import { isTauri, tauriAPI } from './tauriAPI.js'
import { decryptCyreneData, encryptCyreneData } from './cyreneCrypto.js'
import { emitFileNotice } from './desktopFiles.js'

const TAURI_CORE_INPUT_KEYS = new Set(['lists', 'currentListId', 'balance', 'prizes'])

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

    // Browser fallback
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  // Password checks must distinguish an absent password from a failed read.
  async loadDataPassword() {
    const value = isTauri()
      ? await tauriAPI.invokeStrict('storage_get', { key: 'password' })
      : JSON.parse(localStorage.getItem('password'))
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

    // Browser fallback
    try {
      localStorage.setItem(key, JSON.stringify(data))
      return true
    } catch (error) {
      throw Object.assign(new Error(`Web save failed for "${key}": ${error?.message || String(error)}`), { code: 'CORE_TRANSACTION_REJECTED' })
    }
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
  async exportDataBytes() {
    if (isTauri()) {
      const encoded = await tauriAPI.exportEncryptedData()
      if (!encoded || typeof encoded !== 'string') throw new Error('未能读取程序备份 / Could not read backup')
      return base64ToBytes(encoded)
    }
    const allData = Object.create(null)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      try { allData[key] = JSON.parse(localStorage.getItem(key)) } catch {}
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
      restoreBrowserBackup(values, localStorage)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message || 'Parse error' }
    }
  }
}

function restoreBrowserBackup(values, storage) {
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
  const next = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]))
  const previous = new Map()
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    previous.set(key, storage.getItem(key))
  }
  // A full backup replaces the data set. In particular, an old backup without
  // "prizes" must remove the current snapshot so its legacy pool can migrate.
  const touched = []
  try {
    for (const key of previous.keys()) {
      if (!next.has(key)) { storage.removeItem(key); touched.push(key) }
    }
    for (const [key, raw] of next) {
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
