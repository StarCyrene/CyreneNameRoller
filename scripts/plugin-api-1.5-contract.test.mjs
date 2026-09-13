import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTemplate, packDirectory, validateDirectory } from '../packages/cyrene-name-roller/bin/cnrp.mjs'
import {
  CNRP_JSONRPC_PROTOCOL,
  MAX_RPC_FRAME_BYTES,
  MAX_RPC_BINARY_BYTES,
  MAX_RPC_CHUNK_BYTES,
  createRpcRequest,
  createRpcCancel,
  createRpcHandshake,
  encodeRpcFrame,
  parseRpcFrame,
  createRpcError,
  replayRpcRequest,
  validateRpcBinaryChunk,
  RpcFrameDecoder,
  RpcHandshake,
  RPC_ERROR_CODES,
  createCancellationState,
  validateRpcChunkSequence
} from '../src/plugins/rpc/protocol.js'

const parserPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cnr-api15-')), 'package.mjs')
await build({ entryPoints: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/plugins/package.js')], bundle: true, write: true, outfile: parserPath, platform: 'browser', format: 'esm', target: ['es2022'], legalComments: 'none' })
const { normalizePluginManifest, normalizeProcessEntry, normalizeFileScopes, normalizeHookDeclaration } = await import(pathToFileURL(parserPath).href)

const validManifest = {
  api: '1.5',
  schemaVersion: 1,
  id: 'cn.example.api15',
  name: 'API 1.5 plugin',
  version: '1.0.0',
  author: 'Example',
  description: 'A valid plugin',
  engine: { min: '9.9.9', max: '9.9.9' },
  entry: { runtime: 'cnrp-runner', script: 'bin/plugin.js', args: ['--worker'] },
  platforms: ['web', 'windows'],
  permissions: [
    { id: 'files:app:read', required: true, platforms: ['web', 'tauri'] },
    { id: 'files:external:read', required: false, platforms: ['tauri'] },
    { id: 'net:internet', required: true, platforms: ['web', 'tauri'] },
    { id: 'window:create', required: false, platforms: ['tauri'] },
    { id: 'page:read', required: true, platforms: ['web', 'tauri'] },
    { id: 'core:names:read', required: true, platforms: ['web', 'tauri'] },
    { id: 'core:before-operation', required: false, platforms: ['web', 'tauri'] }
  ],
  files: {
    app: { scopes: ['read'] },
    external: [{ path: 'data', scopes: ['read'] }]
  },
  network: { internet: true },
  windows: { create: true, main: { control: true }, floating: { control: false, alwaysOnTop: false } },
  pages: [
    { id: 'main', title: 'Main', location: 'main', entry: 'pages/main.html', children: [{ id: 'child', title: 'Child', entry: 'pages/child.html' }] },
    { id: 'settings', title: 'Settings', location: 'settings', entry: 'pages/settings.html', children: [] }
  ],
  hooks: [{ operation: 'name-draw', timeoutMs: 250 }],
  signature: { algorithm: 'Ed25519', publisher: 'publisher-key' }
}

test('normalizes a strict API 1.5 manifest and its bounded declarations', () => {
  const manifest = normalizePluginManifest(validManifest)
  assert.equal(manifest.api, '1.5')
  assert.deepEqual(manifest.engine, { min: '9.9.9', max: '9.9.9' })
  assert.deepEqual(manifest.entry, validManifest.entry)
  assert.deepEqual(manifest.platforms, validManifest.platforms)
  assert.deepEqual(manifest.permissions, validManifest.permissions)
  assert.deepEqual(manifest.files, validManifest.files)
  assert.deepEqual(manifest.pages.map(page => page.id), ['main', 'settings'])
  assert.equal(manifest.pages[0].children[0].id, 'child')
  assert.equal(manifest.hooks[0].timeoutMs, 250)
  assert.throws(() => normalizePluginManifest({ ...validManifest, windows: { create: 'yes' } }), /windows/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, hooks: [{ operation: 'name-draw', timeoutMs: '250' }] }), /timeout/i)
})

test('keeps API 1.4 and older manifests displayable but never valid for activation', () => {
  assert.throws(() => normalizePluginManifest({ ...validManifest, api: '1.4' }), /API|需要 API/)
})

test('accepts API 1.5 declarative contributions and product capabilities', () => {
  const manifest = normalizePluginManifest({
    ...validManifest,
    permissions: [
      { id: 'storage:read', required: true, platforms: ['web', 'tauri'] },
      { id: 'storage:write', required: true, platforms: ['web', 'tauri'] },
      { id: 'events:draw', required: true, platforms: ['web', 'tauri'] },
      { id: 'notifications:show', required: false, platforms: ['web', 'tauri'] },
      { id: 'audio:select', required: false, platforms: ['web', 'tauri'] },
      { id: 'audio:play', required: false, platforms: ['web', 'tauri'] },
      { id: 'ui:animations', required: true, platforms: ['web', 'tauri'] },
      { id: 'ui:visual-surfaces', required: true, platforms: ['web', 'tauri'] }
    ],
    pages: [{
      id: 'settings',
      title: 'Settings',
      location: 'settings',
      native: { type: 'settings', settingsKey: 'settings', controls: [{ id: 'enabled', type: 'toggle', path: 'enabled', label: 'Enabled', default: true }] }
    }],
    animationPacks: [{ id: 'signature', title: 'Signature', source: 'animations/signature.json' }],
    visualSurfaces: [{ id: 'ambient', title: 'Ambient', entry: 'src/visual-surface.js', placement: 'background', events: ['draw:result'] }]
  })
  assert.equal(manifest.pages[0].native.type, 'settings')
  assert.equal(manifest.pages[0].entry, '')
  assert.deepEqual(manifest.animationPacks[0], { id: 'signature', title: 'Signature', description: '', source: 'animations/signature.json' })
  assert.equal(manifest.visualSurfaces[0].entry, 'src/visual-surface.js')
  assert.equal(manifest.visualSurfaces[0].placement, 'background')
  assert.equal(manifest.visualSurfaces[0].defaultEnabled, true)
  assert.throws(() => normalizePluginManifest({ ...validManifest, animationPacks: [{ id: 'x', title: 'X', source: 'a.json' }] }), /ui:animations/)
  assert.throws(() => normalizePluginManifest({ ...validManifest, pages: [{ id: 'settings', title: 'S', location: 'settings' }] }), /entry or native|entry/i)
})

test('CLI validates and packs API 1.5 contributions with native pages', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnr-api15-contrib-'))
  const source = path.join(root, 'plugin')
  await createTemplate(source, 'api15')
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'))
  manifest.permissions.push(
    { id: 'ui:animations', required: true, platforms: ['web', 'tauri'] },
    { id: 'ui:visual-surfaces', required: true, platforms: ['web', 'tauri'] }
  )
  manifest.pages = [{
    id: 'settings',
    title: 'Settings',
    location: 'settings',
    native: { type: 'settings', settingsKey: 'settings', controls: [{ id: 'enabled', type: 'toggle', path: 'enabled', label: 'Enabled', default: true }] }
  }]
  manifest.animationPacks = [{ id: 'signature', title: 'Signature', source: 'animations/signature.json' }]
  manifest.visualSurfaces = [{ id: 'ambient', title: 'Ambient', entry: 'src/visual-surface.js', placement: 'background', events: ['draw:result'] }]
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await fs.mkdir(path.join(source, 'animations'), { recursive: true })
  await fs.writeFile(path.join(source, 'animations', 'signature.json'), JSON.stringify({
    schemaVersion: 1,
    presets: [{ id: 'fade', target: 'page.transition', label: 'Fade', animation: { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 300 } } }]
  }))
  await fs.writeFile(path.join(source, 'src', 'visual-surface.js'), 'globalThis.CyreneVisualSurfaceModule = { activate() {} }\n')
  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.pages[0].native.type, 'settings')
  assert.equal(validation.animationPacks.length, 1)
  assert.equal(validation.manifest.visualSurfaces[0].entry, 'src/visual-surface.js')
  const output = path.join(root, 'contrib.cnrp')
  const packed = await packDirectory(source, output)
  assert.equal(packed.manifest.api, '1.5')
  assert.ok((await fs.stat(output)).size > 0)
})

test('returns migration metadata for manifests without api', () => {
  const legacy = { schemaVersion: 1, id: 'cn.example.legacy', name: 'Legacy', version: '1.0.0' }
  const status = normalizePluginManifest(legacy)
  assert.deepEqual(status, { ...legacy, activatable: false, displayOnly: true, migrationRequired: true, api: null })
})

test('rejects unknown fields and malformed or undeclared runtime pages', () => {
  assert.throws(() => normalizePluginManifest({ ...validManifest, unknown: true }), /unknown field/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, permissions: [{ id: 'unknown', required: true, platforms: [] }] }), /permission/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, entry: { ...validManifest.entry, script: '../plugin.js' } }), /path|路径/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, files: { app: { path: '../x' } } }), /unknown field/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, pages: [{ id: 'main', title: 'Main', location: 'main', entry: 'pages/main.html' }], runtimePages: ['settings'] }), /unknown field/i)
  assert.throws(() => normalizePluginManifest({ ...validManifest, pages: [{ id: 'main', title: 'Main', location: 'main', entry: 'pages/main.html' }, { id: 'main', title: 'Duplicate', location: 'settings', entry: 'pages/settings.html' }] }), /duplicate/i)
})

test('resolves required and optional capabilities by runtime and OS', async () => {
  const { resolveApi15Capabilities } = await import(pathToFileURL(parserPath).href)
  const manifest = normalizePluginManifest(validManifest)
  const web = resolveApi15Capabilities(manifest, { runtime: 'web', os: 'unknown' })
  assert.equal(web['files:app:read'].available, false)
  assert.equal(web['files:external:read'].available, false)
  const windows = resolveApi15Capabilities(manifest, { runtime: 'tauri', os: 'windows' })
  assert.equal(windows['files:external:read'].available, true)
  assert.equal(windows['window:create'].available, true)
})

test('validates process, files, and hook bounds', () => {
  assert.deepEqual(normalizeProcessEntry(validManifest.entry), validManifest.entry)
  assert.throws(() => normalizeProcessEntry({ ...validManifest.entry, args: Array(33).fill('x') }), /args/i)
  assert.deepEqual(normalizeFileScopes({ app: { scopes: ['read'] } }).app, { scopes: ['read'] })
  assert.throws(() => normalizeFileScopes({ external: [{ path: 'x', scopes: ['admin'] }] }), /scope/i)
  assert.throws(() => normalizeHookDeclaration({ operation: 'name-draw', timeoutMs: 1001 }), /timeout/i)
})

test('frames versioned JSON-RPC with bounded binary chunks and structured errors', () => {
  assert.equal(CNRP_JSONRPC_PROTOCOL, 'cnrp-jsonrpc/1')
  assert.equal(MAX_RPC_FRAME_BYTES, 1024 * 1024)
  assert.equal(MAX_RPC_CHUNK_BYTES, 256 * 1024)
  assert.equal(MAX_RPC_BINARY_BYTES, 32 * 1024 * 1024)
  const request = createRpcRequest('files.read', { path: 'data.txt' }, undefined, { pluginId: 'cn.example.api15', instanceId: 'instance-1' })
  assert.match(request.id, /^[A-Za-z0-9-]+$/)
  assert.ok(request.idempotencyKey)
  const parsed = parseRpcFrame(encodeRpcFrame(request))
  assert.deepEqual(parsed, request)
  assert.deepEqual(createRpcError('INVALID_REQUEST', 'bad request', { field: 'id' }), { code: 'INVALID_REQUEST', message: 'bad request', data: { field: 'id' } })
  const replayCache = new Map()
  assert.deepEqual(replayRpcRequest('key-1', { ok: true }, replayCache), { ok: true })
  assert.deepEqual(replayRpcRequest('key-1', { ok: false }, replayCache), { ok: true })
  assert.equal(createRpcCancel(request.id).method, '$/cancelRequest')
  assert.equal(createRpcHandshake({ pluginId: 'cn.example.api15', instanceId: 'instance-1' }).api, '1.5')
  assert.equal(validateRpcBinaryChunk({ index: 0, total: 1, data: Buffer.from('ok').toString('base64') }).byteLength, 2)
  assert.deepEqual(RPC_ERROR_CODES, ['INVALID_REQUEST', 'UNAUTHORIZED', 'METHOD_NOT_FOUND', 'INVALID_PARAMS', 'TIMEOUT', 'CANCELLED', 'CONFLICT', 'UNSUPPORTED_PLATFORM', 'INTERNAL_ERROR'])
  const cancellation = createCancellationState()
  assert.equal(cancellation.cancel(request.id), true)
  assert.equal(cancellation.isCancelled(request.id), true)
})

test('decodes partial and multiple frames and validates chunk metadata', () => {
  const a = encodeRpcFrame(createRpcRequest('one', {}, 'a'))
  const b = encodeRpcFrame(createRpcRequest('two', {}, 'b'))
  const decoder = new RpcFrameDecoder()
  assert.deepEqual(decoder.push(a.subarray(0, 2)), [])
  assert.deepEqual(decoder.push(new Uint8Array([...a.subarray(2), ...b])), [parseRpcFrame(a), parseRpcFrame(b)])
  assert.deepEqual(validateRpcBinaryChunk({ index: 0, total: 1, data: Buffer.from('ok').toString('base64') }), new Uint8Array([111, 107]))
  assert.throws(() => validateRpcBinaryChunk({ index: 1, total: 1, data: 'b2s=' }), /chunk/i)
  assert.deepEqual(validateRpcChunkSequence([{ index: 1, total: 2, data: 'Yw==' }, { index: 0, total: 2, data: 'Yg==' }]), [98, 99])
  assert.throws(() => validateRpcChunkSequence([{ index: 0, total: 2, data: 'Yg==' }]), /total/i)
  const chunkData = Buffer.alloc(MAX_RPC_CHUNK_BYTES, 97).toString('base64')
  assert.throws(() => validateRpcChunkSequence(Array.from({ length: 129 }, (_, index) => ({ index, total: 129, data: chunkData }))), /limit/i)
})

test('enforces the API 1.5 handshake order and negotiation', () => {
  const handshake = new RpcHandshake({ pluginId: 'cn.example.api15', instanceId: 'instance-1' })
  assert.equal(handshake.next({ type: 'hello', role: 'plugin', pluginId: 'cn.example.api15', instanceId: 'instance-1', protocols: ['cnrp-jsonrpc/1'], api: '1.5' }).type, 'hello.accepted')
  assert.equal(handshake.next({ type: 'initialize', role: 'plugin', pluginId: 'cn.example.api15', instanceId: 'instance-1', api: '1.5' }).type, 'ready')
  assert.throws(() => new RpcHandshake({ pluginId: 'cn.example.api15', instanceId: 'instance-2' }).next({ type: 'initialize', api: '1.5' }), /handshake/i)
  assert.throws(() => new RpcHandshake({ pluginId: 'cn.example.api15', instanceId: 'instance-1' }).next({ type: 'hello', role: 'host', pluginId: 'cn.example.api15', instanceId: 'instance-1', protocols: ['cnrp-jsonrpc/1'], api: '1.5' }), /identity|role/i)
})

test('CLI validates and packs the canonical API 1.5 template', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnr-api15-cli-'))
  const source = path.join(root, 'plugin')
  await createTemplate(source, 'api15')
  const validation = await validateDirectory(source)
  assert.equal(validation.manifest.api, '1.5')
  assert.equal(validation.manifest.entry.runtime, 'cnrp-runner')
  assert.deepEqual(validation.manifest, normalizePluginManifest(JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'))))
  const output = path.join(root, 'plugin.cnrp')
  const packed = await packDirectory(source, output)
  assert.equal(packed.manifest.api, '1.5')
  assert.ok((await fs.stat(output)).size > 0)
})
