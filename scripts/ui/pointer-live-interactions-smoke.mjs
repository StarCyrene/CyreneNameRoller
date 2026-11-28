// node scripts/ui/pointer-live-interactions-smoke.mjs [production output]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({
  logLevel: 'error',
  build: { outDir: resolve(process.argv[2] || 'dist') },
  preview: { host: '127.0.0.1', port: 0 }
})
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const names = Array.from({ length: 32 }, (_, n) => ({
  id: 'person-' + n, cn: '人员 ' + n, en: 'Person ' + n, gender: 'male'
}))
const lists = Object.fromEntries(Array.from({ length: 8 }, (_, n) => {
  const id = n === 0 ? 'default' : 'roster-' + n
  return [id, { id, name: n === 0 ? 'First roster' : 'Other roster ' + n, groups: [], names }]
}))
let browser
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 760, isMobile: true, hasTouch: true })
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.text().includes('interactive capture failed')) errors.push(message.text())
  })
  await page.setRequestInterception(true)
  page.on('request', request => /^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')
    ? request.abort() : request.continue())
  await page.evaluateOnNewDocument(lists => {
    localStorage.setItem('settings', JSON.stringify({
      language: 'en', disableSplash: true, pointerEffects: true, pointerDrawingSpeed: 1,
      pointerDrawingSound: false, uiScale: 100, uiScaleVersion: 2
    }))
    localStorage.setItem('lists', JSON.stringify(lists))
    addEventListener('pointerdown', event => {
      if (event.isTrusted && event.pointerType === 'touch') window.lastTouch = event.target
    }, { capture: true })
  }, lists)

  async function tap(selector) {
    await page.waitForFunction(selector => {
      const el = document.querySelector(selector), rect = el?.getBoundingClientRect()
      return rect?.width && rect.height && el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    }, {}, selector)
    await page.evaluate(() => { window.lastTouch = null })
    await page.tap(selector)
    assert.ok(await page.evaluate(selector => {
      const el = document.querySelector(selector)
      return el?.contains(window.lastTouch) || window.lastTouch?.matches(selector) || window.lastTouch?.closest(selector)
    }, selector), 'expected a trusted touch on ' + selector)
  }

  async function arrive(path, anchor) {
    await page.goto(origin + '/?live=' + encodeURIComponent(path) + '#' + path, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(anchor => {
      const app = window.__divPointers?.app
      const heading = document.querySelector(anchor)
      if (!app?.engine?.started || app.complete || !heading || !app.env.liveInteractions) return false
      const item = app.model.items.find(item => item.kind === 'text' && heading.contains(item.source) && item.shown)
      if (!item?.node?.isConnected) return false
      window.originalSwarm = { app, engine: app.engine, anchor: item.source, node: item.node }
      return true
    }, {}, anchor).catch(async error => {
      const details = await page.evaluate(anchor => {
        const app = window.__divPointers?.app
        return {
          path: location.hash, html: document.querySelector(anchor)?.textContent?.trim(),
          app: !!app, live: app?.env.liveInteractions, complete: app?.complete,
          cover: !!document.querySelector('swarm-cover'), preview: document.querySelector('main h1')?.textContent
        }
      }, anchor)
      throw new Error('Could not observe drawing for ' + path + ': ' + JSON.stringify(details), { cause: error })
    })
  }

  async function painted(selector) {
    await page.waitForFunction(selector => {
      const app = window.__divPointers?.app
      const el = document.querySelector(selector)
      return app && el && app.model.items.some(item => item.kind === 'text' && el.contains(item.source) && item.shown && item.node?.isConnected)
    }, {}, selector)
    const stable = await page.evaluate(() => {
      const app = window.__divPointers?.app, saved = window.originalSwarm
      return app === saved.app && app.engine === saved.engine && !app.complete &&
        app.model.items.some(item => item.source === saved.anchor && item.node === saved.node && item.shown)
    })
    assert.ok(stable, 'reconcile kept the same active run and the already painted heading')
  }

  async function disappears(selector) {
    await page.waitForFunction(selector => {
      const app = window.__divPointers?.app, saved = window.originalSwarm
      return app === saved.app && app.engine === saved.engine &&
        !app.model.items.some(item => item.source?.closest?.(selector) && item.node?.isConnected) &&
        !document.querySelector(selector)
    }, {}, selector)
  }

  await arrive('/lists', '.lists-view h1')
  const dropdown = '.list-header-right .fluent-select'
  const option = '.fluent-select-dropdown .select-option:nth-child(2)'
  await tap(dropdown)
  await painted(option)
  // Close and reopen immediately, then select an actual roster using the DOM.
  await tap(dropdown)
  await tap(dropdown)
  await painted(option)
  await tap(option)
  await disappears('.fluent-select-dropdown')
  assert.equal(await page.$eval(dropdown, el => el.textContent.trim()), 'Other roster 1')
  await page.waitForSelector('div-pointers', { hidden: true })
  await tap(dropdown)
  assert.ok(await page.$(option))
  assert.equal(await page.$('div-pointers'), null)
  await tap(dropdown)
  console.log('Touch roster menu updates incrementally, clears on close, and stays native after drawing.')

  await arrive('/lists/manage', '.list-manage-view')
  const exportButton = '.list-row [title="Export list"]'
  await tap(exportButton)
  await painted('.fluent-modal .export-list-name')
  await tap('.fluent-modal .modal-close')
  await disappears('.fluent-modal-overlay')
  await tap(exportButton)
  await painted('.fluent-modal .export-list-name')
  await tap('.fluent-modal .modal-close')
  await disappears('.fluent-modal-overlay')
  await page.waitForSelector('div-pointers', { hidden: true })
  await tap(exportButton)
  assert.ok(await page.$('.fluent-modal .export-list-name'))
  assert.equal(await page.$('div-pointers'), null)
  console.log('Touch export modal updates inside the same drawing, removes its rendered items, and opens normally afterward.')

  // Name Roller currently uses its custom Fluent dialogs. Add native probes to
  // check the browser top layer remains interactive on an actual app drawing.
  await page.evaluateOnNewDocument(() => {
    addEventListener('DOMContentLoaded', () => {
      const host = document.createElement('div')
      host.setAttribute('data-swarm-persist', '')
      host.style = 'position:fixed;bottom:1rem;left:1rem;z-index:999999'
      host.innerHTML = '<button id="show-native-dialog">Native dialog</button><button popovertarget="native-popover">Native popover</button>'
      const dialog = document.createElement('dialog')
      dialog.style = 'position:fixed;margin:auto;padding:1rem'
      dialog.innerHTML = '<form method="dialog"><button>Close dialog</button></form>'
      const popover = document.createElement('div')
      popover.id = 'native-popover'
      popover.setAttribute('popover', '')
      popover.style = 'position:fixed;margin:auto;padding:1rem'
      popover.innerHTML = '<button popovertarget="native-popover" popovertargetaction="hide">Close popover</button>'
      document.body.append(host, dialog, popover)
      host.querySelector('#show-native-dialog').addEventListener('click', () => dialog.showModal())
    }, { once: true })
  })
  await arrive('/lists', '.lists-view h1')
  await tap('#show-native-dialog')
  await page.waitForSelector('dialog:modal')
  await tap('dialog button')
  await page.waitForSelector('dialog:modal', { hidden: true })
  await tap('button[popovertarget="native-popover"]:not([popovertargetaction])')
  await page.waitForSelector('#native-popover:popover-open')
  await tap('#native-popover button')
  await page.waitForSelector('#native-popover:popover-open', { hidden: true })
  assert.deepEqual(errors, [])
  console.log('Native dialog and popover stay touchable in the browser top layer.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser?.close()
  server.httpServer.closeAllConnections?.()
  await new Promise((done, fail) => server.httpServer.close(error => error ? fail(error) : done()))
}
