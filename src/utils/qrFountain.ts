import { MAX_COMPRESSED_BYTES } from './dataCodec.ts'

// CY v1, all integers big endian. [CY,version,kind,streamCRC:u32,bytes:u32,
// group:u16,symbol:u16][192 symbol bytes][frameCRC:u32]. A group is a complete
// RFC 6330 source block, so late joins never need a separate configuration QR.
export const SYMBOL_BYTES = 192
const GROUP_SIZE = 32
const GROUP_BYTES = GROUP_SIZE * SYMBOL_BYTES
const HEADER = 16
const FRAME_SIZE = HEADER + SYMBOL_BYTES + 4
const SOURCE = 0, PARITY = 1, RAPTOR = 2
const MAX_REPAIR_ID = 128

type RaptorEncoder = { encode(repairs: number): Uint8Array[], free(): void }
type RaptorDecoder = { decode(packet: Uint8Array): Uint8Array | undefined, free(): void }
export interface RaptorRuntime {
  Encoder: { with_defaults(bytes: Uint8Array, mtu: number): RaptorEncoder }
  Decoder: { with_defaults(size: bigint, mtu: number): RaptorDecoder }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0)
  return n >>> 0
})
function crc32(bytes: Uint8Array) {
  let n = -1
  for (const b of bytes) n = (n >>> 8) ^ crcTable[(n ^ b) & 255]
  return (n ^ -1) >>> 0
}
function xor(target: Uint8Array, bytes: Uint8Array) {
  for (let i = 0; i < bytes.length; i++) target[i] ^= bytes[i]
}
function wrap(hash: number, size: number, group: number, kind: number, id: number, symbol: Uint8Array) {
  const frame = new Uint8Array(FRAME_SIZE)
  const view = new DataView(frame.buffer)
  frame.set([67, 89, 1, kind])
  view.setUint32(4, hash)
  view.setUint32(8, size)
  view.setUint16(12, group)
  view.setUint16(14, id)
  frame.set(symbol, HEADER)
  view.setUint32(FRAME_SIZE - 4, crc32(frame.subarray(0, -4)))
  return frame
}

function* frames(data: Uint8Array, codec?: RaptorRuntime) {
  const hash = crc32(data)
  const groups = Math.ceil(data.length / GROUP_BYTES)
  for (let pass = 0; ; pass++) {
    for (let g = 0; g < groups; g++) {
      const block = data.subarray(g * GROUP_BYTES, (g + 1) * GROUP_BYTES)
      const count = Math.ceil(block.length / SYMBOL_BYTES)
      const repairs = codec ? Math.ceil(count / 4) : 0
      const slots = count + 1 + repairs
      let packets: Uint8Array[] | undefined
      for (let tick = 0; tick < slots; tick++) {
        // Rotate the sequence on every pass so regular frame drops do not
        // repeatedly hide the same symbol from slow cameras.
        const slot = (tick + pass) % slots
        if (slot < count) {
          yield wrap(hash, data.length, g, SOURCE, slot, block.subarray(slot * SYMBOL_BYTES, (slot + 1) * SYMBOL_BYTES))
        } else if (slot === count) {
          const parity = new Uint8Array(SYMBOL_BYTES)
          for (let i = 0; i < count; i++) xor(parity, block.subarray(i * SYMBOL_BYTES, (i + 1) * SYMBOL_BYTES))
          yield wrap(hash, data.length, g, PARITY, 0, parity)
        } else if (codec) {
          if (!packets) {
            const encoder = codec.Encoder.with_defaults(block, SYMBOL_BYTES)
            // The binding emits a batch. Generate one small group at a time
            // and rotate the repair window, bounding memory even for backups.
            const offset = (pass % 4) * repairs
            try { packets = encoder.encode(offset + repairs).slice(count + offset) }
            finally { encoder.free() }
          }
          const packet = packets[slot - count - 1]
          const id = new DataView(packet.buffer, packet.byteOffset).getUint32(0)
          yield wrap(hash, data.length, g, RAPTOR, id, packet.subarray(4))
        }
      }
    }
  }
}

export function createFrameEncoder(data: Uint8Array, codec?: RaptorRuntime) {
  if (!data.length || data.length > MAX_COMPRESSED_BYTES) throw new Error('数据大小超出二维码传输范围')
  const iterator = frames(data, codec)
  const total = Math.ceil(data.length / SYMBOL_BYTES)
  const blocks = Math.ceil(total / GROUP_SIZE)
  // Full blocks are divisible by 4, so rounding can only occur once.
  const framesPerPass = total + blocks + (codec ? Math.ceil(total / 4) : 0)
  return { total, framesPerPass, next: () => iterator.next().value as Uint8Array }
}

interface Block {
  ids: Set<number>
  parity?: Uint8Array
  repairs: Map<number, Uint8Array>
}

function repairWithRaptor(codec: RaptorRuntime, bytes: Uint8Array, size: number, block: Block) {
  const decoder = codec.Decoder.with_defaults(BigInt(size), SYMBOL_BYTES)
  const packet = new Uint8Array(4 + SYMBOL_BYTES)
  const header = new DataView(packet.buffer)
  const feed = (id: number, symbol: Uint8Array) => {
    header.setUint32(0, id)
    packet.set(symbol, 4)
    return decoder.decode(packet)
  }
  try {
    for (const id of block.ids) {
      const done = feed(id, bytes.subarray(id * SYMBOL_BYTES, (id + 1) * SYMBOL_BYTES))
      if (done) return done
    }
    for (const [id, symbol] of block.repairs) {
      const done = feed(id, symbol)
      if (done) return done
    }
  } finally { decoder.free() }
}

export function createFrameDecoder(codec?: RaptorRuntime) {
  let size = 0, hash = 0, recovered = 0
  let data: Uint8Array
  const blocks = new Map<number, Block>()
  const finished = new Set<number>()

  function add(frame: Uint8Array) {
    if (frame.length !== FRAME_SIZE || frame[0] !== 67 || frame[1] !== 89 || frame[2] !== 1) return
    const v = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    const kind = frame[3], stream = v.getUint32(4), length = v.getUint32(8), g = v.getUint16(12), id = v.getUint16(14)
    if (!length || length > MAX_COMPRESSED_BYTES || (size && (hash !== stream || length !== size))) return
    const blockSize = Math.min(GROUP_BYTES, length - g * GROUP_BYTES)
    const count = Math.ceil(blockSize / SYMBOL_BYTES)
    if (count < 1 || finished.has(g) || kind > RAPTOR || (kind === SOURCE && id >= count)
      || (kind === PARITY && id !== 0) || (kind === RAPTOR && (!codec || id < count || id >= MAX_REPAIR_ID))) return
    if (crc32(frame.subarray(0, -4)) !== v.getUint32(FRAME_SIZE - 4)) return
    const total = Math.ceil(length / SYMBOL_BYTES)
    if (!size) {
      size = length; hash = stream
      data = new Uint8Array(total * SYMBOL_BYTES)
    }
    const bytes = data.subarray(g * GROUP_BYTES, (g + 1) * GROUP_BYTES)
    const symbol = frame.subarray(HEADER, -4)
    const block = blocks.get(g) ?? { ids: new Set<number>(), repairs: new Map<number, Uint8Array>() } as Block
    blocks.set(g, block)
    if (kind === SOURCE) {
      if (block.ids.has(id)) return
      bytes.set(symbol, id * SYMBOL_BYTES)
      block.ids.add(id)
      recovered++
    } else if (kind === PARITY) {
      if (block.parity) return
      block.parity = symbol.slice()
    } else {
      if (block.repairs.has(id)) return
      block.repairs.set(id, symbol.slice())
    }

    let missing = count - block.ids.size
    if (missing === 1 && block.parity) {
      let absent = 0
      for (let i = 0; i < count; i++) {
        if (block.ids.has(i)) xor(block.parity, bytes.subarray(i * SYMBOL_BYTES, (i + 1) * SYMBOL_BYTES))
        else absent = i
      }
      bytes.set(block.parity, absent * SYMBOL_BYTES)
      recovered++
      missing = 0
    } else if (missing && codec && block.repairs.size >= missing) {
      const restored = repairWithRaptor(codec, bytes, blockSize, block)
      if (restored) {
        bytes.set(restored)
        recovered += missing
        missing = 0
      }
    }
    if (!missing) { blocks.delete(g); finished.add(g) }
    if (recovered !== total) return { complete: false as const, received: recovered, total }
    const result = data.subarray(0, size)
    if (crc32(result) !== hash) throw new Error('整份数据校验失败，请重新扫码。')
    return { complete: true as const, received: total, total, bytes: result }
  }
  return { add }
}
