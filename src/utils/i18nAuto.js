import { isExtraLanguage } from './settingsLocale.mjs'
import { installDomTranslation, registerUiAttributes, resetDomTranslation, UI_ATTRIBUTES } from './i18nDom.mjs'
import { createTranslationCache } from './i18nCache'
import { createPersistentTranslationCacheStorage } from './i18nCacheStorage'

const SOURCE_LANGUAGES = {
  zh: 'chinese_simplified',
  en: 'english'
}

// Pinned SHA-256 of public/vendor/translate.min.js (v4.1.3.20261111).
// Update both the file and this hash together; a mismatch refuses to execute.
const TRANSLATE_LIB_VERSION = '4.1.3.20261111'
const TRANSLATE_LIB_SHA256 = '29DCBE02EADFDAE5E0F5DAA73CCD4AD2F8A3993E1B3FE5A309588A72D2B6F514'

const REFRESH_DELAY = 220
const PREFETCH_BATCH_SIZE = 120
const PREFETCH_DELAY = 180
const PREFETCH_START_DELAY = 1600
const PREFETCH_BATCH_TIMEOUT = 15000

let libraryPromise = null
let catalogPromise = null
let activeRuntime = null

function translateLibraryUrl() {
  return new URL(`vendor/translate.min.js?v=${TRANSLATE_LIB_VERSION}`, document.baseURI).href
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function injectScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.cyreneTranslate = '1'
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      reject(new Error('translate.js could not be executed'))
    }
    document.head.appendChild(script)
  })
}

export function loadTranslateLibrary() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('translate.js requires a browser DOM'))
  }
  if (window.translate) return Promise.resolve(window.translate)
  if (libraryPromise) return libraryPromise

  libraryPromise = (async () => {
    const response = await fetch(translateLibraryUrl(), { cache: 'force-cache' })
    if (!response.ok) throw new Error(`translate.js fetch failed: ${response.status}`)
    const bytes = await response.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    if (bytesToHex(digest) !== TRANSLATE_LIB_SHA256) {
      throw new Error('translate.js integrity check failed')
    }
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }))
    try {
      await injectScript(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
    if (!window.translate) throw new Error('translate.js loaded without exposing window.translate')
    return window.translate
  })().catch(error => {
    libraryPromise = null
    throw error
  })
  return libraryPromise
}

function installCacheBridge(translate, cache) {
  translate.storage.get = key => cache.get(key)
  translate.storage.set = (key, value) => cache.set(key, value)
}

function installHashNormalization(translate) {
  if (translate.__cyreneHashNormalized) return
  const originalHash = translate.util?.hash
  if (typeof originalHash !== 'function') return
  // Vue text nodes often carry a leading/trailing space (e.g. after an icon).
  // The prefetch host and the real page must produce the same cache key.
  translate.util.hash = value => originalHash(String(value ?? '').trim())
  translate.__cyreneHashNormalized = true
}

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = import('virtual:cyrene-i18n-catalog')
      .then(module => Array.isArray(module.default) ? module.default : [])
      .catch(error => {
        console.warn('[i18n] catalog unavailable:', error)
        return []
      })
  }
  return catalogPromise
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeFrom(array, fn) {
  const index = array?.indexOf(fn) ?? -1
  if (index >= 0) array.splice(index, 1)
}

function createPrefetchHost(texts) {
  const host = document.createElement('div')
  host.setAttribute('data-cyrene-i18n-prefetch', '')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;overflow:hidden;pointer-events:none;'
  for (const text of texts) {
    const line = document.createElement('p')
    line.textContent = text
    host.appendChild(line)
  }
  document.body.appendChild(host)
  return host
}

function executePrefetchBatch(translate, host) {
  const terminalStates = new Set([2, 3, 5, 16, 18, 21, 25])
  return new Promise(resolve => {
    let uuid = null
    let settled = false
    let failed = false
    const onStart = (id, _to) => { if (uuid == null) uuid = id }
    const onFinally = data => {
      if (uuid == null || data?.uuid !== uuid || !terminalStates.has(data.state)) return
      if (data.state === 21) failed = true
      finish()
    }
    function cleanup() {
      clearTimeout(timer)
      removeFrom(translate.lifecycle.execute.start, onStart)
      removeFrom(translate.lifecycle.execute.finally, onFinally)
    }
    function finish() {
      if (settled) return
      settled = true
      cleanup()
      resolve({ ok: !failed })
    }
    const timer = setTimeout(() => {
      failed = true
      finish()
    }, PREFETCH_BATCH_TIMEOUT)
    translate.lifecycle.execute.start.push(onStart)
    translate.lifecycle.execute.finally.push(onFinally)
    try {
      translate.execute([host])
    } catch (error) {
      console.warn('[i18n] prefetch batch failed:', error)
      failed = true
      finish()
    }
  })
}

async function prefetchCatalog(translate, target, source, isCurrent, flushCache) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const catalog = await loadCatalog()
  if (!catalog.length || !isCurrent()) return

  // The catalogue contains both interface languages. Only feed the one that is
  // currently rendered; the other half would be pointless network traffic.
  const cjk = /[\u3400-\u9fff]/
  const sourceCatalog = source === 'english'
    ? catalog.filter(text => !cjk.test(text))
    : catalog.filter(text => cjk.test(text))

  const pending = sourceCatalog.filter(text => {
    const key = `hash_${target}_${translate.util.hash(text)}`
    return !translate.storage.get(key)
  })
  if (!pending.length) return

  let failures = 0
  for (let index = 0; index < pending.length; index += PREFETCH_BATCH_SIZE) {
    if (!isCurrent()) return
    const host = createPrefetchHost(pending.slice(index, index + PREFETCH_BATCH_SIZE))
    let result = { ok: true }
    try {
      // Use the library's own DOM scan so sentence segmentation and cache keys
      // match what real pages will look up later.
      result = await executePrefetchBatch(translate, host)
    } finally {
      host.remove()
    }
    if (!result.ok) {
      failures += 1
      if (failures >= 2) return
    } else {
      failures = 0
    }
    await flushCache?.()
    await wait(PREFETCH_DELAY)
  }
}

function restoreDefaultStorage(translate) {
  const fallback = translate.storage?.browser?.storage
  if (fallback && typeof fallback.get === 'function' && typeof fallback.set === 'function') {
    translate.storage.get = key => fallback.get(key)
    translate.storage.set = (key, value) => fallback.set(key, value)
  }
}

export async function clearTranslationCache(target) {
  if (!isExtraLanguage(target)) return false
  if (activeRuntime && activeRuntime.target === target) {
    const cleared = await activeRuntime.clear()
    if (cleared) return true
  }
  const cache = createTranslationCache({
    target,
    storage: createPersistentTranslationCacheStorage(target)
  })
  return cache.clear()
}

export function createAutoTranslateRuntime({ onError } = {}) {
  let translate = null
  let cache = null
  let target = ''
  let source = ''
  let refreshTimer = null
  let attributesObserver = null
  let active = false
  let generation = 0

  function reportError(error) {
    console.warn('[i18n] extra language failed:', error)
    try { onError?.(error) } catch {}
  }

  async function loadCache(targetLanguage) {
    const instance = createTranslationCache({
      target: targetLanguage,
      storage: createPersistentTranslationCacheStorage(targetLanguage)
    })
    const result = await instance.load()
    return { instance, ...result }
  }

  async function start(nextTarget, nextSource, token) {
    const lib = await loadTranslateLibrary()
    const loaded = await loadCache(nextTarget)
    if (token !== generation) {
      await loaded.instance.close()
      return
    }

    translate = lib
    cache = loaded.instance
    target = nextTarget
    source = nextSource
    installCacheBridge(translate, cache)
    installHashNormalization(translate)
    installDomTranslation(translate)
    translate.selectLanguageTag.show = false
    document.getElementById('translateSelectLanguage')?.remove()
    // Keep the only remote call the actual Edge translation request.
    translate.request.api.init = ''
    translate.request.api.connectTest = ''
    translate.service.use('client.edge')
    translate.language.setLocal(source)
    translate.to = target
    registerUiAttributes(translate, document.body)
    // Attribute support must be registered before translate.js sees a new
    // Vue/teleported subtree. Observe only injected tags and presentation attrs.
    attributesObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") registerUiAttributes(lib, record.target)
        else for (const node of record.addedNodes) registerUiAttributes(lib, node)
      }
    })
    attributesObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: UI_ATTRIBUTES })
    translate.listener.start()
    translate.execute()
    active = true

    const startedTranslate = translate
    const startedTarget = target
    const startedSource = source
    const startedCache = cache
    setTimeout(() => {
      if (token !== generation || !active) return
      void prefetchCatalog(
        startedTranslate,
        startedTarget,
        startedSource,
        () => token === generation && active,
        () => startedCache?.flush()
      )
    }, PREFETCH_START_DELAY)
  }

  async function stop() {
    attributesObserver?.disconnect()
    attributesObserver = null
    if (refreshTimer != null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    const hadTranslate = translate
    const hadCache = cache
    active = false
    target = ''
    source = ''
    translate = null
    cache = null
    try {
      if (hadTranslate) {
        resetDomTranslation(hadTranslate)
        document.getElementById('translateSelectLanguage')?.remove()
        restoreDefaultStorage(hadTranslate)
      }
    } catch (error) {
      console.warn('[i18n] reset failed:', error)
    }
    try { await hadCache?.close?.() } catch (error) { console.warn('[i18n] cache flush failed:', error) }
  }

  function refresh(delay = REFRESH_DELAY) {
    if (!active || !translate) return
    if (refreshTimer != null) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      if (!active || !translate) return
      try {
        registerUiAttributes(translate, document.body)
        translate.to = target
        translate.execute()
      } catch (error) {
        reportError(error)
      }
    }, delay)
  }

  async function clear() {
    if (!cache) return false
    // Drop the in-memory and persisted copy. The page keeps its current text;
    // strings are fetched again on the next translation pass or next launch.
    return cache.clear()
  }

  async function sync(nextTarget, nextNativeLanguage) {
    const nextSource = SOURCE_LANGUAGES[nextNativeLanguage] || SOURCE_LANGUAGES.zh
    if (active && target === nextTarget && source === nextSource) {
      refresh()
      return
    }
    const token = ++generation
    // Calling stop synchronously resets the old source before Vue paints
    // the newly selected built-in language.
    await stop()
    if (token !== generation || !isExtraLanguage(nextTarget)) return
    try {
      await start(nextTarget, nextSource, token)
    } catch (error) {
      if (token !== generation) return
      await stop()
      reportError(error)
    }
  }

  function flush() {
    void cache?.flush?.()
  }

  function dispose() {
    generation += 1
    void stop()
  }

  return {
    sync,
    refresh,
    flush,
    clear,
    dispose,
    get active() { return active },
    get target() { return target }
  }
}

export function getActiveAutoTranslateRuntime() {
  return activeRuntime
}

export function setActiveAutoTranslateRuntime(runtime) {
  activeRuntime = runtime
}
