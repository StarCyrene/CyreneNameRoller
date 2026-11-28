// Build first, then: node scripts/ui/roller-tool-strip-smoke.mjs
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({
  logLevel: 'error',
  build: { outDir: process.env.UI_SMOKE_OUT_DIR || 'dist' },
  preview: { host: '127.0.0.1', port: 0 },
})
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
let browser
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')
    ? request.abort() : request.continue())
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('settings', JSON.stringify({ language: 'zh', disableSplash: true, perfAnimations: false, uiScale: 100, uiScaleVersion: 2 }))
    } catch {
      // about:blank 等不可用 localStorage 的文档直接跳过，真正加载应用时会再执行一次。
    }
  })
  const cdp = await page.createCDPSession()

  async function swipe(direction) {
    const bounds = await page.$eval('.tool-pivot', el => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, length: r.width * .38 }
    })
    const send = (type, x) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: x === undefined ? [] : [{x, y: bounds.y}],
    })
    await send('touchStart', bounds.x + bounds.length * direction)
    for (let i = 1; i <= 8; i++) {
      await send('touchMove', bounds.x + bounds.length * direction * (1 - 2 * i / 8))
    }
    await send('touchEnd')
  }

  for (const [width, height] of [[320, 680], [780, 360]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: width > height })
    await page.goto(origin + '/#/roller/wheel')
    await page.waitForSelector('.wheel-view')
    // Navigate to the end without changing routes, then swipe toward the start.
    for (let i = 0; i < 12 && await page.$('.strip-next:not(:disabled)'); i++) await page.tap('.strip-next')
    assert.ok(await page.$('.strip-next:disabled'), 'end arrow disables when all later tools are visible')
    const end = await page.$eval('.tool-pivot', el => el.scrollLeft)
    assert.ok(end > 40)
    await swipe(-1)
    await page.waitForFunction(end => document.querySelector('.tool-pivot').scrollLeft < end - 20, {}, end)
    for (let i = 0; i < 12 && await page.$('.strip-back:not(:disabled)'); i++) await page.tap('.strip-back')
    assert.equal(await page.$eval('.tool-pivot', el => el.scrollLeft), 0)
    await page.tap('#roller-tab-Roller')
    await page.waitForFunction(() => location.hash === '#/roller')
    await page.tap('#roller-tab-Card')
    await page.waitForFunction(() => location.hash === '#/roller/card')
    assert.ok(await page.$eval('.tool-bar', bar => bar.getBoundingClientRect().bottom <= innerHeight + 1))
  }
  assert.deepEqual(errors, [])
  console.log('The compact tool strip returns to its first items via touch and arrow in both orientations; Roll and Card stay reachable.')
} finally {
  await browser?.close()
  await new Promise(resolve => { server.httpServer.close(resolve); server.httpServer.closeAllConnections?.() })
}
