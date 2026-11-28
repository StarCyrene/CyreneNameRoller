// Build first, then run: node scripts/ui/mobile-shell-smoke.mjs [build directory]
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({
  logLevel: 'error',
  build: { outDir: process.argv[2] || 'dist' },
  preview: { host: '127.0.0.1', port: 0 }
})
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const nav = '.mobile-nav button[aria-controls="main-navigation"]'
const scan = '#main-navigation a[href="#/sync/receive"]'
const send = '.qr-send-from-device'
let browser
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  })
  for (const viewport of [
    { width: 320, height: 600, isMobile: true, hasTouch: true },
    { width: 780, height: 360, isMobile: true, hasTouch: true },
    { width: 1440, height: 850 }
  ]) {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.setViewport(viewport)
    page.setDefaultTimeout(15000)
    await page.setRequestInterception(true)
    page.on('request', req => /^https?:/.test(req.url()) && !req.url().startsWith(origin + '/') ? req.abort() : req.continue())
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem('settings')) {
        localStorage.setItem('settings', JSON.stringify({ language: 'en', perfAnimations: false, uiScale: 100, uiScaleVersion: 2 }))
      }
      // Capture the real final splash frame on the render loop before its
      // brief exit; the slow headless screenshot transport won't affect it.
      const sample = () => {
        const root = document.querySelector('.splash-root')
        const brand = root?.querySelector('.brand.expanded')
        const shift = brand?.querySelector('.logo-shift')
        if (!shift || getComputedStyle(shift).transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
          requestAnimationFrame(sample)
          return
        }
        const rect = el => {
          const { left, right, top, bottom } = el.getBoundingClientRect()
          return { left, right, top, bottom }
        }
        const textClip = root.querySelector('.text-clip')
        window.finalSplash = {
          stage: rect(root), logo: rect(root.querySelector('.logo')), text: rect(root.querySelector('.brand-text')),
          footer: rect(root.querySelector('.splash-footer')), clip: rect(textClip),
          scale: Number(getComputedStyle(root).getPropertyValue('--splash-scale'))
        }
      }
      requestAnimationFrame(sample)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => { throw new DOMException('No test camera', 'NotAllowedError') }
      })
    })
    await page.goto(origin + '/#/lists')
    await page.waitForFunction(() => window.finalSplash)
    const { logo, text, stage, footer, clip, scale } = await page.evaluate(() => window.finalSplash)
    assert.ok(logo.left >= stage.left + 8 && text.right <= stage.right - 8 && text.right <= clip.right + 1, JSON.stringify({ logo, text, stage, clip }))
    assert.ok(logo.top >= stage.top && Math.max(logo.bottom, text.bottom) <= footer.top + 1 && footer.bottom <= stage.bottom + 1)
    if (!viewport.hasTouch) {
      assert.equal(scale, 1.5)
      await page.waitForSelector('.lists-view .desktop-scan-entry', { visible: true })
      assert.equal(await page.$(nav), null)
      await context.close()
      console.log('Desktop splash keeps its 150% scale and roster retains its direct receive entry.')
      continue
    }
    await page.waitForSelector(nav, { visible: true })
    assert.equal(await page.$('.mobile-nav a'), null)
    await page.waitForSelector('.lists-view .desktop-scan-entry', { hidden: true })
    await page.waitForSelector(scan, { hidden: true })
    assert.equal(await page.$eval(nav, element => getComputedStyle(element).webkitTapHighlightColor), 'rgba(0, 0, 0, 0)')
    await page.tap(nav)
    await page.waitForSelector(scan, { visible: true })
    if (viewport.width === 780) {
      assert.ok(await page.$eval('.phone-drawer .dock-primary', element => element.scrollHeight > element.clientHeight))
      await page.$eval('.phone-drawer .dock-primary', element => { element.scrollTop = element.scrollHeight })
      assert.ok(await page.$eval('.phone-drawer [href="#/about"]', element => {
        const r = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
      }))
      await page.$eval('.phone-drawer .dock-primary', element => { element.scrollTop = 0 })
    }
    await page.tap(scan)
    await page.waitForSelector(send, { visible: true })
    assert.ok(await page.$eval(send, el => el instanceof HTMLButtonElement && el.getBoundingClientRect().height >= 44))
    await page.tap(send)
    await page.waitForFunction(() => location.hash.startsWith('#/sync/send'))

    await page.evaluate(() => { location.hash = '/settings/appearance' })
    const scaleInput = '.scale-input-wrap input'
    await page.waitForSelector(scaleInput)
    const scaleInputHeight = () => page.$eval(scaleInput, el => el.getBoundingClientRect().height)
    const at100 = await scaleInputHeight()
    async function applyScale(percent) {
      await page.locator(scaleInput).fill(String(percent))
      await page.keyboard.press('Tab')
      await page.locator('.scale-control button ::-p-text(Apply)').click()
      await page.waitForFunction(percent => {
        const content = document.querySelector('.app-content')
        return getComputedStyle(content).zoom === String(percent / 100) &&
          JSON.parse(localStorage.getItem('settings')).uiScale === percent
      }, {}, percent)
    }
    await applyScale(85)
    const at85 = await scaleInputHeight()
    assert.ok(at85 < at100 - 2, JSON.stringify({ at85, at100 }))
    await page.evaluate(() => { location.hash = '/sync/receive' })
    await page.waitForSelector(send, { visible: true })
    assert.ok(await page.$eval(send, el => el.getBoundingClientRect().height >= 43.9), 'Send stays a 44px touch target at 85%')
    await page.evaluate(() => { location.hash = '/settings/appearance' })
    await page.waitForSelector(scaleInput)
    await applyScale(120)
    const at120 = await scaleInputHeight()
    assert.ok(at120 > at100 + 2, JSON.stringify({ at100, at120 }))
    await page.evaluate(() => { location.hash = '/roller' })
    await page.waitForSelector('.tool-bar')
    async function assertRollerFits() {
      assert.ok(await page.evaluate(() => {
        const bar = document.querySelector('.tool-bar')?.getBoundingClientRect()
        const content = document.querySelector('.app-content')?.getBoundingClientRect()
        const header = document.querySelector('.mobile-nav')?.getBoundingClientRect()
        return bar && header && Math.abs(content.bottom - innerHeight) < 1 && Math.abs(bar.bottom - content.bottom) < 1 &&
          bar.left >= 0 && bar.right <= innerWidth + 1 && Math.abs(header.bottom - content.top) < 1 &&
          getComputedStyle(document.querySelector('.app-content')).zoom === '1.2'
      }), 'Scaled content and mode bar fit the physical viewport')
    }
    await assertRollerFits()
    if (viewport.width === 320) {
      // Rotate the same device with the setting already applied.
      await page.setViewport({ width: 780, height: 360, isMobile: true, hasTouch: true, isLandscape: true })
      await assertRollerFits()
    }
    await page.reload()
    await page.waitForSelector('.tool-bar')
    await assertRollerFits()
    assert.deepEqual(errors, [])
    await context.close()
    console.log(viewport.width + '×' + viewport.height + ': splash, compact navigation, scanner/send, and persisted 85%/120% settings fit.')
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  server.httpServer.closeAllConnections?.()
  await new Promise(resolve => server.httpServer.close(resolve))
}
