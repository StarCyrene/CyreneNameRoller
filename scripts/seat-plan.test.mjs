import test from 'node:test'
import assert from 'node:assert/strict'
import { orderedSeats, readSeatPlan, seatAddress, swapSeats, writeSeatPlan } from '../src/utils/seatPlan.mjs'
import { previewSeatPaste } from '../src/utils/seatPaste.mjs'
const people = ['A','B','C','D'].map(id => ({ id, cn: id }))
test('seat plans reconcile roster edits by ID, place new people last, and ignore special entries', () => {
  const entries = [...people, { id: 'retry', cn: '再来一次' }]
  assert.deepEqual(orderedSeats(entries, ['B','gone','A','B']).map(p => p.id), ['B','A','C','D'])
  const swapped = swapSeats(people, 'D', 'B')
  assert.deepEqual(swapped, ['A','D','C','B'])
  assert.deepEqual(orderedSeats([...people.slice(0, 3), { id: 'E', cn: 'B' }], swapped).map(p => p.id), ['A','C','B','E'])
})
test('seat addresses are one-based and select the right page after a column change', () => {
  assert.deepEqual(seatAddress(36, 6), { row: 7, seat: 1, page: 1 })
  assert.deepEqual(seatAddress(36, 7), { row: 6, seat: 2, page: 0 })
  assert.equal(seatAddress(-1, 4), null)
})
test('remounting sees the last queued change, while an unrelated list stays independent', async () => {
  const values = new Map()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const storage = { load: k => values.get(k), async save(k,v) { await gate; values.set(k,v) } }
  const one = writeSeatPlan(storage, 'a', { columns: 4, order: ['B','A'] })
  const two = writeSeatPlan(storage, 'a', { columns: 7, order: ['A','B'] })
  const remount = readSeatPlan(storage, 'a')
  assert.deepEqual(await readSeatPlan(storage, 'b'), { columns: 6, order: [], mapped: false })
  release()
  await Promise.all([one, two])
  assert.deepEqual(await remount, { columns: 7, order: ['A','B'], mapped: false })
})

test('Excel rectangular paste preserves internal and trailing empty seats, keeping later rows aligned', () => {
  const preview = previewSeatPaste('A\t\tB\r\nD\tC\t\r\n', people)
  assert.ok(preview.valid)
  assert.equal(preview.columns, 3)
  assert.deepEqual(preview.order, ['A', null, 'B', 'D', 'C', null])
  assert.deepEqual(orderedSeats(people, preview.order, true).map(p => p?.id || null), preview.order)
})
test('names match exactly, duplicate and unknown names are reported before applying, IDs disambiguate', () => {
  const roster = [{ id: '1', cn: '王晨' }, { id: '2', cn: '王晨' }, { id: '3', cn: 'Z', en: 'Lin, Alex' }]
  const bad = previewSeatPaste('王晨\t陌生人\n1\t1', roster)
  assert.equal(bad.valid, false)
  assert.deepEqual(bad.errors.map(e => e.kind), ['ambiguous', 'unknown', 'duplicate', 'missing'])
  const valid = previewSeatPaste('1,"Lin, Alex"\n,2', roster)
  assert.ok(valid.valid)
  assert.deepEqual(valid.order, ['1', '3', null, '2'])
})
