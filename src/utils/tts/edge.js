/**
 * Edge TTS：基于 Edge「大声朗读」的免费接口，走 WebSocket。
 * 协议要点：握手需要 TrustedClientToken + 有效期 5 分钟的 Sec-MS-GEC 签名，
 * 之后先发 speech.config，再发 ssml，音频以二进制帧（2 字节头长度 + 头 + 负载）返回。
 * 服务端只接受 Edge 的 User-Agent，桌面端 WebView2 自带 Edg/ 标识，网页版可能被拒。
 */

import { TRUSTED_CLIENT_TOKEN, generateSecMsGec } from './gec.js'

const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`

const SYNTHESIS_ENDPOINTS = [
  { url: 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1', subscriptionKey: true },
  { url: 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1', subscriptionKey: false }
]

const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

function randomHexId() {
  if (crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function edgeTimestamp() {
  return `${new Date().toUTCString().replace('GMT', 'GMT+0000')} (Coordinated Universal Time)`
}

function buildSynthesisUrl(endpoint, secMsGec, connectionId) {
  const url = new URL(endpoint.url)
  url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN)
  url.searchParams.set('Sec-MS-GEC', secMsGec)
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION)
  url.searchParams.set('ConnectionId', connectionId)
  if (endpoint.subscriptionKey) url.searchParams.set('Ocp-Apim-Subscription-Key', TRUSTED_CLIENT_TOKEN)
  return url.toString()
}

function buildSpeechConfig() {
  return 'X-Timestamp:' + edgeTimestamp() + '\r\n'
    + 'Content-Type:application/json; charset=utf-8\r\n'
    + 'Path:speech.config\r\n\r\n'
    + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"' + OUTPUT_FORMAT + '"}}}}\r\n'
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[character])
}

function buildSsml({ requestId, voice, text, rate, volume, pitch }) {
  const ratePercent = Math.round(clampNumber(rate, -50, 100, 0))
  const volumePercent = Math.round(clampNumber(volume, -100, 100, 0))
  const pitchPercent = Math.round(clampNumber(pitch, -50, 50, 0))
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">`
    + `<voice name="${escapeXml(voice)}">`
    + `<prosody rate="${ratePercent >= 0 ? '+' : ''}${ratePercent}%" volume="${volumePercent >= 0 ? '+' : ''}${volumePercent}%" pitch="${pitchPercent >= 0 ? '+' : ''}${pitchPercent}%">`
    + escapeXml(text)
    + '</prosody></voice></speak>'
  return `X-RequestId:${requestId}\r\n`
    + 'Content-Type:application/ssml+xml\r\n'
    + `X-Timestamp:${edgeTimestamp()}\r\n`
    + 'Path:ssml\r\n\r\n'
    + ssml
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function parseBinaryFrame(buffer) {
  const view = new DataView(buffer)
  const headerLength = view.getUint16(0)
  const header = new TextDecoder().decode(new Uint8Array(buffer, 2, headerLength))
  const match = /Path:\s*([^\r\n]+)/i.exec(header)
  return { path: (match?.[1] || '').trim(), audio: new Uint8Array(buffer, 2 + headerLength) }
}

async function connectAndSynthesize(endpoint, secMsGec, options) {
  const connectionId = randomHexId()
  const requestId = randomHexId()
  const url = buildSynthesisUrl(endpoint, secMsGec, connectionId)
  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'
  const chunks = []
  const speechConfig = buildSpeechConfig()
  const ssml = buildSsml({ requestId, ...options })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, blob) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.close() } catch {}
      if (error) reject(error)
      else resolve(blob)
    }
    const timer = setTimeout(() => finish(new Error('Edge TTS 连接超时')), 25000)

    socket.onopen = () => {
      try {
        socket.send(speechConfig)
        socket.send(ssml)
      } catch (error) {
        finish(new Error(`Edge TTS 发送失败：${error?.message || error}`))
      }
    }
    socket.onmessage = async event => {
      try {
        if (typeof event.data === 'string') {
          if (event.data.includes('Path:turn.end')) {
            if (!chunks.length) {
              finish(new Error('Edge TTS 没有返回音频（音色名称可能不受支持）'))
              return
            }
            const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
            const merged = new Uint8Array(total)
            let offset = 0
            for (const chunk of chunks) {
              merged.set(chunk, offset)
              offset += chunk.length
            }
            finish(null, new Blob([merged], { type: 'audio/mpeg' }))
          }
          return
        }
        const buffer = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer()
        const frame = parseBinaryFrame(buffer)
        if (frame.path.includes('audio') && frame.audio.length) chunks.push(frame.audio)
      } catch (error) {
        finish(error)
      }
    }
    socket.onerror = () => finish(new Error('Edge TTS 连接被拒绝（浏览器网页版常被限制，可改用桌面端或其他语音服务）'))
    socket.onclose = event => {
      if (!settled) finish(new Error(`Edge TTS 连接中断（代码 ${event.code}）`))
    }
  })
}

export async function synthesizeEdge(options) {
  const text = String(options?.text || '').trim()
  if (!text) throw new Error('没有需要朗读的内容')
  const voice = options.voice || 'zh-CN-XiaoxiaoNeural'
  const secMsGec = generateSecMsGec()
  const failures = []
  for (const endpoint of SYNTHESIS_ENDPOINTS) {
    try {
      return await connectAndSynthesize(endpoint, secMsGec, { ...options, voice, text })
    } catch (error) {
      failures.push(new URL(endpoint.url).host + ' → ' + (error?.message || error))
    }
  }
  throw new Error('Edge TTS 合成失败：' + failures.join('；'))
}
