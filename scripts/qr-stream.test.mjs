import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { gzip } from 'pako'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { initSync, Encoder, Decoder } from 'raptorq/raptorq.js'
import { encodeData, decodeData, MAX_JSON_BYTES } from '../src/utils/dataCodec.ts'
import { createFrameEncoder, createFrameDecoder, SYMBOL_BYTES } from '../src/utils/qrFountain.ts'
import { frameFromProductUrl, frameToProductUrl, QR_PRODUCT_URL } from '../src/utils/qrFrameUrl.ts'

initSync(readFileSync(new URL('../node_modules/raptorq/raptorq_bg.wasm', import.meta.url)))
const raptor = { Encoder, Decoder }

function readQr(frame) {
  const { modules } = QRCode.create(frameToProductUrl(frame), { errorCorrectionLevel: 'M' })
  const scale = 4, side = (modules.size + 8) * scale
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255)
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) for (let row = 0; row < scale; row++) for (let col = 0; col < scale; col++) {
      const offset = (((y+4)*scale + row)*side + (x+4)*scale + col)*4
      pixels.fill(0, offset, offset + 3)
    }
  }
  const qr = jsQR(pixels, side, side, { inversionAttempts: 'dontInvert' })
  assert.ok(qr)
  return qr.data
}

test('100 multilingual names pass through actual QR pixels within 30 displayed frames, including a missed frame', () => {
  const payload = { version: 1, kind: 'names', data: { id: 'class', name: '点名名册', groups: [], names:
    Array.from({length: 100}, (_, i) => ({ id: randomUUID(), cn: '李' + String.fromCodePoint(0x6600+i),
      en: 'Student ' + i, gender: i % 2 ? 'male' : 'female', groupId: '', isWhiteList: false })) } }
  const encoder = createFrameEncoder(encodeData(payload), raptor), decoder = createFrameDecoder(raptor)
  for (let i = 0; i < 30; i++) {
    const frame = encoder.next()
    if (i === 2) continue
    const url = new URL(readQr(frame))
    assert.equal(url.origin + url.pathname + url.search, QR_PRODUCT_URL)
    const scanned = frameFromProductUrl(url.href)
    assert.deepEqual(scanned, frame)
    const state = decoder.add(scanned)
    assert.equal(decoder.add(scanned), undefined)
    if (state?.complete) { assert.deepEqual(decodeData(state.bytes), payload); return }
  }
  assert.fail('sample roster exceeded the default 10 FPS frame budget')
})

test('unrelated URLs and malformed sync fragments do not become frames', () => {
  assert.equal(frameFromProductUrl(QR_PRODUCT_URL), undefined)
  assert.equal(frameFromProductUrl(QR_PRODUCT_URL + '#cnr-sync=A'), undefined)
  assert.equal(frameFromProductUrl(QR_PRODUCT_URL + '#cnr-sync=A+%20'), undefined)
  assert.equal(frameFromProductUrl(QR_PRODUCT_URL.replace('star.cyrene.hk', 'example.com') + '#cnr-sync=AAAA'), undefined)
})

test('RaptorQ recovers several missing source frames per group, across a full and a partial group', () => {
  const original = new Uint8Array(randomBytes(SYMBOL_BYTES * 51 + 19))
  const encoder = createFrameEncoder(original, raptor), decoder = createFrameDecoder(raptor)
  for (let i = 0; i < 180; i++) {
    const frame = encoder.next()
    if (frame[3] === 1 || (frame[3] === 0 && [0, 4, 6].includes(frame[15]))) continue
    const state = decoder.add(frame)
    if (state?.complete) { assert.deepEqual(state.bytes, original); return }
  }
  assert.fail('repair-only completion of missing packets failed')
})

test('a WebView without WASM can join late, ignore a foreign stream and a damaged frame, and resume after obstruction', () => {
  const original = new Uint8Array(randomBytes(SYMBOL_BYTES * 13 + 91))
  for (const sender of [undefined, raptor]) {
    const encoder = createFrameEncoder(original, sender), decoder = createFrameDecoder()
    for (let i = 0; i < 5; i++) encoder.next()
    const good = encoder.next(), bad = good.slice()
    bad[54] ^= 48
    assert.equal(decoder.add(bad), undefined)
    assert.equal(decoder.add(good).received, 1)
    assert.equal(decoder.add(createFrameEncoder(encodeData({ other: true })).next()), undefined)
    let result
    for (let i = 0; i < 100 && !result?.complete; i++) {
      const frame = encoder.next()
      if ((i < 7 || i > 13) && !(frame[3] === 0 && frame[15] === 4)) result = decoder.add(frame)
    }
    assert.deepEqual(result?.bytes, original)
  }
})

test('refuses truncated gzip, malformed JSON, and expansion above the JSON limit', () => {
  const compressed = encodeData({ value: '\u{20000}😺' })
  assert.throws(() => decodeData(compressed.subarray(0, -2)))
  assert.throws(() => decodeData(gzip('not JSON')))
  assert.throws(() => decodeData(gzip(new Uint8Array(MAX_JSON_BYTES + 1))), /文件/)
})
