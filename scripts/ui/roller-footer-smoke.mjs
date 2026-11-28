// node scripts/ui/roller-footer-smoke.mjs; CHROME_PATH overrides the system Edge binary.
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'

const dev = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['index.html'] } })
await dev.listen()
const origin = 'http://127.0.0.1:' + dev.httpServer.address().port
let browser
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(90000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', r => /^https?:/.test(r.url()) && !r.url().startsWith(origin + '/') ? r.abort() : r.continue())
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('lists')) return
    const names = Array.from({ length: 32 }, (_, i) => ({ id: 'p' + i, cn: 'Person ' + i, gender: 'female' }))
    localStorage.setItem('lists', JSON.stringify({ default: { id: 'default', name: 'Class', names, groups: [] } }))
    localStorage.setItem('settings', JSON.stringify({ language: 'en', disableSplash: true, perfAnimations: false, uiScale: 100, uiScaleVersion: 2 }))
    localStorage.setItem('cardSettings', JSON.stringify({ cardCount: 26, quickCount: 2 }))
  })
  const measure = () => page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect()
    const bar = rect('.tool-bar'), panel = rect('.tool-panel'), tab = rect('.tool-tab[aria-selected=true]'), badge = rect('.tool-version-host .version-badge')
    const strip = rect('.tool-pivot'), content = rect('.app-content'), dock = rect('.dock')
    return {
      top: bar.top, bottom: bar.bottom, width: bar.width, panelBottom: panel.bottom, height: innerHeight,
      besideDock: bar.left >= dock.right - 1, panelUsesTop: panel.top <= content.top + 1,
      badgeClear: badge.top >= strip.bottom - 1 || badge.left >= strip.right - 1,
      selectedVisible: tab.left >= strip.left - 1 && tab.right <= strip.right + 1
    }
  })
  const clickable = selector => page.$eval(selector, element => {
    const r = element.getBoundingClientRect(), bar = document.querySelector('.tool-bar').getBoundingClientRect()
    return r.bottom <= bar.top + 1 && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })
  for (const viewport of [{ width: 1440, height: 850 }, { width: 390, height: 715 }]) {
    await page.setViewport(viewport)
    await page.goto(origin + '/#/roller', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.tool-version-host .version-badge')
    await page.waitForSelector('.start-btn:not(.btn-dimmed)')
    await page.waitForFunction(() => document.querySelector('.dock')?.getAnimations().every(a => a.playState !== 'running'))
    const initial = await measure()
    assert.ok(Math.abs(initial.bottom - initial.height) <= 1 && Math.abs(initial.panelBottom - initial.top) <= 1, JSON.stringify(initial))
    assert.ok(initial.besideDock && initial.panelUsesTop && initial.badgeClear && initial.selectedVisible, JSON.stringify(initial))
    assert.ok(await clickable('.start-btn'), 'start button must remain above the tools')
    assert.equal(await page.$eval('.tool-pivot', strip => getComputedStyle(strip).scrollbarWidth), 'none')
    if (viewport.width === 390) {
      await page.waitForSelector('.strip-next')
      const scrollbar = '.tool-scrollbar.fluent-scroll-bar.orientation-horizontal'
      await page.waitForSelector(scrollbar)
      assert.equal(await page.$('.strip-back'), null)
      const thumb = scrollbar + ' .scroll-bar-thumb'
      const thumbStart = await page.$eval(thumb, t => t.style.left)
      for (let i = 0; i < 12 && await page.$('.strip-next'); i++) await page.click('.strip-next')
      assert.equal(await page.$('.strip-next'), null, 'no forward hint at the last tool')
      assert.ok(await page.$('.strip-back'))
      assert.ok(parseFloat(await page.$eval(thumb, t => t.style.left)) > parseFloat(thumbStart), 'arrows move the library thumb')
      assert.equal(await page.$eval('.tool-tab[aria-selected=true]', t => t.id), 'roller-tab-Roller', 'paging must not switch tools')
      assert.equal((await measure()).top, initial.top, 'overflow controls must not change footer height')
      await page.click('.strip-back')
      const track = await page.$eval(scrollbar + ' .scroll-bar-track', t => {
        const r = t.getBoundingClientRect()
        return { x: r.left + 1, y: r.top + r.height / 2 }
      })
      await page.mouse.click(track.x, track.y)
      await page.waitForFunction(() => document.querySelector('.tool-pivot').scrollLeft < 10)
      const grip = await page.$eval(thumb, t => {
        const r = t.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      await page.mouse.move(grip.x, grip.y)
      await page.mouse.down()
      await page.mouse.move(grip.x + 28, grip.y, { steps: 5 })
      await page.waitForFunction(() => document.querySelector('.tool-pivot').scrollLeft > 20)
      await page.mouse.up()
      await page.waitForSelector('.strip-next')
    } else {
      assert.equal(await page.$('.strip-arrow'), null, 'no paging controls when all tabs fit')
      assert.equal(await page.$('.tool-scrollbar'), null)
      const widenLabels = width => page.$$eval('.tool-tab', (tabs, width) => {
        for (const tab of tabs) tab.style.minWidth = width
      }, width)
      await widenLabels('250px')
      await page.waitForSelector('.tool-scrollbar.fluent-scroll-bar.orientation-horizontal')
      assert.equal((await measure()).top, initial.top, 'the scrollbar fits within the existing footer height')
      await widenLabels('')
      await page.waitForSelector('.tool-scrollbar', { hidden: true })
    }
    await page.focus('#roller-tab-Roller')
    await page.keyboard.press('ArrowRight')
    await page.waitForSelector('.card-view .card.show')
    await page.$eval('.tool-panel', panel => { panel.scrollTop = panel.scrollHeight })
    await page.waitForFunction(() => {
      const p = document.querySelector('.tool-panel')
      return p.scrollTop > 0 && p.scrollTop + p.clientHeight >= p.scrollHeight - 2 && document.querySelector('.app-content').scrollTop === 0
    })
    const after = await measure()
    assert.ok(Math.abs(after.top - initial.top) <= 1 && Math.abs(after.bottom - initial.bottom) <= 1, JSON.stringify(after))
    const bottomAction = '.card-controls .ctrl-row:last-child button:last-of-type'
    assert.ok(await clickable(bottomAction), 'last card action must be visible and hit-testable')
    await page.focus('#roller-tab-Card')
    await page.keyboard.press('End')
    await page.waitForSelector('#roller-tab-RollerTeams[aria-selected=true]')
    assert.ok((await measure()).selectedVisible)
    assert.equal(await page.$eval('.tool-panel', p => p.scrollTop), 0)
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'roller-tool-panel')
    console.log(viewport.width + '×' + viewport.height + ': fixed footer ' + Math.round(after.top) + '–' + Math.round(after.bottom) + '; independent scroll, badge, selected tab and actions clear.')
  }
  await page.evaluate(() => { location.hash = '/statistics' })
  await page.waitForSelector('.app-layout > .version-badge')
  assert.equal(await page.$eval('.app-layout > .version-badge', e => getComputedStyle(e).position), 'fixed')
  await page.evaluate(() => { location.hash = '/roller/riddle' })
  await page.waitForSelector('.route-page-stage .tool-version-host .version-badge')
  assert.ok((await measure()).badgeClear)
  assert.deepEqual(errors, [])
} finally {
  await browser?.close()
  await dev.close()
}
