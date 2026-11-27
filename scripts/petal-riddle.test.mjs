import test from 'node:test'
import assert from 'node:assert/strict'
import { createPetalRiddle, matchesPetalGuess, nextPetal } from '../src/utils/petalRiddle.mjs'

test('hints lift complete graphemes and leave the final character sealed', () => {
  const riddle = createPetalRiddle({ name: '星✨', englishName: 'E\u0301va Li' }, [], true)
  assert.equal(riddle.letters[0], 'E\u0301')
  assert.deepEqual(riddle.positions, [0, 1, 2, 4, 5])
  const seen = []
  while (nextPetal(riddle, seen) !== null) seen.push(nextPetal(riddle, seen))
  assert.deepEqual(seen, [0, 1, 2, 4])
  assert.equal(matchesPetalGuess(riddle, 'ÉVA   LI'), true)
  assert.equal(matchesPetalGuess(riddle, '星✨'), true)
  assert.equal(matchesPetalGuess(riddle, 'Éva'), false)
})

test('missing aliases and one-character names cannot leak the whole answer', () => {
  const riddle = createPetalRiddle({ name: '星' }, [], true)
  assert.equal(riddle.display, '星')
  assert.equal(riddle.initial, '')
  assert.equal(nextPetal(riddle, []), null)
  assert.equal(matchesPetalGuess(riddle, ' '), false)
  assert.equal(createPetalRiddle({ name: '星', englishName: 'A' }).initial, '')
})

test('a shared spelling solves the riddle for the originally drawn person ID', () => {
  const roster = [{ id: 'a', cn: '明' }, { id: 'b', cn: '明' }]
  const riddle = createPetalRiddle({ id: 'b', name: '明', englishName: 'Alex' }, roster)
  assert.equal(riddle.rosterNumber, 2)
  assert.equal(matchesPetalGuess(riddle, '明'), true)
  assert.equal(matchesPetalGuess(riddle, ' ＡＬＥＸ '), true)
})
