// Run against a production build: node scripts/ui/classroom-rounds-smoke.mjs [dist directory]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { preview } from 'vite'

const server = await preview({logLevel:'error',build:{outDir:resolve(process.argv[2] || 'dist')},preview:{host:'127.0.0.1',port:0}})
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
    const longNames=Array.from({length:36},(_,i)=>({id:'long'+i,cn:'Alexandria-Marie Montgomery-West '+i,en:'',gender:'female',groupId:'',isWhiteList:false}))
    localStorage.setItem('lists',JSON.stringify({default:{id:'default',name:'七班',names,groups:[]},large:{id:'large',name:'长名单',names:longNames,groups:[]},empty:{id:'empty',name:'Empty',names:[],groups:[]}}))
    localStorage.setItem('settings',JSON.stringify({language:'zh',disableSplash:true,perfAnimations:true}))
  })
  const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('records') || '[]'))
  const change=async (selector,value)=>page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},value)
  const count=async (selector,n)=>page.waitForFunction((s,n)=>document.querySelectorAll(s).length===n,{},selector,n)
  await page.goto(origin+'/#/roller/tunnel',{waitUntil:'domcontentloaded',timeout:60000})
  await page.waitForSelector('.tunnel-draw:not(:disabled)')
  await change('.tunnel-controls input',4)
  await page.select('.tunnel-controls select','steps')
  await page.emulateCPUThrottling(4)
  await page.click('.tunnel-draw')
  await count('.tunnel .arrivals li.featured',1)
  const drawn=await records()
  assert.equal(drawn.length,4)
  assert.equal(new Set(drawn.map(r=>r.personId)).size,4)
  await page.click('.tunnel-draw')
  await count('.arrivals li',2)
  assert.ok(await page.$('.tunnel .arrivals li:last-child.featured'), 'most recent staged name has the spotlight')
  await page.click('.tunnel-reveal-all')
  await count('.tunnel .arrivals-group li',4)
  assert.equal(await page.$('.arrivals .featured'),null,'the completed stage gives every name the same prominence')
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
  await page.select('.classroom-head select','large')
  await page.select('.tunnel-controls select','all')
  await change('.tunnel-controls input',1)
  await page.click('.tunnel-draw')
  await count('.tunnel .arrivals li.featured',1)
  assert.ok((await page.$eval('.tunnel [role="status"]',e=>e.textContent)).includes(await page.$eval('.arrivals strong',e=>e.textContent)))

  await page.setViewport({width:320,height:740})
  await change('.tunnel-controls input',36)
  await page.click('.tunnel-draw')
  await count('.tunnel .arrivals-group li',36)
  assert.ok(await page.$eval('.arrivals',e=>e.scrollHeight>e.clientHeight && e.scrollWidth<=e.clientWidth+2),'long results scroll vertically inside the stage')
  const namesInOrder=await page.$$eval('.arrivals strong',entries=>entries.map(e=>e.textContent))
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('clipboard unavailable')}}}))
  await page.click('.tunnel-copy-action')
  await page.waitForSelector('.tunnel-copy')
  assert.deepEqual(await page.$eval('.tunnel-copy',e=>e.value.split('\n')),namesInOrder)
  assert.ok(await page.$eval('.tunnel-copy',e=>e.selectionStart===0 && e.selectionEnd===e.value.length),'fallback selects every revealed name')

  await page.setViewport({width:1280,height:650})
  await page.click('#roller-tab-RollerRelay')
  await page.waitForSelector('.relay-advance:not(:disabled)')
  await page.evaluate(()=>document.fonts.ready)
  await change('.relay-controls input',12)
  for(let i=1;i<=12;i++){
    await page.click('.relay-advance')
    await count('.relay-trail li',i)
  }
  const history=await page.$eval('.relay-trail',e=>({content:e.scrollHeight,visible:e.clientHeight,top:e.scrollTop}))
  assert.ok(history.content>history.visible && history.content-history.top-history.visible<=2,
    'long relay keeps the latest handoff in view: '+JSON.stringify(history))
  const desktop=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect()
    const action=rect('.relay-advance')
    return {rightGap:action.left-rect('.relay-stage').right,trailGap:action.top-rect('.relay-trail').bottom,footerGap:rect('.tool-bar').top-action.bottom}
  })
  assert.ok(desktop.rightGap>=-1 && desktop.trailGap>=-1 && desktop.footerGap>=-1,
    'relay action sits to the right of the stage, between the history and the footer: '+JSON.stringify(desktop))
  await page.setViewport({width:320,height:740})
  const touch=await page.$eval('.relay-advance',async e=>{
    await new Promise(resolve=>requestAnimationFrame(resolve))
    e.scrollIntoView({block:'nearest',behavior:'instant'})
    const action=e.getBoundingClientRect(),panel=document.querySelector('.tool-panel').getBoundingClientRect()
    return {left:action.left-panel.left,right:panel.right-action.right,top:action.top-panel.top,bottom:panel.bottom-action.bottom,height:action.height}
  })
  assert.ok(touch.left>=-1 && touch.right>=-1 && touch.top>=-1 && touch.bottom>=-1 && touch.height>=32,
    'relay action remains reachable and touch sized at 320 px: '+JSON.stringify(touch))

  await page.click('#roller-tab-RollerTunnel')
  await count('.arrivals li',36)
  await page.select('.classroom-head select','empty')
  await page.waitForFunction(()=>document.querySelector('.tunnel-draw')?.disabled && !document.querySelector('.arrivals'))
  assert.deepEqual(errors,[])
  console.log('Light Tunnel: staged and grouped results, one batch commit, long names and copy fallback; Firefly Relay: distinct commits and reachable controls; teams: balanced, no records; list and tool switches passed.')
} finally { await browser?.close(); await new Promise(resolve=>server.httpServer.close(resolve)) }
