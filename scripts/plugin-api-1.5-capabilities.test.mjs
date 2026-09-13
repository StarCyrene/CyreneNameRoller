import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  resolveApi15Capabilities,
  canonicalizePluginPath,
  validateExecutableDeclaration,
  validateNetworkUrl,
  validateNetworkUrlResolved,
  followNetworkRedirect,
  NetworkLimiter,
  AuditLog,
  summarizeInstallationRisk
} from '../src/plugins/api15/permissions.js'
import { PluginPlatformBridge } from '../src/plugins/platform.js'

const manifest = {
  id: 'cn.example.capabilities',
  permissions: [
    { id: 'files:app:read', required: true, platforms: ['tauri'] },
    { id: 'files:external:read', required: false, platforms: ['tauri'] },
    { id: 'net:internet', required: false, platforms: ['web', 'tauri'] },
    { id: 'system:execute', required: false, platforms: ['tauri'] }
  ],
  files: {
    app: { scopes: ['read'] },
    external: [{ path: 'approved', scopes: ['read', 'execute'], executables: ['approved/tool.exe'] }]
  },
  network: { internet: true }
}

test('resolves required and optional capabilities with structured Web degradation', () => {
  const web = resolveApi15Capabilities(manifest, { runtime: 'web', os: 'unknown' })
  assert.equal(web.compatible, true)
  assert.equal(web.requiredUnavailable.length, 0)
  assert.equal(web.capabilities['files:external:read'].available, false)
  assert.equal(web.capabilities['files:external:read'].code, 'UNSUPPORTED_PLATFORM')

  const desktop = resolveApi15Capabilities(manifest, { runtime: 'tauri', os: 'windows' })
  assert.equal(desktop.compatible, true)
  assert.equal(desktop.capabilities['files:app:read'].available, true)
})

test('ignores required permissions scoped to another platform', () => {
  const result = resolveApi15Capabilities({ permissions: [{ id: 'files:app:read', required: true, platforms: ['tauri'] }] }, { runtime: 'web', os: 'unknown' })
  assert.equal(result.compatible, true)
  assert.equal(result.requiredUnavailable.length, 0)
  assert.equal(result.capabilities['files:app:read'].applies, false)
})

test('canonicalizes app and external paths while rejecting traversal and protected roots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cnrp-cap-'))
  const appRoot = path.join(root, 'app')
  const externalRoot = path.join(root, 'external')
  await fs.mkdir(path.join(appRoot, 'data'), { recursive: true })
  await fs.mkdir(externalRoot)
  await fs.writeFile(path.join(appRoot, 'data', 'ok.txt'), 'ok')
  const outside = path.join(root, 'outside.txt')
  await fs.writeFile(outside, 'outside')

  const ok = await canonicalizePluginPath(path.join(appRoot, 'data', '..', 'data', 'ok.txt'), {
    root: appRoot, scope: 'app', platform: { runtime: 'tauri', os: 'linux' }
  })
  assert.equal(ok.scope, 'app')
  assert.equal(ok.path, path.join(appRoot, 'data', 'ok.txt'))
  await assert.rejects(() => canonicalizePluginPath(outside, { root: appRoot, scope: 'app' }), error => error.code === 'PATH_OUTSIDE_ROOT')
  await assert.rejects(() => canonicalizePluginPath(path.join(appRoot, '..', 'outside.txt'), { root: appRoot, scope: 'app' }), error => error.code === 'PATH_OUTSIDE_ROOT')
  await assert.rejects(() => canonicalizePluginPath(path.join(appRoot, 'coreStateEnvelope'), { root: appRoot, scope: 'app', protectedRoots: [appRoot] }), error => error.code === 'PROTECTED_ROOT')
  await assert.rejects(() => canonicalizePluginPath('\\\\server\\share\\file', { root: appRoot, platform: { runtime: 'tauri', os: 'windows' } }), error => error.code === 'PATH_SPELLING_REJECTED')
})

test('validates fixed executable declarations and rejects arbitrary execution', () => {
  assert.equal(validateExecutableDeclaration({ path: 'approved/tool.exe', args: ['--safe'] }, { executables: ['approved/tool.exe'] }).ok, true)
  assert.equal(validateExecutableDeclaration({ path: 'approved/other.exe', args: [] }, { executables: ['approved/tool.exe'] }).code, 'EXECUTABLE_NOT_DECLARED')
  assert.equal(validateExecutableDeclaration({ path: 'approved/tool.exe', args: ['$(bad)'] }, { executables: ['approved/tool.exe'] }).code, 'EXECUTABLE_ARGUMENT_REJECTED')
})

test('allows only bounded HTTP redirects without changing protocol or reaching private networks', async () => {
  assert.equal(validateNetworkUrl('https://example.com/path').ok, true)
  assert.equal(validateNetworkUrl('file:///etc/passwd').code, 'NETWORK_PROTOCOL_DENIED')
  assert.equal(validateNetworkUrl('http://127.0.0.1:8080').code, 'NETWORK_ADDRESS_DENIED')
  assert.equal(validateNetworkUrl('http://169.254.169.254/latest').code, 'NETWORK_ADDRESS_DENIED')
  const resolver = async () => ['93.184.216.34']
  assert.equal((await followNetworkRedirect('https://example.com/a', 'https://example.com/b', 1, { resolver })).ok, true)
  assert.equal((await followNetworkRedirect('https://example.com/a', 'http://example.com/b', 1, { resolver })).code, 'NETWORK_REDIRECT_DENIED')
  assert.equal((await followNetworkRedirect('https://example.com/a', 'https://example.com/b', 5, { resolver })).code, 'NETWORK_REDIRECT_LIMIT')
})

test('rechecks resolved addresses before requests and redirects', async () => {
  const resolver = async host => host === 'safe.example' ? ['127.0.0.1'] : ['93.184.216.34']
  assert.equal((await validateNetworkUrlResolved('https://safe.example/', { resolver })).code, 'NETWORK_ADDRESS_DENIED')
  assert.equal((await followNetworkRedirect('https://example.com/a', 'https://safe.example/b', 1, { resolver })).code, 'NETWORK_ADDRESS_DENIED')
  assert.equal(validateNetworkUrl('http://0x7f000001/').code, 'NETWORK_ADDRESS_DENIED')
  assert.equal(validateNetworkUrl('http://2130706433/').code, 'NETWORK_ADDRESS_DENIED')
  assert.equal(validateNetworkUrl('http://[::ffff:127.0.0.1]/').code, 'NETWORK_ADDRESS_DENIED')
})

test('enforces network limits and retains bounded host-only audit records', async () => {
  const limiter = new NetworkLimiter({ maxConcurrent: 1, timeoutMs: 20, maxBodyBytes: 4 })
  const release = await limiter.acquire()
  await assert.rejects(() => limiter.acquire(), error => error.code === 'RESOURCE_LIMIT')
  release()
  assert.equal(limiter.validateResponse({ status: 200, bodyBytes: 4 }).ok, true)
  assert.equal(limiter.validateResponse({ status: 200, bodyBytes: 5 }).code, 'RESPONSE_SIZE_LIMIT')
  await assert.rejects(() => limiter.run(() => new Promise(resolve => setTimeout(resolve, 40))), error => error.code === 'TIMEOUT')

  const audit = new AuditLog({ maxRecords: 2, maxBytes: 100000 })
  audit.append({ pluginId: 'cn.example.capabilities', instanceId: 'i', method: 'net.request', resource: 'example.com', decision: 'allow', resultCode: 'OK', bytes: 2, durationMs: 1 })
  const redacted = audit.append({ method: 'net.request', resource: 'https://user:secret@example.com:8443/a?token=x#frag' })
  assert.equal(redacted.resource, 'example.com')
  audit.append({ pluginId: 'cn.example.capabilities', instanceId: 'i', method: 'files.read', resource: 'x', decision: 'deny', resultCode: 'PATH_OUTSIDE_ROOT', bytes: 0, durationMs: 1 })
  audit.append({ pluginId: 'cn.example.capabilities', instanceId: 'i', method: 'files.read', resource: 'y', decision: 'deny', resultCode: 'PATH_OUTSIDE_ROOT', bytes: 0, durationMs: 1 })
  assert.equal(audit.records.length, 2)
  assert.ok(audit.records[0].time)
  assert.equal(Object.prototype.hasOwnProperty.call(audit.records[0], 'correlationId'), true)
  assert.equal(summarizeInstallationRisk(manifest).network, true)
  assert.equal(summarizeInstallationRisk(manifest).externalRoots.length, 1)
})

test('Web bridge returns structured unsupported results instead of native calls', async () => {
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' } })
  const result = await bridge.request({ manifest }, 'files.read', { path: 'x' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'UNSUPPORTED_PLATFORM')
})

test('dispatches supported API 1.5 network requests and rejects Web app-file access', async () => {
  const calls = []
  const plugin = { manifest: { id: 'cn.example.handlers', permissions: [{ id: 'files:app:read' }, { id: 'files:app:write' }, { id: 'net:internet' }] } }
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' }, handlers: {
    filesRead: args => { calls.push(['read', args]); return { data: 'ok' } },
    filesWrite: args => { calls.push(['write', args]); return true },
     netRequest: Object.assign(args => { calls.push(['net', args]); return { status: 200 } }, { addressBinding: true }),
    resolveHost: async () => ['93.184.216.34']
  } })
  assert.equal((await bridge.request(plugin, 'files.read', { path: 'x' })).code, 'UNSUPPORTED_PLATFORM')
  assert.equal((await bridge.request(plugin, 'files.write', { path: 'x', data: 'y' })).code, 'UNSUPPORTED_PLATFORM')
  assert.deepEqual((await bridge.request(plugin, 'net.request', { url: 'https://example.com' })).value, { status: 200 })
  assert.deepEqual(calls.map(call => call[0]), ['net'])
})

test('fails closed when a network resolver is unavailable', async () => {
  assert.equal((await validateNetworkUrlResolved('https://example.com')).code, 'NETWORK_RESOLUTION_UNAVAILABLE')
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' }, handlers: {
    netRequest: () => ({ status: 200 })
  } })
  const result = await bridge.request({ manifest: { id: 'cn.example.failclosed', permissions: [{ id: 'net:internet' }] } }, 'net.request', { url: 'https://example.com' })
  assert.equal(result.code, 'NETWORK_RESOLUTION_UNAVAILABLE')
})

test('Web network requests fail closed when the handler cannot bind the validated address', async () => {
  let invoked = false
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' }, handlers: {
    netRequest: () => { invoked = true; return { status: 200 } },
    resolveHost: async () => ['93.184.216.34']
  } })
  const result = await bridge.request({ manifest: { id: 'cn.example.web-bind', permissions: [{ id: 'net:internet' }] } }, 'net.request', { url: 'https://example.com' })
  assert.equal(result.code, 'NETWORK_ADDRESS_BINDING_UNAVAILABLE')
  assert.equal(invoked, false)
})

test('aborts timed out handlers and retains the slot until settlement', async () => {
  const limiter = new NetworkLimiter({ maxConcurrent: 1, timeoutMs: 5 })
  let settled = false
  await assert.rejects(() => limiter.run(signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => setTimeout(() => { settled = true; resolve({ status: 200 }) }, 10), { once: true })
  })), error => error.code === 'TIMEOUT')
  assert.equal(settled, true)
  assert.equal(limiter.active, 0)
})

test('audits every broker decision without exposing the audit store', async () => {
  const audit = new AuditLog()
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' }, auditLog: audit, handlers: {
    filesRead: () => ({ data: 'ok' })
  } })
  const plugin = { manifest: { id: 'cn.example.audit', permissions: [{ id: 'files:app:read' }] } }
  await bridge.request(plugin, 'files.read', { path: 'secret.txt' })
  await bridge.request(plugin, 'files.write', { path: 'secret.txt' })
  assert.equal(audit.records.length, 2)
  assert.deepEqual(audit.records.map(record => record.method), ['files.read', 'files.write'])
  assert.equal(audit.records[0].resource, 'secret.txt')
})

test('validates system execution before invoking the broker', async () => {
  let invoked = false
  const plugin = { manifest: { id: 'cn.example.exec', permissions: [{ id: 'system:execute' }], files: { external: [{ path: 'x', scopes: ['execute'], executables: ['tool.exe'] }] }, systemOperations: [{ id: 'safe', platforms: ['tauri'], command: { program: 'other.exe', args: [] } }] } }
  const bridge = new PluginPlatformBridge({ platform: { runtime: 'tauri', os: 'windows' }, handlers: { execute: () => { invoked = true } } })
  const result = await bridge.request(plugin, 'system.execute', { operation: 'safe' })
  assert.equal(result.code, 'EXECUTABLE_NOT_DECLARED')
  assert.equal(invoked, false)
})
