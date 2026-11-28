import assert from 'node:assert/strict'
import test from 'node:test'
import { wheelHeading, wheelLabelTransform, wheelLanding, wheelSectors } from '../src/utils/nameWheel.mjs'

function roster(size) {
  return Array.from({ length: size }, (_, i) => ({ id: String(i), cn: '同学' + (i + 1), en: i ? '' : 'Alex' }))
}
const closeTo = (left, right) => assert.ok(Math.abs(left - right) < 0.000001, left + ' should equal ' + right)

test('13 people get 13 wedges, and filtering does not renumber positions', () => {
  const people = roster(13).map((person, index) => ({ ...person, position: 2 * index + 1 }))
  const sectors = wheelSectors(people, { english: true })
  assert.equal(sectors.length, 13)
  assert.deepEqual(sectors.map(sector => sector.person), people)
  assert.deepEqual(sectors.map(sector => sector.position), people.map(person => person.position))
  assert.deepEqual(sectors.map(sector => sector.label), people.map(person => person.en || person.cn))
  sectors.forEach(sector => closeTo(sector.span, 360 / 13))
})

test('CAF probabilities control widths without merging or omitting identities', () => {
  const people = roster(13)
  const counts = { 0: 7, 1: 3 }
  const sectors = wheelSectors(people, { counts, balance: { enabled: true } })
  assert.ok(sectors[0].span < sectors[1].span && sectors[1].span < sectors[2].span)
  assert.equal(sectors[0].start, 0)
  assert.equal(sectors.at(-1).end, 360)
  sectors.forEach((sector, index) => {
    assert.ok(sector.span > 0)
    if (index) assert.equal(sectors[index - 1].end, sector.start)
    closeTo(sector.span, sector.probability * 3.6)
  })
})

test('large rosters keep every wedge distinct without drawing unreadably crowded labels', () => {
  const people = roster(301)
  const sectors = wheelSectors(people)
  assert.equal(sectors.length, 301)
  assert.deepEqual(sectors.map(sector => sector.person.id), people.map(person => person.id))
  assert.ok(sectors.every(sector => !sector.label))
  assert.deepEqual(wheelSectors([], { english: true }), [])
})

test('unequal and tiny wedges still land at the pointer; bottom labels are flipped upright', () => {
  const sectors = wheelSectors(roster(13), { counts: { 0: 15, 1: 2 }, balance: { enabled: true } })
  let rotation = 0
  for (const pos of [0, 12, 6, 6, 2]) {
    const sector = sectors[pos]
    const landing = wheelLanding(rotation, sector)
    assert.ok(landing - rotation >= 1080)
    closeTo(Math.sin(wheelHeading(sector.angle + landing) * Math.PI / 180), 0)
    assert.ok(Math.cos(wheelHeading(sector.angle + landing) * Math.PI / 180) > .999999)
    assert.doesNotMatch(wheelLabelTransform(sector, landing), /rotate\(180 150 47\)/)
    assert.match(wheelLabelTransform(sector, landing + 180), /rotate\(180 150 47\)/)
    rotation = wheelHeading(landing)
  }
})
