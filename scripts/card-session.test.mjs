import assert from 'node:assert/strict'
import test from 'node:test'
import { appendCardReceipt, cardDisplayName, cardSessionKey, readCardTray, withCardSession } from '../src/utils/cardSessions.mjs'

test('a legacy tray migrates only to the list which owns its people; reset stays reset', async () => {
  const values = new Map([['cardUsedNames', ['a1']], ['cardTrayHistory', [{ id: 4, name: 'Alex' }]]])
  const storage = { load: k => values.get(k), save: (k, v) => values.set(k, v) }
  const lists = [{ id: 'a', names: [{ id: 'a1', cn: 'Alex' }] }, { id: 'b', names: [{ id: 'b1', cn: 'Alex' }] }]
  assert.deepEqual((await readCardTray(storage, 'b', lists)).used, [])
  assert.deepEqual((await readCardTray(storage, 'a', lists)).history, [{ id: 4, name: 'Alex' }])
  values.set(cardSessionKey('a'), { used: [], history: [] })
  assert.deepEqual((await readCardTray(storage, 'a', lists)).used, [])
  values.set('cardUsedNames', ['Alex'])
  assert.deepEqual((await readCardTray(storage, 'b', lists)).used, [])
})

test('remounting a list waits for its pending receipt without blocking another list', async () => {
  const history = { used: [], history: [] }
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  let committed
  const pending = withCardSession('a', async () => {
    await gate
    committed = appendCardReceipt(history, { operationId: 'op', results: [{ id: 'a1', name: '甲', englishName: 'Alex' }] })
  })
  const reloaded = withCardSession('a', () => committed)
  assert.equal(await withCardSession('b', () => 'unblocked'), 'unblocked')
  finish()
  await pending
  assert.deepEqual(await reloaded, { used: ['a1'], history: [{ id: 'op:0', name: '甲', englishName: 'Alex' }] })
})

test('new bilingual cards and older saved entries can share one tray', () => {
  const tray = appendCardReceipt({ used: ['legacy'], history: [{ id: 'past:0', name: 'Legacy name' }] }, {
    operationId: 'draw', results: [{ id: 'a', name: '甲', englishName: 'Alex' }, { id: 'b', name: '乙' }]
  })
  assert.deepEqual(tray.history.map(item => cardDisplayName(item, false)), ['乙', '甲', 'Legacy name'])
  assert.deepEqual(tray.history.map(item => cardDisplayName(item, true)), ['乙', 'Alex', 'Legacy name'])
  assert.deepEqual(tray.used, ['legacy', 'a', 'b'])
})
