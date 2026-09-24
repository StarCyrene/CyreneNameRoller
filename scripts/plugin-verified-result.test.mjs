import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import * as policy from '../src/plugins/ui/resultPresentationPolicy.js'

const root = new URL('../', import.meta.url)
const read = path => fs.readFile(new URL(path, root), 'utf8')
test('结果呈现只接受 Roller Receipt 的受限宿主布局', () => {
  const permissions = ['ui:result-presentations']
  const [presentation] = policy.normalizeResultPresentations([{ id: 'spotlight', title: 'Spotlight', targets: ['roller.result'], layout: 'spotlight', style: { size: 'large', showAlgorithm: true } }], permissions)
  assert.equal(presentation.layout, 'spotlight')
  assert.equal(presentation.style.showAlgorithm, true)
  assert.throws(() => policy.normalizeResultPresentations([{ id: 'forged', targets: ['roller.result'], style: { name: 'Injected' } }], permissions), error => error.code === 'PLUGIN_UI_PROPERTY_NOT_ALLOWED')
  assert.throws(() => policy.normalizeResultPresentations([{ id: 'card', targets: ['card.item'] }], permissions), error => error.code === 'PLUGIN_UI_UNKNOWN_TARGET')
})

test('Roller 权威结果由提交后的 Receipt 驱动', async () => {
  const roller = await read('src/views/RollerView.vue')
  const store = await read('src/plugins/store.js')
  const verified = await read('src/components/roller/VerifiedResult.vue')
  const sdk = await read('packages/cyrene-name-roller/src/plugin-sdk.d.ts')
  const page = await read('src/views/PluginPageView.vue')
  const manager = await read('src/views/PluginManagerView.vue')
  assert.match(roller, /await pluginsStore\.executeRollerDraw\(/)
  assert.match(roller, /currentReceipt\.value = receipt/)
  assert.match(roller, /pluginsStore\.dispatchEvent\('roller:result', receipt\)/)
  assert.doesNotMatch(roller, /recordsStore\.addRecord|statisticsStore\.incrementCounts/)
  assert.match(store, /pluginId: 'core'/)
  assert.match(store, /operationId,/)
  assert.match(verified, /props\.receipt\?\.results/)
  assert.doesNotMatch(verified, /name:\s*\{\s*type/)
  assert.match(page, /setResultPresentationSelection\(control\.target, value\)/)
  assert.match(page, /resultPresentationOptions/)
  assert.doesNotMatch(manager, /setResultPresentationSelection\(/)
  assert.doesNotMatch(manager, /resultPresentations/)
  for (const field of ['sequence', 'previousHash', 'receiptHash']) assert.match(sdk, new RegExp(`readonly ${field}\\?:`))
})
