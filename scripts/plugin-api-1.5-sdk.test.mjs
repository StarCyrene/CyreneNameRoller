import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as sdk from '../packages/cyrene-name-roller/src/plugin-sdk.mjs'
import { DomBridge } from '../src/plugins/api15/domBridge.js'
import { CoreHookCoordinator } from '../src/plugins/api15/coreHooks.js'
import { PageStateBridge } from '../src/plugins/api15/pageState.js'
import { WindowBridge } from '../src/plugins/api15/windowBridge.js'
import { PluginPlatformBridge } from '../src/plugins/platform.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFile(path.join(root, relative), 'utf8')

test('publishes SDK 1.5.0 metadata, explicit groups, and no legacy 1.4 helpers', async () => {
  const packageJson = JSON.parse(await read('packages/cyrene-name-roller/package.json'))
  const declarations = await read('packages/cyrene-name-roller/src/plugin-sdk.d.ts')

  assert.equal(packageJson.version, '1.5.0')
  assert.equal(sdk.PLUGIN_API_VERSION, '1.5.0')
  assert.match(declarations, /PLUGIN_API_VERSION: '1\.5\.0'/)
  assert.deepEqual(sdk.PluginPlatforms, {
    WEB: 'web', TAURI: 'tauri', WINDOWS: 'windows', MACOS: 'macos', LINUX: 'linux', ANDROID: 'android', IOS: 'ios'
  })
  assert.equal('groups' in sdk, true)
  assert.equal('componentStyle' in sdk, false)
  assert.equal('componentOverride' in sdk, false)
  assert.equal('resultPresentation' in sdk, false)
  assert.doesNotMatch(Object.keys(sdk).join('\n'), /componentStyle|componentOverride|resultPresentation/)
})

test('returns explicit Web and desktop capability results without native fall-through', async () => {
  const manifest = {
    id: 'cn.example.sdk15',
    permissions: [
      { id: 'files:app:read', required: true, platforms: ['tauri'] },
      { id: 'files:external:read', required: false, platforms: ['tauri'] },
      { id: 'net:internet', required: false, platforms: ['web', 'tauri'] }
    ],
    files: { app: { scopes: ['read'] }, external: [{ path: 'data', scopes: ['read'] }] },
    network: { internet: true }
  }
  const webCalls = []
  const web = new PluginPlatformBridge({ platform: { runtime: 'web', os: 'unknown' }, handlers: {
    filesRead: () => webCalls.push('files'),
    netRequest: Object.assign(() => webCalls.push('net'), { addressBinding: true }),
    resolveHost: async () => ['93.184.216.34']
  } })
  const desktop = new PluginPlatformBridge({ platform: { runtime: 'tauri', os: 'windows' }, handlers: {
    filesRead: () => ({ bytes: 1 })
  } })

  const webResult = await web.request({ manifest }, 'files.read', { path: 'x' })
  const desktopResult = await desktop.request({ manifest }, 'files.read', { path: 'x' })
  assert.deepEqual(webResult, {
    ok: false, capability: 'files:app:read', platform: 'web', os: 'unknown', value: null,
    code: 'UNSUPPORTED_PLATFORM', message: 'files:app:read在当前平台不可用，已安全跳过'
  })
  assert.equal(desktopResult.ok, true)
  assert.deepEqual(webCalls, [])
})

test('exposes typed page, window, file, network, state, and core request groups', async () => {
  const calls = []
  const request = async (method, args) => {
    calls.push([method, args])
    return { ok: true, method, args }
  }
  const context = { request }
  const groups = {
    page: [['read'], ['write']],
    window: [['create'], ['close']],
    files: [['read'], ['write']],
    net: [['request']],
    state: [['read'], ['write']],
    core: [['names', 'read'], ['records', 'read'], ['statistics', 'read'], ['hook', 'before'], ['hook', 'after']]
  }
  for (const [group, methods] of Object.entries(groups)) {
    assert.equal(typeof sdk[group], 'object', `${group} group is missing`)
    for (const path of methods) {
      const target = path.reduce((value, key) => value?.[key], sdk[group])
      assert.equal(typeof target, 'function', `${group}.${path.join('.')} is missing`)
    }
  }
  await sdk.page.read(context, 'language')
  await sdk.page.write(context, 'language', 'en')
  await sdk.window.create(context, { title: 'Plugin' })
  await sdk.window.close(context, 'host-window-1')
  await sdk.files.read(context, { path: 'data.txt' })
  await sdk.files.write(context, { path: 'data.txt', data: 'ok' })
  await sdk.net.request(context, { url: 'https://example.com' })
  await sdk.state.read(context, 'theme')
  await sdk.state.write(context, 'theme', 'peach')
  await sdk.core.names.read(context)
  await sdk.core.hook.before(context, 'name-draw', {})
  assert.deepEqual(calls.map(([method]) => method), [
    'page.read', 'page.write', 'window.create', 'window.close', 'files.read', 'files.write',
    'net.request', 'page.read', 'page.write', 'core.names.read', 'core.hook.before'
  ])
})

test('keeps typed page/window/state APIs constrained and DOM execution unavailable', async () => {
  const values = { language: 'en', clearHistory: false }
  const state = new PageStateBridge({ pluginId: 'p', state: values })
  await assert.rejects(() => state.write('clearHistory', true), error => error.code === 'PLUGIN_PERMISSION_DENIED')

  const windows = new WindowBridge({ pluginId: 'p', maxWindows: 1 })
  const handle = windows.create({ title: 'Plugin' })
  assert.match(handle, /^host-window-/)
  assert.equal(windows.close(handle, 'other'), false)

  const dom = new DomBridge({ pluginId: 'p', permission: 'dom:main', root: { tagName: 'MAIN', children: [] } })
  assert.throws(() => dom.execute(), /unsupported|execute/i)
})

test('delivers before and after core events with structured errors', async () => {
  const coordinator = new CoreHookCoordinator({ now: () => 0 })
  const events = []
  coordinator.register({ pluginId: 'before', operation: 'name-draw', invoke: context => {
    events.push(['before', context.filter.count])
    return { allow: true, patch: { count: 2 } }
  } })
  coordinator.register({ pluginId: 'after', operation: 'name-draw', phase: 'after', invoke: event => {
    events.push(['after', event.committed, event.receipt.operationId])
  } })
  const before = await coordinator.before('name-draw', { listId: 'main', count: 1, names: [{ id: 'hidden' }] })
  await coordinator.after('name-draw', { operationId: 'op-1', results: [] }, [], { originalFilter: { count: 1 }, finalFilter: before.filter })
  assert.deepEqual(events, [['before', 1], ['after', true, 'op-1']])

  coordinator.register({ pluginId: 'bad', operation: 'name-draw', invoke: async () => ({ allow: true, patch: { results: [] } }) })
  await assert.rejects(() => coordinator.before('name-draw', {}), error => error.code === 'PLUGIN_HOOK_INVALID_RESPONSE')
})
