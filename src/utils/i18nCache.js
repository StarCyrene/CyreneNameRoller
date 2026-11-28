import { encryptCyreneData, decryptCyreneData } from './cyreneCrypto.js'

// Cache v1 contains language-recognition fragments. Do not reuse them as
// translations from the whole-fragment queue introduced in v2.
export const I18N_CACHE_VERSION = 2
export const I18N_CACHE_KEY_PREFIX = 'cyrene:i18n-cache:'
export const I18N_CACHE_SAVE_DELAY = 1500
const MAX_ENTRIES = 6000
const MAX_VALUE_LENGTH = 4000

export function i18nCacheKey(target) {
  return `${I18N_CACHE_KEY_PREFIX}${target}`
}

function isTranslationKey(key) {
  return typeof key === 'string' && key.startsWith('hash_')
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * A synchronous facade for translate.js, backed by an encrypted, persisted map.
 * translate.js requires get/set to be synchronous, so entries live in memory and
 * are encrypted + written after a short debounce.
 */
export function createTranslationCache({ target, storage }) {
  if (!target || typeof target !== 'string') throw new Error('i18n cache target is required')
  if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('i18n cache storage adapter is required')
  }

  const entries = new Map()
  let timer = null
  let dirty = false
  let closed = false
  let corrupted = false

  async function load() {
    let saved
    try {
      saved = await storage.load()
    } catch (error) {
      console.warn('[i18n-cache] load failed:', error)
      return { restored: 0, corrupted: false }
    }
    if (!saved || typeof saved !== 'object' || typeof saved.data !== 'string' || !saved.data) {
      return { restored: 0, corrupted: false }
    }

    try {
      const payload = await decryptCyreneData(base64ToBytes(saved.data))
      if (payload == null || typeof payload !== 'object') throw new Error('empty cache payload')
      if (payload.v === 1 && payload.target === target) {
        try { await storage.remove?.() } catch {}
        return { restored: 0, corrupted: false }
      }
      if (payload.v !== I18N_CACHE_VERSION || payload.target !== target) throw new Error('cache belongs to another target')
      if (payload.entries == null || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
        throw new Error('cache entries are invalid')
      }
      for (const [key, value] of Object.entries(payload.entries)) {
        if (!isTranslationKey(key)) continue
        if (typeof value !== 'string' || !value || value.length > MAX_VALUE_LENGTH) continue
        entries.set(key, value)
      }
      return { restored: entries.size, corrupted: false }
    } catch (error) {
      corrupted = true
      entries.clear()
      console.warn('[i18n-cache] encrypted cache rejected:', error?.message || error)
      // Drop the unreadable blob so the next successful translation starts clean.
      try { await storage.remove?.() } catch {}
      return { restored: 0, corrupted: true }
    }
  }

  function get(key) {
    // translate.js asks storage for "to" from language.getCurrent(). Keep the
    // active target visible without persisting control state.
    if (key === 'to') return target
    if (!isTranslationKey(key)) return null
    const value = entries.get(String(key))
    return value == null ? null : value
  }

  function set(key, value) {
    if (closed || key === 'to' || !isTranslationKey(key)) return
    const text = typeof value === 'string' ? value : String(value ?? '')
    if (!text || text.length > MAX_VALUE_LENGTH) return
    entries.set(key, text)
    if (entries.size > MAX_ENTRIES) {
      const excess = entries.size - MAX_ENTRIES
      let removed = 0
      for (const oldKey of entries.keys()) {
        if (removed++ >= excess) break
        entries.delete(oldKey)
      }
    }
    dirty = true
    scheduleSave()
  }

  function scheduleSave() {
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, I18N_CACHE_SAVE_DELAY)
  }

  async function flush() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    if (!dirty) return
    dirty = false
    try {
      const bytes = await encryptCyreneData({
        v: I18N_CACHE_VERSION,
        target,
        entries: Object.fromEntries(entries),
        savedAt: Date.now()
      })
      await storage.save({ data: bytesToBase64(bytes) })
    } catch (error) {
      dirty = true
      console.warn('[i18n-cache] save failed:', error)
    }
  }

  async function clear() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    dirty = false
    entries.clear()
    try {
      await storage.remove?.()
      return true
    } catch (error) {
      console.warn('[i18n-cache] clear failed:', error)
      return false
    }
  }

  function close() {
    closed = true
    return flush()
  }

  return {
    target,
    get,
    set,
    load,
    flush,
    clear,
    close,
    get size() { return entries.size },
    get corrupted() { return corrupted }
  }
}
