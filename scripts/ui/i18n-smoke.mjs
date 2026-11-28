// After building: node scripts/ui/i18n-smoke.mjs [dist directory]
// Set CHROME_PATH for Chromium installations other than Microsoft Edge.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({ logLevel: 'error', build: { outDir: resolve(process.argv[2] || 'dist') }, preview: { host: '127.0.0.1', port: 0 } })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const privateData = {
  person: '龘 Hidden Student',
  personAlias: 'Ŧest Alias',
  nameClue: '龘',
  aliasClue: 'Ŧ',
  guess: 'Hidden Guess',
  personId: 'private-student-id',
  roster: 'Private Classroom',
  alternateRoster: 'Confidential Classroom',
  prizeList: 'Private Prize List',
  prize: 'Private Prize Name',
  quality: 'Secret Prize Quality',
  field: 'Hidden Input Value',
  password: 'Hidden Password',
  seat: 'Hidden Seating Entry'
}
const requests = []
const failures = []
let browser

try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  const page = await browser.newPage()
  page.on('pageerror', error => failures.push(error.message))
  await page.setViewport({ width: 1240, height: 900 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.setRequestInterception(true)
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === origin || !/^https?:$/.test(url.protocol)) return request.continue()
    if (url.hostname !== 'edge.microsoft.com' || url.pathname !== '/translate/translatetext') return request.abort()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': '*' }
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers })
    const payload = JSON.parse(request.postData() || '[]')
    const texts = payload.map(value => typeof value === 'string' ? value : value.Text ?? value.text)
    requests.push(...texts)
    const to = url.searchParams.get('to')
    const result = texts.map((_, i) => ({ translations: [{ text: `⟦проверка ${i}⟧`, to }] }))
    return request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.evaluateOnNewDocument(data => {
    const person = { id: data.personId, cn: data.person, en: data.personAlias, gender: 'female', isWhiteList: false, groupId: '' }
    const defaultList = { id: 'default', name: data.roster, names: [person], groups: [] }
    const alt = { id: 'alt', name: data.alternateRoster, names: [], groups: [] }
    const prize = { id: 'private-prize-id', name: data.prize, quality: data.quality, quantity: 4, weight: 1 }
    const record = { id: 'record', prizeId: prize.id, prizeListId: 'default', peopleListId: 'default', personId: person.id, mode: 'assign', time: 1700000000000 }
    if (!localStorage.getItem('lists')) localStorage.setItem('lists', JSON.stringify({ default: defaultList, alt }))
    if (!localStorage.getItem('prizes')) localStorage.setItem('prizes', JSON.stringify({ lists: { default: { id: 'default', name: data.prizeList, prizes: [prize] } }, currentId: 'default', records: [record] }))
    if (!localStorage.getItem('records')) localStorage.setItem('records', JSON.stringify([{ listId: 'default', personId: person.id, source: 'roller', time: record.time }]))
    if (!localStorage.getItem('settings')) localStorage.setItem('settings', JSON.stringify({ language: 'zh', extraLanguage: 'russian', disableSplash: true, dockCollapsed: false, uiScale: 80, uiScaleVersion: 2, perfAnimations: false }))
  }, privateData)
  const navigate = async (hash, selector) => {
    await page.evaluate(path => { location.hash = '#' + path }, hash)
    await page.waitForSelector(selector)
  }
  const content = (selector, expected) => page.waitForFunction((sel, str) => document.querySelector(sel)?.textContent.trim() === str, { timeout: 12000 }, selector, expected)
  const attribute = (selector, name, expected) => page.waitForFunction((sel, attr, str) => document.querySelector(sel)?.getAttribute(attr) === str, { timeout: 12000 }, selector, name, expected)
  const machine = async (selector, name = '') => page.waitForFunction((sel, attr) => {
    const node = document.querySelector(sel)
    const value = attr ? node?.getAttribute(attr) : node?.textContent
    return value?.includes('⟦проверка ')
  }, { timeout: 12000 }, selector, name)

  await page.goto(origin + '/#/roller/relay', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await content('.relay-headline', 'Кто зажжёт фонарь?')
  await attribute('.dock-item[href="#/roller"]', 'title', 'Инструменты переклички')
  await attribute('#roller-tab-RollerRelay', 'aria-label', 'Эстафета светлячков')
  await machine('.classroom-head p')
  await page.click('.relay-advance')
  await content('.relay-headline', privateData.person)

  await navigate('/records', '.record-item')
  await page.waitForFunction(() => [...document.querySelectorAll('.ri-source')].some(node => node.textContent === 'Случайный выбор из списка'), { timeout: 12000 })
  await content('.ri-name', privateData.person + ' (' + privateData.personAlias + ')')
  await content('.ri-list', privateData.roster)

  await navigate('/statistics', '.stats-header')
  await page.click('.stats-header button.fluent-select')
  await page.waitForFunction(name => [...document.querySelectorAll('.fluent-select-dropdown [translate="no"]')].some(node => node.textContent === name), {}, privateData.roster)
  await page.keyboard.press('Escape')

  await navigate('/roller/seats', '.seat-view')
  await page.waitForSelector('.desk[data-seat-id]')
  await page.click('.seat-controls button.fluent-select')
  await page.waitForSelector('.fluent-select-dropdown [translate="no"]')
  assert.ok((await page.$eval('.fluent-select-dropdown', menu => menu.textContent)).includes(privateData.alternateRoster))
  await page.keyboard.press('Escape')
  await page.click('.seat-chart-actions button')
  await machine('#seat-table', 'placeholder')
  await page.$eval('#seat-table', (input, value) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, privateData.seat)
  await page.waitForSelector('.paste-errors [translate="no"]')
  await page.evaluate(data => {
    const probe = document.createElement('div')
    probe.innerHTML = '<button type="button" title="动态工具提示" aria-label="动态按钮">新的界面标签</button><input placeholder="动态输入提示"><input type="password" placeholder="动态密码提示"><span contenteditable></span>'
    probe.id = 'translation-smoke-probe'
    probe.querySelector('input').value = data.field
    probe.querySelector('[type="password"]').value = data.password
    probe.querySelector('[contenteditable]').textContent = data.field
    document.body.append(probe)
  }, privateData)
  await machine('#translation-smoke-probe button', 'aria-label')
  await machine('#translation-smoke-probe button', 'title')
  await machine('#translation-smoke-probe input', 'placeholder')
  await machine('#translation-smoke-probe [type="password"]', 'placeholder')
  assert.equal(await page.$eval('#translation-smoke-probe [type="password"]', input => input.value), privateData.password)

  await navigate('/roller/riddle', '.open-note:not(:disabled)')
  await page.click('.open-note')
  await machine('.letter-tiles', 'aria-label')
  await machine('.letter-tiles button', 'aria-label')
  await machine('#petal-guess', 'placeholder')
  await content('.note-center p [translate="no"]', privateData.aliasClue)
  await page.click('.letter-tiles button')
  await content('.letter-tiles .lifted', privateData.nameClue)
  await page.type('#petal-guess', privateData.guess)
  await page.click('.hint-actions button:last-child')
  await content('.recipient', privateData.person)
  await content('.note-center p[translate="no"]', privateData.personAlias)

  await navigate('/lottery/draw', '.draw-card')
  await page.waitForFunction(name => document.querySelector('.prize-list-picker select option')?.textContent.trim() === name, {}, privateData.prizeList)
  await navigate('/lottery/records', '.record-row')
  await content('.lottery-record-person', privateData.person)
  await content('.lottery-record-prize', privateData.prize)
  await navigate('/lottery/prizes', '.prize-row')
  await content('.prize-row .quality-badge', privateData.quality)
  await navigate('/lottery/records', '.record-row')
  await page.click('.records-toolbar button')
  await content('.fluent-modal strong[translate="no"]', privateData.prizeList)
  await page.keyboard.press('Escape')

  await navigate('/settings/general', '#interface-language')
  await page.waitForFunction(() => document.querySelector('label[for="interface-language"]')?.textContent === 'Язык интерфейса')
  assert.equal(await page.$eval('#interface-language option[value="russian"]', option => option.textContent), 'Русский')
  await page.select('#interface-language', 'en')
  await content('label[for="interface-language"]', 'Interface language')
  await attribute('#translation-smoke-probe button', 'aria-label', '动态按钮')
  await attribute('#translation-smoke-probe input', 'placeholder', '动态输入提示')
  await navigate('/roller/relay', '.relay-headline')
  await page.waitForFunction(name => ['Who goes first?', name].includes(document.querySelector('.relay-headline')?.textContent), {}, privateData.person)
  await attribute('#roller-tab-RollerRelay', 'aria-label', 'Firefly Relay')

  assert.ok(requests.length > 0, 'machine requests were exercised')
  for (const phrase of Object.values(privateData)) {
    assert.ok(!requests.some(text => String(text).includes(phrase)), `Translation request contained private data: ${phrase}`)
  }
  assert.ok(!requests.some(text => ['随机点名', '谁来点亮？'].includes(String(text).trim())), 'exact glossary phrases should not use the network')
  assert.deepEqual(failures, [])
  console.log('i18n: Russian roll call and relay, ordinary and accessible copy, language reset, and private values absent from translation requests')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
