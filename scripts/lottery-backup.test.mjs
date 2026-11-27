import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { dataBridge } from '../src/utils/dataBridge.js'
import { encryptCyreneData } from '../src/utils/cyreneCrypto.js'
import { usePrizesStore } from '../src/stores/prizes.js'

test('file picker restores a legacy pool over a newer one, and invalid or failed imports preserve all previous bytes', async () => {
  const store = new Map([['prizes', JSON.stringify({ lists: { new: { id: 'new', name: 'Current', prizes: [] } }, currentId: 'new', records: [] })], ['custom', 'unparsed']])
  const backup = { prizeLists: { old: { id: 'old', name: 'From backup', prizes: [{ name: 'Pen', id: 'p', quantity: 5, weight: 1 }] } }, currentPrizeListId: 'old', prizeRecords: [{ id: 'r' }] }
  const bytes = await encryptCyreneData(backup)
  const original = [globalThis.localStorage, globalThis.document]
  let failKey
  globalThis.localStorage = { get length() { return store.size }, key: i => [...store.keys()][i],
    getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k),
    setItem: (k, v) => { if (k === failKey) { failKey = null; throw new Error('quota exceeded') } store.set(k, v) } }
  globalThis.document = { createElement: () => ({ click() { this.onchange({ target: { files: [{ arrayBuffer: () => bytes.buffer }] } }) } }) }
  try {
    const before = new Map(store)
    assert.equal((await dataBridge.importDataBytes(await encryptCyreneData({ prizeLists: { old: { prizes: false } } }))).success, false)
    assert.deepEqual(store, before)
    failKey = 'prizeRecords'
    assert.equal((await dataBridge.importData()).success, false)
    assert.deepEqual(store, before)
    assert.equal((await dataBridge.importData()).success, true)
    assert.equal(store.has('prizes'), false)
    assert.equal(store.has('custom'), false)
    setActivePinia(createPinia())
    const pool = usePrizesStore()
    await pool.initialize()
    assert.equal(pool.currentId, 'old')
    assert.equal(pool.totalStock, 5)
    assert.equal(pool.records[0].id, 'r')
  } finally { [globalThis.localStorage, globalThis.document] = original }
})
