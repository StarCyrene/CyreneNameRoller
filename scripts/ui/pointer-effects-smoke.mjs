// After building: node scripts/ui/pointer-effects-smoke.mjs [dist directory]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({
  logLevel: 'error', build: { outDir: resolve(process.argv[2] || 'dist') },
  preview: { host: '127.0.0.1', port: 0 }
})
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const effectsToggle = '.pointer-effects-toggle'
const soundToggle = '.pointer-sound-toggle'
const errors = []
let browser

async function makePage(overrides = {}, { media, touch = false } = {}) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.setDefaultTimeout(14000)
  await page.setViewport(touch
    ? { width: 390, height: 760, hasTouch: true, isMobile: true }
    : { width: 1440, height: 860 })
  if (media) {
    const session = await page.createCDPSession()
    await session.send('Emulation.setEmulatedMedia', { features: [media] })
  }
  page.on('pageerror', error => errors.push(error.message))
  const chunks = []
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) return request.abort()
    if (request.url().includes('engine-entry')) chunks.push(request.url())
    return request.continue()
  })
  await page.evaluateOnNewDocument(extra => {
    if (!localStorage.getItem('settings')) localStorage.setItem('settings', JSON.stringify({
      language: 'en', disableSplash: true, uiScale: 100, uiScaleVersion: 2,
      colorTheme: 'custom', customThemeColor: '#1e6593', ...extra
    }))
  }, overrides)
  return { page, chunks, context }
}

const waitRoute = (page, path) => page.waitForFunction(path =>
  document.querySelector('.route-page-stage')?.dataset.routePath === path, {}, path)
const seeCover = page => page.waitForFunction(() => {
  const host = document.querySelector('swarm-cover')
  return host && getComputedStyle(host).display !== 'none' && host.style.opacity === '1'
})
const seeEngine = (page, route) => page.waitForFunction(route => {
  const app = window.__divPointers?.app
  return app?.engine?.started && app.env.route === route
}, {}, route)
const settings = page => page.evaluate(() => JSON.parse(localStorage.getItem('settings')))
const waitSetting = (page, name, value) => page.waitForFunction((name, value) =>
  JSON.parse(localStorage.getItem('settings'))[name] === value, {}, name, value)
const arrow = page => page.$eval('#pointer-blank', el => decodeURIComponent(getComputedStyle(el).cursor))
const probeColor = page => page.$eval('#pointer-blank', el => getComputedStyle(el).color)
async function waitArrow(page, previousColor = '') {
  try {
    await page.waitForFunction(previous => {
      const el = document.querySelector('#pointer-blank')
      if (!el) return false
      const { cursor, color } = getComputedStyle(el)
      return color !== previous && cursor.includes('image/svg+xml') && decodeURIComponent(cursor).includes(color)
    }, { timeout: 5000 }, previousColor)
  } catch (cause) {
    const state = await page.evaluate(() => ({
      path: location.hash,
      hover: [...document.querySelectorAll(':hover')].map(el => el.id || el.className || el.localName),
      cursor: getComputedStyle(document.querySelector('#pointer-blank')).cursor,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--cnr-pointer-accent'),
      native: !!document.querySelector('swarm-companion'),
      fine: matchMedia('(any-pointer: fine)').matches
    }))
    throw new Error('Expected themed arrow: ' + JSON.stringify(state), { cause })
  }
  return probeColor(page)
}
async function addCursorProbes(page) {
  await page.evaluate(() => {
    document.querySelector('#pointer-probes')?.remove()
    const probes = document.createElement('div')
    probes.id = 'pointer-probes'
    probes.style.cssText = 'position:fixed;top:120px;right:28px;z-index:120;width:190px'
    probes.innerHTML = '<div id="pointer-blank" style="height:28px;color:var(--accent)"></div>' +
      '<span id="pointer-text" style="user-select:text">Selectable text</span>' +
      '<a id="pointer-link" href="#/roller" style="display:block">Test link</a>' +
      '<div id="pointer-resize" style="height:28px;cursor:ew-resize"></div>'
    document.querySelector('.route-page-stage').append(probes)
  })
}

async function toggleWithKeyboard(page, selector) {
  const input = await page.waitForSelector(selector + ' input')
  await input.evaluate(el => el.focus({ preventScroll: true }))
  assert.equal(await input.evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Space')
}

async function clickDock(page, path) {
  const selector = '.dock a[href="#' + path + '"]'
  await page.waitForFunction(selector => {
    const link = document.querySelector(selector)
    const r = link?.getBoundingClientRect()
    return r?.width > 0 && r.height > 0 &&
      link.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  }, {}, selector)
  await page.click(selector)
}
const assertQuiet = async (page, { chunks, native = false } = {}) => {
  const effects = await page.evaluate(() => ({
    drawing: !!document.querySelector('div-pointers'),
    companion: [...document.querySelectorAll('swarm-companion')].map(host => getComputedStyle(host).display),
    cover: [...document.querySelectorAll('swarm-cover')].some(host => getComputedStyle(host).display !== 'none'),
    input: !!window.__divPointers?.app
  }))
  assert.deepEqual(effects, { drawing: false, companion: native ? ['none'] : [], cover: false, input: false })
  assert.deepEqual(chunks ?? [], [])
}

try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  })
  const { page, chunks } = await makePage()
  await page.goto(origin + '/#/settings/appearance')
  await page.waitForSelector(effectsToggle)
  assert.equal(await page.$eval(effectsToggle + ' input', input => input.checked), false)
  assert.equal(await page.$eval(soundToggle + ' input', input => input.checked), false)
  await toggleWithKeyboard(page, soundToggle)
  await waitSetting(page, 'pointerDrawingSound', true)
  assert.equal((await settings(page)).pointerEffects, false)
  await page.evaluate(() => { location.hash = '/about' })
  await waitRoute(page, '/about')
  await page.waitForSelector('.about-view')
  assert.equal(await page.$('.pointer-replay'), null)
  await assertQuiet(page, { chunks })

  await page.evaluate(() => { location.hash = '/settings/appearance' })
  await page.waitForSelector(effectsToggle)
  await addCursorProbes(page)
  await page.hover('#pointer-blank')
  assert.equal(await arrow(page), 'auto')
  await toggleWithKeyboard(page, effectsToggle)
  await waitSetting(page, 'pointerEffects', true)
  const initialColor = await waitArrow(page)
  assert.match(await arrow(page), /<path d="M[^A-Z"]+L[^A-Z"]+L[^A-Z"]+L[^A-Z"]+Z"/)
  assert.equal(await page.evaluate(() =>
    [...document.querySelectorAll('#app *')].filter(el => el.getAttributeNames().some(name => name.startsWith('data-swarm-arrow-'))).length), 1)
  await assertQuiet(page, { chunks, native: true })
  // A sound preference change must leave the same native arrow attached, and
  // must never request drawing while Settings is open.
  await page.evaluate(() => { window.pointerTestNativeHost = document.querySelector('swarm-companion') })
  await page.$eval(soundToggle + ' input', el => el.focus({ preventScroll: true }))
  await page.hover('#pointer-blank')
  await waitArrow(page)
  for (const sound of [false, true]) {
    await toggleWithKeyboard(page, soundToggle)
    await waitSetting(page, 'pointerDrawingSound', sound)
    assert.equal(await page.evaluate(() => window.pointerTestNativeHost === document.querySelector('swarm-companion')), true)
    const afterSound = await arrow(page)
    assert.ok(afterSound.includes(initialColor), JSON.stringify({
      afterSound, initialColor,
      hover: await page.evaluate(() => [...document.querySelectorAll(':hover')].map(el => el.id || el.className || el.localName))
    }))
    await assertQuiet(page, { chunks, native: true })
  }
  await page.evaluate(() => { delete window.pointerTestNativeHost })
  for (const [selector, expected] of [
    ['#pointer-text', 'auto'], ['#pointer-resize', 'ew-resize'], ['#pointer-link', 'pointer']
  ]) {
    try { await page.hover(selector) } catch (cause) { throw new Error('Could not hover ' + selector, { cause }) }
    await page.waitForFunction(() => !getComputedStyle(document.querySelector('#pointer-blank')).cursor.includes('image/svg+xml'))
    assert.equal(await page.$eval(selector, el => getComputedStyle(el).cursor), expected)
  }
  const input = await page.waitForSelector('.hex-color-input input')
  await input.hover()
  assert.equal(await input.evaluate(el => getComputedStyle(el).cursor), 'text')
  await input.focus()
  await page.hover('#pointer-blank')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')
  await page.keyboard.type('#316694')
  assert.equal(await input.evaluate(input => input.value), '#316694')
  await page.keyboard.press('Enter')
  await waitSetting(page, 'customThemeColor', '#316694')
  const updatedColor = await waitArrow(page, initialColor)
  await page.$eval('#pointer-probes', el => el.remove())
  await input.focus()
  // A navigation requested while a real input owns focus must skip the overlay.
  await page.evaluate(() => { location.hash = '/about' })
  await waitRoute(page, '/about')
  await page.waitForSelector('.pointer-replay')
  await assertQuiet(page, { chunks, native: true })

  await page.click('.pointer-replay')
  await seeEngine(page, false)
  await page.keyboard.press('Escape')
  await page.waitForSelector('div-pointers', { hidden: true })
  await clickDock(page, '/announcement')
  await seeCover(page)
  const viewport = await page.evaluate(() => {
    const cover = document.querySelector('swarm-cover')
    const rail = document.querySelector('.dock')
    const link = rail.querySelector('a[href="#/about"]')
    const r = link.getBoundingClientRect()
    return { clipped: !!cover.style.clipPath && cover.style.clipPath !== 'none', hit: link.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }
  })
  assert.deepEqual(viewport, { clipped: true, hit: true })
  await clickDock(page, '/about')
  await waitRoute(page, '/about')
  await seeEngine(page, true)
  await clickDock(page, '/roller')
  await waitRoute(page, '/roller')
  await page.waitForSelector('.roller-view')
  await page.waitForSelector('div-pointers', { hidden: true })
  await addCursorProbes(page)
  await page.hover('#pointer-blank')
  assert.equal(await waitArrow(page), updatedColor)
  await assertQuiet(page, { native: true })

  // Full reload preserves both options, depicts the initial Dock, and uses app color.
  await page.goto(origin + '/?pointer-cold#/about')
  await seeCover(page)
  assert.equal(await page.$eval('swarm-cover', host => host.style.clipPath), '')
  await seeEngine(page, false)
  await page.waitForFunction(color => {
    const path = document.querySelector('div-pointers')?.shadowRoot.querySelector('.cursor svg path')
    return path && getComputedStyle(path).fill === color
  }, {}, updatedColor)
  assert.equal(await page.evaluate(() => window.__divPointers.app.sfx.on), true)
  await page.evaluate(() => { location.hash = '/settings/appearance' })
  await page.waitForSelector(effectsToggle)
  await page.waitForSelector('div-pointers', { hidden: true })
  assert.equal(await page.$eval(soundToggle + ' input', input => input.checked), true)
  await addCursorProbes(page)
  await page.hover('#pointer-blank')
  assert.equal(await waitArrow(page), updatedColor)
  await toggleWithKeyboard(page, effectsToggle)
  await waitSetting(page, 'pointerEffects', false)
  assert.equal(await arrow(page), 'auto')
  assert.equal((await settings(page)).pointerDrawingSound, true)
  await page.waitForFunction(() => !document.querySelector('swarm-cover, swarm-companion, div-pointers'))
  await page.goto(origin + '/?pointer-off#/about')
  await page.waitForSelector('.about-view')
  await assertQuiet(page)

  const ordinary = await makePage({ pointerEffects: true, pointerDrawingSound: true })
  await ordinary.page.goto(origin + '/#/roller')
  await ordinary.page.waitForSelector('.roller-view')
  await addCursorProbes(ordinary.page)
  await ordinary.page.hover('#pointer-blank')
  await waitArrow(ordinary.page)
  await assertQuiet(ordinary.page, { chunks: ordinary.chunks, native: true })
  await ordinary.context.close()

  for (const overrides of [
    { media: { name: 'prefers-reduced-motion', value: 'reduce' } },
    { media: { name: 'forced-colors', value: 'active' } },
    { touch: true }
  ]) {
    const test = await makePage({ pointerEffects: true, pointerDrawingSound: true }, overrides)
    await test.page.goto(origin + '/#/about')
    await test.page.waitForSelector('.about-view')
    await assertQuiet(test.page, { chunks: test.chunks })
    assert.equal(await test.page.$('.pointer-replay'), null)
    await test.context.close()
  }
  assert.deepEqual(errors, [])
  console.log('Pointer effects: independent sound, native replacement and teardown, stationary theme changes, text and controls, cold and route drawing, rapid Dock navigation, and accessibility fallbacks.')
} finally {
  await browser?.close()
  server.httpServer.closeAllConnections?.()
  await new Promise(resolve => server.httpServer.close(resolve))
}
