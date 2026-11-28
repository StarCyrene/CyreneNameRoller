import { isTauri, tauriAPI } from '../tauriAPI'

/**
 * 统一的 TTS 网络请求出口。
 * 桌面端走 Rust 转发（避开 WebView 的 CORS），Web 端退回原生 fetch。
 * 返回结构固定为 { status, ok, contentType, size, text? , base64? }。
 */
export async function ttsRequest({ url, method = 'GET', headers = {}, body, bodyBase64, timeoutMs = 20000 } = {}) {
  if (!url) throw new Error('缺少请求地址')
  if (isTauri()) {
    return tauriAPI.ttsHttpRequest({ url, method, headers, body, bodyBase64, timeoutMs })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 3000), 120000))
  try {
    const response = await fetch(url, { method, headers, body: bodyBase64 ? base64ToBytes(bodyBase64) : body, signal: controller.signal })
    const contentType = response.headers.get('content-type') || ''
    const bytes = new Uint8Array(await response.arrayBuffer())
    const isText = /json|text\/|xml/.test(contentType)
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      size: bytes.length,
      ...(isText ? { text: new TextDecoder().decode(bytes) } : { base64: bytesToBase64(bytes) })
    }
  } finally {
    clearTimeout(timer)
  }
}

export function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBlob(value, mime = 'audio/mpeg') {
  const bytes = base64ToBytes(value)
  return new Blob([bytes], { type: mime || 'audio/mpeg' })
}

export function pickAudioMime(contentType, fallback = 'audio/mpeg') {
  if (!contentType) return fallback
  if (contentType.includes('wav')) return 'audio/wav'
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'audio/mpeg'
  if (contentType.includes('ogg')) return 'audio/ogg'
  if (contentType.includes('audio')) return contentType.split(';')[0]
  return fallback
}

/** 下载远端音频并交回 Blob。 */
export async function fetchAudioBlob(url, headers = {}, timeoutMs = 30000) {
  const result = await ttsRequest({ url, headers, timeoutMs })
  if (!result?.ok) {
    throw new Error(`音频下载失败（HTTP ${result?.status ?? '未知'}）`)
  }
  if (result.base64) return new Blob([base64ToBytes(result.base64)], { type: pickAudioMime(result.contentType) })
  if (result.text) {
    // 有些服务把 wav 直接当 text 返回，这里兜底一次二进制重取
    const retry = await ttsRequest({ url, headers, method: 'GET', timeoutMs })
    if (retry?.base64) return new Blob([base64ToBytes(retry.base64)], { type: pickAudioMime(retry.contentType) })
  }
  throw new Error('音频内容为空')
}

export function parseJsonPayload(result) {
  if (!result) throw new Error('语音服务没有返回内容')
  let payload = null
  if (result.text) {
    try {
      payload = JSON.parse(result.text)
    } catch {
      payload = null
    }
  }
  if (!result.ok) {
    const message = payload?.message || payload?.error?.message || result.text?.slice(0, 200) || `HTTP ${result.status}`
    const code = payload?.code || payload?.error?.code || ''
    throw new Error(code ? `${message}（${code}）` : `${message}`)
  }
  if (!payload) throw new Error('语音服务返回了无法解析的内容')
  return payload
}
