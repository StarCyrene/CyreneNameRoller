import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

async function bundle(file, name) {
  const outfile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cnr-migration-')), `${name}.mjs`)
  await build({ entryPoints: [path.resolve(fileURLToPath(import.meta.url), '..', '..', file)], bundle: true, write: true, outfile, platform: 'browser', format: 'esm', target: ['es2022'], legalComments: 'none' })
  return import(pathToFileURL(outfile).href)
}

const packageApi = await bundle('src/plugins/package.js', 'package')
const safeModeApi = await bundle('src/plugins/safeMode.js', 'safe-mode')

test('retains legacy metadata as display-only and keeps activation strictly on API 1.5', () => {
  const legacy = packageApi.normalizePluginManifest({ schemaVersion: 1, id: 'cn.example.old', name: 'Old', version: '1.0.0', author: 'Old' })
  assert.equal(legacy.displayOnly, true)
  assert.equal(legacy.activatable, false)
  assert.equal(packageApi.isPluginActivatable(legacy), false)
  assert.equal(packageApi.isPluginActivatable({ api: '1.4' }), false)
  assert.equal(packageApi.isPluginActivatable({ api: '1.5' }), true)
})

test('summarizes every installation risk for signed and unsigned confirmation', () => {
  const risk = packageApi.summarizeInstallationRisk({
    permissions: [{ id: 'core:names:read' }, { id: 'dom:main' }, { id: 'style:main' }, { id: 'system:execute' }],
    network: { internet: true },
    files: { external: [{ path: 'approved', scopes: ['read'] }] },
    signed: false
  })
  assert.deepEqual(risk, {
    network: true,
    externalRoots: [{ path: 'approved', scopes: ['read'] }],
    execute: true,
    coreData: ['core:names:read'],
    hostSurface: ['dom:main', 'style:main'],
    signed: false
  })
})

test('safe mode cleanup cancels and disposes every plugin-owned session resource', async () => {
  const calls = []
  await safeModeApi.cleanupPluginSessions({
    sessions: [{ revoke: () => calls.push('revoke'), terminate: () => calls.push('terminate'), cancel: () => calls.push('cancel'), styles: () => calls.push('styles'), routes: () => calls.push('routes'), dom: () => calls.push('dom'), reload: () => calls.push('reload') }],
    resetOrdinaryState: () => calls.push('reset-ordinary')
  })
  assert.deepEqual(calls, ['revoke', 'terminate', 'cancel', 'styles', 'routes', 'dom', 'reload', 'reset-ordinary'])
})
