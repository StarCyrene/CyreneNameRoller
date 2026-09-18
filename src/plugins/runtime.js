import { decodePluginFile } from './package'
import { resolvePlatformEntry } from './platform'
import { PLUGIN_API_VERSION } from './constants'
import {
  assertActivePrincipal,
  createLegacyPrincipal,
  createPluginPrincipal,
  describePrincipal,
  hasPrincipalPermission,
  revokePrincipal
} from './ui/principal.js'
import { listComponentTargets } from './ui/componentRegistry.js'
import { NATIVE_VIEW_SLOTS } from './ui/nativeViewPolicy.js'

const RESERVED_NATIVE_VIEW_SLOTS = Object.freeze([
  'slot:app.command-palette',
  'slot:roller.toolbar',
  'slot:card.footer',
  'slot:lottery.side-panel',
  'slot:statistics.section',
  'slot:settings.plugin-section'
])

function dataUrlFromBase64(base64, mime = 'application/octet-stream') {
  return `data:${mime};base64,${base64}`
}

function mimeFor(path) {
  const extension = String(path).split('.').pop()?.toLowerCase()
  return {
    html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2'
  }[extension] || 'application/octet-stream'
}

function storageKey(value) {
  const key = String(value || 'default')
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) {
    throw new Error('插件存储键无效')
  }
  return key
}

function transferableValue(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function runtimeError(code, message, details) {
  const error = new Error(message)
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

function isDrawEvent(event) {
  return /^(draw|roller|card|lottery):/.test(String(event || ''))
}

function canReceiveEvent(plugin, event) {
  if (isDrawEvent(event)) return plugin?.manifest.permissions.includes('events:draw')
  return plugin?.manifest.permissions.includes('events:lifecycle')
}

const RUNTIME_DEACTIVATE_GRACE_MS = 250
const RUNTIME_COMMAND_TIMEOUT_MS = 15000
const RUNTIME_CONTRIBUTION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/
const HOST_RESOURCES = Object.freeze({
  names: { permission: 'names:read', access: 'read-only', description: 'Lists, people and groups snapshot' },
  records: { permission: 'records:read', access: 'read-only', description: 'Immutable draw history snapshot' },
  statistics: { permission: 'statistics:read', access: 'read-only', description: 'Draw count and total snapshot' },
  balance: { permission: 'balance:read', access: 'read-only', description: 'CAF status and public parameters snapshot' }
})
const HOST_TRANSACTIONS = Object.freeze({
  draw: { permission: 'draw:execute', mode: 'host-owned', appendOnly: true, description: 'CAF draw with atomic statistics and history append' }
})

function visualCancellationError() {
  const error = new Error('插件视觉层激活已取消')
  error.name = 'AbortError'
  return error
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export class PluginRuntime {
  constructor({ getPlugin, savePluginData, loadPluginData, showBanner, getCoreSnapshot, executeCoreDraw, selectFile, playAudio, platformBridge, onFault }) {
    this.getPlugin = getPlugin
    this.savePluginData = savePluginData
    this.loadPluginData = loadPluginData
    this.showBanner = showBanner
    this.getCoreSnapshot = getCoreSnapshot
    this.executeCoreDraw = executeCoreDraw
    this.selectFile = selectFile
    this.playAudio = playAudio
    this.platformBridge = platformBridge
    this.onFault = onFault
    this.workers = new Map()
    this.frames = new Map()
    this.pages = new Map()
    this.commands = new Map()
    this.visualSurfaces = new Map()
    this.visualRuntimes = new Map()
    this.principals = new Map()
    this.legacyPrincipals = new Map()
    this.deactivatingPlugins = new Set()
    this.lifecycleSnapshots = new Map()
  }

  createPrincipal(plugin, kind, contributionId, instanceId = '') {
    const principal = createPluginPrincipal({
      pluginId: plugin.manifest.id,
      instanceId: instanceId || `${kind}:${plugin.manifest.id}:${contributionId}`,
      kind,
      contributionId,
      grants: plugin.manifest.permissions || [],
      platform: this.platformBridge.info()?.runtime
    })
    this.principals.set(principal.instanceId, principal)
    return principal
  }

  getLegacyPrincipal(plugin) {
    const pluginId = plugin?.manifest?.id
    if (!pluginId) return null
    const existing = this.legacyPrincipals.get(pluginId)
    if (existing?.active) return existing
    const principal = createLegacyPrincipal(plugin, this.platformBridge.info()?.runtime)
    this.legacyPrincipals.set(pluginId, principal)
    this.principals.set(principal.instanceId, principal)
    return principal
  }

  revokePluginPrincipals(pluginId) {
    for (const [instanceId, principal] of this.principals) {
      if (principal.pluginId !== pluginId) continue
      revokePrincipal(principal)
      this.principals.delete(instanceId)
    }
    this.legacyPrincipals.delete(pluginId)
  }

  principalForFrame(pluginId, pageId) {
    const record = this.frames.get(`${pluginId}:${pageId}`)
    return record?.principal || null
  }

  isApi13Plugin(plugin) {
    const minimum = String(plugin?.manifest?.engine?.min || '0').split('.').map(Number)
    return (minimum[0] || 0) > 1 || ((minimum[0] || 0) === 1 && (minimum[1] || 0) >= 3)
  }

  describeHost(plugin, principal = null) {
    const granted = new Set(plugin?.manifest?.permissions || [])
    const describe = ([id, definition]) => ({ id, ...definition, available: granted.has(definition.permission) })
    const platform = this.platformBridge.info()
    const componentTargets = listComponentTargets(platform.runtime).map(({ id, platform: targetPlatform, available, visibilityPolicy, allowedStyles, allowPluginFonts }) => ({
      id,
      platform: targetPlatform,
      available,
      visibilityPolicy,
      allowedStyles: [...allowedStyles],
      ...(allowPluginFonts === true ? { allowPluginFonts: true } : {})
    }))
    const slots = [
      ...NATIVE_VIEW_SLOTS.map(id => ({ id, available: true, platform: platform.runtime })),
      ...RESERVED_NATIVE_VIEW_SLOTS.map(id => ({ id, available: false, platform: platform.runtime }))
    ]
    return {
      schemaVersion: 1,
      apiVersion: PLUGIN_API_VERSION,
      principal: describePrincipal(principal),
      platform: platform.runtime,
      security: { runtime: platform.runtime === 'tauri' ? 'backend-authoritative' : 'plugin-isolated' },
      componentTargets,
      slots,
      model: 'product-freedom-core-hosted',
      resources: Object.entries(HOST_RESOURCES).map(describe),
      transactions: Object.entries(HOST_TRANSACTIONS).map(describe),
      contributions: ['pages', 'commands', 'animationPacks', 'visualSurfaces', 'appearancePacks', 'fonts', 'nativeViews', 'componentStylePacks', 'componentOverridePacks', 'resultPresentations'],
      extensionPoints: {
        pages: { ownership: 'plugin', surface: 'isolated-document', locations: ['plugins', 'dock'] },
        commands: { ownership: 'plugin', invocation: 'host-brokered', locations: ['command-palette', 'page-header', 'context-menu'] },
        animationPacks: { ownership: 'host', execution: ['gsap', 'waapi'], input: 'declarative' },
        visualSurfaces: { ownership: 'plugin', surface: 'offscreen-canvas', placement: ['background'] },
        appearancePacks: { ownership: 'host', input: 'semantic-tokens', modes: ['light', 'dark'] },
        fonts: { ownership: 'host', input: 'validated-woff2', namespace: 'plugin:<pluginId>/<fontId>' },
        nativeViews: { ownership: 'host', input: 'declarative-schema', slots: ['slot:roller.side-panel', 'slot:roller.below-result', 'slot:records.toolbar'] },
        componentStylePacks: { ownership: 'host', input: 'stable-component-ids', properties: ['size', 'scale', 'foreground', 'background', 'accent', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'gap', 'radius', 'borderColor', 'borderWidth', 'shadow', 'alignment', 'density'] },
        componentOverridePacks: { ownership: 'host', input: 'stable-component-ids', visibility: ['visible', 'hidden', 'replaced'] },
        resultPresentations: { ownership: 'host', input: 'verified-receipt-context' }
      },
      guarantees: {
        existingRecordsImmutable: true,
        statisticsImmutable: true,
        balanceParametersImmutable: true,
        resultSelectionHostOwned: true
      }
    }
  }

  registerPages(plugin) {
    const ids = new Set()
    const pages = []
    for (const page of plugin.manifest.contributes?.pages || []) {
      if (!RUNTIME_CONTRIBUTION_ID_PATTERN.test(page.id || '') || ids.has(page.id)) throw new Error(`插件页面 ID 无效或重复：${page.id || '空'}`)
      ids.add(page.id)
      const entry = resolvePlatformEntry(page, this.platformBridge.info())
      if (!entry && !page.native) continue
      pages.push([`${plugin.manifest.id}:${page.id}`, { pluginId: plugin.manifest.id, ...page, entry: entry || '' }])
    }
    for (const [key, page] of pages) this.pages.set(key, page)
  }

  unregisterPages(pluginId) {
    for (const [key, page] of this.pages) if (page.pluginId === pluginId) this.pages.delete(key)
  }

  unregisterFrames(pluginId) {
    for (const key of [...this.frames.keys()]) {
      if (key.startsWith(`${pluginId}:`)) this.unmountFrame(...key.split(':'))
    }
  }

  getContributedPages() {
    return [...this.pages.values()]
  }

  registerCommands(plugin) {
    const ids = new Set()
    const commands = []
    for (const command of plugin.manifest.contributes?.commands || []) {
      if (!RUNTIME_CONTRIBUTION_ID_PATTERN.test(command.id || '') || ids.has(command.id)) {
        throw new Error(`插件命令 ID 无效或重复：${command.id || '空'}`)
      }
      ids.add(command.id)
      commands.push([`${plugin.manifest.id}:${command.id}`, { pluginId: plugin.manifest.id, ...command }])
    }
    for (const [key, command] of commands) this.commands.set(key, command)
  }

  unregisterCommands(pluginId) {
    for (const [key, command] of this.commands) if (command.pluginId === pluginId) this.commands.delete(key)
  }

  getContributedCommands() {
    return [...this.commands.values()]
  }

  registerVisualSurfaces(plugin) {
    const ids = new Set()
    const surfaces = []
    for (const surface of plugin.manifest.contributes?.visualSurfaces || []) {
      if (!RUNTIME_CONTRIBUTION_ID_PATTERN.test(surface.id || '') || ids.has(surface.id)) throw new Error(`插件视觉层 ID 无效或重复：${surface.id || '空'}`)
      ids.add(surface.id)
      const entry = resolvePlatformEntry(surface, this.platformBridge.info())
      if (!entry || surface.defaultEnabled === false) continue
      surfaces.push([`${plugin.manifest.id}:${surface.id}`, { pluginId: plugin.manifest.id, ...surface, entry }])
    }
    for (const [key, surface] of surfaces) this.visualSurfaces.set(key, surface)
  }

  unregisterVisualSurfaces(pluginId) {
    for (const [key, surface] of this.visualSurfaces) if (surface.pluginId === pluginId) this.visualSurfaces.delete(key)
  }

  getContributedVisualSurfaces() {
    return [...this.visualSurfaces.values()]
  }

  finalizeVisualRuntime(key, runtime) {
    if (!runtime || runtime.finalized) return
    runtime.finalized = true
    if (runtime.resizeHandle !== null) {
      if (runtime.resizeHandleType === 'frame' && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(runtime.resizeHandle)
      else clearTimeout(runtime.resizeHandle)
    }
    runtime.resizeHandle = null
    runtime.pendingViewport = null
    try { runtime.worker.terminate() } catch {}
    revokePrincipal(runtime.principal)
    this.principals.delete(runtime.principal?.instanceId)
    if (runtime.workerUrl) URL.revokeObjectURL(runtime.workerUrl)
    if (this.visualRuntimes.get(key) === runtime) this.visualRuntimes.delete(key)
  }

  reportVisualRuntimeFailure(key, runtime, error) {
    if (!runtime || runtime.finalized) return
    runtime.rejectActivation?.(error)
    this.finalizeVisualRuntime(key, runtime)
    try {
      runtime.hostCanvas?.dispatchEvent(new CustomEvent('cyrene-visual-surface-error', {
        detail: { pluginId: runtime.pluginId, surfaceId: runtime.surfaceId, message: error.message || String(error) }
      }))
    } catch {}
  }

  async activate(plugin) {
    const compatibility = this.platformBridge.compatibility(plugin.manifest)
    if (!compatibility.compatible) throw new Error(compatibility.reason)
    const existingRuntime = this.workers.get(plugin.manifest.id)
    if (existingRuntime) return existingRuntime.activated
    const entry = resolvePlatformEntry(plugin.manifest, compatibility.platform)
    if (!entry) {
      try {
        this.registerPages(plugin)
        this.registerVisualSurfaces(plugin)
        return
      } catch (error) {
      this.unregisterPages(plugin.manifest.id)
      this.unregisterCommands(plugin.manifest.id)
      this.unregisterVisualSurfaces(plugin.manifest.id)
      throw error
      }
    }
    const source = decodePluginFile(plugin, entry)
    const workerSource = `
      'use strict';
      for (const key of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'importScripts', 'Worker', 'SharedWorker']) {
        try { Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false }); } catch {}
      }
      ${source}
      const pending = new Map();
      let pluginModule = null;
      let activeCommandId = null;
      const freezePayload = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.freeze(value);
        for (const child of Object.values(value)) freezePayload(child);
        return value;
      };
      const request = (method, args = {}) => new Promise((resolve, reject) => {
        const id = (crypto.randomUUID && crypto.randomUUID()) || ('rpc-' + Date.now() + '-' + Math.random());
        pending.set(id, { resolve, reject });
        self.postMessage({ type: 'rpc-request', id, method, args, commandId: activeCommandId });
      });
      self.onmessage = async event => {
        const message = event.data || {};
        try {
          if (message.type === 'activate') {
            pluginModule = self.CyrenePluginModule || self.cyrenePlugin;
            if (!pluginModule || typeof pluginModule.activate !== 'function') throw new Error('插件未导出 cyrenePlugin.activate');
            await pluginModule.activate(Object.freeze({ ...message.context, request }));
            self.postMessage({ type: 'activated' });
          } else if (message.type === 'event' && pluginModule?.onEvent) {
            await pluginModule.onEvent(message.event, freezePayload(message.payload));
          } else if (message.type === 'command') {
            if (typeof pluginModule?.onCommand !== 'function') throw new Error('插件未实现 onCommand()');
            activeCommandId = message.id;
            try {
              const result = await pluginModule.onCommand(message.commandId, freezePayload(message.args || {}));
              self.postMessage({ type: 'command-result', id: message.id, result });
            } catch (error) {
              self.postMessage({ type: 'command-result', id: message.id, error: String(error?.message || error) });
            } finally { activeCommandId = null; }
          } else if (message.type === 'deactivate') {
            await pluginModule?.deactivate?.();
            self.postMessage({ type: 'deactivated' });
          } else if (message.type === 'rpc-response') {
            const task = pending.get(message.id);
            if (!task) return;
            pending.delete(message.id);
            message.error ? task.reject(Object.assign(new Error(message.error), { code: message.code })) : task.resolve(message.result);
          }
        } catch (error) {
          self.postMessage({ type: 'host-error', error: String(error?.stack || error) });
        }
      };
    `
    const workerPrincipal = this.createPrincipal(plugin, 'worker', 'worker', `worker:${plugin.manifest.id}`)
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    let activatedResolve
    let activatedReject
    let activationComplete = false
    const activated = new Promise((resolve, reject) => { activatedResolve = resolve; activatedReject = reject })
    let deactivatedResolve
    const deactivated = new Promise(resolve => { deactivatedResolve = resolve })
    const timeout = setTimeout(() => activatedReject(new Error(`${plugin.manifest.name} 激活超时`)), 10000)
    worker.onmessage = async event => {
      const message = event.data || {}
      if (message.type === 'rpc-request') {
        try {
          const commandPrincipal = message.commandId
            ? this.workers.get(plugin.manifest.id)?.commandRequests?.get(message.commandId)?.principal
            : null
          const result = await this.handleRpc(commandPrincipal || workerPrincipal, message.method, message.args)
          worker.postMessage({ type: 'rpc-response', id: message.id, result: transferableValue(result) })
        } catch (error) {
          worker.postMessage({ type: 'rpc-response', id: message.id, code: error.code, error: error.message || String(error) })
        }
      } else if (message.type === 'activated') activatedResolve()
      else if (message.type === 'deactivated') deactivatedResolve()
      else if (message.type === 'command-result') {
        const task = commandRequests.get(message.id)
        if (!task) return
        commandRequests.delete(message.id)
        clearTimeout(task.timeout)
        revokePrincipal(task.principal)
        this.principals.delete(task.principal.instanceId)
        message.error ? task.reject(new Error(message.error)) : task.resolve(transferableValue(message.result))
      }
      else if (message.type === 'host-error') {
        const error = new Error(message.error || '插件 Worker 执行失败')
        revokePrincipal(workerPrincipal)
        if (activationComplete) this.onFault?.(plugin.manifest.id, error)
        else activatedReject(error)
      }
    }
    worker.onerror = event => {
      const error = new Error(event.message || '插件 Worker 崩溃')
      revokePrincipal(workerPrincipal)
      if (activationComplete) this.onFault?.(plugin.manifest.id, error)
      else activatedReject(error)
    }
    const context = {
      plugin: { id: plugin.manifest.id, version: plugin.manifest.version },
      principal: describePrincipal(workerPrincipal),
      permissions: transferableValue(plugin.manifest.permissions || []),
      platform: transferableValue(this.platformBridge.info()),
      capabilities: transferableValue(this.platformBridge.capabilities()),
      host: transferableValue(this.describeHost(plugin, workerPrincipal)),
      request: true
    }
    const commandRequests = new Map()
    this.workers.set(plugin.manifest.id, { worker, workerUrl, activated, deactivated, commandRequests, principal: workerPrincipal })
    worker.postMessage({ type: 'activate', context })
    try {
      await activated
      activationComplete = true
      this.registerPages(plugin)
      this.registerCommands(plugin)
      this.registerVisualSurfaces(plugin)
    } catch (error) {
      worker.terminate()
      revokePrincipal(workerPrincipal)
      this.principals.delete(workerPrincipal.instanceId)
      URL.revokeObjectURL(workerUrl)
      this.workers.delete(plugin.manifest.id)
      this.unregisterPages(plugin.manifest.id)
      this.unregisterCommands(plugin.manifest.id)
      this.unregisterVisualSurfaces(plugin.manifest.id)
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async deactivate(pluginId) {
    this.deactivatingPlugins.add(pluginId)
    try {
      const runtime = this.workers.get(pluginId)
      if (runtime) {
        for (const task of runtime.commandRequests?.values() || []) {
          clearTimeout(task.timeout)
          revokePrincipal(task.principal)
          this.principals.delete(task.principal?.instanceId)
          task.reject(new Error('插件已停止，命令已取消'))
        }
        runtime.commandRequests?.clear()
        try { runtime.worker.postMessage({ type: 'deactivate' }) } catch {}
        await Promise.race([runtime.deactivated, wait(RUNTIME_DEACTIVATE_GRACE_MS)])
        runtime.worker.terminate()
        revokePrincipal(runtime.principal)
        this.principals.delete(runtime.principal?.instanceId)
        if (runtime.workerUrl) URL.revokeObjectURL(runtime.workerUrl)
        this.workers.delete(pluginId)
      }
      this.unregisterPages(pluginId)
      this.unregisterCommands(pluginId)
      this.unregisterFrames(pluginId)
      await Promise.all([...this.visualRuntimes.keys()]
        .filter(key => key.startsWith(`${pluginId}:`))
        .map(key => this.unmountVisualSurface(...key.split(':'))))
      this.unregisterVisualSurfaces(pluginId)
      this.revokePluginPrincipals(pluginId)
    } finally {
      this.deactivatingPlugins.delete(pluginId)
    }
  }

  async dispatch(event, payload) {
    const transferredPayload = transferableValue(payload)
    if (String(event || '').startsWith('app:')) this.lifecycleSnapshots.set(event, transferredPayload)
    for (const [pluginId, runtime] of this.workers) {
      const plugin = this.getPlugin(pluginId)
      if (!canReceiveEvent(plugin, event)) continue
      try { runtime.worker.postMessage({ type: 'event', event, payload: transferredPayload }) } catch {}
    }
    for (const [key, frame] of this.frames) {
      const pluginId = key.split(':')[0]
      const plugin = this.getPlugin(pluginId)
      if (!canReceiveEvent(plugin, event)) continue
      try { this.postFrameMessage(frame, { type: 'event', event, payload: transferredPayload }) } catch {}
    }
    for (const [key, runtime] of this.visualRuntimes) {
      if (!runtime.activationComplete || runtime.cancelled || runtime.finalized) continue
      const pluginId = key.split(':')[0]
      const plugin = this.getPlugin(pluginId)
      const surface = this.visualSurfaces.get(key)
      if (!canReceiveEvent(plugin, event) || (surface?.events?.length && !surface.events.includes(event))) continue
      try { runtime.worker.postMessage({ type: 'event', event, payload: transferredPayload }) } catch {}
    }
  }

  invokeCommand(pluginId, commandId, args = {}) {
    const plugin = this.getPlugin(pluginId)
    if (!plugin || plugin.enabled === false || this.deactivatingPlugins.has(pluginId)) throw new Error('插件不存在或已禁用')
    const command = this.commands.get(`${pluginId}:${commandId}`)
    if (!command) throw new Error('插件命令不存在或尚未启用')
    const runtime = this.workers.get(pluginId)
    if (!runtime) throw new Error('插件命令需要可用的 Worker 入口')
    const id = globalThis.crypto?.randomUUID?.() || `command-${Date.now()}-${Math.random()}`
    const principal = this.createPrincipal(plugin, 'command', commandId, `command:${pluginId}:${id}`)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        runtime.commandRequests.delete(id)
        revokePrincipal(principal)
        this.principals.delete(principal.instanceId)
        reject(new Error(`插件命令执行超时：${command.title}`))
      }, RUNTIME_COMMAND_TIMEOUT_MS)
      runtime.commandRequests.set(id, { resolve, reject, timeout, principal })
      try {
        runtime.worker.postMessage({ type: 'command', id, commandId, args: transferableValue(args) })
      } catch (error) {
        clearTimeout(timeout)
        runtime.commandRequests.delete(id)
        revokePrincipal(principal)
        this.principals.delete(principal.instanceId)
        reject(error)
      }
    })
  }

  replayLifecycleEventsToVisualRuntime(key, runtime) {
    const plugin = this.getPlugin(runtime?.pluginId)
    const surface = this.visualSurfaces.get(key)
    if (!runtime?.activationComplete || runtime.cancelled || runtime.finalized || !canReceiveEvent(plugin, 'app:ready')) return 0
    let replayed = 0
    for (const [event, payload] of this.lifecycleSnapshots) {
      if (surface?.events?.length && !surface.events.includes(event)) continue
      try {
        runtime.worker.postMessage({ type: 'event', event, payload: transferableValue(payload) })
        replayed += 1
      } catch (error) {
        this.reportVisualRuntimeFailure(key, runtime, error)
        break
      }
    }
    return replayed
  }

  async mountVisualSurface(canvas, pluginId, surfaceId, viewport = {}) {
    const key = `${pluginId}:${surfaceId}`
    const plugin = this.getPlugin(pluginId)
    const surface = this.visualSurfaces.get(key)
    if (!plugin || !surface) throw new Error('插件视觉层不存在或尚未启用')
    if (!plugin.manifest.permissions.includes('ui:visual-surfaces')) throw new Error('插件未获授权：ui:visual-surfaces')
    if (!canvas?.transferControlToOffscreen) throw new Error('当前环境不支持插件 Canvas 视觉层')
    await this.unmountVisualSurface(pluginId, surfaceId)
    const visualPrincipal = this.createPrincipal(plugin, 'visual', surfaceId, `visual:${pluginId}:${surfaceId}`)
    const source = decodePluginFile(plugin, surface.entry)
    const workerSource = `
      'use strict';
      for (const key of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'importScripts', 'Worker', 'SharedWorker']) {
        try { Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false }); } catch {}
      }
      ${source}
      const pending = new Map();
      let visualModule = null;
      let canvas = null;
      let activationPromise = null;
      let deactivateRequested = false;
      let deactivated = false;
      let pendingViewport = null;
      let resizePromise = null;
      const freezePayload = value => {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.freeze(value);
        for (const child of Object.values(value)) freezePayload(child);
        return value;
      };
      const request = (method, args = {}) => new Promise((resolve, reject) => {
        const id = (crypto.randomUUID && crypto.randomUUID()) || ('rpc-' + Date.now() + '-' + Math.random());
        pending.set(id, { resolve, reject });
        self.postMessage({ type: 'rpc-request', id, method, args });
      });
      const applyResize = async viewport => {
        if (!canvas) return;
        const dpr = Math.max(1, Math.min(3, Number(viewport.dpr) || 1));
        canvas.width = Math.max(1, Math.round((Number(viewport.width) || 1) * dpr));
        canvas.height = Math.max(1, Math.round((Number(viewport.height) || 1) * dpr));
        await visualModule?.onResize?.(Object.freeze({ ...viewport, dpr, pixelWidth: canvas.width, pixelHeight: canvas.height }));
      };
      const queueResize = viewport => {
        pendingViewport = viewport;
        if (resizePromise) return resizePromise;
        resizePromise = (async () => {
          while (pendingViewport) {
            const next = pendingViewport;
            pendingViewport = null;
            await applyResize(next);
          }
        })().finally(() => { resizePromise = null; });
        return resizePromise;
      };
      const deactivateVisual = async () => {
        if (deactivated) return;
        deactivated = true;
        try { await visualModule?.deactivate?.(); }
        finally { self.postMessage({ type: 'deactivated' }); }
      };
      self.onmessage = async event => {
        const message = event.data || {};
        try {
          if (message.type === 'activate') {
            activationPromise = (async () => {
              visualModule = self.CyreneVisualSurfaceModule || self.cyreneVisualSurface;
              if (!visualModule || typeof visualModule.activate !== 'function') throw new Error('视觉层未导出 defineVisualSurface() 模块');
              canvas = message.canvas;
              await visualModule.activate(Object.freeze({ ...message.context, canvas, request }));
              if (deactivateRequested) return;
              await queueResize(message.viewport || {});
            })();
            await activationPromise;
            if (deactivateRequested) await deactivateVisual();
            else self.postMessage({ type: 'activated' });
          } else if (message.type === 'resize') {
            if (!deactivateRequested) await queueResize(message.viewport || {});
          } else if (message.type === 'event' && visualModule?.onEvent) {
            if (!deactivateRequested) await visualModule.onEvent(message.event, freezePayload(message.payload));
          } else if (message.type === 'deactivate') {
            deactivateRequested = true;
            if (activationPromise) {
              try { await activationPromise; } catch {}
            }
            await deactivateVisual();
          } else if (message.type === 'rpc-response') {
            const task = pending.get(message.id);
            if (!task) return;
            pending.delete(message.id);
            message.error ? task.reject(Object.assign(new Error(message.error), { code: message.code })) : task.resolve(message.result);
          }
        } catch (error) {
          self.postMessage({ type: 'host-error', error: String(error?.stack || error) });
          if (deactivateRequested) await deactivateVisual();
        }
      };
    `
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    let resolveActivation
    let rejectActivation
    let activationComplete = false
    const activated = new Promise((resolve, reject) => { resolveActivation = resolve; rejectActivation = reject })
    let resolveDeactivated
    const deactivated = new Promise(resolve => { resolveDeactivated = resolve })
    const timeout = setTimeout(() => rejectActivation(new Error(`${plugin.manifest.name} 视觉层激活超时`)), 10000)
    const runtime = {
      worker, workerUrl, pluginId, surfaceId, hostCanvas: canvas,
      principal: visualPrincipal,
      rejectActivation, deactivated, resolveDeactivated,
      activationComplete: false, cancelled: false, finalized: false,
      pendingViewport: null, resizeHandle: null, resizeHandleType: ''
    }
    worker.onmessage = async event => {
      const message = event.data || {}
      if (message.type === 'rpc-request') {
        try {
          const result = await this.handleRpc(visualPrincipal, message.method, message.args)
          worker.postMessage({ type: 'rpc-response', id: message.id, result: transferableValue(result) })
        } catch (error) {
          worker.postMessage({ type: 'rpc-response', id: message.id, code: error.code, error: error.message || String(error) })
        }
      } else if (message.type === 'activated') {
        if (runtime.cancelled) rejectActivation(visualCancellationError())
        else resolveActivation()
      } else if (message.type === 'deactivated') resolveDeactivated()
      else if (message.type === 'host-error') {
        const error = new Error(message.error || '插件视觉层执行失败')
        if (activationComplete) this.reportVisualRuntimeFailure(key, runtime, error)
        else rejectActivation(error)
      }
    }
    worker.onerror = event => {
      const error = new Error(event.message || '插件视觉层崩溃')
      if (activationComplete) this.reportVisualRuntimeFailure(key, runtime, error)
      else rejectActivation(error)
    }
    const offscreen = canvas.transferControlToOffscreen()
    this.visualRuntimes.set(key, runtime)
    worker.postMessage({
      type: 'activate',
      canvas: offscreen,
      viewport: transferableValue(viewport),
      context: {
        plugin: { id: plugin.manifest.id, version: plugin.manifest.version },
        principal: describePrincipal(visualPrincipal),
        surface: { id: surface.id, placement: surface.placement },
        permissions: transferableValue(plugin.manifest.permissions || []),
        platform: transferableValue(this.platformBridge.info()),
        capabilities: transferableValue(this.platformBridge.capabilities())
      }
    }, [offscreen])
    try {
      await activated
      if (runtime.cancelled || this.visualRuntimes.get(key) !== runtime) throw visualCancellationError()
      activationComplete = true
      runtime.activationComplete = true
      this.replayLifecycleEventsToVisualRuntime(key, runtime)
      return true
    } catch (error) {
      await this.unmountVisualSurface(pluginId, surfaceId)
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  resizeVisualSurface(pluginId, surfaceId, viewport) {
    const runtime = this.visualRuntimes.get(`${pluginId}:${surfaceId}`)
    if (!runtime || runtime.cancelled || runtime.finalized || !runtime.activationComplete) return false
    runtime.pendingViewport = transferableValue(viewport)
    if (runtime.resizeHandle !== null) return true
    const flush = () => {
      runtime.resizeHandle = null
      runtime.resizeHandleType = ''
      if (runtime.cancelled || runtime.finalized || !runtime.pendingViewport) return
      const next = runtime.pendingViewport
      runtime.pendingViewport = null
      try { runtime.worker.postMessage({ type: 'resize', viewport: next }) }
      catch (error) { this.reportVisualRuntimeFailure(`${pluginId}:${surfaceId}`, runtime, error) }
    }
    if (typeof requestAnimationFrame === 'function') {
      runtime.resizeHandleType = 'frame'
      runtime.resizeHandle = requestAnimationFrame(flush)
    } else {
      runtime.resizeHandleType = 'timeout'
      runtime.resizeHandle = setTimeout(flush, 16)
    }
    return true
  }

  async unmountVisualSurface(pluginId, surfaceId) {
    const key = `${pluginId}:${surfaceId}`
    const runtime = this.visualRuntimes.get(key)
    if (!runtime) return
    if (runtime.cleanupPromise) return runtime.cleanupPromise
    runtime.cancelled = true
    runtime.rejectActivation?.(visualCancellationError())
    runtime.cleanupPromise = (async () => {
      try { runtime.worker.postMessage({ type: 'deactivate' }) } catch {}
      await Promise.race([runtime.deactivated, wait(RUNTIME_DEACTIVATE_GRACE_MS)])
      this.finalizeVisualRuntime(key, runtime)
    })()
    return runtime.cleanupPromise
  }

  dispatchForPlugin(pluginId, event, payload) {
    const plugin = this.getPlugin(pluginId)
    if (!canReceiveEvent(plugin, event)) return
    const transferredPayload = transferableValue(payload)
    const worker = this.workers.get(pluginId)
    try { worker?.worker.postMessage({ type: 'event', event, payload: transferredPayload }) } catch {}
    for (const [key, frame] of this.frames) {
      if (!key.startsWith(`${pluginId}:`)) continue
      try { this.postFrameMessage(frame, { type: 'event', event, payload: transferredPayload }) } catch {}
    }
    for (const [key, runtime] of this.visualRuntimes) {
      if (!key.startsWith(`${pluginId}:`)) continue
      if (!runtime.activationComplete || runtime.cancelled || runtime.finalized) continue
      const surface = this.visualSurfaces.get(key)
      if (surface?.events?.length && !surface.events.includes(event)) continue
      try { runtime.worker.postMessage({ type: 'event', event, payload: transferredPayload }) } catch {}
    }
  }

  async handleRpc(pluginId, method, args = {}) {
    if (pluginId && typeof pluginId === 'object') return this.handleRpcPrincipal(pluginId, method, args)
    const plugin = this.getPlugin(pluginId)
    if (!plugin) throw new Error('插件不存在')
    return this.handleRpcPrincipal(this.getLegacyPrincipal(plugin), method, args)
  }

  async handleRpcPrincipal(principal, method, args = {}) {
    assertActivePrincipal(principal)
    const pluginId = principal.pluginId
    const plugin = this.getPlugin(pluginId)
    if (!plugin) throw new Error('插件不存在')
    if (plugin.enabled === false || this.deactivatingPlugins.has(pluginId)) throw runtimeError('PLUGIN_INSTANCE_REVOKED', '插件已禁用')
    const resource = method === 'resources.query' ? HOST_RESOURCES[String(args.resource || '')] : null
    const transaction = method === 'transactions.execute' ? HOST_TRANSACTIONS[String(args.transaction || args.id || '')] : null
    if (method === 'resources.query' && !resource) throw new Error(`未知宿主资源：${String(args.resource || '')}`)
    if (method === 'transactions.execute' && !transaction) throw new Error(`未知宿主事务：${String(args.transaction || args.id || '')}`)
    const permissionFor = method => ({
      'storage.read': 'storage:read', 'storage.write': 'storage:write',
      'names.read': 'names:read', 'records.read': 'records:read', 'statistics.read': 'statistics:read', 'balance.read': 'balance:read',
      'draw.execute': 'draw:execute',
      'notifications.show': 'notifications:show',
      'audio.select': 'audio:select', 'audio.play': 'audio:play',
      'system.open-url': 'system:open-url', 'system.select-file': 'system:select-file',
      'system.select-directory': 'system:select-directory',
      'system.clipboard-read': 'system:clipboard-read', 'system.clipboard-write': 'system:clipboard-write',
      'system.reveal-file': 'system:reveal-file', 'system.execute': 'system:execute'
    }[method] || resource?.permission || transaction?.permission)
    const permission = permissionFor(method)
    if (permission && !hasPrincipalPermission(principal, permission)) throw runtimeError('PLUGIN_PERMISSION_DENIED', `插件未获授权：${permission}`, { permission })
    switch (method) {
      case 'runtime.platform': return this.platformBridge.info()
      case 'runtime.capabilities': return this.platformBridge.capabilities()
      case 'host.describe': return this.describeHost(plugin)
      case 'storage.read': return this.loadPluginData(pluginId, storageKey(args.key))
      case 'storage.write': {
        const key = storageKey(args.key)
        const result = await this.savePluginData(pluginId, key, args.value)
        this.dispatchForPlugin(pluginId, 'plugin:storage-changed', { key })
        return result
      }
      case 'names.read': return this.getCoreSnapshot('names')
      case 'records.read': return this.getCoreSnapshot('records')
      case 'statistics.read': return this.getCoreSnapshot('statistics')
      case 'balance.read': return this.getCoreSnapshot('balance')
      case 'draw.execute': return this.executeCoreDraw?.(plugin, transferableValue(args))
      case 'resources.query': return this.getCoreSnapshot(String(args.resource), transferableValue(args.query || {}))
      case 'transactions.execute': {
        const transactionId = String(args.transaction || args.id || '')
        if (transactionId === 'draw') return this.executeCoreDraw?.(plugin, transferableValue(args.input || args.payload || {}))
        throw new Error(`宿主事务尚未实现：${transactionId}`)
      }
      case 'notifications.show': return this.showBanner?.({ message: String(args.message || '').slice(0, 1000), type: ['info', 'success', 'warning'].includes(args.type) ? args.type : 'info', duration: Math.max(0, Math.min(30000, Number(args.duration) || 5000)), icon: args.icon || 'info-16-regular' })
      case 'audio.select': return this.selectFile?.('audio/*,.mp3,.m4a,.wav,.flac,.ogg')
      case 'audio.play': {
        const source = String(args.source || '')
        if (!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(source)) throw new Error('插件只能播放经用户选择的本地音频')
        const volume = Number(args.volume)
        return this.playAudio?.(source, Number.isFinite(volume) ? volume : 1)
      }
      case 'system.open-url':
      case 'system.select-file':
      case 'system.select-directory':
      case 'system.clipboard-read':
      case 'system.clipboard-write':
      case 'system.reveal-file':
      case 'system.execute':
        return this.platformBridge.request(plugin, method, args)
      case 'dependency.storage.read': {
        const dependency = plugin.manifest.dependencies.find(item => item.id === args.pluginId && item.dataAccess)
        if (!dependency) throw new Error('未声明此前置插件的数据访问权限')
        const target = this.getPlugin(args.pluginId)
        if (!target?.manifest.shareData) throw new Error('前置插件未开放数据共享')
        return this.loadPluginData(args.pluginId, storageKey(args.key))
      }
      default: throw new Error(`不支持的插件请求：${method}`)
    }
  }

  frameSource(plugin, page) {
    let html = decodePluginFile(plugin, page.entry)
    const basePath = page.entry.split('/').slice(0, -1).join('/')
    html = html.replace(/(src|href)=(['"])(?!https?:|data:|#)([^'"]+)\2/gi, (match, attr, quote, path) => {
      const fullPath = [basePath, path].filter(Boolean).join('/').replace(/\/+/g, '/')
      const encoded = plugin.files[fullPath]
      return encoded ? `${attr}=${quote}${dataUrlFromBase64(encoded, mimeFor(fullPath))}${quote}` : match
    })
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; media-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">`
    const platform = this.platformBridge.info()
    const capabilities = this.platformBridge.capabilities()
    const principal = this.principalForFrame(plugin.manifest.id, page.id)
    const host = this.describeHost(plugin, principal)
    const useMessageChannel = this.isApi13Plugin(plugin)
    const initialTheme = this.lifecycleSnapshots.get('app:theme-changed') || {}
    const fluentBase = `<style id="cyrene-plugin-fluent-base">
      :root { color-scheme: light dark; --accent:#ea5ec1; --bg-base:#fff7fc; --bg-card-solid:#fff; --bg-hover:#f8eaf3; --text-primary:#2a1723; --text-secondary:#654356; --text-muted:#8a6d7d; --border-default:rgba(234,94,193,.18); --radius:8px; --radius-lg:12px; --font-ui:'Segoe UI Variable','Segoe UI',system-ui,sans-serif; }
      * { box-sizing:border-box; }
      html, body { min-height:100%; margin:0; background:var(--bg-base); color:var(--text-primary); font-family:var(--font-ui); }
      body { padding:24px; }
      button, input, select, textarea { font:inherit; color:inherit; }
      button, input, select, textarea, .cyrene-fluent-card { border:1px solid var(--border-default); border-radius:var(--radius); background:var(--bg-card-solid); }
      button { min-height:32px; padding:6px 14px; cursor:pointer; }
      button:hover { background:var(--bg-hover); }
      button[data-primary] { color:var(--text-on-accent,#fff); background:var(--accent); border-color:transparent; }
      .cyrene-fluent-page { width:min(1100px,100%); margin:0 auto; display:grid; gap:16px; }
      .cyrene-fluent-card { padding:18px; box-shadow:var(--shadow-4,0 2px 10px rgba(0,0,0,.08)); }
      .cyrene-fluent-row { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      .cyrene-muted { color:var(--text-muted); }
    </style>`
    const bootstrap = `<script>
      (() => {
        const pluginId = ${JSON.stringify(plugin.manifest.id)};
        const platform = Object.freeze(${JSON.stringify(platform)});
        const capabilities = Object.freeze(${JSON.stringify(capabilities)});
        const host = Object.freeze(${JSON.stringify(host)});
        const initialTheme = ${JSON.stringify(initialTheme)};
        const pending = new Map();
        let rpcPort = null;
        const useMessageChannel = ${useMessageChannel ? 'true' : 'false'};
        const handleRpcMessage = message => {
          if (message.type !== 'rpc-response') return;
          const task = pending.get(message.id);
          if (!task) return;
          pending.delete(message.id);
          message.error ? task.reject(Object.assign(new Error(message.error), { code: message.code })) : task.resolve(message.result);
        };
        const applyTheme = payload => {
          const theme = payload && typeof payload === 'object' ? payload : {};
          document.documentElement.classList.toggle('dark', theme.dark === true);
          document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
          for (const [token, value] of Object.entries(theme.tokens || {})) {
            if (/^--[a-z0-9-]+$/i.test(token)) document.documentElement.style.setProperty(token, String(value));
          }
        };
        const request = (method, args = {}) => new Promise((resolve, reject) => {
          const id = (crypto.randomUUID && crypto.randomUUID()) || ('rpc-' + Date.now() + '-' + Math.random());
          pending.set(id, { resolve, reject });
          if (rpcPort) rpcPort.postMessage({ type: 'rpc-request', id, method, args });
          else parent.postMessage({ type: 'rpc-request', pluginId, id, method, args }, '*');
        });
        window.CyrenePlugin = Object.freeze({ pluginId, platform, capabilities, host, request });
        applyTheme(initialTheme);
        addEventListener('message', event => {
          const message = event.data || {};
          if (useMessageChannel && message.type === 'cyrene-plugin-connect' && event.ports?.[0]) {
            rpcPort = event.ports[0];
            rpcPort.onmessage = portEvent => handleRpcMessage(portEvent.data || {});
            rpcPort.start?.();
          } else if (message.type === 'rpc-response') {
            handleRpcMessage(message);
          } else if (message.type === 'event') {
            if (message.event === 'app:theme-changed') applyTheme(message.payload);
            dispatchEvent(new CustomEvent('cyrene-plugin-event', { detail: message }));
          }
        });
      })();
    <\/script>`
    return /<head(?:\s[^>]*)?>/i.test(html)
      ? html.replace(/<head(\s[^>]*)?>/i, match => `${match}${csp}${fluentBase}${bootstrap}`)
      : `${csp}${fluentBase}${bootstrap}${html}`
  }

  postFrameMessage(record, message) {
    const frame = record?.frame || record
    if (record?.port) return record.port.postMessage(message)
    return frame?.contentWindow?.postMessage(message, '*')
  }

  mountFrame(frame, pluginId, pageId) {
    const key = `${pluginId}:${pageId}`
    if (this.frames.has(key)) this.unmountFrame(pluginId, pageId)
    const plugin = this.getPlugin(pluginId)
    const principal = plugin ? this.createPrincipal(plugin, 'page', pageId, `page:${pluginId}:${pageId}`) : null
    this.frames.set(key, { frame, principal, port: null })
  }

  connectFrame(frame, pluginId, pageId) {
    const key = `${pluginId}:${pageId}`
    const record = this.frames.get(key)
    const plugin = this.getPlugin(pluginId)
    if (!record || !plugin || !this.isApi13Plugin(plugin)) return false
    if (typeof MessageChannel !== 'function') throw new Error('当前环境不支持 MessageChannel')
    record.port?.close?.()
    const channel = new MessageChannel()
    record.port = channel.port1
    record.principal.port = channel.port1
    channel.port1.onmessage = async event => {
      const message = event.data || {}
      if (message.type !== 'rpc-request') return
      try {
        const result = await this.handleRpc(record.principal, message.method, message.args)
        channel.port1.postMessage({ type: 'rpc-response', id: message.id, result: transferableValue(result) })
      } catch (error) {
        channel.port1.postMessage({ type: 'rpc-response', id: message.id, code: error.code, error: error.message || String(error) })
      }
    }
    channel.port1.start?.()
    record.frame?.contentWindow?.postMessage({ type: 'cyrene-plugin-connect' }, '*', [channel.port2])
    return true
  }

  unmountFrame(pluginId, pageId) {
    const key = `${pluginId}:${pageId}`
    const record = this.frames.get(key)
    record?.port?.close?.()
    revokePrincipal(record?.principal)
    this.principals.delete(record?.principal?.instanceId)
    this.frames.delete(key)
  }

  ownsFrameSource(source, pluginId) {
    if (!source || !pluginId) return false
    for (const [key, record] of this.frames) {
      const frame = record?.frame || record
      if (key.startsWith(`${pluginId}:`) && frame.contentWindow === source) return true
    }
    return false
  }
}
