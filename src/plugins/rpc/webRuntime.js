import { CNRP_JSONRPC_PROTOCOL, HostRpcHandshake, createRpcRequest, validateApi15Message } from './protocol.js'

const id = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`

export class WebPluginRuntime {
  constructor({ pluginId, instanceId = id(), worker, requiredCapabilities = [], availableCapabilities = {}, maxConcurrentRequests = 32, requestTimeoutMs = 15000, activationTimeoutMs = 10000, heartbeatMs = 0, onRequest = null } = {}) {
    this.pluginId = pluginId
    this.instanceId = instanceId
    this.worker = worker
    this.onRequest = onRequest
    this.requiredCapabilities = requiredCapabilities
    this.capabilities = Object.fromEntries(Object.entries(availableCapabilities).map(([name, available]) => [name, { id: name, available: available === true, code: available === true ? 'AVAILABLE' : 'UNSUPPORTED_PLATFORM' }]))
    this.pending = new Map()
    this.brokerRequests = new Map()
    this.responses = new Map()
    this.seenResponses = new Set()
    this.maxConcurrentRequests = maxConcurrentRequests
    this.requestTimeoutMs = requestTimeoutMs
    this.activationTimeoutMs = activationTimeoutMs
    this.handshake = new HostRpcHandshake({ pluginId, instanceId })
    this.state = 'new'
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
    this.ready.catch(() => {})
    this.worker?.addEventListener?.('message', event => this.receive(event.data))
    this.heartbeatMs = heartbeatMs
  }

  async start() {
    const missing = this.requiredCapabilities.filter(name => !this.capabilities[name]?.available)
    if (missing.length) throw Object.assign(new Error(`required capability unavailable: ${missing.join(', ')}`), { code: 'UNSUPPORTED_PLATFORM' })
    this.send({ type: 'hello', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId })
    this.state = 'starting'
    this.activationTimer = setTimeout(() => {
      this.rejectReady(new Error('plugin activation timeout'))
      this.shutdown()
    }, this.activationTimeoutMs)
  }

  send(message) { this.worker?.postMessage({ ...message, protocol: CNRP_JSONRPC_PROTOCOL, api: '1.5' }) }

  receive(message) {
    validateApi15Message(message)
    if (this.heartbeatMs && this.state !== 'closed') {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = setTimeout(() => this.shutdown(), this.heartbeatMs)
    }
    if (message?.type === 'hello.accepted') {
      const response = this.handshake.next(message)
      this.send({ ...response, capabilities: this.capabilities })
      this.state = 'accepted'
      return response
    }
    if (message?.type === 'ready') {
      const response = this.handshake.next(message)
      this.state = 'ready'
      clearTimeout(this.activationTimer)
      this.resolveReady(response)
      if (this.heartbeatMs) this.heartbeatTimer = setTimeout(() => this.shutdown(), this.heartbeatMs)
      return message
    }
    if (message?.jsonrpc === '2.0' && (message.pluginId !== this.pluginId || message.instanceId !== this.instanceId)) throw new Error('stale or invalid plugin instance identity')
    if (message?.method) {
      if (message.method === '$/cancelRequest') { this.cancelBrokerRequest(message.params?.requestId); return message }
      const controller = new AbortController()
      this.brokerRequests.set(String(message.id), controller)
      Promise.resolve(this.onRequest?.({ ...message, signal: controller.signal })).then(result => this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: message.id, result })).catch(error => this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: message.id, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || String(error) } })).finally(() => this.brokerRequests.delete(String(message.id)))
      return message
    }
    const task = this.pending.get(String(message?.id))
    if (!task) throw new Error(this.seenResponses.has(String(message?.id)) ? 'unknown or duplicate request ID' : 'unknown request ID')
    this.pending.delete(String(message.id))
    this.seenResponses.add(String(message.id))
    clearTimeout(task.timer)
    this.responses.set(task.idempotencyKey, message)
    message.error ? task.reject(Object.assign(new Error(message.error.message || message.error), { code: message.error.code })) : task.resolve(message.result)
    return message
  }

  call(method, params = {}) {
    if (this.state !== 'ready') return Promise.reject(new Error('RPC runtime is not ready'))
    if (method.includes(':') && !this.capabilities[method]?.available) return Promise.reject(new Error('UNSUPPORTED_PLATFORM'))
    if (this.pending.size >= this.maxConcurrentRequests) return Promise.reject(Object.assign(new Error('concurrent request limit exceeded'), { code: 'RESOURCE_LIMIT' }))
    const idempotencyKey = params?.idempotencyKey || id()
    if (this.responses.has(idempotencyKey)) {
      const response = this.responses.get(idempotencyKey)
      return response.error ? Promise.reject(Object.assign(new Error(response.error.message || response.error), { code: response.error.code })) : Promise.resolve(response.result)
    }
    const request = createRpcRequest(method, params, id(), { pluginId: this.pluginId, instanceId: this.instanceId, idempotencyKey })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: id(), method: '$/cancelRequest', params: { requestId: request.id } })
        reject(Object.assign(new Error('RPC request timeout'), { code: 'TIMEOUT' }))
      }, this.requestTimeoutMs)
      this.pending.set(request.id, { resolve, reject, timer, idempotencyKey })
      this.send(request)
    })
  }

  cancel(requestId) {
    const task = this.pending.get(String(requestId))
    if (!task) return false
    clearTimeout(task.timer)
    this.pending.delete(String(requestId))
    this.send({ jsonrpc: '2.0', pluginId: this.pluginId, instanceId: this.instanceId, id: id(), method: '$/cancelRequest', params: { requestId } })
    task.reject(Object.assign(new Error('RPC request cancelled'), { code: 'CANCELLED' }))
    return true
  }

  cancelBrokerRequest(requestId) {
    const controller = this.brokerRequests.get(String(requestId))
    if (!controller) return false
    controller.abort()
    return true
  }

  async shutdown() {
    try { this.send({ type: 'shutdown', role: 'host', pluginId: this.pluginId, instanceId: this.instanceId }) } finally {
      clearTimeout(this.heartbeatTimer)
      clearTimeout(this.activationTimer)
      for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('RPC closed')) }
      this.rejectReady?.(new Error('RPC closed'))
      this.pending.clear()
      for (const controller of this.brokerRequests.values()) controller.abort()
      this.brokerRequests.clear()
      this.worker?.terminate?.()
      this.state = 'closed'
    }
  }
}
