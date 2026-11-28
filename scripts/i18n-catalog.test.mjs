import test from 'node:test'
import assert from 'node:assert/strict'
import { collectI18nCatalog } from './i18n-catalog.mjs'

test('interface catalogue keeps UI copy and drops technical tokens', async () => {
  const catalog = await collectI18nCatalog(process.cwd())
  assert.ok(catalog.length > 500)
  assert.ok(catalog.includes('抽一封花笺'))
  assert.ok(catalog.includes('Interface language'))
  assert.ok(catalog.includes('谁来点亮？'))
  assert.ok(catalog.includes('No names available yet'))
  assert.ok(catalog.includes('LIGHT TUNNEL'))
  assert.ok(catalog.includes('English Mode'))
  assert.ok(!catalog.includes('Эстафета светлячков'))
  assert.ok(!catalog.includes('dockRef'))
  assert.ok(!catalog.some(text => /^\s*[a-z][a-zA-Z0-9]{7,}\s*$/.test(text)))
  assert.ok(!catalog.some(text => /\{\s*\w+\s*\}/.test(text)))
})
