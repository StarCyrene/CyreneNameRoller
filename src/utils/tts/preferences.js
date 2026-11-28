import { DEFAULT_TTS_TEMPLATE, TTS_PROVIDER_IDS } from './catalog.js'

const TEXT_LIMIT = 120

function text(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, TEXT_LIMIT) : fallback
}

function number(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** 读档时的容错：旧版本没有这些字段，也不要让脏数据把播报搞崩。 */
export function normalizeTtsSettings(saved = {}) {
  return {
    ttsEnabled: saved.ttsEnabled === true,
    ttsProvider: TTS_PROVIDER_IDS.includes(saved.ttsProvider) ? saved.ttsProvider : 'edge',
    ttsTemplate: text(saved.ttsTemplate, DEFAULT_TTS_TEMPLATE) || DEFAULT_TTS_TEMPLATE,
    ttsRate: number(saved.ttsRate, -50, 100, 0),
    ttsVolume: number(saved.ttsVolume, 0, 100, 100),
    ttsEdgeVoice: text(saved.ttsEdgeVoice, 'zh-CN-XiaoxiaoNeural') || 'zh-CN-XiaoxiaoNeural',
    ttsQwenApiKey: text(saved.ttsQwenApiKey, ''),
    ttsQwenModel: text(saved.ttsQwenModel, 'qwen3-tts-flash') || 'qwen3-tts-flash',
    ttsQwenVoice: text(saved.ttsQwenVoice, 'Cherry') || 'Cherry',
    ttsQwenCustomVoice: text(saved.ttsQwenCustomVoice, ''),
    ttsCosyApiKey: text(saved.ttsCosyApiKey, ''),
    ttsCosyModel: text(saved.ttsCosyModel, 'cosyvoice-v2') || 'cosyvoice-v2',
    ttsCosyVoice: text(saved.ttsCosyVoice, 'longxiaochun_v2') || 'longxiaochun_v2',
    ttsCosyCustomVoice: text(saved.ttsCosyCustomVoice, ''),
    ttsCosyBaseUrl: text(saved.ttsCosyBaseUrl, 'https://dashscope.aliyuncs.com') || 'https://dashscope.aliyuncs.com',
    ttsMimoApiKey: text(saved.ttsMimoApiKey, ''),
    ttsMimoMode: saved.ttsMimoMode === 'clone' ? 'clone' : 'preset',
    ttsMimoVoice: text(saved.ttsMimoVoice, 'mimo_default') || 'mimo_default',
    ttsMimoStyle: text(saved.ttsMimoStyle, '')
  }
}
