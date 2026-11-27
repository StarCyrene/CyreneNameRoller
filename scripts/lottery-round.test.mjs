import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { usePrizesStore } from '../src/stores/prizes.js'
import { executePrizeRequest } from '../src/core/web/coreService.js'
import { prizeSegments, landingRotation, resultsWithStock, validRoundCount } from '../src/utils/lotteryRound.mjs'

const tea = { id: 'tea', name: 'Tea', weight: 3, quantity: 1, quality: 'R' }
const pass = { id: 'pass', name: 'Pass', weight: 1, quantity: 4, quality: 'SR' }
const oldList = { id: 'club', name: 'Club', prizes: [tea, pass] }

test('wheel and pool use in-stock type weights, and land on a sold-out winning segment', () => {
  const available = prizeSegments([tea, { ...pass, id: 'sold', quantity: 0 }, pass])
  assert.deepEqual(available.map(s => s.probability), [.75, .25])
  const before = 921
  const rotation = landingRotation(before, available[0])
  assert.equal((rotation + available[0].center) % 360, 0)
  assert.ok(rotation > before + 360)
  assert.equal(validRoundCount(5, 5), true)
  for (const count of [0, 1.25, 6, '', NaN]) assert.equal(validRoundCount(count, 5), false)
  assert.equal(validRoundCount(101, 200), false)
})

test('repeat wins report stock in receipt order, even when the final item sells out', () => {
  const result = resultsWithStock([pass, tea, pass], [{ ...tea, quantity: 0 }, { ...pass, quantity: 2 }])
  assert.deepEqual(result.map(item => [item.id, item.remaining]), [['pass', 3], ['tea', 0], ['pass', 2]])
})

test('single assignments divide the random range equally among eligible people', t => {
  const names = ['A', 'B', 'C', 'D'].map(id => ({ id, cn: id }))
  const state = { prizes: { currentId: 'club', lists: { club: oldList }, records: [] }, names: { lists: { class: { names: [...names, { id: 'exempt', cn: 'E', isWhiteList: true }] } } } }
  let sample = 0
  t.mock.method(globalThis.crypto, 'getRandomValues', array => { array[0] = sample; return array })
  for (let index = 0; index < names.length; index++) {
    sample = Math.floor((index + .5) / names.length * 2 ** 32)
    const { receipt } = executePrizeRequest({ operation: 'prize-assignment', input: { count: 1, listId: 'club', peopleListId: 'class' }, state, caller: { pluginId: 'core' } })
    assert.equal(receipt.results[0].person.id, names[index].id)
  }
})

test('legacy list, selection and history migrate once; a fresh store sees committed inventory and exactly one record per item', async () => {
  const original = globalThis.localStorage
  const values = new Map(Object.entries({
    prizeLists: { club: oldList }, currentPrizeListId: 'club', prizeRecords: [{ id: 'older' }]
  }).map(([key, value]) => [key, JSON.stringify(value)]))
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  try {
    setActivePinia(createPinia())
    const store = usePrizesStore()
    await Promise.all([store.initialize(), store.initialize()])
    const canonical = JSON.parse(values.get('prizes'))
    assert.equal(canonical.currentId, 'club')
    assert.equal(canonical.records[0].id, 'older')
    const input = { count: 5, listId: 'club' }
    const { receipt, nextPrizes } = executePrizeRequest({ operation: 'lottery-draw', input, state: { prizes: canonical, names: { lists: {} } }, caller: { pluginId: 'core' } })
    assert.equal(receipt.results.length, 5)
    await store.restoreState(nextPrizes)
    setActivePinia(createPinia())
    const fresh = usePrizesStore()
    await fresh.initialize()
    assert.equal(fresh.currentId, 'club')
    assert.equal(fresh.totalStock, 0)
    assert.equal(fresh.records.length, 6)
    assert.deepEqual(fresh.records.at(-1), { id: 'older' })
    // Old backups may still be present; they never supersede a canonical snapshot.
    assert.equal(JSON.parse(values.get('prizeLists')).club.prizes[0].quantity, 1)
  } finally { globalThis.localStorage = original }
})
