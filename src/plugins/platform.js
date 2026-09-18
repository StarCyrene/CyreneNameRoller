import { isTauri, tauriAPI } from '../utils/tauriAPI.js'
import { PLUGIN_API_VERSION } from './constants.js'

const MAX_SELECTED_FILE_SIZE = 32 * 1024 * 1024
const MAX_CLIPBOARD_TEXT_LENGTH = 100000

function compareApiVersions(left, right) {
  const a = String(left || '0').split('.').map(value => Number(value) || 0)
  const b = String(right || '0').split('.').map(value => Number(value) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}

export const PLATFORM_CAPABILITIES = Object.freeze({
  'notifications:show': { label: '宿主通知', web: true, tauri: true },
  'audio:select': { label: '选择本地音频', web: true, tauri: true },
  'audio:play': { label: '播放本地音频', web: true, tauri: true },
  'system:open-url': { label: '打开外部链接', web: true, tauri: true },
  'system:select-file': { label: '选择并读取本地文件', web: true, tauri: true },
  'system:select-directory': { label: '选择本地目录', web: false, tauri: true },
  'system:clipboard-read': { label: '读取剪贴板', web: 'dynamic', tauri: 'dynamic' },
  'system:clipboard-write': { label: '写入剪贴板', web: 'dynamic', tauri: 'dynamic' },
  'system:reveal-file': { label: '在文件管理器中定位文件', web: false, tauri: true },
  'system:execute': { label: '执行清单声明的系统操作', web: false, tauri: true }
})

function detectOs() {
  if (typeof navigator === 'undefined') return 'unknown'
  const value = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
  if (value.includes('win')) return 'windows'
  if (value.includes('mac')) return 'macos'
  if (value.includes('linux') || value.includes('x11')) return 'linux'
  if (value.includes('android')) return 'android'
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) return 'ios'
  return 'unknown'
}

export function getCurrentPlatform() {
  const runtime = isTauri() ? 'tauri' : 'web'
  return Object.freeze({ runtime, os: detectOs(), desktop: runtime === 'tauri' })
}

export function platformMatches(platforms, platform = getCurrentPlatform()) {
  if (!Array.isArray(platforms) || !platforms.length) return true
  return platforms.includes(platform.runtime) || (platform.runtime === 'tauri' && platforms.includes(platform.os))
}

function clipboardAvailable(kind) {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.clipboard?.[kind] === 'function'
}

export function capabilityStatus(capability, platform = getCurrentPlatform()) {
  const definition = PLATFORM_CAPABILITIES[capability]
  if (!definition) return { id: capability, label: capability, available: false, code: 'UNKNOWN_CAPABILITY' }
  let available = definition[platform.runtime]
  if (capability === 'system:clipboard-read') available = clipboardAvailable('readText')
  if (capability === 'system:clipboard-write') available = clipboardAvailable('writeText')
  return {
    id: capability,
    label: definition.label,
    available: available === true,
    code: available === true ? 'AVAILABLE' : 'UNSUPPORTED_PLATFORM',
    platform: platform.runtime,
    os: platform.os
  }
}

export function getCapabilityMap(platform = getCurrentPlatform()) {
  return Object.fromEntries(Object.keys(PLATFORM_CAPABILITIES).map(id => [id, capabilityStatus(id, platform)]))
}

export function getManifestCompatibility(manifest, platform = getCurrentPlatform()) {
  const requiredApi = manifest?.engine?.min || '0'
  const maximumApi = manifest?.engine?.max || ''
  if (compareApiVersions(PLUGIN_API_VERSION, requiredApi) < 0) {
    return {
      compatible: false,
      degraded: false,
      platform,
      missing: [],
      unavailableOptional: [],
      reason: `插件需要 API ${requiredApi}，当前宿主仅提供 ${PLUGIN_API_VERSION}`
    }
  }
  const supportedPlatforms = Array.isArray(manifest?.supportedPlatforms) ? manifest.supportedPlatforms : []
  if (supportedPlatforms.length && !platformMatches(supportedPlatforms, platform)) {
    return {
      compatible: false,
      degraded: false,
      platform,
      missing: [],
      unavailableOptional: [],
      reason: `插件不支持当前平台（${platform.runtime}/${platform.os}）`
    }
  }
  const hasWorker = !!resolvePlatformEntry(manifest, platform)
  const hasPage = (manifest?.contributes?.pages || []).some(page => !!page.native || !!resolvePlatformEntry(page, platform))
  const hasVisualSurface = (manifest?.contributes?.visualSurfaces || []).some(surface => !!resolvePlatformEntry(surface, platform))
  if (!hasWorker && !hasPage && !hasVisualSurface) {
    return {
      compatible: false,
      degraded: false,
      platform,
      missing: [],
      unavailableOptional: [],
      reason: `插件没有适用于当前平台的 Worker、页面或视觉层入口（${platform.runtime}/${platform.os}）`
    }
  }
  const missing = []
  const unavailableOptional = []
  for (const [id, declaration] of Object.entries(manifest?.capabilities || {})) {
    if (!platformMatches(declaration?.platforms, platform)) continue
    const status = capabilityStatus(id, platform)
    if (!status.available) {
      if (declaration?.required) missing.push(status)
      else unavailableOptional.push(status)
    }
  }
  const warnings = []
  if (maximumApi && compareApiVersions(PLUGIN_API_VERSION, maximumApi) > 0) {
    warnings.push(`插件面向旧版 API（最高 ${maximumApi}，当前 ${PLUGIN_API_VERSION}），可能存在兼容性问题`)
  }
  if (unavailableOptional.length) {
    warnings.push(`当前平台将安全跳过：${unavailableOptional.map(item => item.label).join('、')}`)
  }
  return {
    compatible: missing.length === 0,
    degraded: missing.length === 0 && warnings.length > 0,
    platform,
    missing,
    unavailableOptional,
    reason: missing.length
      ? `当前平台缺少必须能力：${missing.map(item => item.label).join('、')}`
      : warnings.join('；')
  }
}

export function resolvePlatformEntry(target, platform = getCurrentPlatform()) {
  const entries = target?.platformEntries || {}
  if (platform.runtime === 'tauri') return entries[platform.os] || entries.tauri || target?.entry || ''
  return entries.web || target?.entry || ''
}

function bridgeResult(ok, capability, platform, value = null, extras = {}) {
  return {
    ok,
    capability,
    platform: platform.runtime,
    os: platform.os,
    value,
    ...extras
  }
}

function unsupported(capability, platform, message = '') {
  const label = PLATFORM_CAPABILITIES[capability]?.label || capability
  return bridgeResult(false, capability, platform, null, {
    code: 'UNSUPPORTED_PLATFORM',
    message: message || `${label}在当前平台不可用，已安全跳过`
  })
}

function failed(capability, platform, error, code = 'OPERATION_FAILED') {
  return bridgeResult(false, capability, platform, null, {
    code,
    message: error?.message || String(error || '操作失败')
  })
}

function mimeForFile(name = '') {
  const extension = String(name).split('.').pop()?.toLowerCase()
  return {
    txt: 'text/plain', csv: 'text/csv', json: 'application/json', html: 'text/html', css: 'text/css', js: 'text/javascript',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }[extension] || 'application/octet-stream'
}

function bytesToDataUrl(bytes, mime) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

function extensionsFromAccept(accept = '') {
  return [...new Set(String(accept).split(',').map(value => value.trim().replace(/^\./, '').toLowerCase()).filter(value => /^[a-z0-9]{1,12}$/.test(value)))]
}

function selectBrowserFile(accept = '') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = String(accept).slice(0, 512)
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      resolve(value)
    }
    const onFocus = () => setTimeout(() => { if (!input.files?.length) finish(null) }, 250)
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return finish(null)
        if (file.size > MAX_SELECTED_FILE_SIZE) throw new Error('插件选择的文件不能超过 32 MB')
        const bytes = new Uint8Array(await file.arrayBuffer())
        finish({
          name: file.name,
          type: file.type || mimeForFile(file.name),
          size: file.size,
          dataUrl: bytesToDataUrl(bytes, file.type || mimeForFile(file.name)),
          path: ''
        })
      } catch (error) {
        settled = true
        window.removeEventListener('focus', onFocus)
        reject(error)
      }
    }
    window.addEventListener('focus', onFocus, { once: true })
    input.click()
  })
}

function validExternalUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export class PluginPlatformBridge {
  constructor() {
    this.platform = getCurrentPlatform()
    this.grantedPaths = new Map()
  }

  info() { return this.platform }

  capabilities() { return getCapabilityMap(this.platform) }

  compatibility(manifest) { return getManifestCompatibility(manifest, this.platform) }

  rememberPath(pluginId, path) {
    if (!path) return
    if (!this.grantedPaths.has(pluginId)) this.grantedPaths.set(pluginId, new Set())
    this.grantedPaths.get(pluginId).add(path)
  }

  forgetPlugin(pluginId) { this.grantedPaths.delete(pluginId) }

  async request(plugin, method, args = {}) {
    const capability = method.replace(/^system\./, 'system:')
    const status = capabilityStatus(capability, this.platform)
    if (!status.available) return unsupported(capability, this.platform)
    try {
      switch (method) {
        case 'system.open-url': {
          const url = validExternalUrl(args.url)
          if (!url) return failed(capability, this.platform, '仅允许打开 HTTP、HTTPS 或 mailto 链接', 'INVALID_ARGUMENT')
          if (this.platform.runtime === 'tauri') await tauriAPI.invokeStrict('open_external', { url })
          else {
            const opened = window.open(url, '_blank', 'noopener,noreferrer')
            if (!opened) return failed(capability, this.platform, '浏览器阻止了新窗口，请允许弹出窗口后重试', 'POPUP_BLOCKED')
          }
          return bridgeResult(true, capability, this.platform, true)
        }
        case 'system.select-file': {
          let selected
          if (this.platform.runtime === 'tauri') {
            selected = await tauriAPI.invokeStrict('plugin_select_file', { extensions: extensionsFromAccept(args.accept) })
            if (selected?.success && selected.path) this.rememberPath(plugin.manifest.id, selected.path)
            if (selected?.success && selected.base64) {
              selected = {
                name: selected.name,
                type: mimeForFile(selected.name),
                size: selected.size,
                path: selected.path,
                dataUrl: `data:${mimeForFile(selected.name)};base64,${selected.base64}`
              }
            } else if (selected?.cancelled) selected = null
          } else selected = await selectBrowserFile(args.accept)
          return bridgeResult(true, capability, this.platform, selected, { cancelled: !selected })
        }
        case 'system.select-directory': {
          const selected = await tauriAPI.invokeStrict('plugin_select_directory', {})
          if (selected?.success && selected.path) this.rememberPath(plugin.manifest.id, selected.path)
          const value = selected?.success ? { name: selected.name, path: selected.path } : null
          return bridgeResult(true, capability, this.platform, value, { cancelled: !value })
        }
        case 'system.clipboard-read': {
          const value = await navigator.clipboard.readText()
          return bridgeResult(true, capability, this.platform, String(value).slice(0, MAX_CLIPBOARD_TEXT_LENGTH))
        }
        case 'system.clipboard-write': {
          const value = String(args.text ?? '')
          if (value.length > MAX_CLIPBOARD_TEXT_LENGTH) return failed(capability, this.platform, '剪贴板文本不能超过 100000 字符', 'INVALID_ARGUMENT')
          await navigator.clipboard.writeText(value)
          return bridgeResult(true, capability, this.platform, true)
        }
        case 'system.reveal-file': {
          const path = String(args.path || '')
          if (!path || !this.grantedPaths.get(plugin.manifest.id)?.has(path)) {
            return failed(capability, this.platform, '只能定位本次运行中由用户授权给插件的文件或目录', 'PATH_NOT_GRANTED')
          }
          const value = await tauriAPI.invokeStrict('reveal_file', { path })
          return value ? bridgeResult(true, capability, this.platform, true) : failed(capability, this.platform, '无法定位文件')
        }
        case 'system.execute': {
          const operationId = String(args.operation || '')
          const operation = (plugin.manifest.systemOperations || []).find(item => item.id === operationId)
          if (!operation) return failed(capability, this.platform, '插件未在清单中声明该系统操作', 'OPERATION_NOT_DECLARED')
          if (!platformMatches(operation.platforms, this.platform)) return unsupported(capability, this.platform, '该系统操作不适用于当前操作系统，已安全跳过')
          const result = await tauriAPI.invokeStrict('plugin_execute_operation', {
            program: operation.command.program,
            args: operation.command.args || [],
            timeoutMs: operation.timeoutMs || 10000
          })
          return bridgeResult(!!result?.success, capability, this.platform, result, result?.success ? {} : {
            code: result?.timedOut ? 'OPERATION_TIMEOUT' : 'OPERATION_FAILED',
            message: result?.error || '系统操作执行失败'
          })
        }
        default:
          return failed(capability, this.platform, `不支持的平台请求：${method}`, 'UNKNOWN_CAPABILITY')
      }
    } catch (error) {
      return failed(capability, this.platform, error)
    }
  }
}
