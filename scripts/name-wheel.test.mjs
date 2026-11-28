import assert from 'node:assert/strict'
import test from 'node:test'
import { nameWheelSectors, wheelHeading, wheelLabelTransform, wheelLanding, wheelSectorAt, wheelSectors } from '../src/utils/nameWheel.mjs'

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

test('unequal and tiny wedges land at the pointer without flipping their labels', () => {
  const sectors = wheelSectors(roster(13), { counts: { 0: 15, 1: 2 }, balance: { enabled: true } })
  let rotation = 0
  for (const pos of [0, 12, 6, 6, 2]) {
    const sector = sectors[pos]
    const landing = wheelLanding(rotation, sector)
    assert.ok(landing - rotation >= 1080)
    assert.equal(wheelSectorAt(sectors, landing), sector)
    closeTo(Math.sin(wheelHeading(sector.angle + landing) * Math.PI / 180), 0)
    assert.ok(Math.cos(wheelHeading(sector.angle + landing) * Math.PI / 180) > .999999)
    assert.equal(wheelLabelTransform(sector), `rotate(${sector.angle} 150 150)`)
    rotation = wheelHeading(landing)
  }
})

test('changing the displayed names retains the drawn layout and pointer position', () => {
  const sectors = wheelSectors(roster(7), { counts: { 0: 2 }, balance: { enabled: true } })
  const named = nameWheelSectors(sectors, true)
  const landing = wheelLanding(0, sectors[0])
  assert.equal(named[0].name, 'Alex')
  assert.equal(wheelSectorAt(named, landing).person, sectors[0].person)
  assert.equal(wheelLabelTransform(named[0]), wheelLabelTransform(sectors[0]))
  assert.equal(named[1], sectors[1])
})

test('the pointer changes names at uneven wedge boundaries, including after full turns', () => {
  const sectors = [
    { start: 0, end: 165 },
    { start: 165, end: 168 },
    { start: 168, end: 360 }
  ]
  assert.equal(wheelSectorAt(sectors, 0), sectors[0])
  assert.equal(wheelSectorAt(sectors, 190), sectors[2])
  assert.equal(wheelSectorAt(sectors, 192), sectors[2])
  assert.equal(wheelSectorAt(sectors, 193), sectors[1])
  assert.equal(wheelSectorAt(sectors, 915), sectors[1])
  assert.equal(wheelSectorAt(sectors, 196), sectors[0])
})
