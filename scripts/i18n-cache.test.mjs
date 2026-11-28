import test from 'node:test'
import assert from 'node:assert/strict'
import { createTranslationCache } from '../src/utils/i18nCache.js'

function createMemoryStorage() {
  let value = null
  return {
    load: async () => value,
    save: async next => { value = next },
    remove: async () => { value = null },
    get value() { return value },
    set value(next) { value = next }
  }
}

test('translation cache round-trips through the encrypted container', async () => {
  const storage = createMemoryStorage()
  const cache = createTranslationCache({ target: 'japanese', storage })
  await cache.load()
  cache.set('hash_japanese_1141616', '設定')
  cache.set('to', 'japanese')
  cache.set('not-a-translation-key', 'ignored')
  assert.equal(cache.get('hash_japanese_1141616'), '設定')
  assert.equal(cache.get('to'), 'japanese')
  assert.equal(cache.get('not-a-translation-key'), null)
  await cache.close()
  assert.ok(storage.value?.data)
  assert.ok(!storage.value.data.includes('設定'))

  const restored = createTranslationCache({ target: 'japanese', storage })
  const result = await restored.load()
  assert.equal(result.restored, 1)
  assert.equal(restored.get('hash_japanese_1141616'), '設定')
})

test('a tampered cache is rejected and discarded', async () => {
  const storage = createMemoryStorage()
  const cache = createTranslationCache({ target: 'japanese', storage })
  await cache.load()
  cache.set('hash_japanese_1141616', '設定')
  await cache.close()

  const original = storage.value.data
  const tampered = original.slice(0, 10) + (original[10] === 'A' ? 'B' : 'A') + original.slice(11)
  storage.value = { data: tampered }

  const rejected = createTranslationCache({ target: 'japanese', storage })
  const result = await rejected.load()
  assert.equal(result.corrupted, true)
  assert.equal(result.restored, 0)
  assert.equal(rejected.get('hash_japanese_1141616'), null)
  assert.equal(storage.value, null)
})

test('a cache from another target is rejected', async () => {
  const storage = createMemoryStorage()
  const cache = createTranslationCache({ target: 'japanese', storage })
  await cache.load()
  cache.set('hash_japanese_1141616', '設定')
  await cache.close()

  const other = createTranslationCache({ target: 'korean', storage })
  const result = await other.load()
  assert.equal(result.corrupted, true)
  assert.equal(result.restored, 0)
})
