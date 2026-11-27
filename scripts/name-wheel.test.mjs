import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_WHEEL_SECTORS, wheelLanding, wheelSectors } from '../src/utils/nameWheel.mjs'

test('wheel labels names in small lists, and preserves every position in large lists', () => {
  const list = Array.from({ length: 301 }, (_, i) => ({ cn: `同学${i}`, en: i ? '' : 'Alex' }))
  assert.deepEqual(wheelSectors([], true), [])
  assert.deepEqual(wheelSectors(list.slice(0, 2), true).map(s => s.label), ['Alex', '同学1'])
  const sectors = wheelSectors(list)
  assert.equal(sectors.length, MAX_WHEEL_SECTORS)
  assert.deepEqual(sectors.flatMap(s => list.slice(s.start, s.end)), list)
  assert.equal(sectors.at(-1).label, '271–301')
})

test('each receipt position stops its own sector at twelve o’clock, on consecutive spins', () => {
  const sectors = wheelSectors(Array.from({ length: 37 }, (_, i) => ({ cn: String(i) })))
  let rotation = 0
  for (const i of [0, 36, 18, 18, 9]) {
    const next = wheelLanding(rotation, sectors, i)
    assert.ok(next - rotation >= 1080)
    const sector = sectors.find(s => s.start <= i && i < s.end)
    assert.equal((next + sector.angle) % 360, 0)
    rotation = next
  }
  assert.equal(wheelLanding(rotation, sectors, -1), null)
})
