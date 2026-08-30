import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BundledRunner,
  DesktopPluginHost,
  PendingRequests,
  createPrivateCredentialChannel,
  createNodeRunner
} from '../src/plugins/rpc/desktopHost.js'
import { WebPluginRuntime } from '../src/plugins/rpc/webRuntime.js'
import { CNRP_JSONRPC_PROTOCOL, HostRpcHandshake, encodeRpcFrame } from '../src/plugins/rpc/protocol.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

test('selects only the application bundled runner and keeps credentials off argv/env', () => {
  const runner = new BundledRunner({ platform: 'win32', resourcesDir: 'resources' })
  const launch = runner.launchSpec({ packagePath: 'plugins/example.cnrp', entry: 'dist/main.js', args: ['--safe'] })

  assert.equal(launch.command, runner.path)
  assert.deepEqual(launch.args, ['plugins/example.cnrp', 'dist/main.js', '--safe'])
  assert.equal(launch.env.CNRP_SESSION_CREDENTIAL, undefined)
  assert.equal(launch.credentialChannel, 'inherited-private')
})

test('uses a private inherited fd for credentials and starts the bundled runner by default', async () => {
  const channel = createPrivateCredentialChannel('secret-token')
  assert.equal(channel.metadata.kind, 'inherited-fd')
  assert.equal(channel.metadata.fd, 3)
  assert.equal(channel.metadata.credential, undefined)
  assert.equal(channel.argv.some(value => value.includes('secret-token')), false)
  assert.equal(Object.values(channel.env).some(value => value?.includes('secret-token')), false)
  channel.close()

  const runner = createNodeRunner({
    platform: process.platform,
    resourcesDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/plugins/rpc')
  })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-runner-basic-'))
  await fs.writeFile(path.join(root, 'plugin.mjs'), 'globalThis.CyrenePluginModule = {}\n')
  const transport = { send() {} }
  const host = new DesktopPluginHost({
    pluginId: 'cn.example.real', instanceId: 'real-1', packagePath: root, entry: 'plugin.mjs',
    credential: 'secret-token', transport, runner, heartbeatMs: 1000
  })
  await host.start()
  await host.ready
  assert.ok(host.process?.pid)
  assert.equal(host.launch.env.CNRP_SESSION_CREDENTIAL, undefined)
  await host.shutdown()
})

test('requires credential proof and executes the validated bundled runner entry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-runner-'))
  await fs.writeFile(path.join(root, 'plugin.mjs'), "if (typeof process !== 'undefined' || typeof Bun !== 'undefined' || typeof require !== 'undefined') throw new Error('runner globals exposed'); globalThis.CyrenePluginModule = { activate(context) { if (context.plugin.id !== 'cn.example.entry') throw new Error('identity missing'); if (!context.capabilities['core:names:read']?.available) throw new Error('capabilities missing') } }\n")
  const runner = createNodeRunner({ platform: process.platform, resourcesDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/plugins/rpc') })
  const host = new DesktopPluginHost({ pluginId: 'cn.example.entry', instanceId: 'entry-1', packagePath: root, entry: 'plugin.mjs', credential: 'proof-secret', runner, initialize: { 'core:names:read': { available: true } } })
  await host.start()
  await host.ready
  assert.equal(host.state, 'ready')
  await host.shutdown()

  const rejected = new DesktopPluginHost({ pluginId: 'cn.example.entry', instanceId: 'entry-2', transport: { send() {} }, runner: { killTree() {} }, credential: 'expected' })
  await rejected.start()
  assert.throws(() => rejected.receive({ type: 'hello.accepted', role: 'plugin', pluginId: rejected.pluginId, instanceId: rejected.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL, credentialProof: 'wrong' }), /credential/i)
  await rejected.fail(new Error('invalid credential'))
})

test('declares the native Tauri runner bridge contract', async () => {
  const rust = await fs.readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src-tauri/src/lib.rs'), 'utf8')
  for (const command of ['plugin_runner_start', 'plugin_runner_send', 'plugin_runner_stop']) assert.match(rust, new RegExp(command))
  assert.match(rust, /PluginRunnerState/)
  assert.match(rust, /cyrene-plugin-rpc/)
})

test('owns opaque resources and kills a desktop runtime after heartbeat loss', async () => {
  const killed = []
  const host = new DesktopPluginHost({ pluginId: 'cn.example.resources', transport: { send() {} }, runner: { killTree: async reason => killed.push(reason) }, heartbeatMs: 5 })
  const resource = host.allocateResource('window')
  assert.equal(host.ownsResource(resource), true)
  assert.equal(host.ownsResource('window-other'), false)
  assert.equal(host.releaseResource(resource), true)
  await host.start()
  host.receive({ type: 'hello.accepted', role: 'plugin', pluginId: host.pluginId, instanceId: host.instanceId, credentialProof: host.credentialProof, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  host.receive({ type: 'ready', role: 'plugin', pluginId: host.pluginId, instanceId: host.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  await new Promise(resolve => setTimeout(resolve, 16))
  assert.equal(host.state, 'closed')
  assert.deepEqual(killed, ['RPC heartbeat lost'])
})

test('validates host handshake roles and states in the correct direction', () => {
  const handshake = new HostRpcHandshake({ pluginId: 'cn.example.host', instanceId: 'host-1' })
  assert.throws(() => handshake.next({ type: 'hello.accepted', role: 'plugin', pluginId: 'wrong', instanceId: 'host-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }), /identity/i)
  assert.equal(handshake.next({ type: 'hello.accepted', role: 'plugin', pluginId: 'cn.example.host', instanceId: 'host-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'initialize')
  assert.equal(handshake.next({ type: 'ready', role: 'plugin', pluginId: 'cn.example.host', instanceId: 'host-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'ready')
  assert.throws(() => handshake.next({ type: 'ready', role: 'host', pluginId: 'cn.example.host', instanceId: 'host-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }), /state|role/i)
})

test('performs the API 1.5 desktop lifecycle and releases pending requests', async () => {
  const transport = new EventTarget()
  const sent = []
  transport.send = message => sent.push(message)
  const host = new DesktopPluginHost({
    pluginId: 'cn.example.process',
    instanceId: 'instance-1',
    transport,
    runner: { killTree: async () => {} },
    maxConcurrentRequests: 1,
    requestTimeoutMs: 30,
    initialize: { 'core:names:read': { available: true } }
  })

  await host.start()
  assert.deepEqual(sent.map(message => message.type), ['hello'])
  assert.equal(host.receive({ type: 'hello.accepted', role: 'plugin', pluginId: 'cn.example.process', instanceId: 'instance-1', credentialProof: host.credentialProof, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'initialize')
  assert.deepEqual(sent.at(-1).capabilities, { 'core:names:read': { available: true } })
  assert.equal(host.receive({ type: 'ready', role: 'plugin', pluginId: 'cn.example.process', instanceId: 'instance-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'ready')
  assert.equal(host.state, 'ready')

  const request = host.request('runtime.platform', {}, { idempotencyKey: 'same' })
  assert.throws(() => host.request('runtime.platform'), /concurrent|limit/i)
  const outbound = sent.at(-1)
  host.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', pluginId: host.pluginId, instanceId: host.instanceId, id: outbound.id, result: { runtime: 'tauri' } })
  assert.deepEqual(await request, { runtime: 'tauri' })
  assert.deepEqual(await host.request('runtime.platform', {}, { idempotencyKey: 'same' }), { runtime: 'tauri' })
  await host.shutdown()
  assert.equal(host.state, 'closed')
})

test('authorizes API 1.5 object permissions with the active instance principal', async () => {
  const output = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-runtime-')), 'runtime.mjs')
  await build({ entryPoints: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/plugins/runtime.js')], bundle: true, platform: 'browser', format: 'esm', outfile: output })
  const { PluginRuntime } = await import(pathToFileURL(output).href)
  const plugin = { enabled: true, manifest: { api: '1.5', id: 'cn.example.auth', permissions: [{ id: 'core:names:read', required: true, platforms: ['web'] }] } }
  const runtime = new PluginRuntime({
    getPlugin: id => id === plugin.manifest.id ? plugin : null,
    getCoreSnapshot: async kind => kind === 'names' ? 'allowed' : null,
    platformBridge: { info: () => ({ runtime: 'web', os: 'unknown' }), capabilities: () => ({}) }
  })
  const principal = runtime.createApi15Principal(plugin, 'instance-auth', { 'core:names:read': { available: true } })
  assert.equal(await runtime.handleRpc(principal, 'core.names.read'), 'allowed')
  runtime.revokePluginPrincipals(plugin.manifest.id)
  await assert.rejects(runtime.handleRpc(principal, 'core.names.read'), error => error.code === 'PLUGIN_INSTANCE_REVOKED')
})

test('rejects malformed and duplicate frames and terminates on timeout or crash', async () => {
  const killed = []
  const host = new DesktopPluginHost({
    pluginId: 'cn.example.process',
    instanceId: 'instance-2',
    transport: { send() {} },
    runner: { killTree: async reason => killed.push(reason) },
    requestTimeoutMs: 5
  })
  assert.throws(() => host.receiveFrame(encodeRpcFrame({ bad: true })), /protocol|message/i)
  assert.throws(() => host.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', pluginId: host.pluginId, instanceId: host.instanceId, id: 'duplicate', result: true }), /unknown|duplicate/i)
  await host.fail(new Error('runner crashed'))
  assert.deepEqual(killed, ['runner crashed'])

  const pending = new PendingRequests({ maxConcurrent: 1, timeoutMs: 5 })
  const promise = pending.add('request-1', 'idem-1', () => {})
  await assert.rejects(promise, /timeout/i)
})

test('rejects ordinary desktop and Web RPC messages with missing or mismatched API metadata', async () => {
  const desktop = new DesktopPluginHost({ pluginId: 'cn.example.api-version', instanceId: 'desktop-api', transport: { send() {} }, runner: { killTree() {} } })
  await desktop.start()
  desktop.receive({ type: 'hello.accepted', role: 'plugin', pluginId: desktop.pluginId, instanceId: desktop.instanceId, credentialProof: desktop.credentialProof, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  desktop.receive({ type: 'ready', role: 'plugin', pluginId: desktop.pluginId, instanceId: desktop.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  const identity = { pluginId: desktop.pluginId, instanceId: desktop.instanceId }
  assert.throws(() => desktop.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, ...identity, id: 'missing-api', result: true }), /API/i)
  assert.throws(() => desktop.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.4', ...identity, id: 'wrong-api', result: true }), /API/i)
  await desktop.shutdown()

  const worker = { postMessage() {}, terminate() {} }
  const web = new WebPluginRuntime({ pluginId: 'cn.example.api-version', instanceId: 'web-api', worker })
  web.receive({ type: 'hello.accepted', role: 'plugin', pluginId: web.pluginId, instanceId: web.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  web.receive({ type: 'ready', role: 'plugin', pluginId: web.pluginId, instanceId: web.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  assert.throws(() => web.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, pluginId: web.pluginId, instanceId: web.instanceId, id: 'missing-api', result: true }), /API/i)
  assert.throws(() => web.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, api: '2.0', pluginId: web.pluginId, instanceId: web.instanceId, id: 'wrong-api', result: true }), /API/i)
  await web.shutdown()
})

test('uses the same logical lifecycle with structured-clone Worker transport', async () => {
  const messages = []
  const worker = {
    postMessage: message => messages.push(message),
    terminate: () => { worker.terminated = true }
  }
  const runtime = new WebPluginRuntime({
    pluginId: 'cn.example.web',
    instanceId: 'web-1',
    worker,
    requiredCapabilities: [],
    availableCapabilities: { 'core:names:read': false }
  })
  worker.onmessage = event => runtime.receive(event.data)
  await runtime.start()
  assert.equal(messages[0].type, 'hello')
  assert.equal(runtime.receive({ type: 'hello.accepted', role: 'plugin', pluginId: 'cn.example.web', instanceId: 'web-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'initialize')
  assert.equal(runtime.receive({ type: 'ready', role: 'plugin', pluginId: 'cn.example.web', instanceId: 'web-1', api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL }).type, 'ready')
  assert.equal(runtime.capabilities['core:names:read'].available, false)
  await assert.rejects(runtime.call('core:names:read'), /UNSUPPORTED_PLATFORM/)
  await runtime.shutdown()
  assert.equal(worker.terminated, true)
})

test('routes Worker messages through runtime and enforces request limits and heartbeat shutdown', async () => {
  const messages = []
  const worker = { postMessage: message => messages.push(message), terminate() { this.terminated = true } }
  const runtime = new WebPluginRuntime({ pluginId: 'cn.example.limited', worker, maxConcurrentRequests: 1, requestTimeoutMs: 5, heartbeatMs: 30 })
  runtime.receive({ type: 'hello.accepted', role: 'plugin', pluginId: 'cn.example.limited', instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  runtime.receive({ type: 'ready', role: 'plugin', pluginId: 'cn.example.limited', instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  const first = runtime.call('runtime.platform')
  await assert.rejects(runtime.call('runtime.platform'), /limit/i)
  await assert.rejects(first, /timeout/i)
  await new Promise(resolve => setTimeout(resolve, 35))
  assert.equal(worker.terminated, true)
})

test('rejects duplicate Worker responses and supports explicit cancellation', async () => {
  const messages = []
  const worker = { postMessage: message => messages.push(message), terminate() {} }
  const runtime = new WebPluginRuntime({ pluginId: 'cn.example.cancel', worker })
  runtime.receive({ type: 'hello.accepted', role: 'plugin', pluginId: runtime.pluginId, instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  runtime.receive({ type: 'ready', role: 'plugin', pluginId: runtime.pluginId, instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  const request = runtime.call('runtime.platform')
  const requestId = messages.at(-1).id
  assert.equal(runtime.cancel(requestId), true)
  await assert.rejects(request, /cancel/i)
  assert.throws(() => runtime.receive({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', pluginId: runtime.pluginId, instanceId: runtime.instanceId, id: requestId, result: true }), /unknown|duplicate/i)
})

test('Worker timeout sends cancellation and host cleanup releases opaque resources', async () => {
  const messages = []
  const worker = { postMessage: message => messages.push(message), terminate() {} }
  const runtime = new WebPluginRuntime({ pluginId: 'cn.example.timeout', worker, requestTimeoutMs: 5 })
  runtime.receive({ type: 'hello.accepted', role: 'plugin', pluginId: runtime.pluginId, instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  runtime.receive({ type: 'ready', role: 'plugin', pluginId: runtime.pluginId, instanceId: runtime.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  await assert.rejects(runtime.call('runtime.platform'), /timeout/i)
  assert.equal(messages.at(-1).method, '$/cancelRequest')
  assert.equal(messages.at(-1).pluginId, runtime.pluginId)
  assert.equal(messages.at(-1).instanceId, runtime.instanceId)

  const host = new DesktopPluginHost({ pluginId: 'cn.example.cleanup', transport: { send() {} }, runner: { killTree() {} } })
  host.allocateResource('window')
  await host.fail(new Error('lost'))
  assert.equal(host.resources.size, 0)
})

test('times out activation and enforces host heartbeat acknowledgement', async () => {
  const messages = []
  const worker = { postMessage: message => messages.push(message), terminate() { this.terminated = true } }
  const runtime = new WebPluginRuntime({ pluginId: 'cn.example.activation-timeout', worker, activationTimeoutMs: 5 })
  await runtime.start()
  await assert.rejects(runtime.ready, /activation timeout/i)
  assert.equal(worker.terminated, true)

  const sent = []
  const host = new DesktopPluginHost({ pluginId: 'cn.example.heartbeat', transport: { send: message => sent.push(message) }, runner: { killTree() {} }, heartbeatMs: 5 })
  await host.start()
  host.receive({ type: 'hello.accepted', role: 'plugin', pluginId: host.pluginId, instanceId: host.instanceId, credentialProof: host.credentialProof, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  host.receive({ type: 'ready', role: 'plugin', pluginId: host.pluginId, instanceId: host.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  for (let attempt = 0; attempt < 20 && sent.at(-1).type !== 'heartbeat'; attempt += 1) await new Promise(resolve => setTimeout(resolve, 2))
  assert.equal(sent.at(-1).type, 'heartbeat')
  host.receive({ type: 'heartbeat.ack', role: 'plugin', pluginId: host.pluginId, instanceId: host.instanceId, api: '1.5', protocol: CNRP_JSONRPC_PROTOCOL })
  await host.shutdown()
})

test('standalone runner rejects oversized inbound frames', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-runner-frame-'))
  await fs.writeFile(path.join(root, 'plugin.mjs'), 'globalThis.CyrenePluginModule = {}\n')
  const runner = createNodeRunner({ platform: process.platform, resourcesDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/plugins/rpc') })
  const host = new DesktopPluginHost({ pluginId: 'cn.example.frame', packagePath: root, entry: 'plugin.mjs', runner })
  await host.start()
  await host.ready
  const oversized = Buffer.alloc(4)
  oversized.writeUInt32LE(1024 * 1024 + 1)
  host.process.stdin.write(oversized)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(host.state, 'closed')
})
