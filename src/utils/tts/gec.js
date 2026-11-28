/**
 * Edge TTS 的 Sec-MS-GEC 令牌（v2）。
 *
 * 微软从 2026 年起把朗读接口换成带签名的令牌：令牌由「5 分钟对齐的 Windows
 * 文件时间 + 客户端令牌」派生出 CS64 与 SHA256 两段摘要。算法本身是把标准
 * SHA-256 改了初始状态与前 30 个扩展字，这里按等价的标准轮函数重新实现，
 * 便于验证也便于日后维护。
 * 参考实现：rany2/edge-tts 的 drm.py
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WINDOWS_FILE_TIME_EPOCH = 11644473600
const WIN_TICKS_PER_SECOND = 1e7
const MASK = 0xffffffff

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
const CUSTOM_STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2]
const CUSTOM_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491,
  0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564
]
const ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]
const CS64_COEFFICIENTS = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf], [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb], [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167]
]
const CS64_FACTOR = 0x82893933
const CS64_ADJUSTMENT0 = 0xf2f90b1a
const CS64_ADJUSTMENT1 = 0x0b1a0000
const SHA256_ADJUSTMENT = 0xc9dc06a7
const SIGMA0_ADJUSTMENT = 0x059c0b80
const SIGMA1_ADJUSTMENT = 0x000b92c0
const BLOCK_CONSTANTS = ROUND_CONSTANTS.slice()
BLOCK_CONSTANTS[14] = SHA256_ADJUSTMENT

const rotr = (value, bits) => ((value >>> bits) | (value << (32 - bits))) >>> 0
const rol16 = value => ((value << 16) | (value >>> 16)) >>> 0
const smallSigma0 = value => ((value >>> 7) ^ (value << 25) ^ (value >>> 18) ^ (value << 14) ^ (value >>> 3)) >>> 0
const smallSigma1 = value => ((value >>> 17) ^ (value << 15) ^ (value >>> 19) ^ (value << 13) ^ (value >>> 10)) >>> 0

function mul32(a, b) {
  return Number((BigInt(a >>> 0) * BigInt(b >>> 0)) & 0xffffffffn) >>> 0
}

function compress(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state
  const constants = firstRound === 14 ? BLOCK_CONSTANTS : ROUND_CONSTANTS
  for (let index = firstRound; index < 64; index++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (g ^ (e & (f ^ g))) + constants[index] + words[index]) >>> 0
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) | (c & (a | b)))) >>> 0
    h = g
    g = f
    f = e
    e = (d + t1) >>> 0
    d = c
    c = b
    b = a
    a = (t1 + t2) >>> 0
  }
  return [a, b, c, d, e, f, g, h]
}

function expandSchedule(words, firstWord = 16) {
  for (let index = firstWord; index < 64; index++) {
    words[index] = (smallSigma1(words[index - 2]) + words[index - 7] + smallSigma0(words[index - 15]) + words[index - 16]) >>> 0
  }
}

function sha256Init(seed) {
  const words = new Array(64).fill(0)
  words[14] = ((seed[0] << 16) | (seed[1] << 8) | seed[2]) >>> 0
  words[15] = ((seed[3] << 24) | (seed[4] << 16) | (seed[5] << 8) | seed[6]) >>> 0
  for (let index = 16; index < 30; index++) {
    let value = CUSTOM_SCHEDULE[index - 16]
    if (index - 2 >= 14) {
      value += index === 16 ? (smallSigma1(words[index - 2]) ^ SIGMA1_ADJUSTMENT) >>> 0 : smallSigma1(words[index - 2])
    }
    if (index - 7 >= 14) value += words[index - 7]
    if (index - 15 >= 14) {
      value += index === 29 ? (smallSigma0(words[index - 15]) ^ SIGMA0_ADJUSTMENT) >>> 0 : smallSigma0(words[index - 15])
    }
    words[index] = value >>> 0
  }
  words[30] = (
    smallSigma1(words[28]) + words[23] + smallSigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - ROUND_CONSTANTS[14]
  ) >>> 0
  expandSchedule(words, 31)
  const working = compress(CUSTOM_STATE, words, 14)
  return INITIAL.map((value, index) => (value + working[index]) >>> 0)
}

function sha256Digest(data) {
  if (data.length < 7) throw new Error('令牌数据过短')
  const state = sha256Init(Array.from(data.slice(0, 7)))
  const paddingLength = ((55 - (57 + data.length)) % 64 + 64) % 64
  const total = data.length - 7 + 1 + paddingLength + 8
  const buffer = new Uint8Array(total)
  buffer.set(data.slice(7), 0)
  buffer[data.length - 7] = 0x80
  const bitLength = 57 + data.length
  const view = new DataView(buffer.buffer)
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(total - 4, (bitLength * 8) >>> 0, false)
  let current = state
  for (let offset = 0; offset < total; offset += 64) {
    const words = new Array(64).fill(0)
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false)
    expandSchedule(words)
    const working = compress(current, words, 0)
    current = current.map((value, index) => (value + working[index]) >>> 0)
  }
  const digest = new Uint8Array(32)
  const out = new DataView(digest.buffer)
  current.forEach((value, index) => out.setUint32(index * 4, value, false))
  return digest
}

function wordsLe4Even(data) {
  const padded = new Uint8Array(Math.ceil(data.length / 4) * 4)
  padded.set(data)
  const words = []
  for (let offset = 0; offset < padded.length; offset += 4) {
    words.push((padded[offset] | (padded[offset + 1] << 8) | (padded[offset + 2] << 16) | (padded[offset + 3] << 24)) >>> 0)
  }
  if (words.length % 2) words.push(0)
  return words
}

function cs64Digest(data, digest) {
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  const keyA = view.getUint32(0, true) | 1
  const keyB = view.getUint32(4, true) | 1
  const factors = [mul32(keyA, CS64_FACTOR), mul32(keyB, CS64_FACTOR)]
  const terms = CS64_COEFFICIENTS.map((coefficient, index) => mul32(coefficient[0], factors[index % 2]))
  const offsets = CS64_COEFFICIENTS.map(coefficient => coefficient[1])

  const prefixed = new Uint8Array(data.length + 1)
  prefixed.set(data, 1)
  wordsLe4Even(prefixed).forEach((word, index) => {
    let term = mul32(word, index % 2 === 0 ? keyA : keyB)
    let offset = mul32(rol16(word), index % 2 === 0 ? 0xef0569fb : 0xc31713db)
    if (index === 0) {
      term = (term + mul32(CS64_ADJUSTMENT0, factors[0])) >>> 0
      offset = (offset + CS64_ADJUSTMENT1) >>> 0
    }
    terms.push(term >>> 0)
    offsets.push(offset >>> 0)
  })

  let swapAcc = 0
  let swapLast = 0
  let state = 0
  let acc = 0
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index]
    const y = terms[index + 1]
    let t = rol16((offsets[index] + x) >>> 0)
    let q = mul32(t, 0x76f50f34)
    swapAcc = (swapAcc + ((mul32(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0
    t = rol16((offsets[index + 1] + y) >>> 0)
    q = mul32(t, 0x1881ce3c)
    swapLast = (mul32(rol16(q), 0x35bd1ec9) + q) >>> 0
    swapAcc = (swapAcc + swapLast) >>> 0

    state = (mul32(state, keyA) + x) >>> 0
    state = mul32(rol16(state), 0xcf98b111)
    state = mul32(rol16(state), 0x87085b9f)
    state = mul32(rol16(state), 0x12ceb96d)
    state = mul32(rol16(state), 0x257e1d83)
    acc = (acc + state) >>> 0
    t = (mul32(state, keyB) + y) >>> 0
    t = mul32(rol16(t), 0xa27416f5)
    t = mul32(rol16(t), 0xd38396ff)
    state = mul32(rol16(mul32(rol16(t), 0x7c932b89)), 0xbfa49f69)
    acc = (acc + state) >>> 0
  }
  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0]
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** 生成当前（或指定）时间的 Sec-MS-GEC 令牌。 */
export function generateSecMsGec(unixTimestamp = Date.now() / 1000) {
  let ticks = unixTimestamp + WINDOWS_FILE_TIME_EPOCH
  ticks -= ticks % 300
  ticks *= WIN_TICKS_PER_SECOND
  const data = new TextEncoder().encode(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`)
  const sha = sha256Digest(data)
  const [low, high] = cs64Digest(data, sha)
  const cs64 = toHex(new Uint8Array(new Uint32Array([low, high]).buffer))
  return `${cs64}-${toHex(sha)}`
}

export { TRUSTED_CLIENT_TOKEN }
