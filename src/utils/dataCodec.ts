import { gzip, Inflate } from 'pako'

export const MAX_COMPRESSED_BYTES = 4 * 1024 * 1024
export const MAX_JSON_BYTES = 16 * 1024 * 1024
const tooLarge = () => new Error('数据超过二维码传输上限，请改用文件导入和导出。')

export function encodeData(value: unknown): Uint8Array {
  const json = JSON.stringify(value)
  if (json === undefined) throw new Error('没有可发送的数据')
  if (json.length > MAX_JSON_BYTES) throw tooLarge()
  return compressBytes(new TextEncoder().encode(json))
}

export function compressBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_JSON_BYTES) throw tooLarge()
  const compressed = gzip(bytes)
  if (compressed.length > MAX_COMPRESSED_BYTES) throw tooLarge()
  return compressed
}

// pako.ungzip inflates the whole input before returning; cap output while it is produced.
function inflateBounded(bytes: Uint8Array, onData: (chunk: Uint8Array) => void): number {
  if (bytes.length > MAX_COMPRESSED_BYTES) throw tooLarge()
  const inflate = new Inflate({ windowBits: 31, chunkSize: 32 * 1024 })
  let length = 0
  inflate.onData = (chunk: Uint8Array) => {
    length += chunk.length
    if (length > MAX_JSON_BYTES) throw tooLarge()
    onData(chunk)
  }
  if (!inflate.push(bytes, true) || !inflate.ended || inflate.err) throw new Error('压缩数据不完整，请重新扫码。')
  return length
}

export function decompressBytes(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  const size = inflateBounded(bytes, chunk => chunks.push(chunk))
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

export function decodeData(bytes: Uint8Array): unknown {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const parts: string[] = []
  inflateBounded(bytes, chunk => parts.push(decoder.decode(chunk, { stream: true })))
  parts.push(decoder.decode())
  return JSON.parse(parts.join(''))
}
