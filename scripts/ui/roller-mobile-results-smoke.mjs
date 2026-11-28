// Build first, then: node scripts/ui/roller-mobile-results-smoke.mjs [dist directory]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({ logLevel: 'error', build: { outDir: resolve(process.argv[2] || 'dist') }, preview: { host: '127.0.0.1', port: 0 } })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
let browser

try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(origin + '/') ? request.abort() : request.continue())
  await page.evaluateOnNewDocument(() => {
    if (window.top !== window || location.protocol !== 'http:' || localStorage.getItem('lists')) return
    const makeList = (id, title) => ({ id, name: title, groups: [], names: Array.from({ length: 100 }, (_, index) => ({
      id: id + '-' + index, cn: id + '同学' + (index + 1) + '，这是用于验证换行及滚动的姓名',
      en: 'Person ' + (index + 1), gender: index % 2 ? 'female' : 'male', groupId: '', isWhiteList: false
    })) })
    localStorage.setItem('lists', JSON.stringify({ default: makeList('default', 'Portrait class'), other: makeList('other', 'Landscape class') }))
    localStorage.setItem('settings', JSON.stringify({ language: 'en', disableSplash: true, uiScale: 100, uiScaleVersion: 2,
      multiMode: true, forbidDuplicates: true, peopleCount: 100, multiStepStop: false, autoStop: false, perfAnimations: false }))
  })

  const screen = (width, height) => page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const draw = async () => {
    await page.locator('.start-btn').click()
    await page.waitForFunction(() => document.querySelector('.start-btn').textContent.trim() === 'Stop')
    await page.locator('.start-btn').click()
    try {
      await page.waitForFunction(() => document.querySelectorAll('.display-container .verified-result').length === 100)
    } catch (cause) {
      const state = await page.evaluate(() => ({ start: document.querySelector('.start-btn').textContent.trim(),
        results: document.querySelectorAll('.display-container .verified-result').length, count: document.querySelector('.count-input input')?.value,
        banner: document.querySelector('.banner-message')?.textContent, settings: JSON.parse(localStorage.getItem('settings'))?.peopleCount }))
      throw new Error('Expected 100 verified results: ' + JSON.stringify({ state, errors }), { cause })
    }
    await page.waitForFunction(() => document.querySelector('.start-btn').textContent.trim() === "Let's ROLL!")
  }
  const check = async (name, sideBySide) => {
    const m = await page.evaluate(async () => {
      const q = s => document.querySelector(s)
      const panel = q('.tool-panel')
      const stage = q('.display-container')
      const footer = () => q('.tool-bar').getBoundingClientRect().toJSON()
      const before = footer()
      // The results scroll independently; this must not click or move controls.
      const outerScroll = panel.scrollTop
      await document.fonts.ready
      stage.scrollTo({ top: stage.scrollHeight, behavior: 'instant' })
      await new Promise(resolveFrame => requestAnimationFrame(resolveFrame))
      return {
        viewport: innerHeight, before, after: footer(), outerStable: outerScroll === panel.scrollTop,
        stage: stage.getBoundingClientRect().toJSON(), scroll: stage.scrollTop,
        last: stage.querySelector('.name-display:last-child').getBoundingClientRect().toJSON(),
        title: q('.roller-title').getBoundingClientRect().toJSON(),
        controls: q('.controls-center').getBoundingClientRect().toJSON(), overflowX: panel.scrollWidth - panel.clientWidth
      }
    })
    assert.ok(m.scroll > 0 && m.outerStable, name + ': 100 results have their own scroll')
    assert.ok(m.last.bottom <= m.stage.bottom + 1 && m.last.top >= m.stage.top - 1, name + ': last result can be read: ' + JSON.stringify(m))
    assert.deepEqual(m.before, m.after, name + ': scrolling results keeps the footer fixed')
    assert.ok(Math.abs(m.after.bottom - m.viewport) < 2, name + ': footer sits at viewport edge')
    assert.ok(m.title.bottom <= m.controls.top + 1, name + ': controls do not cover the heading')
    assert.ok(sideBySide ? m.stage.right <= m.controls.left + 1 : m.stage.bottom <= m.controls.top + 1, name + ': results do not cover controls')
    assert.ok(m.overflowX <= 1, name + ': no page-wide horizontal scrolling')
    await page.$eval('.start-btn', button => button.scrollIntoView({ block: 'nearest' }))
    assert.ok(await page.$eval('.start-btn', button => {
      const box = button.getBoundingClientRect()
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    }), name + ': Start remains tappable')
  }

  await screen(390, 740)
  await page.goto(origin + '/#/roller', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('.start-btn:not(.btn-dimmed)'))
  await page.locator('.draw-count-tabs ::-p-text(Draw multiple people)').click()
  await page.waitForFunction(() => document.querySelector('.count-input input')?.value === '100')
  await draw()
  await check('390x740 portrait', false)

  await screen(780, 360)
  await check('780x360 rotated landscape', true)
  await page.locator('.list-selector-bar .fluent-select').click()
  await page.locator('.fluent-select-dropdown ::-p-text(Landscape class)').click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('currentListId')) === 'other')
  await draw()
  await check('780x360 landscape after changing lists', true)
  assert.ok(await page.$$eval('.verified-result', results => results.every(result => result.textContent.startsWith('other同学'))))

  await screen(320, 520)
  await check('320x520 short portrait', false)
  assert.deepEqual(errors, [])
  console.log('100 verified results remain readable and start, list picker, and footer work across portrait and landscape.')
} finally {
  await browser?.close()
  await new Promise(resolveServer => server.httpServer.close(resolveServer))
}
