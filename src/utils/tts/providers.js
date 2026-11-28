import { synthesizeEdge } from './edge.js'
import { base64ToBlob, fetchAudioBlob, parseJsonPayload, pickAudioMime, ttsRequest } from './http.js'

export const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
export const COSY_DEFAULT_BASE = 'https://dashscope.aliyuncs.com'
export const MIMO_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'

function requireKey(key, label) {
  if (!key || !String(key).trim()) throw new Error(`${label} 还没有填写 API Key`)
  return String(key).trim()
}

function joinUrl(base, path) {
  const trimmed = String(base || COSY_DEFAULT_BASE).replace(/\/+$/, '')
  return trimmed + path
}

async function audioFromDashScope(payload, headers) {
  const audio = payload?.output?.audio
  const mime = pickAudioMime('', 'audio/wav')
  if (audio?.data) return base64ToBlob(audio.data, mime)
  if (audio?.url) return fetchAudioBlob(audio.url, headers)
  const finish = payload?.output?.finish_reason
  throw new Error(`语音服务没有返回音频${finish ? `（finish_reason: ${finish}）` : ''}`)
}

async function synthesizeQwen(settings, text) {
  const apiKey = requireKey(settings.ttsQwenApiKey, 'Qwen TTS')
  const voice = (settings.ttsQwenCustomVoice || settings.ttsQwenVoice || 'Cherry').trim()
  const model = settings.ttsQwenModel || 'qwen3-tts-flash'
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const body = JSON.stringify({
    model,
    input: {
      text: text.slice(0, 600),
      voice,
      language_type: /^[\x00-\x7F\s]*$/.test(text) ? 'English' : 'Chinese'
    }
  })
  const result = await ttsRequest({ url: QWEN_ENDPOINT, method: 'POST', headers, body, timeoutMs: 30000 })
  const payload = parseJsonPayload(result)
  if (payload?.code) throw new Error(`${payload.message || payload.code}`)
  return audioFromDashScope(payload, {})
}

async function synthesizeCosyVoice(settings, text) {
  const apiKey = requireKey(settings.ttsCosyApiKey, 'CosyVoice')
  const voice = (settings.ttsCosyCustomVoice || settings.ttsCosyVoice || 'longxiaochun_v2').trim()
  const model = settings.ttsCosyModel || 'cosyvoice-v2'
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const body = JSON.stringify({
    model,
    input: {
      text: text.slice(0, 2000),
      voice,
      format: 'mp3',
      sample_rate: 24000
    }
  })
  const url = joinUrl(settings.ttsCosyBaseUrl, '/api/v1/services/audio/tts/SpeechSynthesizer')
  const result = await ttsRequest({ url, method: 'POST', headers, body, timeoutMs: 30000 })
  const payload = parseJsonPayload(result)
  if (payload?.code) throw new Error(`${payload.message || payload.code}`)
  return audioFromDashScope(payload, {})
}

async function synthesizeMiMo(settings, text) {
  const apiKey = requireKey(settings.ttsMimoApiKey, 'MiMo TTS')
  const clone = settings.ttsMimoMode === 'clone'
  const style = String(settings.ttsMimoStyle || '').trim()
  const headers = { 'api-key': apiKey, 'Content-Type': 'application/json' }
  let voice = (settings.ttsMimoVoice || 'mimo_default').trim()
  let model = 'mimo-v2.5-tts'
  if (clone) {
    const sample = settings.ttsMimoCloneSample
    if (!sample?.base64) throw new Error('还没有添加用于克隆的音频样本')
    const mime = sample.mime || 'audio/mpeg'
    voice = `data:${mime};base64,${sample.base64}`
    model = 'mimo-v2.5-tts-voiceclone'
  }
  const messages = []
  if (style) messages.push({ role: 'user', content: style })
  else if (clone) messages.push({ role: 'user', content: '' })
  messages.push({ role: 'assistant', content: text.slice(0, 2000) })
  const body = JSON.stringify({
    model,
    messages,
    audio: { format: 'wav', voice },
    stream: false
  })
  const result = await ttsRequest({ url: MIMO_ENDPOINT, method: 'POST', headers, body, timeoutMs: 60000 })
  const payload = parseJsonPayload(result)
  const data = payload?.choices?.[0]?.message?.audio?.data
  if (!data) throw new Error('MiMo TTS 没有返回音频数据')
  return base64ToBlob(data, 'audio/wav')
}

export async function synthesizeSpeech(settings, text) {
  const content = String(text || '').trim()
  if (!content) throw new Error('没有需要朗读的内容')
  const provider = settings.ttsProvider || 'edge'
  if (provider === 'qwen') return synthesizeQwen(settings, content)
  if (provider === 'cosyvoice') return synthesizeCosyVoice(settings, content)
  if (provider === 'mimo') return synthesizeMiMo(settings, content)
  return synthesizeEdge({
    text: content,
    voice: settings.ttsEdgeVoice || 'zh-CN-XiaoxiaoNeural',
    rate: Number(settings.ttsRate) || 0
  })
}
