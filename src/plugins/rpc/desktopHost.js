import { CNRP_JSONRPC_PROTOCOL, HostRpcHandshake, RpcFrameDecoder, createRpcRequest, encodeRpcFrame, validateApi15Message } from './protocol.js'
import { tauriAPI } from '../../utils/tauriAPI.js'

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_CONCURRENT = 32
const id = () => globalThis.crypto?.randomUUID?.() || `rpc-${Date.now()}-${Math.random().toString(36).slice(2)}`
const loadNodeModule = specifier => Function('specifier', 'return import(specifier)')(specifier)
const credential = () => {
  const bytes = new Uint8Array(32)
  if (!globalThis.crypto?.getRandomValues) throw new Error('secure random credential generation unavailable')
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function sessionProof(secret, pluginId, instanceId) {
  const bytes = new TextEncoder().encode(`${secret}\0${pluginId}\0${instanceId}`)
  if (globalThis.crypto?.subtle) return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
  const { createHash } = await loadNodeModule('node:crypto')
  return createHash('sha256').update(bytes).digest('hex')
}

export class BundledRunner {
  constructor({ platform = 'unknown', resourcesDir = '', executable = '' } = {}) {
    this.platform = platform
    this.resourcesDir = resourcesDir
    this.executable = executable
  }

  get path() {
    const name = this.platform === 'win32' ? 'cnrp-runner.exe' : 'cnrp-runner'
    return this.executable || [this.resourcesDir, 'plugin-runner', name].filter(Boolean).join('/')
  }

  launchSpec({ packagePath, entry, args = [] } = {}) {
    if (!packagePath || !entry || !Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('validated package and entry required')
    if (!this.path || this.path.includes('..')) throw new Error('bundled runner executable path is invalid')
    return { command: this.path, args: [packagePath, entry, ...args], env: {}, credentialChannel: 'inherited-private' }
  }
}

export function createApplicationRunner({ platform = 'unknown', resourcesDir = '', executable = '', spawn } = {}) {
  const bundled = new BundledRunner({ platform, resourcesDir, executable })
  if (typeof spawn !== 'function') throw new Error('application bundled runner spawn bridge is unavailable')
  return {
    platform,
    resourcesDir,
    launchSpec: options => bundled.launchSpec(options),
    spawn,
    killTree: createProcessTreeKiller(platform)
  }
}

export function createTauriRunner({ pluginId, instanceId, files }) {
  return createApplicationRunner({
    platform: 'tauri',
    executable: 'plugin-runner/cnrp-runner',
    async spawn(spec, channel) {
      const { listen } = await import('@tauri-apps/api/event')
      const listeners = new Map()
      const processHandle = {
        stdin: { writable: true, write: bytes => tauriAPI.pluginRunnerSend(instanceId, bytes) },
        stdout: { on(type, callback) { if (type === 'data') listeners.set(type, callback) } },
        on(type, callback) { listeners.set(type, callback) },
        async kill() { await tauriAPI.pluginRunnerStop(instanceId) }
      }
      processHandle.unlisten = await listen('cyrene-plugin-rpc', event => {
        if (event.payload?.sessionId !== instanceId) return
        if (event.payload.closed) listeners.get('exit')?.(null)
        else listeners.get('data')?.(new Uint8Array(event.payload.bytes))
      })
      const packagePath = await tauriAPI.pluginRunnerStage(pluginId, files)
      const started = await tauriAPI.pluginRunnerStart({ sessionId: instanceId, pluginId, packagePath, entry: spec.args[1], args: spec.args.slice(2) })
      processHandle.pid = started.pid
      processHandle.credentialProof = started.credentialProof
      return processHandle
    }
  })
}

export function createProcessTreeKiller(platform = typeof process === 'undefined' ? 'unknown' : process.platform) {
  return async (reason, processHandle) => {
    if (!processHandle?.pid) return reason
    processHandle.kill?.('SIGTERM')
    if (platform === 'win32') {
      const { execFile } = await loadNodeModule('node:child_process')
      await new Promise(resolve => execFile('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], () => resolve()))
    }
    return reason
  }
}

export function createPrivateCredentialChannel(credential, { fd = 3 } = {}) {
  const value = new TextEncoder().encode(String(credential || ''))
  let closed = false
  return {
    metadata: { kind: 'inherited-fd', fd },
    argv: [],
    env: {},
    stream: { fd, value, close() { closed = true } },
    get closed() { return closed },
    close() { closed = true }
  }
}

export function createNodeRunner({ platform = process.platform, resourcesDir = '', executable = '' } = {}) {
  return {
    platform,
    resourcesDir,
    launchSpec: options => ({
      command: process.execPath,
      args: [executable || pathForRunner(resourcesDir), ...new BundledRunner({ platform, resourcesDir, executable: executable || pathForRunner(resourcesDir) }).launchSpec(options).args],
      env: {}
    }),
    async spawn(spec, channel) {
      const { spawn } = await loadNodeModule('node:child_process')
      const child = spawn(spec.command, spec.args, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: { ...process.env, ...spec.env } })
      child.runnerError = ''
      child.stderr.on('data', chunk => { child.runnerError = `${child.runnerError}${chunk}`.slice(-4096) })
      child.stdio[3].end(channel.channel?.stream?.value || channel.stream?.value || channel.value)
      return child
    },
    killTree: createProcessTreeKiller(platform)
  }
}

function pathForRunner(resourcesDir) { return [resourcesDir, 'runner.mjs'].filter(Boolean).join('/') }
function moduleDirectory() { return decodeURIComponent(import.meta.url.replace(/^file:\/\//, '')).replace(/^\/([A-Za-z]:)/, '$1').replace(/[^/]+$/, '') }

export class PendingRequests {
  constructor({ maxConcurrent = DEFAULT_MAX_CONCURRENT, timeoutMs = DEFAULT_TIMEOUT_MS, onTimeout = null } = {}) {
    this.maxConcurrent = maxConcurrent
    this.timeoutMs = timeoutMs
    this.pending = new Map()
    this.responses = new Map()
    this.onTimeout = onTimeout
  }

  add(requestId, idempotencyKey, cancel = () => {}) {
    if (this.responses.has(idempotencyKey)) {
      const cached = this.responses.get(idempotencyKey)
      return cached.error
        ? Promise.reject(Object.assign(new Error(cached.error.message), { code: cached.error.code }))
        : Promise.resolve(cached.result)
    }
    if (this.pending.size >= this.maxConcurrent) throw Object.assign(new Error('concurrent request limit exceeded'), { code: 'RESOURCE_LIMIT' })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        cancel()
        this.onTimeout?.(requestId)
        reject(Object.assign(new Error('RPC request timeout'), { code: 'TIMEOUT' }))
      }, this.timeoutMs)
      this.pending.set(requestId, { idempotencyKey, resolve, reject, timer, cancel })
    })
  }

  settle(requestId, response) {
    const task = this.pending.get(String(requestId))
    if (!task) throw new Error('unknown or duplicate request ID')
    this.pending.delete(String(requestId))
    clearTimeout(task.timer)
    this.responses.set(task.idempotencyKey, { result: response?.result, error: response?.error })
    response?.error ? task.reject(Object.assign(new Error(response.error.message || response.error), { code: response.error.code })) : task.resolve(response?.result)
  }

  cancelAll(error = new Error('RPC closed')) {
    for (const [requestId, task] of this.pending) {
      clearTimeout(task.timer)
      task.cancel()
      task.reject(error)
      this.pending.delete(requestId)
    }
  }
}

export class DesktopPluginHost {
  constructor({ pluginId, instanceId = id(), transport, runner = {}, packagePath = '', entry = '', args = [], credential: sessionCredential = '', maxConcurrentRequests = DEFAULT_MAX_CONCURRENT, requestTimeoutMs = DEFAULT_TIMEOUT_MS, activationTimeoutMs = 10000, initialize = {}, onTimeout = null, onMessage = null, onRequest = null, heartbeatMs = 15000 } = {}) {
    this.pluginId = pluginId
    this.instanceId = instanceId
    this.transport = transport
    this.runner = runner
    this.onMessage = onMessage
    this.onRequest = onRequest
    this.injectedRunner = Object.keys(runner).length > 0
    this.packagePath = packagePath
    this.entry = entry
    this.args = args
    this.credential = sessionCredential || credential()
    this.initialize = initialize
    this.activationTimeoutMs = activationTimeoutMs
    this.state = 'new'
    this.handshake = null
    this.pending = new PendingRequests({ maxConcurrent: maxConcurrentRequests, timeoutMs: requestTimeoutMs, onTimeout: requestId => { onTimeout?.(requestId); this.fail(new Error('RPC request timeout')) } })
    this.brokerRequests = new Map()
    this.decoder = new RpcFrameDecoder()
    this.seenResponses = new Set()
    this.resources = new Map()
    this.heartbeatMs = heartbeatMs
    this.lastHeartbeat = Date.now()
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
    this.ready.catch(() => {})
  }

  async start() {
    if (this.state !== 'new') return
    this.credentialProof = await sessionProof(this.credential, this.pluginId, this.instanceId)
    this.handshake = new HostRpcHandshake({ pluginId: this.pluginId, instanceId: this.instanceId }, this.credentialProof)
    this.activationTimer = setTimeout(() => this.fail(new Error('plugin activation timeout')), this.activationTimeoutMs)
    if (!this.runner.spawn && !this.injectedRunner && typeof process !== 'undefined' && process.versions?.node) this.runner = createNodeRunner({ platform: process.platform, resourcesDir: moduleDirectory() })
    if (this.runner.required && !this.runner.spawn) throw new Error('application bundled runner is not configured')
    if (!this.runner.spawn && this.injectedRunner) {
      this.state = 'starting'
      this.send({ type: 'hello', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId })
      return
    }
    if (!this.runner.spawn && this.injectedRunner) this.runner.spawn = null
    if (this.runner.spawn) {
      const spec = this.runner.launchSpec
        ? this.runner.launchSpec({ packagePath: this.packagePath, entry: this.entry, args: this.args })
        : new BundledRunner({ platform: this.runner.platform, resourcesDir: this.runner.resourcesDir }).launchSpec({ packagePath: this.packagePath, entry: this.entry, args: this.args })
      const channel = createPrivateCredentialChannel(this.credential)
      this.launch = { ...spec, env: {}, args: [...spec.args] }
      this.process = await this.runner.spawn(spec, { type: 'inherited-private', channel })
      if (this.process.credentialProof) {
        this.credentialProof = this.process.credentialProof
        this.handshake = new HostRpcHandshake({ pluginId: this.pluginId, instanceId: this.instanceId }, this.credentialProof)
      }
      this.process.stdout?.on?.('data', chunk => { try { this.receiveFrame(chunk) } catch (error) { this.fail(error) } })
      this.process.stdin?.on?.('error', error => { if (this.state !== 'closed' && error.code !== 'EPIPE') this.fail(error) })
      this.process.on?.('error', error => this.fail(error))
      this.process.on?.('exit', code => { if (this.state !== 'closed') this.fail(new Error(`runner exited: ${code}${this.process.runnerError ? `: ${this.process.runnerError.trim()}` : ''}`)) })
    }
    this.state = 'starting'
    this.send({ type: 'hello', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId })
  }

  send(message) {
    const envelope = { ...message, protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5' }
    if (this.process?.stdin?.writable) return this.process.stdin.write(encodeRpcFrame(envelope))
    return this.transport?.send?.(envelope)
  }

  receive(message) {
    validateApi15Message(message)
    this.lastHeartbeat = Date.now()
    if (['heartbeat', 'heartbeat.ack', 'event', 'fault'].includes(message?.type)) {
      if (message.pluginId !== this.pluginId || message.instanceId !== this.instanceId || message.role !== 'plugin' || message.api !== '1.5' || message.protocol !== CNRP_JSONRPC_PROTOCOL) throw new Error('stale or invalid plugin instance identity')
      if (message.type === 'heartbeat') return this.send({ type: 'heartbeat.ack', role: 'host', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', pluginId: this.pluginId, instanceId: this.instanceId })
      if (message.type === 'heartbeat.ack') return message
      return this.onMessage?.(message)
    }
    if (message?.type === 'hello.accepted') {
      const response = this.handshake.next(message)
      this.send({ ...response, capabilities: this.initialize })
      this.state = 'accepted'
      return response
    }
    if (message?.type === 'ready') {
      const response = this.handshake.next(message)
      this.state = 'ready'
      clearTimeout(this.activationTimer)
      this.resolveReady(response)
      if (this.heartbeatMs) {
        this.send({ type: 'heartbeat', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId })
        this.heartbeatTimer = setInterval(() => {
          if (Date.now() - this.lastHeartbeat > this.heartbeatMs * 2) return this.fail(new Error('RPC heartbeat lost'))
          this.send({ type: 'heartbeat', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId })
        }, this.heartbeatMs)
      }
      return response
    }
    if (message?.jsonrpc !== '2.0' || message.protocol !== CNRP_JSONRPC_PROTOCOL || !message.id) throw new Error('RPC message protocol is invalid')
    if (message.pluginId !== this.pluginId || message.instanceId !== this.instanceId) throw new Error('stale or invalid plugin instance identity')
    if (message.method) {
      if (message.method === '$/cancelRequest') { this.cancelBrokerRequest(message.params?.requestId); return message }
      const controller = new AbortController()
      this.brokerRequests.set(String(message.id), controller)
      Promise.resolve(this.onRequest?.({ ...message, signal: controller.signal })).then(result => this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: message.id, result })).catch(error => this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: message.id, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || String(error) } })).finally(() => this.brokerRequests.delete(String(message.id)))
      return message
    }
    if (this.seenResponses.has(String(message.id))) throw new Error('unknown or duplicate request ID')
    this.seenResponses.add(String(message.id))
    this.pending.settle(message.id, message)
    return message
  }

  receiveFrame(frame) {
    const messages = this.decoder.push(frame)
    for (const message of messages) this.receive(message)
    return messages
  }

  request(method, params = {}, { idempotencyKey = id() } = {}) {
    if (this.state !== 'ready') throw new Error('RPC runtime is not ready')
    const requestId = id()
    const message = createRpcRequest(method, params, requestId, { pluginId: this.pluginId, instanceId: this.instanceId, idempotencyKey })
    const promise = this.pending.add(requestId, idempotencyKey, () => this.send({ ...message, method: '$/cancelRequest', params: { requestId } }))
    this.send(message)
    return promise
  }

  async fail(error) {
    this.state = 'closed'
    clearInterval(this.heartbeatTimer)
    clearTimeout(this.activationTimer)
    this.rejectReady?.(error)
    this.pending.cancelAll(error)
    for (const controller of this.brokerRequests.values()) controller.abort()
    this.brokerRequests.clear()
    this.resources.clear()
    await this.runner.killTree?.(error.message || String(error), this.process)
  }

  cancelBrokerRequest(requestId) {
    const controller = this.brokerRequests.get(String(requestId))
    if (!controller) return false
    controller.abort()
    return true
  }

  async shutdown() {
    if (this.state === 'closed') return
    try { this.send({ type: 'shutdown', role: 'host', protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5', pluginId: this.pluginId, instanceId: this.instanceId }) } finally {
      clearInterval(this.heartbeatTimer)
      clearTimeout(this.activationTimer)
      this.pending.cancelAll(new Error('RPC closed'))
      for (const controller of this.brokerRequests.values()) controller.abort()
      this.brokerRequests.clear()
      this.resources.clear()
      this.rejectReady?.(new Error('RPC closed'))
      this.state = 'closed'
      await this.runner.killTree?.('shutdown', this.process)
      this.process?.kill?.()
      this.process?.unlisten?.()
    }
  }

  launchFrame(message) { return encodeRpcFrame(message) }

  allocateResource(kind) {
    const resourceId = `${kind}-${id()}`
    this.resources.set(resourceId, { kind, pluginId: this.pluginId })
    return resourceId
  }

  ownsResource(resourceId) { return this.resources.get(String(resourceId))?.pluginId === this.pluginId }

  releaseResource(resourceId) { return this.resources.delete(String(resourceId)) }
}
