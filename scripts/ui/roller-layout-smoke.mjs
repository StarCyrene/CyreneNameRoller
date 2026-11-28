// After building: node scripts/ui/roller-layout-smoke.mjs [dist directory]
// Optionally set ROLLER_LAYOUT_SCREENSHOTS to save a wide/narrow image per mode.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const screenshots = process.env.ROLLER_LAYOUT_SCREENSHOTS
if (screenshots) await mkdir(screenshots, { recursive: true })
const server = await preview({ logLevel: 'error', build: { outDir: resolve(process.argv[2] || 'dist') }, preview: { host: '127.0.0.1', port: 0 } })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const modes = [
  ['wheel', '.wheel-frame', '.spin-action', .66, .34],
  ['tunnel', '.tunnel', '.tunnel-draw', .43, .69],
  ['seats', '.seat-map', '.seat-draw', .35, .65],
  ['relay', '.relay-stage', '.relay-advance', .36, .42],
  ['riddle', '.flower-note', '.open-note', .40, .43],
  ['teams', '.team-studio', '.team-setup button', .36, .60]
]

let browser
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.setRequestInterception(true)
  page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(origin + '/') ? request.abort() : request.continue())
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('lists')) return
    const names = Array.from({ length: 13 }, (_, index) => ({
      id: 'person-' + index, cn: '同学' + (index + 1), en: 'Student ' + (index + 1), gender: index % 2 ? 'female' : 'male', groupId: '', isWhiteList: false
    }))
    localStorage.setItem('lists', JSON.stringify({ default: { id: 'default', name: '十三人名单', names, groups: [] } }))
    localStorage.setItem('settings', JSON.stringify({ language: 'zh', disableSplash: true, dockCollapsed: false, uiScale: 80, uiScaleVersion: 2, perfAnimations: false }))
  })
  const measure = (stageSelector, actionSelector) => page.evaluate((stageSelector, actionSelector) => {
    const panel = document.querySelector('.tool-panel')
    const rect = node => node.getBoundingClientRect().toJSON()
    return {
      panel: rect(panel), footer: rect(document.querySelector('.tool-bar')),
      stage: rect(document.querySelector(stageSelector)), action: rect(document.querySelector(actionSelector)),
      horizontalOverflow: panel.scrollWidth - panel.clientWidth
    }
  }, stageSelector, actionSelector)
  const viewports = [
    { key: 'wide', width: 1600, height: 960 },
    { key: 'short', width: 1280, height: 600 },
    { key: 'narrow', width: 390, height: 715 },
    { key: 'compact', width: 320, height: 740 }
  ]
  let previous = null
  for (const { key, width, height } of viewports) {
    await page.setViewport({ width, height })
    for (const [route, stageSelector, actionSelector, minHeight, minWidth] of modes) {
      const hash = '/roller/' + route
      if (previous === null) await page.goto(origin + '/#' + hash, { waitUntil: 'domcontentloaded', timeout: 60000 })
      else await page.evaluate(path => { location.hash = '#' + path }, hash)
      previous = hash
      await page.waitForSelector(stageSelector, { visible: true })
      await page.waitForSelector(actionSelector + ':not(:disabled)', { visible: true })
      await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      let { panel, footer, stage, action, horizontalOverflow } = await measure(stageSelector, actionSelector)
      const context = key + ' ' + route
      assert.ok(Math.abs(footer.top - panel.bottom) <= 2 && Math.abs(footer.bottom - height) <= 2, context + ' footer remains below the scrolling panel')
      assert.ok(horizontalOverflow <= 2, context + ' does not scroll the entire panel sideways')
      assert.ok(action.left >= panel.left - 2 && action.right <= panel.right + 2, context + ' action stays within the panel')
      if (key === 'wide') {
        assert.ok(stage.height >= panel.height * minHeight && stage.width >= panel.width * minWidth,
          context + ' stage uses available space: ' + Math.round(stage.width) + '×' + Math.round(stage.height) + ' within ' + Math.round(panel.width) + '×' + Math.round(panel.height))
        assert.ok(action.top >= panel.top - 1 && action.bottom <= panel.bottom + 1, context + ' primary action is initially in view')
      }
      if (key === 'compact' && route === 'teams') {
        assert.ok(action.bottom <= panel.bottom + 1, context + ' shows the setup above the star chart')
      }
      if (screenshots && (key === 'wide' || key === 'narrow')) await page.screenshot({ path: resolve(screenshots, key + '-' + route + '.png') })
      await page.$eval(actionSelector, element => element.scrollIntoView({ block: 'nearest' }))
      ;({ panel, footer, action } = await measure(stageSelector, actionSelector))
      assert.ok(action.top >= panel.top - 1 && action.bottom <= panel.bottom + 1 && Math.abs(footer.bottom - height) <= 2,
        context + ' primary action can be reached without moving the footer')
      console.log(context + ': ' + Math.round(stage.width) + '×' + Math.round(stage.height) + ' stage / ' + Math.round(panel.width) + '×' + Math.round(panel.height) + ' panel')
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
