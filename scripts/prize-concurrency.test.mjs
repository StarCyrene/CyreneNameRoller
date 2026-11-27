import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia } from 'pinia'
import { usePrizesStore } from '../src/stores/prizes.js'
import { executePrizeRequest } from '../src/core/web/coreService.js'

test('an editor opened while a draw is in flight retains both the committed prize and its pending edits', async () => {
  const previous = globalThis.localStorage
  const data = new Map()
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }
  try {
    const store = usePrizesStore(createPinia())
    await store.initialize()
    const initial = await store.add('Tea', 1)
    let enter, release
    const started = new Promise(r => { enter = r }), pause = new Promise(r => { release = r })
    const draw = store.transaction(async () => {
      const { nextPrizes } = executePrizeRequest({ operation:'lottery-draw', input:{listId:'default',count:1}, caller:{pluginId:'core'}, state:{prizes:store.snapshotState(),names:{lists:{}}} })
      enter(); await pause; await store.commitDraw(nextPrizes)
    })
    await started
    const renamed = store.update(initial.id, { ...initial, name:'Green tea' }, initial)
    const added = store.add('Cake', 3)
    release()
    await Promise.all([draw, renamed, added])
    const saved = JSON.parse(data.get('prizes'))
    assert.deepEqual(saved.lists.default.prizes.map(p => [p.name,p.quantity]), [['Green tea',0],['Cake',3]])
    assert.equal(saved.records.length, 1)
    assert.equal(saved.records[0].prizeId, initial.id)
    await assert.rejects(store.update(initial.id, {quantity:5}, initial), /changed|变更/)
    assert.equal(store.current.prizes[0].quantity,0)
  } finally { globalThis.localStorage = previous }
})
