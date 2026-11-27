// After building: node scripts/ui/prize-race-smoke.mjs [dist directory]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { preview } from 'vite'
import puppeteer from 'puppeteer-core'

const server = await preview({ logLevel:'error', build:{ outDir:resolve(process.argv[2] || 'dist') }, preview:{host:'127.0.0.1',port:0} })
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
let browser
try {
  browser = await puppeteer.launch({ executablePath:process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true, args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] })
  for (const fallback of [false,true]) {
    const context = await browser.createBrowserContext()
    const pages = await Promise.all([context.newPage(), context.newPage()])
    for (const p of pages) {
      await p.bringToFront()
      p.on('pageerror',error=>console.error(error.message))
      await p.setRequestInterception(true)
      p.on('request',r => /^https?:/.test(r.url()) && !r.url().startsWith(origin + '/') ? r.abort() : r.continue())
      await p.evaluateOnNewDocument(disableLocks => {
        if (disableLocks) Object.defineProperty(navigator,'locks',{value:undefined})
        if (!localStorage.getItem('prizes')) localStorage.setItem('prizes',JSON.stringify({
          currentId:'default', lists:{default:{id:'default',name:'Class',prizes:[{id:'last',name:'Last item',quantity:1,quality:'R',weight:1}]}},records:[]
        }))
        localStorage.setItem('settings',JSON.stringify({language:'en',disableSplash:true,uiScale:80,uiScaleVersion:2,perfAnimations:false}))
      },fallback)
      await p.goto(origin+'/#/lottery/draw',{waitUntil:'domcontentloaded'})
      await p.waitForFunction(()=>document.querySelector('.draw-actions .primary-action:not(:disabled)')?.innerText.includes('Start'), {polling:100}).catch(async error => {
        console.error('Draw page:', await p.evaluate(()=>({path:location.hash,text:document.body.innerText.slice(-900)}))); throw error
      })
    }
    await Promise.all(pages.map(p=>p.$eval('.draw-actions .primary-action',el=>el.click())))
    await Promise.all(pages.map(p=>p.waitForFunction(()=>document.querySelector('.draw-workspace .sr-only[role="status"]')?.textContent==='Draw started', {polling:100})))
    await Promise.all(pages.map(p=>p.$eval('.draw-actions .primary-action',el=>el.click())))
    await Promise.all(pages.map(p=>p.waitForFunction(()=>/Selected: Last item|Could not complete the draw/.test(document.body.innerText), {polling:100})))
    const winners = await Promise.all(pages.map(p=>p.$eval('.draw-workspace .sr-only[role="status"]',el=>el.textContent.includes('Selected: Last item'))))
    assert.equal(winners.filter(Boolean).length,1)
    const saved=await pages[0].evaluate(()=>JSON.parse(localStorage.getItem('prizes')))
    assert.equal(saved.records.length,1); assert.equal(saved.lists.default.prizes[0].quantity,0)
    console.log((fallback ? 'IndexedDB fallback' : 'Web Locks') + ': two loaded pages, one winner, stock zero, one saved record')
    await context.close()
  }
} finally {
  await browser?.close()
  await new Promise(resolve=>server.httpServer.close(resolve))
}
