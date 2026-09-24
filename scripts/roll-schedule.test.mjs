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

test('deceleration eases speed down gradually and converges to the target interval', () => {
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
  // 缓降：起步阶段速度几乎不变，不能一按下停止就掉到很低
  assert.ok(intervals[3] <= 120, `early deceleration should stay fast, got ${intervals[3]}`)
  assert.ok(Math.abs(scheduler.currentIntervalMs() - 400) < 1, 'interval converges to target')
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

test('roller view drives rolling via gsap ticker and gsap finish animations', () => {
  const rollerView = read('src', 'views', 'RollerView.vue')
  assert.match(rollerView, /gsap\.ticker\.add\(rollTickerTick\)/)
  assert.match(rollerView, /createRollScheduler\(/)
  assert.match(rollerView, /runFinishAnimation\(/)
  assert.doesNotMatch(rollerView, /@keyframes final-/)
  assert.match(rollerView, /@keyframes gradient-shift/)
})

test('lottery view drives preview and wheel via gsap ticker', () => {
  const lotteryView = read('src', 'views', 'LotteryView.vue')
  assert.match(lotteryView, /gsap\.ticker\.add\(drawTickerTick\)/)
  assert.match(lotteryView, /runFinishAnimation\(/)
  assert.doesNotMatch(lotteryView, /@keyframes result-/)
  assert.doesNotMatch(lotteryView, /@keyframes allocation-in/)
  assert.doesNotMatch(lotteryView, /setInterval\(randomPreview/)
})

test('card deal animation runs through gsap', () => {
  const cardView = read('src', 'views', 'CardView.vue')
  assert.match(cardView, /runCardDeal\(/)
  assert.doesNotMatch(cardView, /@keyframes card-deal/)
  assert.match(cardView, /\.card\.show \{ opacity: 1; transform: none; \}/)
})

test('banner transitions and countdown run through gsap', () => {
  const appLayout = read('src', 'components', 'layout', 'AppLayout.vue')
  assert.match(appLayout, /onBannerTransitionEnter/)
  assert.doesNotMatch(appLayout, /@keyframes banner-in/)
  assert.doesNotMatch(appLayout, /@keyframes banner-out/)
  assert.doesNotMatch(appLayout, /@keyframes banner-countdown/)
  assert.match(appLayout, /@keyframes scanline-scroll/)
})

test('splash pop animation runs through gsap', () => {
  const splash = read('src', 'components', 'SplashScreen.vue')
  assert.match(splash, /runSplashPop\(/)
  assert.doesNotMatch(splash, /@keyframes enter-pop/)
})

test('vue transition css keyframes are retained by design', () => {
  const rollerView = read('src', 'views', 'RollerView.vue')
  const cardView = read('src', 'views', 'CardView.vue')
  const settingsView = read('src', 'views', 'SettingsView.vue')
  assert.match(rollerView, /@keyframes toggle-in/)
  assert.match(cardView, /@keyframes slide-in/)
  assert.match(settingsView, /@keyframes toggle-in/)
})
