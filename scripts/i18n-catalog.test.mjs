import test from 'node:test'
import assert from 'node:assert/strict'
import { collectI18nCatalog } from './i18n-catalog.mjs'

test('interface catalogue keeps UI copy and drops technical tokens', async () => {
  const catalog = await collectI18nCatalog(process.cwd())
  assert.ok(catalog.length > 500)
  assert.ok(catalog.includes('抽一封花笺'))
  assert.ok(catalog.includes('Additional language'))
  assert.ok(!catalog.includes('dockRef'))
  assert.ok(!catalog.some(text => /^\s*[a-z][a-zA-Z0-9]{7,}\s*$/.test(text)))
  assert.ok(!catalog.some(text => /\{\s*\w+\s*\}/.test(text)))
})
