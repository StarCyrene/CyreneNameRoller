import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const { createRollScheduler } = await import('../src/utils/rollSchedule.mjs')

test('scheduler throttles swaps to the base interval when not decelerating', () => {
  const scheduler = createRollScheduler()
  assert.equal(scheduler.isDecelerating(), false)
  assert.equal(scheduler.currentIntervalMs(), 50)
  assert.equal(scheduler.tick(25), false)
  assert.equal(scheduler.tick(25), true)
  assert.equal(scheduler.tick(49), false)
  assert.equal(scheduler.tick(51), true)
})

test('a single oversized tick produces at most one swap', () => {
  const scheduler = createRollScheduler()
  assert.equal(scheduler.tick(1000), true)
  assert.equal(scheduler.tick(1), false)
})

test('deceleration grows the interval monotonically up to the target', () => {
  const scheduler = createRollScheduler()
  scheduler.beginDeceleration()
  const intervals = []
  for (let step = 0; step < 12; step++) {
    intervals.push(scheduler.currentIntervalMs())
    scheduler.tick(100)
  }
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(intervals[i] >= intervals[i - 1], `interval shrank at step ${i}`)
  }
  assert.ok(intervals[0] <= 80, 'deceleration starts near base interval')
  assert.ok(Math.abs(intervals[intervals.length - 1] - 400) < 1, 'interval converges to target')
  assert.equal(scheduler.isDecelerating(), true)
})

test('deceleration completes only after the configured window', () => {
  const scheduler = createRollScheduler({ decelDurationMs: 300 })
  scheduler.beginDeceleration()
  assert.equal(scheduler.decelerationComplete(), false)
  scheduler.tick(299)
  assert.equal(scheduler.decelerationComplete(), false)
  scheduler.tick(1)
  assert.equal(scheduler.decelerationComplete(), true)
})

test('reset clears deceleration state', () => {
  const scheduler = createRollScheduler()
  scheduler.beginDeceleration()
  scheduler.tick(5000)
  scheduler.reset()
  assert.equal(scheduler.isDecelerating(), false)
  assert.equal(scheduler.decelerationComplete(), false)
  assert.equal(scheduler.currentIntervalMs(), 50)
})

test('invalid options fall back to safe defaults', () => {
  const scheduler = createRollScheduler({ baseMs: 0, targetMs: -100, decelDurationMs: 'nope' })
  assert.equal(scheduler.currentIntervalMs(), 50)
  scheduler.beginDeceleration()
  scheduler.tick(1200)
  assert.ok(Math.abs(scheduler.currentIntervalMs() - 400) < 1)
})

test('decelerate finish setting is persisted and exposed', () => {
  const settingsStore = read('src', 'stores', 'settings.js')
  const settingsView = read('src', 'views', 'SettingsView.vue')
  assert.match(settingsStore, /decelerateFinish:\s*false/)
  assert.match(settingsView, /decelerateFinish/)
})
