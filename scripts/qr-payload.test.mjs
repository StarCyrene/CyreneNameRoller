import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { base64ToBytes, bytesToBase64, dataBridge } from '../src/utils/dataBridge.js'
import { decryptCyreneBytes, decryptCyreneData, encryptCyreneBytes } from '../src/utils/cyreneCrypto.js'
import { convertQRBackup } from '../src/utils/qrBackupCodec.js'
import { createQRPayload, importQRPayload, validateQRPayload } from '../src/utils/qrPayload.js'
import { useNamesStore } from '../src/stores/names.js'
import { usePrizesStore } from '../src/stores/prizes.js'

class TestStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)])) }
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(key) { return this.values.get(key) ?? null }
  removeItem(key) { this.values.delete(key) }
  setItem(key, value) {
    if (key === this.failOnce) { this.failOnce = null; throw new Error('disk full') }
    this.values.set(key, value)
  }
}

function boot(storage) {
  globalThis.localStorage = storage
  setActivePinia(createPinia())
}

const roster = { id: 'class', name: '一年一班', groups: [{ id: 'g', name: '一组', enName: 'Group 1' }],
  names: [{ id: 'student-01', cn: '张禕', en: 'Yi Zhang', gender: 'female', groupId: 'g', isWhiteList: true, count: 3 }] }
const prizeList = { id: 'pool', name: '开学礼', prizes: [
  { id: 'bookmark', name: '书签', quality: '稀有', quantity: 6, weight: 0.5 }
] }

test('QR list import adds rather than replacing and selects the restored lists after boot', async t => {
  const original = globalThis.localStorage
  t.after(() => { globalThis.localStorage = original })
  boot(new TestStorage({ lists: { class: roster }, currentListId: 'class',
    prizes: { lists: { pool: prizeList }, currentId: 'pool', records: [] } }))
  const namesPayload = await createQRPayload('names')
  const prizesPayload = await createQRPayload('prizes')
  assert.deepEqual(namesPayload.data, roster)
  assert.deepEqual(prizesPayload.data, prizeList)

  const localRoster = { ...roster, name: '原有名单' }
  const localPool = { ...prizeList, name: '原有奖池' }
  const phone = new TestStorage({ lists: { class: localRoster }, currentListId: 'class',
    prizes: { lists: { pool: localPool }, currentId: 'pool', records: [{ id: 'local-record' }] } })
  boot(phone)
  assert.deepEqual(await importQRPayload(namesPayload), { route: '/lists' })
  assert.deepEqual(await importQRPayload(prizesPayload), { route: '/lottery/prizes' })

  boot(phone)
  const namesStore = useNamesStore()
  const prizes = usePrizesStore()
  await Promise.all([namesStore.initialize(), prizes.initialize()])
  assert.notEqual(namesStore.currentListId, 'class')
  assert.notEqual(prizes.currentId, 'pool')
  assert.deepEqual(namesStore.nameLists.class, localRoster)
  assert.deepEqual(prizes.lists.pool, localPool)
  assert.deepEqual(namesStore.currentList, { ...roster, id: namesStore.currentListId })
  assert.deepEqual(prizes.current, { ...prizeList, id: prizes.currentId })
  assert.deepEqual(prizes.records, [{ id: 'local-record' }])
})

test('A failed QR roster save restores the original list and selection', async t => {
  const original = globalThis.localStorage
  t.after(() => { globalThis.localStorage = original })
  const phone = new TestStorage({ lists: { class: roster }, currentListId: 'class' })
  boot(phone)
  const store = useNamesStore()
  await store.initialize()
  const before = new Map(phone.values)
  phone.failOnce = 'currentListId'
  await assert.rejects(importQRPayload({ version: 1, kind: 'names', data: { ...roster, name: '同步失败名单' } }), /disk full/)
  assert.deepEqual(store.allLists, [roster])
  assert.deepEqual(phone.values, before)
})

test('QR backup needs a local password and explicit replacement; original backup stays interoperable', async t => {
  const original = globalThis.localStorage
  t.after(() => { globalThis.localStorage = original })
  const records = Array.from({ length: 1000 }, (_, i) => ({ id: `draw-${i}`, listId: 'class', name: '张禕', mode: 'name' }))
  boot(new TestStorage({ lists: { class: roster }, settings: { darkMode: true }, currentListId: 'class', records }))
  await assert.rejects(createQRPayload('backup'), /data password/)
  const payload = await createQRPayload('backup', { password: 'source-data-pass', setPassword: true })
  await assert.rejects(createQRPayload('backup', { password: 'wrong', setPassword: true }), /Incorrect data password/)
  const originalFile = await dataBridge.exportDataBytes()
  assert.ok(base64ToBytes(payload.data).length < originalFile.length / 4, 'compresses repetitive backup plaintext')
  const backup = await decryptCyreneData(await convertQRBackup('receive', base64ToBytes(payload.data)))
  assert.deepEqual(backup.lists.class, roster)
  assert.equal(backup.settings.darkMode, true)

  const phone = new TestStorage({ settings: { darkMode: false }, records: [{ id: 'replace-me' }] })
  boot(phone)
  await createQRPayload('backup', { password: 'phone-local-pass', setPassword: true })
  const before = new Map(phone.values)
  await assert.rejects(importQRPayload(payload, { password: 'phone-local-pass' }), /Confirm replacement/)
  await assert.rejects(importQRPayload(payload, { replace: true, password: 'source-data-pass' }), /Incorrect data password/)
  assert.deepEqual(phone.values, before)

  assert.deepEqual(await importQRPayload(payload, { replace: true, password: 'phone-local-pass' }), { route: '/lists', reload: true })
  assert.deepEqual(JSON.parse(phone.getItem('records')), records)
  assert.deepEqual(JSON.parse(phone.getItem('settings')), { darkMode: true })
  assert.deepEqual(JSON.parse(phone.getItem('password')), backup.password)
  assert.deepEqual(await importQRPayload({ ...payload, data: bytesToBase64(originalFile) },
    { replace: true, password: 'source-data-pass' }), { route: '/lists', reload: true })
  boot(phone)
  const store = useNamesStore()
  await store.initialize()
  assert.deepEqual(store.currentList, roster)
})

test('QR backup conversion preserves authenticated file plaintext byte for byte', async () => {
  const source = new TextEncoder().encode('{"core":{"sequence":9007199254740993},"settings":  {"name":"星"}}')
  const stream = await convertQRBackup('send', await encryptCyreneBytes(source))
  assert.deepEqual(await decryptCyreneBytes(await convertQRBackup('receive', stream)), source)
  stream[stream.length - 1] ^= 1
  await assert.rejects(convertQRBackup('receive', stream), /数据完整性校验失败/)
})

test('Malformed or unrelated payloads cannot enter the lists', () => {
  assert.throws(() => validateQRPayload({ version: 2, kind: 'names', data: roster }), /Invalid sync data/)
  assert.throws(() => validateQRPayload({ version: 1, kind: 'names', data: { ...roster, id: '__proto__' } }), /Invalid sync data/)
  assert.throws(() => validateQRPayload({ version: 1, kind: 'names', data: { ...roster, names: [null] } }), /Invalid sync data/)
  assert.throws(() => validateQRPayload({ version: 1, kind: 'prizes', data: { ...prizeList, prizes: [{ name: 'X', quantity: -1 }] } }), /Invalid sync data/)
})

test('QR backup skips plugin data and voice samples while file backup keeps them', async t => {
  const original = globalThis.localStorage
  t.after(() => { globalThis.localStorage = original })
  const pluginData = { blob: 'x'.repeat(300 * 1024) }
  boot(new TestStorage({
    lists: { class: roster },
    settings: { darkMode: true },
    pluginData,
    pluginState: { installed: [{ id: 'sound-effects' }] },
    'tts-voice-sample': { name: 'sample.mp3', base64: 'A'.repeat(200000) }
  }))
  const payload = await createQRPayload('backup', { password: 'sync-only-pass', setPassword: true })
  const streamed = await decryptCyreneData(await convertQRBackup('receive', base64ToBytes(payload.data)))
  assert.deepEqual(streamed.lists.class, roster)
  assert.equal(streamed.settings.darkMode, true)
  assert.equal(streamed.pluginData, undefined, 'plugin data must not ride the QR stream')
  assert.equal(streamed.pluginState, undefined, 'plugin state must not ride the QR stream')
  assert.equal(streamed['tts-voice-sample'], undefined, 'voice clone sample must not ride the QR stream')

  const full = await decryptCyreneData(await dataBridge.exportDataBytes())
  assert.equal(full.pluginData.blob.length, 300 * 1024, 'file backup still keeps plugin data')
})
