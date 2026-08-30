const [, , packagePath, entry, ...args] = process.argv
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
let credential
try { credential = fs.readFileSync(3, 'utf8') } catch {
  const credentialBytes = Buffer.alloc(65)
  fs.readSync(0, credentialBytes, 0, credentialBytes.length, null)
  credential = credentialBytes.toString('utf8').trim()
}
if (!credential && process.env.CNRP_ALLOW_EMPTY_CREDENTIAL !== '1') process.exit(2)

const packageRoot = path.resolve(packagePath)
const entryPath = path.resolve(packageRoot, entry)
if (entryPath !== packageRoot && !entryPath.startsWith(packageRoot + path.sep) || !fs.statSync(entryPath).isFile()) process.exit(3)
const source = fs.readFileSync(entryPath, 'utf8')
if (Buffer.byteLength(source, 'utf8') > 4 * 1024 * 1024) process.exit(3)
const sandbox = vm.createContext({ console: Object.freeze({ log() {}, warn() {}, error() {} }), setTimeout, clearTimeout, crypto: Object.freeze({ randomUUID: crypto.randomUUID }) }, { codeGeneration: { strings: false, wasm: false } })
new vm.Script(`'use strict';\n${source}`, { filename: entryPath }).runInContext(sandbox, { timeout: 1000 })
const pluginModule = sandbox.CyrenePluginModule || sandbox.cyrenePlugin || sandbox.plugin || {}
const MAX_FRAME_BYTES = 1024 * 1024

const encode = value => {
  const data = Buffer.from(JSON.stringify(value), 'utf8')
  if (data.length > MAX_FRAME_BYTES) throw new Error('RPC frame exceeds 1 MiB')
  const frame = Buffer.allocUnsafe(4 + data.length)
  frame.writeUInt32LE(data.length, 0)
  data.copy(frame, 4)
  return frame
}
const send = value => process.stdout.write(encode({ ...value, protocol: 'cnrp-jsonrpc/1', api: '1.5' }))
let buffer = Buffer.alloc(0)
let initialized = false
let identity = null
const pending = new Map()
const request = (method, params = {}) => {
  if (!initialized) return Promise.reject(new Error('runner is not ready'))
  if (pending.size >= 32) return Promise.reject(Object.assign(new Error('concurrent request limit exceeded'), { code: 'RESOURCE_LIMIT' }))
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      send({ jsonrpc: '2.0', protocol: 'cnrp-jsonrpc/1', ...identity, id: crypto.randomUUID(), method: '$/cancelRequest', params: { requestId: id } })
      reject(Object.assign(new Error('RPC request timeout'), { code: 'TIMEOUT' }))
    }, 15000)
    pending.set(id, { resolve, reject, timer })
    send({ jsonrpc: '2.0', protocol: 'cnrp-jsonrpc/1', ...identity, id, idempotencyKey: crypto.randomUUID(), method, params })
  })
}
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk])
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0)
    if (length > MAX_FRAME_BYTES) process.exit(4)
    if (buffer.length < length + 4) return
    const message = JSON.parse(buffer.subarray(4, length + 4).toString('utf8'))
    buffer = buffer.subarray(length + 4)
    if (message.protocol !== 'cnrp-jsonrpc/1' || message.api !== '1.5') process.exit(5)
    if (message.type === 'hello' && message.role === 'host' && message.api === '1.5' && message.protocol === 'cnrp-jsonrpc/1') {
      identity = { pluginId: message.pluginId, instanceId: message.instanceId }
      const credentialProof = createHash('sha256').update(`${credential}\0${message.pluginId}\0${message.instanceId}`).digest('hex')
      send({ type: 'hello.accepted', role: 'plugin', ...identity, credentialProof, api: '1.5', protocol: 'cnrp-jsonrpc/1' })
    }
    else if (message.type === 'initialize' && identity && message.pluginId === identity.pluginId && message.instanceId === identity.instanceId && message.role === 'host' && message.api === '1.5' && message.protocol === 'cnrp-jsonrpc/1') {
      Promise.resolve(pluginModule.activate?.(Object.freeze({ plugin: Object.freeze({ id: identity.pluginId, instanceId: identity.instanceId }), capabilities: Object.freeze(message.capabilities || {}), args: Object.freeze([...args]), request }))).then(() => {
        initialized = true
        send({ type: 'ready', role: 'plugin', ...identity, api: '1.5', protocol: 'cnrp-jsonrpc/1' })
      }).catch(error => send({ type: 'fault', role: 'plugin', ...identity, api: '1.5', protocol: 'cnrp-jsonrpc/1', error: String(error?.message || error) }))
    }
    else if (message.type === 'heartbeat' && identity && message.pluginId === identity.pluginId && message.instanceId === identity.instanceId) send({ type: 'heartbeat.ack', role: 'plugin', ...identity, api: '1.5', protocol: 'cnrp-jsonrpc/1' })
    else if (message.type === 'shutdown' && initialized) Promise.resolve(pluginModule.deactivate?.()).finally(() => process.exit(0))
    else if (message.type === 'event' && initialized) Promise.resolve(pluginModule.onEvent?.(message.event, message.payload)).catch(() => {})
    else if (message.jsonrpc === '2.0' && message.id && !message.method && message.pluginId === identity.pluginId && message.instanceId === identity.instanceId) {
      const task = pending.get(message.id)
      if (!task) continue
      pending.delete(message.id)
      clearTimeout(task.timer)
      message.error ? task.reject(Object.assign(new Error(message.error.message || message.error), { code: message.error.code })) : task.resolve(message.result)
    }
    else if (message.method && initialized && message.pluginId === identity.pluginId && message.instanceId === identity.instanceId) {
      Promise.resolve(pluginModule.onRequest?.(message.method, message.params || {})).then(result => send({ jsonrpc: '2.0', protocol: 'cnrp-jsonrpc/1', ...identity, id: message.id, result })).catch(error => send({ jsonrpc: '2.0', protocol: 'cnrp-jsonrpc/1', ...identity, id: message.id, error: { code: error.code || 'INTERNAL_ERROR', message: String(error?.message || error) } }))
    }
  }
})
void packagePath
void entry
void args
