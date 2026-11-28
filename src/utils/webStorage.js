/**
 * 网页端的键值存储底座：IndexedDB 为主，localStorage 只做旧数据迁移与兜底。
 *
 * localStorage 只有约 5 MB，点名记录、插件数据一大就会写爆；IndexedDB 的配额
 * 按源计算，通常是磁盘剩余空间的一个比例，足够放多年的记录与音频样本。
 * Tauri（桌面 / 手机）不走这里，仍然使用原生加密存储。
 */

const DB_NAME = 'cyrene-name-roller'
const DB_VERSION = 1
const STORE_NAME = 'kv'

let databasePromise = null
let unavailable = false

function factory() {
  return typeof indexedDB !== 'undefined' ? indexedDB : null
}

function openDatabase() {
  const idb = factory()
  if (!idb || unavailable) return Promise.resolve(null)
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
    }).catch(() => {
      unavailable = true
      return null
    })
  }
  return databasePromise
}

function run(mode, operation) {
  return openDatabase().then(database => {
    if (!database) return undefined
    return new Promise((resolve, reject) => {
      let request
      const transaction = database.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      try {
        request = operation(store)
      } catch (error) {
        reject(error)
        return
      }
      transaction.oncomplete = () => resolve(request ? request.result : undefined)
      transaction.onerror = () => reject(transaction.error || request?.error)
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
    })
  })
}

/** 读一条；不存在时返回 undefined（与「存了 null」区分开）。 */
export function idbGet(key) {
  return run('readonly', store => store.get(key))
}

/** 写一条；IndexedDB 不可用时返回 false。 */
export async function idbSet(key, value) {
  if (!factory()) return false
  try {
    // put() 成功时返回写入的键；返回 undefined 说明数据库根本没打开。
    const stored = await run('readwrite', store => store.put(value, key))
    return stored !== undefined
  } catch {
    return false
  }
}

export async function idbDelete(key) {
  if (!factory() || !await openDatabase()) return false
  try {
    await run('readwrite', store => store.delete(key))
    return true
  } catch {
    return false
  }
}

export async function idbClear() {
  if (!factory() || !await openDatabase()) return false
  try {
    await run('readwrite', store => store.clear())
    return true
  } catch {
    return false
  }
}

/** 导出全部键值；IndexedDB 不可用时返回空数组。 */
export async function idbEntries() {
  const database = await openDatabase()
  if (!database) return []
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const keysRequest = store.getAllKeys()
    const valuesRequest = store.getAll()
    transaction.oncomplete = () => {
      const keys = keysRequest.result || []
      const values = valuesRequest.result || []
      resolve(keys.map((key, index) => [key, values[index]]))
    }
    transaction.onerror = () => reject(transaction.error || keysRequest.error)
  })
}

export function isIndexedDbAvailable() {
  return Boolean(factory()) && !unavailable
}
