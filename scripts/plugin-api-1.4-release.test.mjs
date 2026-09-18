import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFile(path.join(root, relative), 'utf8')

test('API 1.4 release metadata is synchronized', async () => {
  const packageJson = JSON.parse(await read('packages/cyrene-name-roller/package.json'))
  assert.equal(packageJson.version, '1.4.0')
  assert.equal(packageJson.bin.cnrp, 'bin/cnrp.mjs')
  assert.match(await read('src/plugins/constants.js'), /PLUGIN_API_VERSION = '1\.4\.0'/)
  assert.match(await read('packages/cyrene-name-roller/src/plugin-sdk.mjs'), /PLUGIN_API_VERSION = '1\.4\.0'/)
  assert.match(await read('packages/cyrene-name-roller/src/plugin-sdk.d.ts'), /PLUGIN_API_VERSION: '1\.4\.0'/)
  assert.match(await read('packages/cyrene-name-roller/bin/cnrp.mjs'), /const API_VERSION = '1\.4\.0'/)
})

test('API 1.4 UI template validates, packs and parses through host parser', async () => {
  const { validateDirectory, packDirectory } = await import(pathToFileURL(path.join(root, 'packages/cyrene-name-roller/bin/cnrp.mjs')).href)
  const template = path.join(root, 'packages/cyrene-name-roller/templates/ui-customization')
  const validation = await validateDirectory(template)
  assert.equal(validation.manifest.engine.min, '1.4.0')
  assert.deepEqual(validation.manifest.contributes.pages[0].native.controls.map(control => control.type), [
    'component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'
  ])
  assert.equal(validation.manifest.systemOperations[0].id, 'desktop-check')
  assert.deepEqual(validation.manifest.systemOperations[0].command, { program: 'cmd', args: ['/d', '/c', 'ver'] })
  assert.deepEqual(validation.manifest.contributes.nativeViews.map(view => view.slot), [
    'slot:roller.side-panel',
    'slot:roller.below-result',
    'slot:records.toolbar'
  ])
  assert.deepEqual(validation.manifest.contributes.resultPresentations.map(item => item.layout), ['single', 'list', 'grid', 'spotlight'])
  assert.equal(validation.manifest.contributes.componentStylePacks.length, 3)
  assert.equal(validation.manifest.contributes.componentOverridePacks.length, 3)
  const styledTargets = new Set(validation.manifest.contributes.componentStylePacks.flatMap(pack => Object.keys(pack.targets)))
  assert.equal(styledTargets.size, 11)
  for (const target of ['navigation.dock', 'roller.current-list', 'roller.filters', 'card.item', 'lottery.result', 'statistics.summary']) {
    assert.equal(styledTargets.has(target), true)
  }
  const styles = validation.manifest.contributes.componentStylePacks[0].targets
  assert.deepEqual(styles['roller.result'], {
    size: 'large', foreground: '#172033', background: '#ffffff', fontFamily: 'host:display',
    fontSize: 72, fontWeight: 700, alignment: 'center', padding: 'comfortable', gap: 'comfortable'
  })
  assert.deepEqual(styles['roller.primary-action'], {
    size: 'large', foreground: '#ffffff', background: '#005a9e', fontFamily: 'host:ui', fontSize: 18, fontWeight: 700, radius: 8
  })
  assert.deepEqual(validation.manifest.contributes.componentOverridePacks.map(pack => pack.targets), [
    {
      'app.version-badge': { visibility: 'hidden', layout: 'collapse' },
      'roller.filters': { visibility: 'hidden', layout: 'collapse' }
    },
    { 'roller.filters': { visibility: 'visible', layout: 'compact' } },
    { 'statistics.summary': { visibility: 'hidden', layout: 'reserve' } }
  ])
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-api-1.4-'))
  const output = path.join(tempDir, 'ui-customization.cnrp')
  const parserOutput = path.join(tempDir, 'application-plugin-parser.mjs')
  await build({ entryPoints: [path.join(root, 'src/plugins/package.js')], bundle: true, write: true, outfile: parserOutput, platform: 'browser', format: 'esm', target: ['es2022'], legalComments: 'none' })
  const { parsePluginPackage } = await import(`${pathToFileURL(parserOutput).href}?v=${Date.now()}`)
  const packed = await packDirectory(template, output)
  const parsed = await parsePluginPackage(new Uint8Array(packed.output))
  assert.equal(parsed.manifest.id, validation.manifest.id)
  assert.equal(parsed.manifest.systemOperations[0].id, 'desktop-check')
  assert.deepEqual(parsed.manifest.contributes.nativeViews.map(view => view.slot), [
    'slot:roller.side-panel',
    'slot:roller.below-result',
    'slot:records.toolbar'
  ])
  assert.deepEqual(parsed.manifest.contributes.resultPresentations.map(item => item.layout), ['single', 'list', 'grid', 'spotlight'])
  assert.equal(parsed.manifest.contributes.componentOverridePacks[0].targets['roller.filters'].visibility, 'hidden')
})

test('frozen API 1.2 fixtures retain their byte hashes', async () => {
  const fixtures = [
    ['basic-1.0.0.cnrp', '927376ccaa59ba4ca46c26597f13582ff8a96db52e6b9f9051b963e6df8be778'],
    ['sound-effects-1.1.1.cnrp', '8e48702b19442606beb1fba3795a943292642c3e6beee32b4bad41d52b742d2a']
  ]
  for (const [name, expected] of fixtures) {
    const bytes = await fs.readFile(path.join(root, 'scripts/fixtures/plugin-api-1.2', name))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected)
  }
})

test('core write boundaries remain present for the release gate', async () => {
  const [client, worker, coreDraw, tauri, bridge, rust] = await Promise.all([
    read('src/core/client.js'),
    read('src/core/web/core.worker.js'),
    read('src/plugins/coreDraw.js'),
    read('src/utils/tauriAPI.js'),
    read('src/utils/dataBridge.js'),
    read('src-tauri/src/lib.rs')
  ])
  assert.match(client, /coreDrawExecute/)
  assert.match(client, /coreCardCommit/)
  assert.match(client, /coreMaintenanceExecute/)
  assert.match(client, /message\.type === 'commit\.request'/)
  assert.match(client, /type: 'commit\.resolve'/)
  assert.match(worker, /await requestCommit/)
  assert.match(worker, /coreState = \{ \.\.\.coreState, statistics: value\.nextStatistics, records: value\.nextRecords \}/)
  assert.doesNotMatch(coreDraw, /commitCoreDrawTransaction|createCoreDrawQueue/)
  assert.doesNotMatch(client, /executeCoreDrawRequest|fallbackState/)
  assert.match(tauri, /coreDrawExecute/)
  assert.match(tauri, /coreCardCommit/)
  assert.match(tauri, /coreMaintenanceExecute/)
  assert.match(tauri, /coreStateSet/)
  assert.match(bridge, /TAURI_CORE_INPUT_KEYS/)
  assert.match(rust, /core_draw_execute/)
  assert.match(rust, /core_card_commit/)
  assert.match(rust, /core_maintenance_execute/)
  assert.match(rust, /core_state_set/)
  assert.match(rust, /normalize_values/)
  assert.match(rust, /is_core_storage_key/)
  assert.match(rust, /statistics|records/)
  assert.match(rust, /storage_set[\s\S]*核心名单、算法设置、统计和记录必须通过权威事务写入/)
})
