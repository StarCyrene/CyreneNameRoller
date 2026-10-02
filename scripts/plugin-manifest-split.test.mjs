import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'
import { parse as parseYaml } from 'yaml'
import {
  createTemplate,
  packDirectory,
  readManifestSource,
  validateDirectory
} from '../packages/cyrene-name-roller/bin/cnrp.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const testTempRoot = path.join(projectRoot, 'build-output', 'plugin-manifest-split-tests')

async function createTestDirectory(prefix) {
  await fs.mkdir(testTempRoot, { recursive: true })
  return fs.mkdtemp(path.join(testTempRoot, prefix))
}

async function loadApplicationParser(directory) {
  const output = path.join(directory, 'split-application-parser.mjs')
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

async function loadPluginRuntime(directory) {
  const output = path.join(directory, 'split-application-runtime.mjs')
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

async function readPackedArchive(output) {
  const bytes = await fs.readFile(output)
  const magic = Buffer.from('CNRP1\n')
  const envelope = JSON.parse(bytes.subarray(magic.length).toString('utf8'))
  const subtle = crypto.webcrypto.subtle
  const material = await subtle.importKey('raw', new TextEncoder().encode(`${envelope.id}@${envelope.version}:CyreneNameRollerPlugin-v1`), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: Buffer.from(envelope.salt, 'base64'), iterations: 120000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const plain = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Buffer.from(envelope.iv, 'base64'),
      additionalData: new TextEncoder().encode(`${envelope.id}\0${envelope.version}\0${envelope.hash}`)
    },
    key,
    Buffer.from(envelope.data, 'base64')
  )
  return JSZip.loadAsync(new Uint8Array(plain))
}

const YAML_IDENTITY = `schemaVersion: 1
id: cn.example.split
name: Split Plugin
version: 1.0.0
author: Split Author
description: Split declaration plugin.
engine:
  min: 1.4.0
  max: 1.4.0
entry: src/worker.js
readme: README.md
permissions:
  - storage:read
  - storage:write
  - events:draw
`

const CONTRIBUTIONS = {
  settings: {
    title: 'Split settings',
    storageKey: 'settings',
    sections: [{
      id: 'general',
      title: 'General',
      fields: [
        { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
        { id: 'count', type: 'slider', label: 'Count', min: 1, max: 10, default: 3 },
        { id: 'volume', type: 'range', label: 'Volume', min: 0, max: 1, default: 0.5 },
        { id: 'mode', type: 'select', label: 'Mode', default: 'once', options: [{ value: 'once', label: 'Once' }, { value: 'each', label: 'Each' }] }
      ]
    }]
  },
  pages: [{ id: 'lab', title: 'Lab', entry: 'pages/main.html', location: 'plugins', order: 640 }],
  commands: [{ id: 'apply', title: 'Apply', locations: ['command-palette'] }]
}

async function createSplitSource(directory, { yaml = YAML_IDENTITY, contributions = CONTRIBUTIONS, writeContributions = true } = {}) {
  await createTemplate(directory, 'basic')
  await fs.rm(path.join(directory, 'contributions.json'), { force: true })
  await fs.writeFile(path.join(directory, 'manifest.yml'), yaml)
  if (writeContributions) await fs.writeFile(path.join(directory, 'contributions.json'), JSON.stringify(contributions, null, 2))
  return directory
}

test('split format packs manifest.yml with contributions.json and the host merges them', async t => {
  const temporary = await createTestDirectory('cyrene-split-roundtrip-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'split.cnrp')
  await createSplitSource(source)

  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.id, 'cn.example.split')
  assert.deepEqual(validation.manifest.engine, { min: '1.4.0', max: '1.4.0' })
  assert.equal(validation.manifest.contributes.settings.storageKey, 'settings')
  assert.deepEqual(validation.manifest.contributes.pages.map(page => page.id), ['lab'])
  assert.deepEqual(validation.manifest.contributes.commands.map(command => command.id), ['apply'])
  assert.deepEqual(validation.files.sort(), ['README.md', 'pages/main.html', 'src/worker.js'])

  const packed = await packDirectory(source, output)
  const archive = await readPackedArchive(output)
  assert.equal(archive.file('manifest.json'), null)
  const packedYaml = parseYaml(await archive.file('manifest.yml').async('string'))
  assert.equal(packedYaml.id, 'cn.example.split')
  assert.equal(packedYaml.contributes, undefined)
  assert.equal(packedYaml.settings, undefined)
  assert.equal(packedYaml.pages, undefined)
  assert.equal(packedYaml.api, undefined)
  assert.match(packedYaml.integrity['contributions.json'], /^[0-9a-f]{64}$/)
  assert.match(packedYaml.integrity['src/worker.js'], /^[0-9a-f]{64}$/)
  assert.equal(Object.hasOwn(packedYaml.integrity, 'manifest.yml'), false)

  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(packed.output))
  assert.equal(parsed.manifest.id, 'cn.example.split')
  assert.equal(parsed.manifest.contributes.settings.sections[0].fields.length, 4)
  assert.deepEqual(parsed.manifest.contributes.settings.sections[0].fields.map(field => field.type), ['toggle', 'slider', 'slider', 'select'])
  assert.deepEqual(parsed.manifest.contributes.settings.sections[0].fields.map(field => field.path), ['enabled', 'count', 'volume', 'mode'])
  assert.deepEqual(parsed.manifest.contributes.pages.map(page => page.id), ['lab'])
  assert.deepEqual(parsed.manifest.contributes.pages[0].native, null)
  assert.equal(parsed.files['contributions.json'] !== undefined, true)
  assert.equal(parsed.files['manifest.yml'] !== undefined, true)
})

test('CLI and host normalize the same split declaration identically', async t => {
  const temporary = await createTestDirectory('cyrene-split-parity-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createSplitSource(source)
  const cli = await validateDirectory(source)
  const parser = await loadApplicationParser(temporary)
  const { raw, fromYml } = await readManifestSource(source)
  assert.equal(fromYml, true)
  const host = parser.normalizePluginManifest(raw, { fromYml: true })
  assert.deepEqual(cli.manifest.contributes.settings, host.contributes.settings)
  assert.deepEqual(cli.manifest.contributes.pages, host.contributes.pages)
  assert.deepEqual(cli.manifest.contributes.commands, host.contributes.commands)
})

test('split format rejects a package that mixes manifest.yml with manifest.json', async t => {
  const temporary = await createTestDirectory('cyrene-split-mixed-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createSplitSource(source)
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify({ schemaVersion: 1 }, null, 2))
  await assert.rejects(() => validateDirectory(source), /cannot coexist/)
  await packDirectory(path.join(await createSplitSource(path.join(temporary, 'clean'))), path.join(temporary, 'clean.cnrp'))
  const parser = await loadApplicationParser(temporary)
  assert.throws(
    () => parser.pluginManifestSource({ 'manifest.yml': YAML_IDENTITY, 'manifest.json': '{}' }),
    /禁止混用/
  )
})

test('split format rejects contribution keys declared inside manifest.yml', async t => {
  const temporary = await createTestDirectory('cyrene-split-forbidden-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const parser = await loadApplicationParser(temporary)
  for (const key of ['contributes', 'settings', 'pages', 'api']) {
    const source = path.join(temporary, `plugin-${key}`)
    await createSplitSource(source, {
      yaml: `${YAML_IDENTITY}\n${key}: {}\n`
    })
    await assert.rejects(() => validateDirectory(source), new RegExp(`must not declare ${key}`))
    assert.throws(() => parser.pluginManifestSource({ 'manifest.yml': `${YAML_IDENTITY}\n${key}: {}\n` }), new RegExp(`不允许包含 ${key}`))
  }
})

test('split format requires a declaration file and rejects a contributions wrapper', async t => {
  const temporary = await createTestDirectory('cyrene-split-missing-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createTemplate(source, 'ui-customization')
  await fs.rm(path.join(source, 'manifest.yml'), { force: true })
  await fs.rm(path.join(source, 'contributions.json'), { force: true })
  await assert.rejects(() => validateDirectory(source), /missing manifest\.yml or manifest\.json/)
  const parser = await loadApplicationParser(temporary)
  assert.throws(() => parser.pluginManifestSource({}), /缺少 manifest\.yml 或 manifest\.json/)

  const wrapped = path.join(temporary, 'wrapped')
  await createSplitSource(wrapped, { contributions: { contributes: { pages: [] } } })
  await assert.rejects(() => validateDirectory(wrapped), /contributes wrapper/)
  assert.throws(() => parser.pluginManifestSource({ 'manifest.yml': YAML_IDENTITY, 'contributions.json': '{"contributes":{}}' }), /无需 contributes 包装/)

  const identity = path.join(temporary, 'identity')
  await createSplitSource(identity, { contributions: { ...CONTRIBUTIONS, id: 'cn.example.other' } })
  await assert.rejects(() => validateDirectory(identity), /identity field id/)
  assert.throws(
    () => parser.pluginManifestSource({ 'manifest.yml': YAML_IDENTITY, 'contributions.json': '{"id":"cn.example.other"}' }),
    /不允许声明插件身份字段：id/
  )
})

test('split format rejects pages[].native and points at contributions settings', async t => {
  const temporary = await createTestDirectory('cyrene-split-native-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await createSplitSource(source, {
    contributions: {
      pages: [{ id: 'settings', title: 'Settings', native: { type: 'settings', controls: [] } }]
    }
  })
  await assert.rejects(() => validateDirectory(source), /pages\[0\]\.native/)
  const parser = await loadApplicationParser(temporary)
  const { raw } = await readManifestSource(source)
  assert.throws(() => parser.normalizePluginManifest(raw, { fromYml: true }), /新格式中不可用/)
  const legacy = parser.normalizePluginManifest({ ...structuredClone(raw), contributes: { pages: [{ id: 'settings', title: 'Settings', native: { type: 'settings', controls: [{ id: 'enabled', type: 'toggle', path: 'enabled', label: 'Enabled' }] } }] } }, { fromYml: false })
  assert.equal(legacy.contributes.pages[0].native.type, 'settings')
})

test('normalizePluginSettings enforces the field contract in both CLI and host', async t => {
  const temporary = await createTestDirectory('cyrene-split-settings-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const parser = await loadApplicationParser(temporary)

  const settingsOnly = { ...structuredClone(CONTRIBUTIONS), pages: [], commands: [] }
  assert.doesNotThrow(() => parser.normalizePluginManifest({ ...JSON.parse(JSON.stringify({
    schemaVersion: 1, id: 'cn.example.split', name: 'Split', version: '1.0.0', author: 'Split',
    engine: { min: '1.4.0', max: '1.4.0' }, permissions: ['storage:read'], contributes: settingsOnly
  })) }, { fromYml: true }))
  assert.doesNotThrow(() => parser.normalizePluginSettings({ storageKey: 'default', sections: [{ id: 'a', title: 'A', fields: [{ id: 'only', type: 'toggle', label: 'Only' }] }] }))

  const cases = [
    [{ sections: [] }, /sections/],
    [{ sections: [{ id: 'A', title: 'A', fields: [{ id: 'x', type: 'toggle', label: 'X' }] }] }, /ID 无效或重复/],
    [{ sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'dropdown', label: 'X' }] }] }, /类型不受支持/],
    [{ sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'slider', label: 'X', min: 2, max: 1 }] }] }, /范围无效/],
    [{ sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'select', label: 'X' }] }] }, /options 无效/],
    [{ sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'component-style-select', label: 'X', target: 'roller.result', path: 'x' }] }] }, /不应声明 path/],
    [{ sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'component-style-select', label: 'X', target: 'not.a.target' }] }] }, /target 无效/],
    [{ storageKey: 'bad/path', sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'toggle', label: 'X' }] }] }, /storageKey 无效/]
  ]
  for (const [value, pattern] of cases) {
    assert.throws(() => parser.normalizePluginSettings(value), pattern)
  }
  assert.throws(() => parser.normalizePluginSettings({ sections: [] }, 'pages[0].native'), /pages\[0\]\.native\.sections/)

  const source = path.join(temporary, 'plugin')
  await createSplitSource(source, { contributions: { settings: { sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'dropdown', label: 'X' }] }] } } })
  await assert.rejects(() => validateDirectory(source), /unsupported type/)
})

test('a settings-only plugin without any Worker entry passes the entry check', async t => {
  const temporary = await createTestDirectory('cyrene-split-settings-only-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  await fs.mkdir(path.join(source, 'src'), { recursive: true })
  await fs.writeFile(path.join(source, 'src', 'worker.js'), 'self.addEventListener("message", () => {})\n')
  await fs.writeFile(path.join(source, 'manifest.yml'), `schemaVersion: 1
id: cn.example.only-settings
name: Only Settings
version: 1.0.0
author: Example
engine:
  min: 1.4.0
  max: 1.4.0
permissions:
  - storage:read
  - storage:write
`)
  await fs.writeFile(path.join(source, 'contributions.json'), JSON.stringify({
    settings: { sections: [{ id: 'general', title: '常规', fields: [{ id: 'enabled', type: 'toggle', label: '启用', default: true }] }] }
  }, null, 2))

  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.entry, undefined)
  assert.equal(validation.manifest.contributes.settings.sections[0].fields[0].path, 'enabled')

  await fs.writeFile(path.join(source, 'contributions.json'), '{}')
  await assert.rejects(() => validateDirectory(source), /at least one Worker/)

  await fs.writeFile(path.join(source, 'contributions.json'), JSON.stringify({
    settings: { sections: [{ id: 'general', title: '常规', fields: [{ id: 'enabled', type: 'toggle', label: '启用' }] }] }
  }, null, 2))
  const parser = await loadApplicationParser(temporary)
  const sources = await readManifestSource(source)
  const host = parser.normalizePluginManifest(sources.raw, { fromYml: true })
  assert.equal(host.contributes.settings.sections[0].fields[0].path, 'enabled')
})

test('legacy single-file packages keep parsing with pages[].native intact', async t => {
  const temporary = await createTestDirectory('cyrene-split-legacy-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'plugin')
  const output = path.join(temporary, 'legacy.cnrp')
  await createTemplate(source, 'basic')
  await fs.rm(path.join(source, 'manifest.yml'), { force: true })
  await fs.rm(path.join(source, 'contributions.json'), { force: true })
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'cn.example.legacy-single',
    name: 'Legacy Single',
    version: '1.2.0',
    author: 'Legacy',
    engine: { min: '1.2.0', max: '1.2.0' },
    entry: 'src/worker.js',
    permissions: ['storage:read'],
    contributes: {
      pages: [{ id: 'settings', title: 'Settings', location: 'plugins', native: { type: 'settings', settingsKey: 'settings', controls: [{ id: 'enabled', type: 'toggle', path: 'enabled', label: 'Enabled' }] } }]
    }
  }, null, 2))

  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.contributes.pages[0].native.type, 'settings')
  const packed = await packDirectory(source, output)
  const archive = await readPackedArchive(output)
  assert.equal(archive.file('manifest.yml'), null)
  assert.notEqual(archive.file('manifest.json'), null)
  const parser = await loadApplicationParser(temporary)
  const parsed = await parser.parsePluginPackage(new Uint8Array(packed.output))
  assert.equal(parsed.manifest.contributes.pages[0].native.controls[0].path, 'enabled')
})

test('plugin:storage-changed reaches a mounted page for the declared settings key without events:lifecycle', async t => {
  const temporary = await createTestDirectory('cyrene-split-storage-relay-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: {
      id: 'cn.example.split-relay',
      version: '1.0.0',
      permissions: ['storage:read', 'storage:write'],
      contributes: {
        settings: { storageKey: 'panel', sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'toggle', label: 'X' }] }] },
        pages: [{ id: 'lab', title: 'Lab', entry: 'pages/main.html' }]
      }
    }
  }
  const gated = {
    enabled: true,
    manifest: { id: 'cn.example.split-gated', version: '1.0.0', permissions: ['storage:read', 'storage:write'], contributes: { pages: [] } }
  }
  const messages = { frame: [], worker: [], visual: [], other: [] }
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : id === gated.manifest.id ? gated : null,
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
  runtime.workers.set(gated.manifest.id, { worker: { postMessage: message => messages.other.push(message) } })
  runtime.frames.set(`${plugin.manifest.id}:lab`, { contentWindow: { postMessage: message => messages.frame.push(message) } })
  runtime.frames.set(`${gated.manifest.id}:lab`, { contentWindow: { postMessage: message => messages.other.push(message) } })
  const visualKey = `${plugin.manifest.id}:surface`
  runtime.visualSurfaces.set(visualKey, { events: ['plugin:storage-changed'] })
  runtime.visualRuntimes.set(visualKey, {
    activationComplete: true, cancelled: false, finalized: false,
    worker: { postMessage: message => messages.visual.push(message) }
  })

  await runtime.handleRpc(plugin.manifest.id, 'storage.write', { key: 'panel', value: { x: true } })
  assert.deepEqual(messages.frame, [{ type: 'event', event: 'plugin:storage-changed', payload: { key: 'panel' } }])
  assert.deepEqual(messages.worker, [], 'worker stays behind the lifecycle permission gate')
  assert.deepEqual(messages.visual, [], 'visual surfaces stay behind the lifecycle permission gate')

  messages.frame.length = 0
  await runtime.handleRpc(plugin.manifest.id, 'storage.write', { key: 'other-key', value: { x: true } })
  assert.deepEqual(messages.frame, [], 'a non-settings key is still gated')

  messages.other.length = 0
  await runtime.handleRpc(gated.manifest.id, 'storage.write', { key: 'settings', value: { x: true } })
  assert.deepEqual(messages.other, [], 'a plugin without declared settings is unaffected')
})

test('packed split pages expose the settingsKey bootstrap to their frames', async t => {
  const temporary = await createTestDirectory('cyrene-split-bootstrap-')
  t.after(() => fs.rm(temporary, { recursive: true, force: true }))
  const { PluginRuntime } = await loadPluginRuntime(temporary)
  const plugin = {
    enabled: true,
    manifest: {
      id: 'cn.example.split-frame',
      version: '1.0.0',
      permissions: ['storage:read', 'storage:write'],
      contributes: { settings: { storageKey: 'panel', sections: [{ id: 'a', title: 'A', fields: [{ id: 'x', type: 'toggle', label: 'X' }] }] } }
    },
    files: {
      'pages/main.html': Buffer.from('<html><head></head><body>frame</body></html>', 'utf8').toString('base64')
    }
  }
  const runtime = new PluginRuntime({
    getPlugin: () => plugin,
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
  const source = runtime.frameSource(plugin, { id: 'lab', entry: 'pages/main.html' })
  assert.match(source, /const settingsKey = "panel";/)
  assert.match(source, /settingsKey,/)
  assert.match(source, /read: async \(\) => \(await request\('storage\.read', \{ key: settingsKey \}\)\) \|\| \{\}/)
  assert.match(source, /patch: async partial =>/)
})
