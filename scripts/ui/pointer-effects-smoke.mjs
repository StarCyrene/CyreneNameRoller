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
const hideWorkerToggle = '.pointer-hide-worker-toggle'
const drawingSpeedSelect = '.pointer-drawing-speed-select button'
const viewForPath = {
  '/roller': '.roller-view',
  '/roller/card': '.card-view',
  '/roller/wheel': '.wheel-view',
  '/lottery/draw': '.lottery-view.section-draw',
  '/records': '.records-view',
  '/lottery/records': '.lottery-records-view',
  '/settings/general': '.settings-view',
  '/settings/appearance': '.settings-view',
  '/about': '.about-view',
  '/announcement': '.ann-view'
}
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
  await page.evaluateOnNewDocument((extra, views) => {
    if (window !== window.top) return
    if (!localStorage.getItem('settings')) localStorage.setItem('settings', JSON.stringify({
      language: 'en', disableSplash: true, uiScale: 100, uiScaleVersion: 2,
      colorTheme: 'custom', customThemeColor: '#1e6593', ...extra
    }))
    const trace = window.pointerDrawingTrace = { splashSeen: false, splashObscured: false, paints: [] }
    const recorded = new WeakSet()
    function screenVisible(node) {
      if (!node?.isConnected) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0
    }
    function sample() {
      const splash = document.querySelector('.splash-root')
      if (splash) {
        trace.splashSeen = true
        trace.splashObscured ||= !!document.querySelector('div-pointers') ||
          screenVisible(document.querySelector('swarm-cover'))
      }
      const app = window.__divPointers?.app
      if (!app?.engine?.started || recorded.has(app) || !screenVisible(app.view.host)) return
      const stage = document.querySelector('.route-page-stage')
      const path = stage?.dataset.routePath
      const view = views[path] && stage.querySelector(views[path])
      if (!view || splash) return
      const bounds = view.getBoundingClientRect()
      // Upstream renders content in a shadow tree. A running engine, a cover,
      // the Dock, or an arrow alone does not prove target page content was drawn.
      const text = app.model?.items.find(item => {
        if (item.kind !== 'text' || !item.vis || !item.shown || !screenVisible(item.node)) return false
        const box = item.node.getBoundingClientRect()
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        return box.width > 0 && box.height > 0 && x >= Math.max(0, bounds.left) && x < Math.min(innerWidth, bounds.right) &&
          y >= Math.max(0, bounds.top) && y < Math.min(innerHeight, bounds.bottom)
      })
      if (text) {
        recorded.add(app)
        trace.paints.push({ path, route: app.env.route })
      }
    }
    // Record short transitions between Puppeteer commands as well as frames.
    new MutationObserver(sample).observe(document, { childList: true, subtree: true })
    function frame() {
      sample()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, overrides, viewForPath)
  return { page, chunks, context }
}

const waitRoute = (page, path) => page.waitForFunction(path =>
  document.querySelector('.route-page-stage')?.dataset.routePath === path, {}, path)
const seeCover = page => page.waitForFunction(() => {
  const host = document.querySelector('swarm-cover')
  return host && getComputedStyle(host).display !== 'none' && host.style.opacity === '1'
})
async function assertCoverTheme(page) {
  const { actual, expected } = await page.$eval('swarm-cover', host => {
    const expected = document.createElement('span')
    expected.hidden = true
    expected.style.backgroundColor = 'var(--bg-base)'
    document.querySelector('.app-layout').append(expected)
    const colors = { actual: getComputedStyle(host).backgroundColor, expected: getComputedStyle(expected).backgroundColor }
    expected.remove()
    return colors
  })
  assert.notEqual(expected, 'rgba(0, 0, 0, 0)')
  assert.equal(actual, expected, 'The cover must match the current app surface')
}
const seeEngine = (page, route) => page.waitForFunction(route => {
  const app = window.__divPointers?.app
  return app?.engine?.started && app.env.route === route
}, {}, route)
const paintCount = page => page.evaluate(() => window.pointerDrawingTrace.paints.length)
async function seePaint(page, path, { since = 0, route = true } = {}) {
  try {
    await page.waitForFunction(({ since, path, route }) =>
      window.pointerDrawingTrace.paints.slice(since).some(paint => paint.path === path && paint.route === route),
    { timeout: 18000 }, { since, path, route })
  } catch (cause) {
    const detail = await page.evaluate(() => ({
      ...window.pointerDrawingTrace,
      route: document.querySelector('.route-page-stage')?.dataset.routePath,
      engine: window.__divPointers?.app?.engine?.started,
      items: window.__divPointers?.app?.model?.items.length
    }))
    throw new Error('No visible page content was drawn for ' + path + ': ' + JSON.stringify(detail), { cause })
  }
}
async function reveal(page) {
  await page.keyboard.press('Escape')
  await page.waitForSelector('div-pointers', { hidden: true })
}
const settings = page => page.evaluate(() => JSON.parse(localStorage.getItem('settings')))
const waitSetting = (page, name, value) => page.waitForFunction((name, value) =>
  JSON.parse(localStorage.getItem('settings'))[name] === value, {}, name, value)
const arrow = page => page.$eval('#pointer-blank', el => decodeURIComponent(getComputedStyle(el).cursor))
async function assertNativeArrowLayers(page, color) {
  const parts = await page.$eval('#pointer-blank', el => {
    const cursor = decodeURIComponent(getComputedStyle(el).cursor)
    const markup = cursor.slice(cursor.indexOf('<svg'), cursor.indexOf('</svg>') + 6)
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml')
    return [...svg.querySelectorAll('path')].map(path => ({
      d: path.getAttribute('d'), fill: path.getAttribute('fill'),
      stroke: path.getAttribute('stroke'), opacity: Number(path.getAttribute('opacity') ?? 1)
    }))
  })
  assert.equal(parts.length, 4)
  const [body, light, dark, rim] = parts
  assert.match(body.d, /^M4\.5 2\.5 .+Z$/)
  assert.equal(body.fill, color)
  assert.equal(light.fill, 'white')
  assert.notEqual(dark.fill, light.fill)
  assert.ok(light.opacity > dark.opacity && dark.opacity > 0)
  assert.equal(rim.d, body.d)
  assert.equal(rim.stroke, 'white')
  return body.d
}
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

async function visibleTarget(page, selector) {
  const point = await page.waitForFunction(selector => {
    const target = document.querySelector(selector)
    const r = target?.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false
    const x = r.x + r.width / 2
    const y = r.y + r.height / 2
    return target.contains(document.elementFromPoint(x, y)) && { x, y }
  }, {}, selector)
  try { return await point.jsonValue() }
  finally { await point.dispose() }
}
async function clickVisible(page, selector) {
  await visibleTarget(page, selector)
  await page.click(selector)
}
const clickDock = (page, path) => clickVisible(page, '.dock a[href="#' + path + '"]')
async function makeTrustedTap(page) {
  await page.evaluateOnNewDocument(() => {
    const trace = window.pointerInputTrace = []
    for (const type of ['pointerdown', 'pointermove', 'click']) {
      document.addEventListener(type, event => {
        if (event.isTrusted) trace.push({
          type, pointer: event.pointerType, fromTouch: Boolean(event.sourceCapabilities?.firesTouchEvents),
          hit: event.composedPath().includes(window.pointerTapTarget)
        })
      }, { capture: true, passive: true })
    }
  })
  const session = await page.createCDPSession()
  return async selector => {
    const point = await visibleTarget(page, selector)
    const before = await page.evaluate(selector => {
      window.pointerTapTarget = document.querySelector(selector)
      return window.pointerInputTrace.length
    }, selector)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const events = await page.evaluate(start => window.pointerInputTrace.slice(start), before)
    const detail = selector + ': ' + JSON.stringify(events)
    assert.ok(events.some(event => event.hit && event.type === 'pointerdown' && event.pointer === 'touch'), detail)
    assert.ok(events.some(event => event.hit && event.type === 'click' && (event.pointer === 'touch' || event.fromTouch)), detail)
    assert.ok(!events.some(event => event.pointer === 'mouse' && !event.fromTouch), detail)
  }
}
async function closeDockGroup(page) {
  if (await page.$('.secondary-sidebar-menu.is-interactive')) {
    await clickVisible(page, '.secondary-sidebar-menu.is-interactive .secondary-sidebar-menu__back')
  }
}
async function expectNavigationPaint(page, path, navigate) {
  const since = await paintCount(page)
  await navigate()
  await waitRoute(page, path)
  // The engine can hide the live DOM while its reconstruction is visible.
  await page.waitForSelector(viewForPath[path])
  await seePaint(page, path, { since })
  await reveal(page)
  await page.waitForSelector(viewForPath[path], { visible: true })
}
async function verifyHybridDockNavigation() {
  const { page, context } = await makePage({ pointerEffects: true, pointerDrawingSpeed: 2 })
  try {
    // Keep the desktop primary pointer but report an additional touch pointer
    // even on test runners that have no physical touchscreen.
    await page.evaluateOnNewDocument(() => {
      const match = window.matchMedia.bind(window)
      window.matchMedia = query => {
        const result = match(query)
        if (!result.matches && query === '(any-pointer: coarse)') Object.defineProperty(result, 'matches', { value: true })
        return result
      }
    })
    const tap = await makeTrustedTap(page)
    const records = '.dock button[title="Records"]'
    const back = '.secondary-sidebar-menu.is-interactive .secondary-sidebar-menu__back'
    const roller = '.dock a[href="#/roller"]'
    await page.goto(origin + '/#/roller')
    await seePaint(page, '/roller', { route: false })
    await reveal(page)
    assert.deepEqual(await page.evaluate(() => [
      matchMedia('(pointer: fine)').matches, matchMedia('(any-pointer: coarse)').matches
    ]), [true, true])
    await expectNavigationPaint(page, '/records', () => tap(records))
    await tap(back)
    await expectNavigationPaint(page, '/roller', () => tap(roller))
    await addCursorProbes(page)
    await page.hover('#pointer-blank')
    await waitArrow(page)
    await expectNavigationPaint(page, '/records', () => clickVisible(page, records))
  } finally {
    await context.close()
  }
}
async function verifyTouchDrawing() {
  const { page, context } = await makePage({ pointerEffects: true, pointerDrawingSpeed: 2 }, { touch: true })
  try {
    const tap = await makeTrustedTap(page)
    const waitForDrawingEnd = () => page.waitForSelector('div-pointers', { hidden: true })
    await page.goto(origin + '/#/roller')
    assert.deepEqual(await page.evaluate(() => [
      matchMedia('(pointer: coarse)').matches, matchMedia('(hover: none)').matches, matchMedia('(any-pointer: fine)').matches
    ]), [true, true, false])
    await seePaint(page, '/roller', { route: false })
    await waitForDrawingEnd()

    await page.reload()
    await seePaint(page, '/roller', { route: false })
    await waitForDrawingEnd()

    for (const [path, selector] of [
      ['/roller/card', '#roller-tab-Card'], ['/about', '.dock a[href="#/about"]']
    ]) {
      const since = await paintCount(page)
      if (path === '/about') await tap('.mobile-nav button[aria-controls="main-navigation"]')
      await tap(selector)
      await waitRoute(page, path)
      await seePaint(page, path, { since })
      await waitForDrawingEnd()
      await page.waitForSelector(viewForPath[path], { visible: true })
    }
  } finally {
    await context.close()
  }
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
  const { page, chunks, context } = await makePage()
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
  const arrowOutline = await assertNativeArrowLayers(page, initialColor)
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
  await seePaint(page, '/about', { route: false })
  await reveal(page)
  const beforeRapid = await paintCount(page)
  await clickDock(page, '/announcement')
  await seeCover(page)
  await assertCoverTheme(page)
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
  await seePaint(page, '/about', { since: beforeRapid })
  await reveal(page)

  // Navigate through the live Dock and the workspace's actual tool tabs.
  // The paint trace distinguishes fresh body content from the previous scene.
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'))
  await expectNavigationPaint(page, '/roller', () => clickDock(page, '/roller'))
  await addCursorProbes(page)
  await page.hover('#pointer-blank')
  assert.equal(await waitArrow(page), updatedColor)
  await assertQuiet(page, { native: true })
  await page.$eval('#pointer-probes', el => el.remove())
  await expectNavigationPaint(page, '/roller/card', () => clickVisible(page, '#roller-tab-Card'))
  await expectNavigationPaint(page, '/roller/wheel', () => clickVisible(page, '#roller-tab-RollerWheel'))
  await expectNavigationPaint(page, '/lottery/draw', () => clickVisible(page, '.dock button[title="Lottery"]'))
  await closeDockGroup(page)
  await expectNavigationPaint(page, '/records', () => clickVisible(page, '.dock button[title="Records"]'))
  await expectNavigationPaint(page, '/lottery/records', () => clickDock(page, '/lottery/records'))
  await closeDockGroup(page)

  // Full reload preserves both options, depicts the initial Dock, and uses app color.
  await page.goto(origin + '/?pointer-cold#/about')
  await seeCover(page)
  await assertCoverTheme(page)
  assert.equal(await page.$eval('swarm-cover', host => host.style.clipPath), '')
  await seeEngine(page, false)
  await seePaint(page, '/about', { route: false })
  await page.waitForFunction((color, outline) => {
    const cursors = document.querySelector('div-pointers')?.shadowRoot.querySelectorAll('.cursor svg')
    return [...(cursors || [])].some(cursor => {
      const parts = [...cursor.querySelectorAll('path')]
      if (parts.length !== 4 || parts[0].getAttribute('d') !== outline || parts[3].getAttribute('d') !== outline) return false
      const [body, light, dark, rim] = parts.map(part => getComputedStyle(part))
      return body.fill === color && light.fill === 'rgb(255, 255, 255)' && light.fill !== dark.fill &&
        Number(light.opacity) > Number(dark.opacity) && Number(dark.opacity) > 0 &&
        rim.stroke === 'rgb(255, 255, 255)' && body.stroke !== rim.stroke
    })
  }, {}, updatedColor, arrowOutline)
  assert.equal(await page.evaluate(() => window.__divPointers.app.sfx.on), true)
  await reveal(page)
  await expectNavigationPaint(page, '/settings/general', () => clickVisible(page, '.dock [data-plugin-component="navigation.settings-entry"]'))
  await expectNavigationPaint(page, '/settings/appearance', () => clickDock(page, '/settings/appearance'))
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
  await context.close()

  const startup = await makePage({ disableSplash: false, pointerEffects: true })
  await startup.page.goto(origin + '/?pointer-splash#/roller/wheel', { waitUntil: 'domcontentloaded' })
  await startup.page.waitForFunction(() => window.pointerDrawingTrace.splashSeen)
  await startup.page.waitForSelector('.splash-root', { hidden: true })
  await waitRoute(startup.page, '/roller/wheel')
  await seePaint(startup.page, '/roller/wheel', { route: false })
  assert.equal(await startup.page.evaluate(() => window.pointerDrawingTrace.splashObscured), false)
  await reveal(startup.page)
  await clickVisible(startup.page, '#roller-tab-Roller')
  await waitRoute(startup.page, '/roller')
  await seePaint(startup.page, '/roller')
  await startup.context.close()

  for (const overrides of [
    { media: { name: 'prefers-reduced-motion', value: 'reduce' } },
    { media: { name: 'forced-colors', value: 'active' } },
    { touch: true, media: { name: 'prefers-reduced-motion', value: 'reduce' } }
  ]) {
    const test = await makePage({ pointerEffects: true, pointerDrawingSound: true }, overrides)
    await test.page.goto(origin + '/#/about')
    await test.page.waitForSelector('.about-view')
    await assertQuiet(test.page, { chunks: test.chunks })
    assert.equal(await test.page.$('.pointer-replay'), null)
    await test.context.close()
  }

  await verifyTouchDrawing()
  await verifyHybridDockNavigation()

  const preferences = await makePage()
  const prefsPage = preferences.page
  await prefsPage.goto(origin + '/#/settings/appearance')
  await prefsPage.waitForSelector(drawingSpeedSelect)
  assert.equal(await prefsPage.$eval(drawingSpeedSelect, button => button.textContent.trim()), '1×')
  assert.equal(await prefsPage.$eval(hideWorkerToggle + ' input', input => input.checked), false)
  await prefsPage.$eval(drawingSpeedSelect, button => { button.scrollIntoView({ block: 'center' }); button.focus() })
  await prefsPage.keyboard.press('Enter')
  const option = '.fluent-select-dropdown .select-option'
  await prefsPage.waitForSelector(option, { visible: true })
  const choices = await prefsPage.$$(option)
  assert.deepEqual(await prefsPage.$$eval(option, options => options.map(item => item.textContent.trim())),
    ['1×', '1.25×', '1.5×', '1.75×', '2×'])
  await choices[3].click()
  await waitSetting(prefsPage, 'pointerDrawingSpeed', 1.75)
  await toggleWithKeyboard(prefsPage, hideWorkerToggle)
  await waitSetting(prefsPage, 'pointerHideWorkerPointers', true)
  await assertQuiet(prefsPage, { chunks: preferences.chunks })
  await toggleWithKeyboard(prefsPage, effectsToggle)
  await waitSetting(prefsPage, 'pointerEffects', true)
  await prefsPage.goto(origin + '/?drawing-preferences#/roller/wheel')
  await waitRoute(prefsPage, '/roller/wheel')
  await prefsPage.waitForFunction(() => {
    const app = window.__divPointers?.app
    const outlines = app?.view.root.querySelectorAll('svg.ov rect')
    return app?.engine?.started && app.engine.speed === 1.75 && outlines?.length > 0 &&
      getComputedStyle(app.view.cursorsEl).display === 'none' &&
      !!document.querySelector('swarm-companion')
  })
  await reveal(prefsPage)
  await preferences.context.close()
  assert.deepEqual(errors, [])
  console.log('Pointer effects: real page painting on startup, reload, and tool/Dock navigation with touch and mouse; unobscured splash, service worker, independent sound, stationary theme changes, teardown, and accessibility fallbacks.')
} finally {
  await browser?.close()
  server.httpServer.closeAllConnections?.()
  await new Promise(resolve => server.httpServer.close(resolve))
}
