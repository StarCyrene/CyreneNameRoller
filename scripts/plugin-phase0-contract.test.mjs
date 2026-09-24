import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { PLUGIN_API_VERSION } from '../src/plugins/constants.js'

const root = new URL('../', import.meta.url)
const read = path => fs.readFile(new URL(path, root), 'utf8')
const contract = JSON.parse(await read('scripts/fixtures/plugin-ui-api-1.4-contract.json'))
const parserOutput = path.resolve(import.meta.dirname, '../build-output/plugin-phase0-contract/parser.mjs')
const runtimeOutput = path.resolve(import.meta.dirname, '../build-output/plugin-phase0-contract/runtime.mjs')
await fs.mkdir(path.dirname(parserOutput), { recursive: true })
await Promise.all([
  build({
  entryPoints: [path.resolve(import.meta.dirname, '../src/plugins/package.js')],
  bundle: true,
  write: true,
  outfile: parserOutput,
  platform: 'browser',
  format: 'esm'
  }),
  build({
    entryPoints: [path.resolve(import.meta.dirname, '../src/plugins/runtime.js')],
    bundle: true,
    write: true,
    outfile: runtimeOutput,
    platform: 'browser',
    format: 'esm'
  })
])
const { parsePluginPackage } = await import(`${pathToFileURL(parserOutput).href}?v=${Date.now()}`)
const { PluginRuntime } = await import(`${pathToFileURL(runtimeOutput).href}?v=${Date.now()}`)

test('阶段 0 freezes API, component targets and slot namespaces', async () => {
  assert.equal(PLUGIN_API_VERSION, '1.4.0')
  assert.equal(contract.legacyApiVersion, '1.2.0')
  assert.equal(contract.apiVersion, '1.4.0')
  assert.equal(contract.componentTargets.length, 19)
  assert.equal(contract.componentTargets.find(target => target.id === 'roller.filters').visibilityPolicy, 'optional')
  assert.ok(contract.componentTargets.every(target => !target.id.startsWith('slot:')))
  assert.ok(contract.slots.every(slot => slot.id.startsWith('slot:')))
  assert.deepEqual(contract.slots.filter(slot => slot.available).map(slot => slot.id), [
    'slot:roller.side-panel', 'slot:roller.below-result', 'slot:records.toolbar'
  ])

  const hostRuntime = new PluginRuntime({
    getPlugin: () => null,
    savePluginData: async () => {},
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: () => ({}),
    executeCoreDraw: async () => ({}),
    selectFile: async () => null,
    playAudio: async () => {},
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })
  const host = hostRuntime.describeHost({ manifest: { permissions: [] } })
  assert.equal(host.platform, 'web')
  assert.equal(host.security.runtime, 'plugin-isolated')
  assert.equal(host.componentTargets.length, 19)
  assert.equal(host.componentTargets.find(target => target.id === 'app.title-bar').available, false)
  assert.equal(host.componentTargets.find(target => target.id === 'roller.filters').visibilityPolicy, 'optional')
  assert.equal(host.slots.find(slot => slot.id === 'slot:app.command-palette').available, false)
  assert.equal(host.slots.find(slot => slot.id === 'slot:roller.side-panel').available, true)

  const sourceChecks = new Map([
    ['src/components/layout/TitleBar.vue', ['class="titlebar"', 'isDesktopApp']],
    ['src/components/layout/AppLayout.vue', ['class="version-badge"']],
    ['src/components/layout/NavigationDock.vue', ['class="dock"', "'设置'"]],
    ['src/views/RollerView.vue', ['class="list-selector-bar"', 'class="switches"', 'class="english-mode-toggle"', 'data-plugin-component="roller.filter.draw-target"', 'class="start-btn"', 'class="display-container"', 'class="name-display"']],
    ['src/views/CardView.vue', ['class="card-controls"', 'class="cards-grid"', 'class="card-face ', 'class="card"']],
    ['src/views/LotteryView.vue', ['class="roller-result"', 'class="wheel-result"']],
    ['src/views/StatisticsView.vue', ['class="stats-summary"']]
  ])
  for (const [file, needles] of sourceChecks) {
    const source = await read(file)
    for (const needle of needles) assert.ok(source.includes(needle), `${file} missing ${needle}`)
  }
})

test('阶段 0 freezes legacy DrawReceipt fields and events', async () => {
  const dts = await read('packages/cyrene-name-roller/src/plugin-sdk.d.ts')
  for (const field of ['operationId', 'pluginId', 'listId', 'target', 'count', 'allowDuplicates', 'gender', 'algorithm', 'algorithmVersion', 'committedAt', 'results']) {
    assert.match(dts, new RegExp(`readonly ${field}:`))
  }
  const sdk = await read('packages/cyrene-name-roller/src/plugin-sdk.mjs')
  for (const event of ['draw:item-result', 'draw:result']) assert.ok(sdk.includes(`'${event}'`), `missing ${event}`)
  assert.match(await read('src/views/RollerView.vue'), /roller:item-result/)
  assert.match(await read('src/views/RollerView.vue'), /roller:result/)
})

for (const sample of [
  ['basic-1.0.0.cnrp', '927376ccaa59ba4ca46c26597f13582ff8a96db52e6b9f9051b963e6df8be778', 'cn.example.cyrene.plugin'],
  ['sound-effects-1.1.1.cnrp', '8e48702b19442606beb1fba3795a943292642c3e6beee32b4bad41d52b742d2a', 'cn.cyrene2008.sound-effects']
]) {
  test(`冻结未经重打包的 API 1.2 样本：${sample[2]}`, async () => {
    const bytes = await fs.readFile(new URL(`scripts/fixtures/plugin-api-1.2/${sample[0]}`, root))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sample[1])
    const parsed = await parsePluginPackage(new Uint8Array(bytes))
    assert.equal(parsed.manifest.id, sample[2])
    assert.equal(parsed.manifest.engine.min, '1.2.0')
    assert.equal(parsed.manifest.engine.max, '1.2.0')
  })
}
