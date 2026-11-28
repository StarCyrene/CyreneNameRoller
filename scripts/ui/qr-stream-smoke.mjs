// Build first, then: node scripts/ui/qr-stream-smoke.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({
  logLevel: 'error',
  build: { outDir: process.env.UI_SMOKE_OUT_DIR || 'dist' },
  preview: { host: '127.0.0.1', port: 0 },
})
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const roster = {
  id: 'qr-smoke-roster', name: '扫码测试名单', groups: [{ id: 'a', name: '第一组' }],
  names: Array.from({ length: 100 }, (_, i) => ({
    id: randomUUID(), cn: '李' + String.fromCodePoint(0x6600+i), en: 'Student ' + i,
    gender: i % 2 ? 'male' : 'female', groupId: i % 2 ? 'a' : '', isWhiteList: i % 5 === 0,
  })),
}
let browser
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
  const errors = []
  async function setup(page, sample, viewport) {
    await page.setViewport(viewport)
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    await page.setRequestInterception(true)
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) return request.abort()
      if (request.url() === origin + '/names.json') return request.respond({ contentType: 'application/json', body: '{"names":[]}' })
      return request.continue()
    })
    await page.evaluateOnNewDocument(roster => {
      localStorage.setItem('settings', JSON.stringify({ language: 'en', disableSplash: true, perfAnimations: false, uiScale: 100, uiScaleVersion: 2 }))
      if (roster && !localStorage.getItem('lists')) {
        localStorage.setItem('lists', JSON.stringify({ [roster.id]: roster }))
        localStorage.setItem('currentListId', JSON.stringify(roster.id))
      }
    }, sample)
  }
  const desktop = await browser.newPage()
  await setup(desktop, roster, { width: 1440, height: 820 })
  await desktop.evaluateOnNewDocument(() => {
    window.qrImages = []
    new MutationObserver(() => {
      const code = document.querySelector('.qr-display img')?.getAttribute('src')
      if (code && code !== window.qrImages.at(-1)) window.qrImages.push(code)
    }).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ['src'] })
  })
  await desktop.goto(origin + '/#/lists')
  await desktop.locator('button ::-p-text(Sync to phone)').click()
  const fps = '.qr-rate .fluent-select'
  await desktop.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('10 FPS'), {}, fps)
  await desktop.click(fps)
  await desktop.locator('.fluent-select-dropdown .select-option ::-p-text(15 FPS)').click()
  await desktop.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('15 FPS'), {}, fps)
  await desktop.click(fps)
  await desktop.locator('.fluent-select-dropdown .select-option ::-p-text(10 FPS)').click()
  await desktop.waitForFunction(() => window.qrImages.length >= 32)
  assert.equal(await desktop.$('.qr-rate select'), null)
  const frames = await desktop.evaluate(() => window.qrImages.slice(0, 32))
  await desktop.close()

  const mobileContext = await browser.createBrowserContext()
  const phone = await mobileContext.newPage()
  await setup(phone, null, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await phone.evaluateOnNewDocument(dataUrls => {
    window.cameraTracks = []
    window.focusRequests = []
    let requests = 0
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async constraints => {
        if (++requests === 1) throw new DOMException('Denied by test', 'NotAllowedError')
        window.cameraRequest = constraints
        const canvas = document.createElement('canvas')
        canvas.width = 640; canvas.height = 480
        const ctx = canvas.getContext('2d')
        const images = await Promise.all(dataUrls.map(async url => {
          const img = new Image()
          img.src = url
          await img.decode()
          return img
        }))
        ctx.fillStyle = '#eee'
        ctx.fillRect(0, 0, 640, 480)
        let index = 4 // The phone joins midstream.
        const stream = canvas.captureStream(24)
        const [track] = stream.getVideoTracks()
        window.cameraTracks.push(track)
        track.getCapabilities = () => ({ focusMode: ['continuous', 'single-shot'] })
        track.getConstraints = () => ({ width: { ideal: 1280 } })
        track.applyConstraints = async settings => {
          window.focusRequests.push({ width: settings.width?.ideal, mode: settings.advanced.at(-1).focusMode })
        }
        const timer = setInterval(() => {
          if (track.readyState === 'ended') { clearInterval(timer); return }
          ctx.fillRect(0, 0, 640, 480)
          if (index !== 9 && index !== 10) {
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(images[index % images.length], 168 + index % 3, 88, 304, 304)
          }
          index++
        }, 100)
        return stream
      },
    })
  }, frames)
  await phone.goto(origin + '/#/lists')
  const nav = '.mobile-nav button[aria-controls="main-navigation"]'
  const scan = '#main-navigation a[href="#/sync/receive"]'
  await phone.waitForSelector(nav, { visible: true })
  assert.equal(await phone.$('.mobile-nav a[href="#/sync/receive"]'), null)
  await phone.waitForSelector(scan, { hidden: true })
  await phone.click(nav)
  await phone.waitForSelector(scan, { visible: true })
  await phone.keyboard.press('Escape')
  await phone.waitForSelector('#main-navigation', { hidden: true })
  await phone.click(nav)
  await phone.click(scan)
  await phone.waitForFunction(() => document.querySelector('.qr-error[role="alert"]')?.textContent.includes('permission was denied'))
  assert.ok(await phone.$eval('.qr-send-from-device', el => el.getBoundingClientRect().height >= 43.5))
  await phone.locator('button ::-p-text(Start camera)').click()
  await phone.waitForFunction(() => window.focusRequests[0]?.mode === 'continuous')
  await phone.locator('button ::-p-text(Refocus)').click()
  assert.deepEqual(await phone.evaluate(() => window.focusRequests.slice(0, 2)), [
    {width: 1280, mode: 'continuous'}, {width: 1280, mode: 'single-shot'}
  ])
  await phone.waitForSelector('.qr-success')
  await phone.waitForFunction(() => location.hash === '#/lists' && document.querySelectorAll('.person-item').length === 100)
  assert.equal(await phone.$eval('.person-cn', el => el.textContent), roster.names[0].cn)
  assert.deepEqual(await phone.evaluate(id => JSON.parse(localStorage.getItem('lists'))[id], roster.id), roster)
  assert.equal(await phone.evaluate(() => window.cameraRequest.video.facingMode.ideal), 'environment')
  assert.equal(await phone.evaluate(() => window.cameraRequest.video.width.ideal), 1280)
  assert.equal(await phone.evaluate(() => window.cameraTracks[0].readyState), 'ended')
  await phone.reload()
  await phone.waitForFunction(() => document.querySelectorAll('.person-item').length === 100)
  assert.deepEqual(errors, [])
  console.log('Desktop QR stream → mobile camera retry → worker decode with obstructions → persisted 100 names after reload.')
} finally {
  await browser?.close()
  await new Promise(resolve => {
    server.httpServer.close(resolve)
    server.httpServer.closeAllConnections?.()
  })
}
