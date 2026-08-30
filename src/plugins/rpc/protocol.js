export const CNRP_JSONRPC_PROTOCOL = 'cnrp-jsonrpc/1'
export const MAX_RPC_FRAME_BYTES = 1024 * 1024
export const MAX_RPC_CHUNK_BYTES = 256 * 1024
export const MAX_RPC_BINARY_BYTES = 32 * 1024 * 1024
export const RPC_ERROR_CODES = ['INVALID_REQUEST', 'UNAUTHORIZED', 'METHOD_NOT_FOUND', 'INVALID_PARAMS', 'TIMEOUT', 'CANCELLED', 'CONFLICT', 'UNSUPPORTED_PLATFORM', 'INTERNAL_ERROR']

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

export function createRpcRequest(method, params = {}, id = '', identity = {}) {
  const requestId = id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (!REQUEST_ID.test(String(requestId))) throw new Error('invalid request id')
  if (typeof method !== 'string' || !(/^[a-z][a-z0-9.-]{0,127}$/.test(method) || /^\$\/[A-Za-z][A-Za-z0-9.-]{0,127}$/.test(method))) throw new Error('invalid RPC method')
  const envelope = { jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, id: String(requestId), idempotencyKey: String(identity.idempotencyKey || requestId), method, params }
  for (const field of ['pluginId', 'instanceId']) if (identity[field] !== undefined) envelope[field] = String(identity[field])
  return Object.freeze(envelope)
}

export function createRpcCancel(id, identity = {}) {
  return createRpcRequest('$/cancelRequest', { requestId: String(id) }, `cancel:${id}`, identity)
}

export function createRpcHandshake(identity, role = 'plugin') {
  if (!identity || typeof identity !== 'object' || typeof identity.pluginId !== 'string' || typeof identity.instanceId !== 'string') throw new Error('invalid RPC identity')
  return Object.freeze({ jsonrpc: '2.0', protocol: CNRP_JSONRPC_PROTOCOL, type: 'handshake', role, pluginId: identity.pluginId, instanceId: identity.instanceId, api: '1.5' })
}

export function validateRpcBinaryChunk(chunk, totalBytes = 0) {
  if (!chunk || typeof chunk !== 'object' || !Number.isInteger(chunk.index) || !Number.isInteger(chunk.total) || chunk.index < 0 || chunk.total < 1 || chunk.index >= chunk.total || typeof chunk.data !== 'string' || chunk.data.length > Math.ceil(MAX_RPC_CHUNK_BYTES / 3) * 4) throw new Error('RPC binary chunk metadata is invalid')
  const bytes = Uint8Array.from(atob(chunk.data), character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_RPC_CHUNK_BYTES || totalBytes + bytes.byteLength > MAX_RPC_BINARY_BYTES) throw new Error('RPC binary operation exceeds limit')
  return bytes
}

export function validateRpcChunkSequence(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) throw new Error('RPC chunk sequence is invalid')
  const total = chunks[0]?.total
  if (!Number.isInteger(total) || total !== chunks.length) throw new Error('RPC chunk sequence total is invalid')
  const ordered = [...chunks].sort((left, right) => left.index - right.index)
  const values = []
  let totalBytes = 0
  ordered.forEach((chunk, index) => {
    if (chunk.index !== index || chunk.total !== total) throw new Error('RPC chunk sequence index is invalid')
    const value = validateRpcBinaryChunk(chunk, totalBytes)
    totalBytes += value.byteLength
    values.push(value)
  })
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const value of values) { bytes.set(value, offset); offset += value.byteLength }
  return Array.from(bytes)
}

export function encodeRpcFrame(message) {
  const bytes = new TextEncoder().encode(JSON.stringify(message))
  if (bytes.byteLength > MAX_RPC_FRAME_BYTES) throw new Error('RPC frame exceeds 1 MiB')
  const frame = new Uint8Array(4 + bytes.byteLength)
  new DataView(frame.buffer).setUint32(0, bytes.byteLength, true)
  frame.set(bytes, 4)
  return frame
}

export function parseRpcFrame(frame) {
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame)
  if (bytes.byteLength < 4) throw new Error('RPC frame is truncated')
  const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
  if (length > MAX_RPC_FRAME_BYTES || bytes.byteLength !== length + 4) throw new Error('RPC frame length is invalid')
  const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4)))
  if (!message || message.jsonrpc !== '2.0' || message.protocol !== CNRP_JSONRPC_PROTOCOL) throw new Error('RPC message protocol is invalid')
  return message
}

export function createRpcError(code, message, data) {
  if (!RPC_ERROR_CODES.includes(code)) throw new Error('invalid RPC error code')
  return { code, message, ...(data === undefined ? {} : { data }) }
}

export function replayRpcRequest(idempotencyKey, response, cache) {
  const key = String(idempotencyKey)
  if (cache.has(key)) return cache.get(key)
  cache.set(key, response)
  return response
}

export class RpcFrameDecoder {
  #buffer = new Uint8Array()
  push(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    const merged = new Uint8Array(this.#buffer.length + bytes.length)
    merged.set(this.#buffer); merged.set(bytes, this.#buffer.length); this.#buffer = merged
    const messages = []
    while (this.#buffer.length >= 4) {
      const length = new DataView(this.#buffer.buffer, this.#buffer.byteOffset, 4).getUint32(0, true)
      if (length > MAX_RPC_FRAME_BYTES) throw new Error('RPC frame length is invalid')
      if (this.#buffer.length < length + 4) break
      messages.push(parseRpcFrame(this.#buffer.subarray(0, length + 4)))
      this.#buffer = this.#buffer.slice(length + 4)
    }
    return messages
  }
}

export class RpcHandshake {
  constructor(identity) { this.identity = identity; this.state = 'new' }
  next(message) {
    if (this.state === 'new') {
      if (message?.type !== 'hello') throw new Error('handshake hello required')
      if (message.role !== 'plugin' || message.pluginId !== this.identity.pluginId || message.instanceId !== this.identity.instanceId) throw new Error('handshake identity or role invalid')
      if (message.api !== '1.5' || !message.protocols?.includes(CNRP_JSONRPC_PROTOCOL)) throw new Error('handshake negotiation invalid')
      this.state = 'accepted'
      return { type: 'hello.accepted', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5' }
    }
    if (this.state === 'accepted') {
      if (message?.type !== 'initialize') throw new Error('handshake initialize required')
      if (message.role !== 'plugin' || message.pluginId !== this.identity.pluginId || message.instanceId !== this.identity.instanceId) throw new Error('handshake identity or role invalid')
      if (message.api !== '1.5') throw new Error('handshake negotiation invalid')
      this.state = 'ready'
      return { type: 'ready', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5' }
    }
    if (this.state !== 'ready') throw new Error('handshake is closed')
    return message
  }
}

export function createCancellationState() {
  const cancelled = new Set()
  return {
    cancel(id) { cancelled.add(String(id)); return true },
    isCancelled(id) { return cancelled.has(String(id)) },
    clear(id) { cancelled.delete(String(id)) }
  }
}
