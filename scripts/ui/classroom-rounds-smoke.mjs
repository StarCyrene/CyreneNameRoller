// Run against a production build: node scripts/ui/classroom-rounds-smoke.mjs
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({logLevel:'error',preview:{host:'127.0.0.1',port:0}})
const origin = 'http://127.0.0.1:'+server.httpServer.address().port
let browser
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
  const page=await browser.newPage(), errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.setViewport({width:1050,height:740})
  await page.setRequestInterception(true)
  page.on('request',r=>/^https?:/.test(r.url()) && !r.url().startsWith(origin+'/') ? r.abort() : r.continue())
  await page.evaluateOnNewDocument(()=>{
    if(localStorage.getItem('lists')) return
    const names=['安然','明希','晨雨','冬青','映雪','知夏','清和','云舒'].map((cn,i)=>({id:'p'+i,cn,en:'Name '+i,gender:'female',groupId:'',isWhiteList:i===7}))
    localStorage.setItem('lists',JSON.stringify({default:{id:'default',name:'七班',names,groups:[]},empty:{id:'empty',name:'Empty',names:[],groups:[]}}))
    localStorage.setItem('settings',JSON.stringify({language:'zh',disableSplash:true,perfAnimations:true}))
  })
  const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('records') || '[]'))
  const change=async (selector,value)=>page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},value)
  const count=async (selector,n)=>page.waitForFunction((s,n)=>document.querySelectorAll(s).length===n,{},selector,n)
  await page.goto(origin+'/#/roller/tunnel')
  await page.waitForSelector('.tunnel-draw:not(:disabled)')
  await change('.tunnel-controls input',4)
  await page.select('.tunnel-controls select','steps')
  await page.emulateCPUThrottling(4)
  await page.click('.tunnel-draw')
  await count('.arrivals li',1)
  const drawn=await records()
  assert.equal(drawn.length,4)
  assert.equal(new Set(drawn.map(r=>r.personId)).size,4)
  await page.click('.tunnel-draw')
  await count('.arrivals li',2)
  await page.click('.tunnel-reveal-all')
  await count('.arrivals li',4)
  assert.deepEqual(await records(),drawn)
  assert.equal(await page.$$eval('.tunnel .gate',els=>els.length),5)
  await page.emulateCPUThrottling(1)
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}])
  await page.click('#roller-tab-RollerRelay')
  await page.waitForSelector('.relay-stage')
  await change('.classroom-actions input',3)
  for(let i=1;i<=3;i++){
    await page.click('.relay-advance')
    await count('.relay-trail li',i)
    assert.equal((await records()).length,4+i)
  }
  assert.equal(new Set((await records()).slice(0,3).map(r=>r.personId)).size,3)
  await page.click('#roller-tab-RollerTeams')
  await page.waitForSelector('.team-setup input')
  await change('.team-setup input',3)
  await page.click('.team-setup button')
  await count('.team-card',3)
  assert.deepEqual(await page.$$eval('.team-card',els=>els.map(e=>e.querySelectorAll('li').length)),[3,2,2])
  assert.equal(new Set(await page.$$eval('.team-card li',els=>els.map(e=>e.textContent))).size,7)
  assert.equal((await records()).length,7)
  await page.click('#roller-tab-RollerTunnel')
  await count('.arrivals li',4)
  await page.select('.classroom-head select','empty')
  await page.waitForFunction(()=>document.querySelector('.tunnel-draw')?.disabled && !document.querySelector('.arrivals'))
  assert.deepEqual(errors,[])
  console.log('Light Tunnel: throttled batch, staged reveal, one commit; Firefly Relay: three distinct commits; teams: balanced, no records; list and tool switches passed.')
} finally { await browser?.close(); await new Promise(resolve=>server.httpServer.close(resolve)) }
