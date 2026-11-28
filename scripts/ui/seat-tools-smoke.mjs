// After building: node scripts/ui/seat-tools-smoke.mjs [dist directory]
// Set CHROME_PATH to a Chromium executable on systems without Microsoft Edge.
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
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewport({ width: 1170, height: 800 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.setRequestInterception(true)
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin + '/')) r.abort(); else r.continue() })
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('lists')) return
    const roster = (id, n) => Array.from({ length: n }, (_,i) => ({ id: id+i, cn: id+i, en: '', gender: i ? 'male' : 'female', isWhiteList: false, groupId: '' }))
    const small = roster('b', 3); small[1].cn = small[2].cn = 'Lee'
    const medium = roster('m', 13)
    medium.forEach((p,i) => { p.cn = '同学' + (i + 1) })
    localStorage.setItem('lists', JSON.stringify({ default: { id:'default',name:'Large',names:roster('a', 34),groups:[] }, medium:{ id:'medium',name:'Medium',names:medium,groups:[] }, other:{ id:'other',name:'Small',names:small,groups:[] } }))
    localStorage.setItem('settings', JSON.stringify({ language:'en', disableSplash:true, dockCollapsed:true, uiScale:80, uiScaleVersion:2, perfAnimations:false }))
  })
  const clickText = (selector, text) => page.evaluate(({ selector,text }) => {
    const button = [...document.querySelectorAll(selector)].find(el=>el.innerText.trim() === text)
    if (!button) throw new Error('Missing control: ' + text)
    button.click()
  }, { selector, text })
  const switchList = async (selector, label) => {
    await page.click(selector + ' button.fluent-select')
    await page.waitForSelector('.fluent-select-dropdown')
    await clickText('.fluent-select-dropdown > *', label)
  }
  const paste = value => page.$eval('#seat-table', (input,text) => { input.value = text; input.dispatchEvent(new Event('input',{bubbles:true})) }, value)
  const ids = () => page.$$eval('.seat-map button', els => els.map(el => el.dataset.seatId || null))
  const navigate = async (name, selector) => { await page.click('#roller-tab-' + name); await page.waitForSelector(selector) }
  await page.goto(origin + '/#/roller/wheel', { waitUntil:'domcontentloaded', timeout:60000 })
  await page.waitForSelector('.wheel-hub:not(:disabled)')
  assert.equal(await page.$$eval('.wheel-dial line', els => els.length), 34)
  await switchList('.wheel-field', 'Medium')
  await page.waitForFunction(() => document.querySelectorAll('.wheel-dial line').length === 13)
  assert.deepEqual(await page.$$eval('.wheel-dial text', els => els.map(el => el.textContent)), Array.from({ length:13 }, (_, i) => '同学' + (i + 1)))
  await switchList('.wheel-field', 'Large')
  await page.waitForFunction(() => document.querySelectorAll('.wheel-dial line').length === 34)
  await page.click('.wheel-key summary')
  await page.waitForSelector('.wheel-key li')
  assert.equal(await page.$$eval('.wheel-key li', els => els.length), 24)
  await clickText('.wheel-key-nav button', 'Next')
  assert.equal(await page.$$eval('.wheel-key li', els => els.length), 10)
  await page.click('.wheel-key summary')
  await page.evaluate(() => { document.querySelector('.wheel-hub').click(); document.querySelector('.spin-action').click() })
  await page.waitForSelector('.winner [data-authority="host-verified"]')
  const [wheelRecord] = await page.evaluate(() => JSON.parse(localStorage.getItem('records')))
  assert.equal(wheelRecord.personId, (await page.$eval('.winner', el=>el.innerText)).trim())
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('records')).length), 1)
  await page.click('.wheel-filters label:last-child')
  await page.focus('.wheel-hub'); await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.winner')?.innerText.trim() === 'a0')
  console.log('Wheel: large roster, committed winner, no duplicate click, keyboard + gender filter')

  await navigate('Card', '.card.show')
  await page.evaluate(() => { const c = document.querySelector('.card.show'); c.click(); c.click(); document.querySelector('#roller-tab-RollerWheel').click() })
  await page.waitForSelector('.wheel-hub')
  await navigate('Card', '.history-chip')
  assert.equal(await page.$$eval('.history-chip',els=>els.length),1)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('records')).filter(r=>r.source === 'card').length),1)
  await switchList('.card-controls','Small')
  await page.waitForFunction(() => !document.querySelector('.history-chip') && document.querySelector('.remaining-badge')?.innerText.includes('3') && document.querySelector('.card.show'))
  await clickText('.card-controls button','Draw')
  await page.waitForFunction(() => document.querySelectorAll('.card.flipped').length === 3)
  assert.deepEqual(await page.evaluate(() => ['default','other'].map(id => JSON.parse(localStorage.getItem('cardTray:'+id)).used.length)),[1,3])
  console.log('Cards: double click, immediate unmount/remount, per-list trays and batch commit')

  await navigate('RollerSeats','.desk')
  await page.click('.seat-draw')
  await page.waitForSelector('.seat-address')
  assert.match(await page.$eval('.seat-address',e=>e.innerText),/^Position /)
  await clickText('.seat-chart-actions button','Paste seating chart')
  await paste('Lee\tmissing')
  await page.waitForSelector('.paste-errors')
  assert.match(await page.$eval('.paste-errors',e=>e.innerText), /b1 \/ b2/)
  assert.ok(await page.$eval('.paste-actions button',e=>e.disabled))
  assert.deepEqual(await ids(),['b0','b1','b2'])
  await paste('b2\t\tb0\n\tb1\t')
  await page.waitForFunction(() => document.querySelector('.paste-actions button')?.disabled === false)
  assert.deepEqual(await ids(),['b0','b1','b2'])
  await clickText('.paste-actions button','Use this seating chart')
  await page.waitForSelector('.desk.empty')
  assert.deepEqual(await ids(),['b2',null,'b0',null,'b1',null])
  await clickText('.seat-modes button','Swap seats')
  for (const id of ['b2','b0']) { await page.focus('[data-seat-id="'+id+'"]'); await page.keyboard.press('Space') }
  assert.deepEqual(await ids(),['b0',null,'b2',null,'b1',null])
  await navigate('RollerWheel','.wheel-hub')
  await navigate('RollerSeats','.desk.empty')
  assert.deepEqual(await ids(),['b0',null,'b2',null,'b1',null])
  await page.click('[data-seat-id="b1"]'); await page.click('[data-seat-id="b2"]')
  await page.click('.seat-draw'); await page.waitForSelector('.desk.lit[data-seat-id="b0"]')
  assert.equal(await page.$eval('.seat-address',e=>e.innerText),'Row 1, seat 1')
  await page.click('[data-seat-id="b0"]')
  assert.ok(await page.$eval('.seat-draw',e=>e.disabled))
  await clickText('.seat-toolbar button','Reset attendance')
  await clickText('.seat-chart-actions button','Use roster order')
  assert.deepEqual(await ids(),['b0','b1','b2'])
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lists')).other.names.map(p=>p.id)),['b0','b1','b2'])
  await page.setViewport({width:520,height:780})
  assert.ok(await page.$eval('.classroom',e=>e.getBoundingClientRect().right<=innerWidth+1))
  assert.deepEqual(errors,[])
  console.log('Seats: roster-only draw, invalid import blocked, confirmed Excel gaps, keyboard swap, persistence, absence exclusions, reset, narrow screen')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
