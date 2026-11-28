import { reactive } from 'vue'
import { synthesizeSpeech } from './providers.js'
import { dataBridge } from '../dataBridge.js'

const CACHE_LIMIT = 24
export const VOICE_SAMPLE_KEY = 'tts-voice-sample'

function clampVolume(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.min(1, Math.max(0, number / 100))
}

/**
 * 语音播报的播放中枢：合成、缓存、打断、状态回报都在这里。
 * 连续点名时以最新一条为准（interrupt 模式），避免播报排队拖到下课。
 */
class TtsService {
  constructor() {
    this.state = reactive({ status: 'idle', error: '', provider: '' })
    this.audio = null
    this.cache = new Map()
    this.token = 0
    this.sample = null
    this.sampleLoaded = false
  }

  cacheKey(settings, text) {
    return [
      settings.ttsProvider,
      settings.ttsEdgeVoice,
      settings.ttsRate,
      settings.ttsQwenModel,
      settings.ttsQwenVoice,
      settings.ttsQwenCustomVoice,
      settings.ttsCosyModel,
      settings.ttsCosyVoice,
      settings.ttsCosyCustomVoice,
      settings.ttsCosyBaseUrl,
      settings.ttsMimoMode,
      settings.ttsMimoVoice,
      settings.ttsMimoStyle,
      text
    ].join('|')
  }

  remember(key, url) {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      const stale = this.cache.get(oldest)
      this.cache.delete(oldest)
      if (stale) URL.revokeObjectURL(stale)
    }
    this.cache.set(key, url)
  }

  async loadSample() {
    if (this.sampleLoaded) return this.sample
    this.sampleLoaded = true
    try {
      const saved = await dataBridge.load(VOICE_SAMPLE_KEY)
      if (saved?.base64) this.sample = saved
    } catch {
      this.sample = null
    }
    return this.sample
  }

  async saveSample(sample) {
    this.sample = sample || null
    this.sampleLoaded = true
    if (sample) await dataBridge.save(VOICE_SAMPLE_KEY, sample)
    else await dataBridge.remove(VOICE_SAMPLE_KEY)
    return this.sample
  }

  async withVoiceSample(settings) {
    if (settings.ttsProvider !== 'mimo' || settings.ttsMimoMode !== 'clone') return settings
    const sample = settings.ttsMimoCloneSample || await this.loadSample()
    return { ...settings, ttsMimoCloneSample: sample }
  }

  stop() {
    this.token += 1
    if (this.audio) {
      try {
        this.audio.pause()
        this.audio.currentTime = 0
      } catch {}
      this.audio = null
    }
    if (this.state.status !== 'error') this.state.status = 'idle'
  }

  async speak(text, settings, { preview = false } = {}) {
    const content = String(text || '').trim()
    if (!content) return
    this.stop()
    const token = this.token
    const key = this.cacheKey(settings, content)
    this.state.provider = settings.ttsProvider || 'edge'
    this.state.error = ''
    try {
      let url = this.cache.get(key)
      if (!url) {
        this.state.status = 'synthesizing'
        const payload = await this.withVoiceSample(settings)
        const blob = await synthesizeSpeech(payload, content)
        if (token !== this.token) return
        url = URL.createObjectURL(blob)
        this.remember(key, url)
      }
      if (token !== this.token) return
      this.state.status = 'playing'
      const audio = new Audio(url)
      audio.volume = clampVolume(settings.ttsVolume)
      this.audio = audio
      audio.onended = () => {
        if (this.audio !== audio) return
        this.audio = null
        this.state.status = 'idle'
      }
      audio.onerror = () => {
        if (this.audio !== audio) return
        this.audio = null
        this.state.status = 'error'
        this.state.error = '音频播放失败'
      }
      await audio.play()
    } catch (error) {
      if (token !== this.token) return
      this.audio = null
      this.state.status = 'error'
      this.state.error = error?.message || String(error)
      console.warn('[tts] speak failed:', error)
      if (preview) throw error
    }
  }

  async preview(text, settings) {
    await this.speak(text, settings, { preview: true })
  }

  clearCache() {
    for (const url of this.cache.values()) URL.revokeObjectURL(url)
    this.cache.clear()
  }
}

export const ttsService = new TtsService()
