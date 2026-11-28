// After building: node scripts/ui/i18n-matrix-smoke.mjs [dist directory]
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'
import { EXTRA_LANGUAGES } from '../../src/utils/settingsLocale.mjs'
import { exactUiTranslation } from '../../src/utils/i18nGlossary.mjs'

const server = await preview({ logLevel: 'error', build: { outDir: resolve(process.argv[2] || 'dist') }, preview: { host: '127.0.0.1', port: 0 } })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': '*' }
const probeCopy = {
  zh: { text: '通过 Microsoft Edge 翻译整句文字。', label: '复制到 Windows · 3 项', from: 'zh-CHS' },
  en: { text: 'Translate all 18 items with Microsoft Edge.', label: 'Copy to Windows · 3 items', from: 'en' },
}
const PRIVATE = ['Confidential Name', 'Secret Accessible Value', 'Undisclosed Input Content', '名单隐私标签']
const heldCopy = 'Old result from Microsoft Edge.'
const replacementCopy = 'Updated text from Microsoft Edge.'
const toolLabels = [
  ['Roller', '滚动点名', 'Roller'], ['Card', '翻牌点名', 'Cards'], ['RollerWheel', '转盘点名', 'Wheel'],
  ['RollerTunnel', '光轨穿梭', 'Light Tunnel'], ['RollerSeats', '座次寻光', 'Seat Spotlight'],
  ['RollerRelay', '流萤传灯', 'Firefly Relay'], ['RollerRiddle', '花笺藏名', 'Petal Riddle'], ['RollerTeams', '连星成诗', 'Constellations'],
]
const encode = (to, text) => '⟦' + to + ':' + createHash('sha256').update(text).digest('hex').slice(0, 12) + '⟧'
const edgeCode = lang => lang === 'zh-Hant' ? 'zh-CHT' : lang
const eq = (page, selector, expected, attr) => page.waitForFunction((sel, value, name) => {
  const node = document.querySelector(sel)
  return (name ? node?.getAttribute(name) : node?.textContent.trim()) === value
}, { timeout: 11000 }, selector, expected, attr ?? null)

async function translateMatrix(browser, base) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const log = []
  const errors = []
  const probe = probeCopy[base]
  const nativeLang = base === 'zh' ? 'zh-Hans' : 'en'
  const phrase = (zh, en) => base === 'zh' ? zh : en
  let hold = false
  let releaseLateResponse
  let blockNetwork = false
  try {
    await page.setViewport({ width: 1280, height: 900 })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setRequestInterception(true)
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.origin === origin || !/^https?:$/.test(url.protocol)) return request.continue()
      if (url.hostname !== 'edge.microsoft.com' || url.pathname !== '/translate/translatetext' || blockNetwork) return request.abort()
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers })
      const to = url.searchParams.get('to')
      const from = url.searchParams.get('from')
      const texts = JSON.parse(request.postData() || '[]').map(value => typeof value === 'string' ? value : value.Text ?? value.text)
      log.push(...texts.map(text => ({ from, to, text })))
      const result = texts.map(text => ({ translations: [{ text: encode(to, text), to }] }))
      const respond = () => request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(result) })
      if (hold && to === 'ru' && texts.includes(heldCopy)) {
        releaseLateResponse = respond
        return
      }
      return respond()
    })
    await page.evaluateOnNewDocument(({ base, data }) => {
      if (!localStorage.getItem('settings')) localStorage.setItem('settings', JSON.stringify({ language: base, disableSplash: true, dockCollapsed: false, uiScaleVersion: 2, perfAnimations: false }))
      if (!localStorage.getItem('lists')) localStorage.setItem('lists', JSON.stringify({ default: { id: 'default', name: data[3], names: [{ id: 'test-fixture', cn: data[0], en: '', gender: 'female' }], groups: [] } }))
    }, { base, data: PRIVATE })
    const settings = () => navigate('/settings/general', '#interface-language')
    const navigate = async (hash, selector) => {
      await page.evaluate(path => { location.hash = '#' + path }, hash)
      await page.waitForSelector(selector)
    }
    const select = async (target, lang) => {
      await page.select('#interface-language', target)
      await eq(page, 'html', lang, 'lang')
    }
    const heading = (target) => eq(page, 'label[for="interface-language"]', exactUiTranslation(target, phrase('界面语言', 'Interface language')))
    const insertProbe = () => page.evaluate(({ probe, data }) => {
      const shell = document.createElement('section')
      shell.id = 'language-matrix-probe'
      const text = shell.appendChild(document.createElement('span'))
      text.className = 'interface-label'
      text.textContent = probe.text
      text.setAttribute('aria-label', probe.label)
      const privateName = shell.appendChild(document.createElement('span'))
      privateName.className = 'private-name'
      privateName.translate = false
      privateName.textContent = data[0]
      const privateLabel = shell.appendChild(document.createElement('span'))
      privateLabel.textContent = 'English Mode'
      privateLabel.setAttribute('data-i18n-private-attrs', 'title')
      privateLabel.title = data[1]
      const input = shell.appendChild(document.createElement('input'))
      input.value = data[2]
      document.body.appendChild(shell)
    }, { probe, data: PRIVATE })
    const targetCheck = async lang => {
      await eq(page, '#language-matrix-probe .interface-label', encode(edgeCode(lang), probe.text))
      await eq(page, '#language-matrix-probe .interface-label', encode(edgeCode(lang), probe.label), 'aria-label')
      await eq(page, '#language-matrix-probe .private-name', PRIVATE[0])
      assert.equal(await page.$eval('#language-matrix-probe input', input => input.value), PRIVATE[2])
      assert.equal(await page.$eval('#language-matrix-probe [title]', input => input.title), PRIVATE[1])
    }

    await page.goto(origin + '/#/settings/general', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('#interface-language')
    await eq(page, 'html', nativeLang, 'lang')
    await insertProbe()
    for (const target of EXTRA_LANGUAGES) {
      try {
        await settings()
        await select(target.value, target.lang)
        await heading(target.value)
        await targetCheck(target.lang)
        const code = edgeCode(target.lang)
        assert.ok(log.some(item => item.from === probe.from && item.to === code && item.text === probe.text), 'prose should be sent whole with its source language')
        assert.ok(log.some(item => item.from === probe.from && item.to === code && item.text === probe.label), 'an accessible label should be sent whole')
        await navigate('/roller/relay', '.relay-headline')
        await eq(page, '.relay-headline', exactUiTranslation(target.value, phrase('谁来点亮？', 'Who goes first?')))
        await Promise.all(toolLabels.map(([name, zh, en]) => eq(page, '#roller-tab-' + name, exactUiTranslation(target.value, phrase(zh, en)), 'aria-label')))
        assert.equal(await page.$eval('.classroom-field select option', option => option.textContent), PRIVATE[3])
      } catch (error) {
        throw new Error(base + ' → ' + target.value + ': ' + error.message, { cause: error })
      }
    }
    // Cache reuse must work after a fresh page load with the remote service blocked.
    await settings()
    await page.waitForFunction(() => localStorage.getItem('cyrene:i18n-cache:vietnamese'))
    blockNetwork = true
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#interface-language')
    await heading('vietnamese')
    await insertProbe()
    await targetCheck('vi')
    blockNetwork = false

    if (base === 'en') {
      await select('russian', 'ru')
      hold = true
      await page.evaluate(text => {
        const node = document.createElement('span')
        node.id = 'language-matrix-race'
        node.textContent = text
        document.body.appendChild(node)
      }, heldCopy)
      const deadline = Date.now() + 8000
      while (!releaseLateResponse && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
      assert.ok(releaseLateResponse, 'a Russian response should be pending')
      await page.$eval('#language-matrix-race', (node, text) => { node.firstChild.nodeValue = text }, replacementCopy)
      await select('spanish', 'es')
      await eq(page, '#language-matrix-race', encode('es', replacementCopy))
      const responseCompleted = page.waitForResponse(response => response.url().includes('to=ru') && response.status() === 200, { timeout: 3000 })
      await releaseLateResponse()
      await responseCompleted
      await page.waitForNetworkIdle({ idleTime: 250, timeout: 10000 })
      await eq(page, '#language-matrix-race', encode('es', replacementCopy))
      await select(base, nativeLang)
      await eq(page, '#language-matrix-race', replacementCopy)
    } else {
      await select(base, nativeLang)
    }
    await eq(page, '#language-matrix-probe .interface-label', probe.text)
    await eq(page, '#language-matrix-probe .interface-label', probe.label, 'aria-label')
    for (const value of PRIVATE) assert.ok(!log.some(request => request.text.includes(value)), 'private value sent: ' + value)
    assert.deepEqual(errors, [])
    console.log(base + ': 10 target locales, whole copy and ARIA, tool terminology, privacy, offline cache and native reset')
  } finally {
    await context.close()
  }
}

let browser
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const results = await Promise.allSettled(['zh', 'en'].map(base => translateMatrix(browser, base)))
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (failures.length) throw new AggregateError(failures, 'Locale matrix failed')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
