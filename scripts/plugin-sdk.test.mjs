import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createTemplate, packDirectory, validateDirectory } from '../packages/cyrene-name-roller/bin/cnrp.mjs'
import {
  PLUGIN_API_VERSION,
  PluginCapabilities,
  PluginEvents,
  PluginPlatforms,
  describeHost,
  executeTransaction,
  queryResource,
  readDependencyStorage
} from '../packages/cyrene-name-roller/src/plugin-sdk.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const testTempRoot = path.join(projectRoot, 'build-output', 'plugin-sdk-tests')

async function createTestDirectory(prefix) {
  await fs.mkdir(testTempRoot, { recursive: true })
  return fs.mkdtemp(path.join(testTempRoot, prefix))
}

async function loadApplicationParser(directory) {
  const output = path.join(directory, 'application-plugin-parser.mjs')
  await build({
    entryPoints: [path.join(projectRoot, 'src/plugins/package.js')],
    bundle: true,
    write: true,
    outfile: output,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    legalComments: 'none'
  })
  return import(`${pathToFileURL(output).href}?v=${Date.now()}`)
}

async function loadPlatformBridge(directory) {
  const output = path.join(directory, 'application-plugin-platform.mjs')
  await build({
    entryPoints: [path.join(projectRoot, 'src/plugins/platform.js')],
    bundle: true,
    write: true,
    outfile: output,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    legalComments: 'none'
  })
  return import(`${pathToFileURL(output).href}?v=${Date.now()}`)
}

async function loadPluginRuntime(directory) {
  const output = path.join(directory, 'application-plugin-runtime.mjs')
  await build({
    entryPoints: [path.join(projectRoot, 'src/plugins/runtime.js')],
    bundle: true,
    write: true,
    outfile: output,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    legalComments: 'none'
  })
  return import(`${pathToFileURL(output).href}?v=${Date.now()}`)
}

async function loadPluginCatalog(directory) {
  const output = path.join(directory, 'application-plugin-catalog.mjs')
  await build({
    entryPoints: [path.join(projectRoot, 'src/plugins/catalog.js')],
    bundle: true,
    write: true,
    outfile: output,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    legalComments: 'none'
  })
  return import(`${pathToFileURL(output).href}?v=${Date.now()}`)
}

async function loadAnimationRegistry(directory) {
  const output = path.join(directory, 'application-plugin-animation-registry.mjs')
  await build({
    entryPoints: [path.join(projectRoot, 'src/plugins/animationRegistry.js')],
    bundle: true,
    write: true,
    outfile: output,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    legalComments: 'none'
  })
  return import(`${pathToFileURL(output).href}?v=${Date.now()}`)
}

test('SDK creates, validates and packs a CNRP package accepted by the application parser', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-sdk-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'example.cnrp')
  await createTemplate(source, 'basic')
  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.schemaVersion, 1)
  assert.deepEqual(validation.manifest.engine, { min: '1.2.0', max: '1.2.0' })
  const packed = await packDirectory(source, output)
  assert.equal((await fs.readFile(output)).subarray(0, 6).toString('utf8'), 'CNRP1\n')

  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.id, packed.manifest.id)
  assert.equal(parsed.manifest.version, '1.0.0')
  assert.equal(parsed.publisherVerified, false)
  const worker = parser.decodePluginFile(parsed, parsed.manifest.entry)
  assert.ok(worker.length > 200)
  assert.doesNotMatch(worker, /from\s+['"]@(cyrene2008|starcyrene)\/cyrene-name-roller/)
  assert.doesNotMatch(worker, /Result received/)
  const context = {
    self: null,
    globalThis: null,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {}, table() {}, trace() {} },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    setTimeout,
    clearTimeout
  }
  context.self = context
  context.globalThis = context
  vm.runInNewContext(worker, context, { timeout: 5000 })
  assert.equal(typeof context.CyrenePluginModule?.activate, 'function')
  assert.equal(typeof context.CyrenePluginModule?.onEvent, 'function')
})

test('SDK lifecycle constants include plugin storage changes', async () => {
  assert.equal(PluginEvents.PLUGIN_STORAGE_CHANGED, 'plugin:storage-changed')
  assert.equal(PluginPlatforms.ANDROID, 'android')
  assert.equal(PluginPlatforms.IOS, 'ios')
  assert.equal(PluginCapabilities.NOTIFICATIONS_SHOW, 'notifications:show')
  assert.equal(PluginCapabilities.AUDIO_SELECT, 'audio:select')
  assert.equal(PluginCapabilities.AUDIO_PLAY, 'audio:play')
  const requests = []
  assert.equal(await readDependencyStorage({ request: async (...args) => { requests.push(args); return 42 } }, 'cn.example.base', 'shared'), 42)
  assert.deepEqual(requests, [['dependency.storage.read', { pluginId: 'cn.example.base', key: 'shared' }]])
  const declaration = await fs.readFile(path.join(projectRoot, 'packages/cyrene-name-roller/src/plugin-sdk.d.ts'), 'utf8')
  assert.match(declaration, /readonly PLUGIN_STORAGE_CHANGED: 'plugin:storage-changed'/)
  assert.match(declaration, /function readDependencyStorage<T = unknown>/)
})

test('application parser rejects a tampered CNRP package', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-tamper-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'example.cnrp')
  await createTemplate(source, 'basic')
  await packDirectory(source, output)
  const bytes = await fs.readFile(output)
  const magic = Buffer.from('CNRP1\n')
  const envelope = JSON.parse(bytes.subarray(magic.length).toString('utf8'))
  const replacement = envelope.data[0] === 'A' ? 'B' : 'A'
  envelope.data = replacement + envelope.data.slice(1)
  const tampered = Buffer.concat([magic, Buffer.from(JSON.stringify(envelope), 'utf8')])
  const parser = await loadApplicationParser(temporary)
  await assert.rejects(() => parser.parsePluginPackage(new Uint8Array(tampered)), /解密|认证|封装|篡改/)
})

test('native Fluent settings pages validate and pack without an iframe entry', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-native-page-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'sound-effects.cnrp')
  await createTemplate(source, 'sound-effects')

  const validation = await validateDirectory(source)
  const nativePage = validation.manifest.contributes.pages[0]
  assert.equal(nativePage.entry, '')
  assert.equal(nativePage.native.type, 'settings')
  assert.ok(nativePage.native.controls.some(control => control.type === 'audio'))

  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.contributes.pages[0].native.type, 'settings')
  assert.equal(parsed.manifest.contributes.pages[0].entry, '')
})

test('native settings pages accept host contribution selectors', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-native-contribution-page-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'native-contributions.cnrp')
  await createTemplate(source, 'sound-effects')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.contributes.pages[0].native.controls.push(
    { id: 'style', type: 'component-style-select', label: 'Style', target: 'navigation.dock' },
    { id: 'override', type: 'component-override-select', label: 'Override', target: 'card.controls' },
    { id: 'result', type: 'result-presentation-select', label: 'Result', target: 'roller.result' },
    { id: 'override-toggle', type: 'component-override-toggle', label: 'Hide controls', target: 'card.controls', packId: 'hide-controls' }
  )
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  const validation = await validateDirectory(source)
  assert.deepEqual(validation.manifest.contributes.pages[0].native.controls.slice(-4).map(control => [control.type, control.target, control.path, control.packId || '']), [
    ['component-style-select', 'navigation.dock', '', ''],
    ['component-override-select', 'card.controls', '', ''],
    ['result-presentation-select', 'roller.result', '', ''],
    ['component-override-toggle', 'card.controls', '', 'hide-controls']
  ])

  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.contributes.pages[0].native.controls.at(-1).type, 'component-override-toggle')
  assert.equal(parsed.manifest.contributes.pages[0].native.controls.at(-1).packId, 'hide-controls')
})

test('plugin-owned commands are validated, packed and advertised as a generic extension point', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-command-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'command.cnrp')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.contributes.commands = [{
    id: 'refresh', title: '刷新插件数据', titleEn: 'Refresh plugin data',
    locations: ['command-palette', 'page-header'], icon: 'arrow-clockwise-24-regular', order: 300
  }]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  const validation = await validateDirectory(source)
  assert.deepEqual(validation.manifest.contributes.commands[0].locations, ['command-palette', 'page-header'])
  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.contributes.commands[0].id, 'refresh')

  const runtimeModule = await loadPluginRuntime(temporary)
  const plugin = { enabled: true, manifest: { id: 'cn.example.commands', version: '1.0.0', permissions: [], contributes: { commands: parsed.manifest.contributes.commands } } }
  const runtime = new runtimeModule.PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async () => null,
    executeCoreDraw: async () => null,
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: { info: () => ({ runtime: 'web', os: 'unknown', desktop: false }), capabilities: () => ({}), request: async () => ({ ok: false }) },
    onFault: () => {}
  })
  const descriptor = await runtime.handleRpc(plugin.manifest.id, 'host.describe')
  assert.ok(descriptor.contributions.includes('commands'))
  assert.deepEqual(descriptor.extensionPoints.commands.locations, ['command-palette', 'page-header', 'context-menu'])
})

test('SDK validates animation packs and rejects properties outside the visual allow-list', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-animation-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'animation.cnrp')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.contributes.animationPacks = [{ id: 'motion', title: 'More Motion', source: 'animations/presets.json' }]
  await fs.mkdir(path.join(source, 'animations'), { recursive: true })
  const animationPath = path.join(source, 'animations/presets.json')
  const pack = {
    schemaVersion: 1,
    presets: [{
      id: 'soft-spring', target: 'roller.finish', label: 'Soft spring', default: true,
      animation: {
        keyframes: [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }],
        options: { duration: 620, easing: 'cubic-bezier(.2,.9,.2,1)' }
      }
    }]
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /requires ui:animations permission/)

  manifest.permissions.push('ui:animations')
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  const validation = await validateDirectory(source)
  assert.equal(validation.animationPacks[0].presets[0].target, 'roller.finish')
  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.animationPacks[0].presets[0].id, 'soft-spring')

  pack.presets[0].animation.keyframes[0].left = '100vw'
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /disallows property left/)

  delete pack.presets[0].animation.keyframes[0].left
  pack.presets[0].animation.keyframes[0].background = 'url(https://example.invalid/track.png)'
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /keyframes\[0\]\.background is invalid/)

  pack.presets[0].animation.keyframes[0].background = 'u\\72l(https://example.invalid/track.png)'
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /keyframes\[0\]\.background is invalid/)
})

test('SDK and host accept declarative GSAP presets while rejecting layout and network values', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-gsap-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'gsap.cnrp')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.permissions.push('ui:animations')
  manifest.contributes.animationPacks = [{ id: 'motion', title: 'GSAP Motion', source: 'animations/presets.json' }]
  await fs.mkdir(path.join(source, 'animations'), { recursive: true })
  const animationPath = path.join(source, 'animations/presets.json')
  const pack = {
    schemaVersion: 1,
    presets: [{
      id: 'magnetic-snap', target: 'roller.finish', label: 'Magnetic snap',
      animation: {
        gsap: {
          from: { opacity: 0, y: 28, scale: 0.82, filter: 'blur(8px)' },
          to: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
          options: { duration: 760, ease: 'elastic.out(1,0.36)' }
        }
      }
    }]
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))

  const validation = await validateDirectory(source)
  assert.equal(validation.animationPacks[0].presets[0].animation.engine, 'gsap')
  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.animationPacks[0].presets[0].animation.engine, 'gsap')

  pack.presets[0].animation.gsap.to.left = '100vw'
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /disallows property left/)
  delete pack.presets[0].animation.gsap.to.left
  pack.presets[0].animation.gsap.to.background = 'image-set(url(https://example.invalid/a.png) 1x)'
  await fs.writeFile(animationPath, JSON.stringify(pack, null, 2))
  await assert.rejects(() => validateDirectory(source), /background is invalid/)
})

test('appearance packs provide semantic light and dark tokens with host and CLI parity', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-appearance-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'appearance.cnrp')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.permissions.push('ui:appearance')
  manifest.contributes.appearancePacks = [{
    id: 'ocean-glass', title: '海蓝玻璃', titleEn: 'Ocean Glass', base: 'fluent',
    light: { '--accent': '#0067c0', '--bg-base': '#f7fbff', '--text-primary': '#10243a', '--text-on-accent': '#ffffff' },
    dark: { '--accent': '#60aeea', '--bg-base': '#101820', '--text-primary': '#f4f8fc', '--text-on-accent': '#0a1620', '--shadow-8': '0 12px 24px rgba(0, 0, 0, 0.3)' }
  }]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.contributes.appearancePacks[0].base, 'fluent')
  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.contributes.appearancePacks[0].dark['--accent'], '#60aeea')

  manifest.contributes.appearancePacks[0].light.width = '100vw'
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await assert.rejects(() => validateDirectory(source), /disallows token width/)
  delete manifest.contributes.appearancePacks[0].light.width
  manifest.contributes.appearancePacks[0].light['--text-primary'] = '#f8f8f8'
  manifest.contributes.appearancePacks[0].light['--bg-base'] = '#ffffff'
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await assert.rejects(() => validateDirectory(source), /contrast must be at least 4.5:1/)
})

test('SDK bundles visual surface workers and preserves top-level Dock page metadata', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-visual-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'visual.cnrp')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.permissions.push('events:lifecycle', 'ui:visual-surfaces')
  Object.assign(manifest.contributes.pages[0], {
    location: 'dock', order: 640, icon: 'sparkle-24-regular', titleEn: 'Effects'
  })
  manifest.contributes.visualSurfaces = [{
    id: 'aurora', title: 'Aurora', entry: 'src/visual.js', placement: 'background',
    events: ['app:resize', 'draw:result']
  }]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await fs.writeFile(path.join(source, 'src/visual.js'), `
    import { defineVisualSurface } from '@starcyrene/cyrene-name-roller/plugin-sdk'
    defineVisualSurface({ activate() {}, onResize() {}, onEvent() {}, deactivate() {} })
  `)

  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.contributes.pages[0].location, 'dock')
  assert.equal(validation.manifest.contributes.pages[0].order, 640)
  await packDirectory(source, output)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)))
  assert.equal(parsed.manifest.contributes.pages[0].icon, 'sparkle-24-regular')
  assert.equal(parsed.manifest.contributes.visualSurfaces[0].placement, 'background')
  const worker = parser.decodePluginFile(parsed, 'src/visual.js')
  assert.doesNotMatch(worker, /from\s+['"]@(cyrene2008|starcyrene)\/cyrene-name-roller/)
  const context = { self: null, globalThis: null }
  context.self = context
  context.globalThis = context
  vm.runInNewContext(worker, context, { timeout: 5000 })
  assert.equal(typeof context.CyreneVisualSurfaceModule?.activate, 'function')
})

test('CLI rejects packages that the host would reject before installation', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-parity-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  delete manifest.entry
  manifest.contributes.pages = []
  manifest.contributes.commands = []
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await assert.rejects(() => validateDirectory(source), /at least one Worker, page, visual surface or appearance pack/)

  manifest.entry = 'src/worker.js'
  manifest.dependencies = [{ id: manifest.id, range: '^1.0.0' }]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await assert.rejects(() => validateDirectory(source), /dependencies\[0\].*invalid/)
})

test('CLI and host normalize API 1.2 page, native and dependency metadata consistently', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-parity-metadata-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const original = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  Object.assign(original.contributes.pages[0], {
    location: 'dock', order: 0, icon: 'sparkle-24-regular', titleEn: 'Zero order'
  })
  original.dependencies = [{ id: 'cn.example.foundation', version: '^2.0.0', dataAccess: true }]
  await fs.writeFile(manifestPath, JSON.stringify(original, null, 2))

  const cli = await validateDirectory(source)
  const parser = await loadApplicationParser(temporary)
  const host = parser.normalizePluginManifest(original)
  assert.deepEqual(cli.manifest.contributes.pages, host.contributes.pages)
  assert.deepEqual(cli.manifest.dependencies, host.dependencies)
  assert.equal(cli.manifest.contributes.pages[0].order, 0)

  const invalidCases = [
    manifest => { manifest.contributes.pages[0].order = 1.5 },
    manifest => { manifest.contributes.pages[0].location = 'sidebar' },
    manifest => { manifest.contributes.pages[0].id = 'Uppercase' },
    manifest => { manifest.contributes.pages.push({ ...manifest.contributes.pages[0] }) },
    manifest => { manifest.contributes.pages[0].icon = 'bad icon' },
    manifest => { delete manifest.contributes.pages[0].entry; manifest.contributes.pages[0].platformEntries = {} },
    manifest => {
      delete manifest.contributes.pages[0].entry
      manifest.contributes.pages[0].native = { type: 'settings', settingsKey: 'bad/path', controls: [] }
    },
    manifest => {
      delete manifest.contributes.pages[0].entry
      manifest.contributes.pages[0].native = {
        type: 'settings', controls: [{ id: 'motion', type: 'animation-select', label: 'Motion', target: 'roller.finish', packId: 'Bad Pack' }]
      }
    },
    manifest => { manifest.dependencies = 'cn.example.foundation' },
    manifest => { manifest.dependencies = [{ id: 'cn.example.foundation', range: '<script>' }] }
  ]

  for (const mutate of invalidCases) {
    const candidate = structuredClone(original)
    mutate(candidate)
    await fs.writeFile(manifestPath, JSON.stringify(candidate, null, 2))
    assert.throws(() => parser.normalizePluginManifest(candidate))
    await assert.rejects(() => validateDirectory(source))
  }
})

test('host and CLI load older plugin APIs in compatibility mode but reject newer minimum APIs', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-api-compatibility-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const parser = await loadApplicationParser(temporary)
  const { getManifestCompatibility } = await loadPlatformBridge(temporary)
  const platform = { runtime: 'web', os: 'unknown', desktop: false }

  manifest.engine = { min: '1.0.0', max: '1.0.0' }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  const cli = await validateDirectory(source)
  const host = parser.normalizePluginManifest(manifest)
  assert.equal(cli.manifest.engine.max, '1.0.0')
  assert.equal(host.engine.max, '1.0.0')
  const compatibility = getManifestCompatibility(host, platform)
  assert.equal(compatibility.compatible, true)
  assert.equal(compatibility.degraded, true)
  assert.match(compatibility.reason, /旧版 API|older API/i)

  manifest.engine = { min: '1.5.0', max: '2.0.0' }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  assert.throws(() => parser.normalizePluginManifest(manifest), /需要 API/)
  await assert.rejects(() => validateDirectory(source), /requires API/i)
})

test('core plugin data exposes read-only snapshots and no write RPCs', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-readonly-core-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    manifest: {
      id: 'cn.example.readonly',
      version: '1.0.0',
      permissions: ['names:read', 'records:read', 'statistics:read', 'balance:read'],
      contributes: { pages: [] }
    }
  }
  const snapshots = {
    names: { currentListId: 'list-a', lists: { 'list-a': { names: [] } } },
    records: [{ personId: 'person-a', listId: 'list-a' }],
    statistics: { counts: { 'person-a': 3 }, totalCount: 3 },
    balance: { enabled: true, algorithm: 'Cyrene Balance' }
  }
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async kind => structuredClone(snapshots[kind]),
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  const namesSnapshot = await runtime.handleRpc(plugin.manifest.id, 'names.read', {})
  assert.deepEqual(namesSnapshot, snapshots.names)
  namesSnapshot.lists['list-a'].names.push({ id: 'local-only' })
  assert.deepEqual(await runtime.handleRpc(plugin.manifest.id, 'names.read', {}), snapshots.names)
  assert.deepEqual(await runtime.handleRpc(plugin.manifest.id, 'records.read', {}), snapshots.records)
  assert.deepEqual(await runtime.handleRpc(plugin.manifest.id, 'statistics.read', {}), snapshots.statistics)
  assert.deepEqual(await runtime.handleRpc(plugin.manifest.id, 'balance.read', {}), snapshots.balance)
  for (const method of ['names.write', 'records.write', 'statistics.write', 'balance.write']) {
    await assert.rejects(() => runtime.handleRpc(plugin.manifest.id, method, {}), /不支持的插件请求/)
  }
})

test('generic host capability discovery composes read-only resources and host-owned transactions', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-host-broker-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: { id: 'cn.example.composed', version: '1.0.0', permissions: ['names:read', 'draw:execute'], contributes: { pages: [] } }
  }
  const calls = []
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async (resource, query) => ({ resource, query }),
    executeCoreDraw: async (_plugin, input) => ({ operationId: 'host-owned', results: [], input }),
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  const descriptor = await runtime.handleRpc(plugin.manifest.id, 'host.describe')
  assert.equal(descriptor.apiVersion, PLUGIN_API_VERSION)
  assert.equal(descriptor.model, 'product-freedom-core-hosted')
  assert.equal(descriptor.resources.find(item => item.id === 'names').available, true)
  assert.equal(descriptor.resources.find(item => item.id === 'records').available, false)
  assert.equal(descriptor.transactions.find(item => item.id === 'draw').appendOnly, true)
  assert.equal(descriptor.guarantees.resultSelectionHostOwned, true)

  assert.deepEqual(await runtime.handleRpc(plugin.manifest.id, 'resources.query', { resource: 'names', query: { listId: 'a' } }), { resource: 'names', query: { listId: 'a' } })
  await assert.rejects(() => runtime.handleRpc(plugin.manifest.id, 'resources.query', { resource: 'records' }), /records:read/)
  const receipt = await runtime.handleRpc(plugin.manifest.id, 'transactions.execute', { transaction: 'draw', input: { count: 2 } })
  assert.equal(receipt.operationId, 'host-owned')
  assert.equal(receipt.input.count, 2)

  const context = {
    host: descriptor,
    request: async (method, args) => {
      calls.push({ method, args })
      return { method, args }
    }
  }
  assert.equal((await describeHost(context)).model, 'product-freedom-core-hosted')
  await queryResource(context, 'names', { listId: 'b' })
  await executeTransaction(context, 'draw', { count: 3 })
  assert.deepEqual(calls, [
    { method: 'resources.query', args: { resource: 'names', query: { listId: 'b' } } },
    { method: 'transactions.execute', args: { transaction: 'draw', input: { count: 3 } } }
  ])
})

test('draw.execute requires permission and returns only the host-owned draw receipt', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-draw-execute-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const allowed = {
    manifest: { id: 'cn.example.draw', version: '1.0.0', permissions: ['draw:execute'], contributes: { pages: [] } }
  }
  const denied = {
    manifest: { id: 'cn.example.denied', version: '1.0.0', permissions: [], contributes: { pages: [] } }
  }
  const officialReceipt = {
    operationId: 'host-operation', pluginId: allowed.manifest.id, listId: 'list-a', target: 'people', count: 1,
    allowDuplicates: false, gender: 'all', algorithm: 'Cyrene Balance', algorithmVersion: '3', committedAt: 123,
    results: [{ id: 'host-picked', name: 'Host Pick', englishName: '', isGroup: false, isWhiteList: false }]
  }
  let executions = 0
  const runtime = new PluginRuntime({
    getPlugin: id => id === allowed.manifest.id ? allowed : id === denied.manifest.id ? denied : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async () => null,
    executeCoreDraw: async (plugin, filters) => {
      executions += 1
      assert.equal(plugin.manifest.id, allowed.manifest.id)
      assert.equal(filters.count, 1)
      return structuredClone(officialReceipt)
    },
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  const receipt = await runtime.handleRpc(allowed.manifest.id, 'draw.execute', {
    count: 1, results: [{ id: 'plugin-forged' }], weights: { 'plugin-forged': 999999 }
  })
  assert.deepEqual(receipt, officialReceipt)
  assert.equal(receipt.results[0].id, 'host-picked')
  await assert.rejects(() => runtime.handleRpc(denied.manifest.id, 'draw.execute', { count: 1 }), /draw:execute/)
  assert.equal(executions, 1)
})

test('disabled plugin pages lose their RPC identity when the runtime deactivates', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-disabled-frame-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: { id: 'cn.example.frame', version: '1.0.0', permissions: ['storage:read'], contributes: { pages: [] } }
  }
  const source = {}
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => ({ ok: true }),
    showBanner: () => {},
    getCoreSnapshot: async () => null,
    executeCoreDraw: async () => null,
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  runtime.mountFrame({ contentWindow: source }, plugin.manifest.id, 'page')
  assert.equal(runtime.ownsFrameSource(source, plugin.manifest.id), true)
  plugin.enabled = false
  await assert.rejects(() => runtime.handleRpc(plugin.manifest.id, 'storage.read', { key: 'settings' }), /插件已禁用/)
  await runtime.deactivate(plugin.manifest.id)
  assert.equal(runtime.ownsFrameSource(source, plugin.manifest.id), false)
})

test('storage writes notify only the owning plugin lifecycle runtimes', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-storage-event-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: {
      id: 'cn.example.storage-owner', version: '1.0.0',
      permissions: ['storage:write', 'events:lifecycle'], contributes: { pages: [] }
    }
  }
  const otherPlugin = {
    enabled: true,
    manifest: {
      id: 'cn.example.storage-observer', version: '1.0.0',
      permissions: ['events:lifecycle'], contributes: { pages: [] }
    }
  }
  const messages = { worker: [], frame: [], visual: [], other: [], unsubscribed: [] }
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : id === otherPlugin.manifest.id ? otherPlugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async () => null,
    executeCoreDraw: async () => null,
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  runtime.workers.set(plugin.manifest.id, { worker: { postMessage: message => messages.worker.push(message) } })
  runtime.workers.set(otherPlugin.manifest.id, { worker: { postMessage: message => messages.other.push(message) } })
  runtime.frames.set(`${plugin.manifest.id}:settings`, { contentWindow: { postMessage: message => messages.frame.push(message) } })
  const visualKey = `${plugin.manifest.id}:subscribed`
  runtime.visualSurfaces.set(visualKey, { events: ['plugin:storage-changed'] })
  runtime.visualRuntimes.set(visualKey, {
    activationComplete: true, cancelled: false, finalized: false,
    worker: { postMessage: message => messages.visual.push(message) }
  })
  const unsubscribedKey = `${plugin.manifest.id}:unsubscribed`
  runtime.visualSurfaces.set(unsubscribedKey, { events: ['app:resize'] })
  runtime.visualRuntimes.set(unsubscribedKey, {
    activationComplete: true, cancelled: false, finalized: false,
    worker: { postMessage: message => messages.unsubscribed.push(message) }
  })

  assert.equal(await runtime.handleRpc(plugin.manifest.id, 'storage.write', { key: 'settings', value: { enabled: true } }), true)
  for (const received of [messages.worker, messages.frame, messages.visual]) {
    assert.deepEqual(received, [{ type: 'event', event: 'plugin:storage-changed', payload: { key: 'settings' } }])
  }
  assert.deepEqual(messages.other, [])
  assert.deepEqual(messages.unsubscribed, [])
})

test('visual surfaces replay only their subscribed latest lifecycle snapshots after activation', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-visual-replay-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: {
      id: 'cn.example.visual-replay', version: '1.0.0',
      permissions: ['events:lifecycle', 'ui:visual-surfaces'], contributes: { pages: [] }
    }
  }
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    savePluginData: async () => true,
    loadPluginData: async () => null,
    showBanner: () => {},
    getCoreSnapshot: async () => null,
    executeCoreDraw: async () => null,
    selectFile: async () => null,
    playAudio: async () => true,
    platformBridge: {
      info: () => ({ runtime: 'web', os: 'unknown', desktop: false }),
      capabilities: () => ({}),
      request: async () => ({ ok: false })
    },
    onFault: () => {}
  })

  await runtime.dispatch('app:ready', { route: '/roller', stale: true })
  await runtime.dispatch('app:ready', { route: '/cards', stale: false })
  await runtime.dispatch('app:theme-changed', { theme: 'dark' })
  await runtime.dispatch('app:resize', { width: 1280 })
  await runtime.dispatch('draw:result', { results: ['transient'] })

  const key = `${plugin.manifest.id}:aurora`
  runtime.visualSurfaces.set(key, {
    pluginId: plugin.manifest.id,
    id: 'aurora',
    events: ['app:ready', 'app:theme-changed']
  })
  const messages = []
  const visualRuntime = {
    pluginId: plugin.manifest.id,
    activationComplete: true,
    cancelled: false,
    finalized: false,
    worker: { postMessage: message => messages.push(structuredClone(message)) }
  }
  assert.equal(runtime.replayLifecycleEventsToVisualRuntime(key, visualRuntime), 2)
  assert.deepEqual(messages, [
    { type: 'event', event: 'app:ready', payload: { route: '/cards', stale: false } },
    { type: 'event', event: 'app:theme-changed', payload: { theme: 'dark' } }
  ])
})

test('visual surface worker activates before its initial resize and replays cached theme state', async () => {
  const runtimeSource = await fs.readFile(path.join(projectRoot, 'src/plugins/runtime.js'), 'utf8')
  const activatePosition = runtimeSource.indexOf('await visualModule.activate(Object.freeze({ ...message.context, canvas, request }))')
  const resizePosition = runtimeSource.indexOf('await queueResize(message.viewport || {})', activatePosition)
  const activatedPosition = runtimeSource.indexOf("else self.postMessage({ type: 'activated' })", resizePosition)
  assert.ok(activatePosition >= 0, 'visual activate call is present')
  assert.ok(resizePosition > activatePosition, 'initial resize happens after activate')
  assert.ok(activatedPosition > resizePosition, 'activated is emitted after the initial resize')

  const layoutSource = await fs.readFile(path.join(projectRoot, 'src/components/layout/AppLayout.vue'), 'utf8')
  assert.match(layoutSource, /perfAnimations:\s*settingsStore\.settings\.perfAnimations !== false/)
  assert.match(layoutSource, /reducedMotion:\s*reducedMotion\.value/)
  assert.match(layoutSource, /\{ deep: true, immediate: true \}/)
  assert.match(layoutSource, /addEventListener\('change', onReducedMotionChange\)/)
  assert.match(layoutSource, /removeEventListener\('change', onReducedMotionChange\)/)
})

test('Dock plugin page ordering preserves an explicit zero order', async () => {
  const dockSource = await fs.readFile(path.join(projectRoot, 'src/components/layout/NavigationDock.vue'), 'utf8')
  const layoutSource = await fs.readFile(path.join(projectRoot, 'src/components/layout/AppLayout.vue'), 'utf8')
  assert.match(dockSource, /left\.order \?\? 500/)
  assert.match(dockSource, /right\.order \?\? 500/)
  assert.doesNotMatch(dockSource, /left\.order \|\| 500|right\.order \|\| 500/)
  assert.match(layoutSource, /Number\(page\?\.order \?\? 500\)/)
  assert.doesNotMatch(layoutSource, /Number\(page\?\.order\) \|\| 500/)
})

test('host animation validation rejects network-backed CSS values', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-animation-network-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const parser = await loadApplicationParser(temporary)
  const declaration = { id: 'unsafe-motion', title: 'Unsafe motion', source: 'animations/presets.json' }
  const pack = {
    schemaVersion: 1,
    presets: [{
      id: 'remote-image', target: 'global.transition', label: 'Remote image',
      animation: {
        keyframes: [
          { opacity: 0, background: 'url(https://example.invalid/track.png)' },
          { opacity: 1, background: 'transparent' }
        ],
        options: { duration: 300 }
      }
    }]
  }
  assert.throws(() => parser.normalizeAnimationPack(pack, declaration), /不安全/)
  pack.presets[0].animation.keyframes[0].background = 'u\\72l(https://example.invalid/track.png)'
  assert.throws(() => parser.normalizeAnimationPack(pack, declaration), /不安全/)
})

test('animation registry cancels active animations and falls back after plugin removal', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-animation-registry-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginAnimationRegistry } = await loadAnimationRegistry(temporary)
  const originalElement = globalThis.Element
  const originalDocument = globalThis.document
  const originalMatchMedia = globalThis.matchMedia
  t.after(() => {
    globalThis.Element = originalElement
    globalThis.document = originalDocument
    globalThis.matchMedia = originalMatchMedia
  })

  let cancelled = 0
  class FakeElement {
    animate() {
      return {
        finished: new Promise(() => {}),
        cancel() { cancelled += 1 }
      }
    }
  }
  globalThis.Element = FakeElement
  globalThis.document = { querySelector: () => null }
  // The host animation switch is authoritative; the OS/browser preference
  // must not silently suppress a registered GSAP/WAAPI animation.
  globalThis.matchMedia = () => ({ matches: true })

  const registry = new PluginAnimationRegistry()
  const selections = {}
  registry.registerPlugin({
    manifest: { id: 'cn.example.motion', name: 'Motion' },
    animationPacks: [{
      id: 'motion', title: 'Motion', presets: [{
        id: 'spring', target: 'roller.finish', label: 'Spring', default: true,
        animation: { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 300, iterations: 1, delay: 0 } },
        variants: {}
      }]
    }]
  }, selections)
  assert.equal(registry.has('roller.finish', selections), true)
  registry.setDurationScale('cn.example.motion', 1.5)
  const handle = registry.start('roller.finish', new FakeElement(), selections)
  assert.ok(handle)
  assert.equal(handle.totalDurationMs, 450)
  registry.unregisterPlugin('cn.example.motion')
  assert.equal(cancelled, 1)
  assert.equal(registry.has('roller.finish', selections), false)

  assert.equal(registry.start('roller.finish', new FakeElement(), selections), null)
})

test('plugin catalog resolves the latest GitHub Release asset and digest dynamically', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-catalog-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { resolveCatalogRelease } = await loadPluginCatalog(temporary)
  const catalogItem = {
    id: 'cn.example.sound',
    name: 'Sound',
    repository: 'example/sound-plugin',
    release: { provider: 'github', channel: 'latest', assetPattern: 'sound-*.cnrp' }
  }
  const resolved = await resolveCatalogRelease(catalogItem, {
    source: 'github',
    fetchImpl: async url => {
      assert.equal(url, 'https://api.github.com/repos/example/sound-plugin/releases/latest')
      return {
        ok: true,
        async json() {
          return {
            tag_name: 'v2.3.4',
            name: '2.3.4',
            draft: false,
            prerelease: false,
            html_url: 'https://github.com/example/sound-plugin/releases/tag/v2.3.4',
            published_at: '2026-08-01T00:00:00Z',
            assets: [{
              name: 'sound-2.3.4.cnrp',
              state: 'uploaded',
              digest: `sha256:${'ab'.repeat(32)}`,
              browser_download_url: 'https://github.com/example/sound-plugin/releases/download/v2.3.4/sound-2.3.4.cnrp'
            }]
          }
        }
      }
    }
  })
  assert.equal(resolved.version, '2.3.4')
  assert.equal(resolved.release.assetName, 'sound-2.3.4.cnrp')
  assert.equal(resolved.sha256, 'ab'.repeat(32))
  assert.match(resolved.downloadUrl, /releases\/download\/v2\.3\.4/)
})

test('repository catalog uses dynamic GitHub Release metadata instead of pinned asset URLs', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(projectRoot, 'plugins/list.json'), 'utf8'))
  assert.equal(catalog.apiVersion, PLUGIN_API_VERSION)
  for (const plugin of catalog.plugins) {
    assert.ok(plugin.repository)
    assert.equal(plugin.downloadUrl, undefined)
    assert.equal(plugin.sha256, undefined)
    assert.equal(plugin.version, undefined)
    assert.equal(plugin.release?.provider, 'github')
    assert.match(plugin.release?.assetPattern || '', /\.cnrp$/)
  }
})

test('catalog packages can bind an Ed25519 publisher key', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-signature-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'signed.cnrp')
  const keyPath = path.join(temporary, 'publisher-private.pem')
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  await fs.writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  await createTemplate(source, 'basic')
  const packed = await packDirectory(source, output, { privateKey: keyPath })
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(await fs.readFile(output)), { expectedPublisherKey: packed.envelope.publisherKey })
  assert.equal(parsed.publisherVerified, true)
  await assert.rejects(
    () => parser.parsePluginPackage(new Uint8Array(packed.output), { expectedPublisherKey: Buffer.alloc(44, 1).toString('base64') }),
    /公钥.*不一致/
  )
})

test('platform bridge exposes Web capability status and safely marks native-only operations unavailable', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-bridge-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { getManifestCompatibility, getCapabilityMap, getCurrentPlatform } = await loadPlatformBridge(temporary)
  const platform = { runtime: 'web', os: 'unknown', desktop: false }
  const capabilities = getCapabilityMap(platform)
  assert.equal(capabilities['system:open-url'].available, true)
  assert.equal(capabilities['system:select-file'].available, true)
  assert.equal(capabilities['system:select-directory'].available, false)
  assert.equal(capabilities['system:reveal-file'].available, false)

  const optional = getManifestCompatibility({
    engine: { min: '1.0.0', max: '1.0.0' },
    entry: 'worker.js',
    permissions: ['system:select-directory'],
    capabilities: { 'system:select-directory': { required: false } }
  }, platform)
  assert.equal(optional.compatible, true)
  assert.equal(optional.missing.length, 0)
  assert.equal(optional.degraded, true)
  assert.match(optional.reason, /旧版 API/)
  assert.match(optional.reason, /选择本地目录/)

  const required = getManifestCompatibility({
    entry: 'worker.js',
    permissions: ['system:select-directory'],
    capabilities: { 'system:select-directory': { required: true } }
  }, platform)
  assert.equal(required.compatible, false)
  assert.match(required.reason, /选择本地目录/)

  const nativeOnly = getManifestCompatibility({
    platformEntries: { windows: 'worker.windows.js' },
    contributes: { pages: [] },
    permissions: [],
    capabilities: {}
  }, platform)
  assert.equal(nativeOnly.compatible, false)
  assert.match(nativeOnly.reason, /没有适用于当前平台/)

  const visualOnly = getManifestCompatibility({
    contributes: {
      pages: [],
      visualSurfaces: [{ id: 'aurora', entry: 'visual.js', platformEntries: {} }]
    },
    permissions: ['ui:visual-surfaces'],
    capabilities: {}
  }, platform)
  assert.equal(visualOnly.compatible, true)
  assert.equal(getCurrentPlatform().runtime, 'web')
})

test('SDK manifest rejects combined command strings instead of fixed program declarations', async t => {
  const temporary = await createTestDirectory('cyrene-plugin-platform-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createTemplate(source, 'basic')
  const manifestPath = path.join(source, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.permissions = [...manifest.permissions, 'system:execute']
  manifest.capabilities = {}
  manifest.capabilities['system:execute'] = { required: false, platforms: ['tauri'] }
  manifest.systemOperations = [{
    id: 'bad-shell',
    label: 'Bad shell',
    platforms: ['tauri'],
    command: { program: 'pwsh -Command', args: ['Get-Process'] }
  }]
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await assert.rejects(() => validateDirectory(source), /system operation|系统操作/)
})
