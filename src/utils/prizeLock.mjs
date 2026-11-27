// All editors and draw transactions use the same origin-wide lock. Inventory
// continues to live in the canonical store; the fallback DB only arbitrates.
const LOCK = 'cyrene-prize-inventory-v1'
let dbPromise
const unavailable = () => Object.assign(new Error('当前浏览器无法安全保存奖池，请在支持的浏览器或桌面版中重试。 / Safe prize storage is unavailable in this browser.'), { code: 'PRIZE_LOCK_UNAVAILABLE' })

function openMutex() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCK, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('mutex')
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); dbPromise = null }; resolve(db) }
    request.onerror = () => reject(unavailable())
    request.onblocked = () => reject(unavailable())
  }).catch(() => { dbPromise = null; throw unavailable() })
  return dbPromise
}

async function withDatabaseLock(task) {
  const db = await openMutex()
  return new Promise((resolve, reject) => {
    // Readwrite transactions on one object store never overlap across tabs.
    // Keep a harmless read pending until the worker/desktop commit settles.
    let tx
    try { tx = db.transaction('mutex', 'readwrite') } catch { reject(unavailable()); return }
    const mutex = tx.objectStore('mutex')
    let started = false, settled = false, failed = false, result
    tx.onabort = () => reject(unavailable())
    tx.oncomplete = () => failed ? reject(result) : resolve(result)
    function tick() {
      const read = mutex.get(0)
      read.onsuccess = () => {
        if (!started) {
          started = true
          Promise.resolve().then(task).then(value => { result = value; settled = true }, err => { result = err; failed = true; settled = true })
        }
        if (!settled) tick()
      }
    }
    tick()
  })
}

let localQueue = Promise.resolve()
export function withPrizeLock(task) {
  if (globalThis.navigator?.locks?.request) {
    // Locks can be exposed but unavailable in a restricted browsing context.
    // Never re-execute a task that actually acquired the lock.
    let entered = false
    return navigator.locks.request(LOCK, () => { entered = true; return task() }).catch(error => {
      if (entered) throw error
      throw unavailable()
    })
  }
  if (typeof indexedDB !== 'undefined') return withDatabaseLock(task)
  // There is no second browsing context in a non-browser test runtime.
  if (typeof window === 'undefined') {
    const next = localQueue.catch(() => {}).then(task)
    localQueue = next
    return next
  }
  return Promise.reject(unavailable())
}
