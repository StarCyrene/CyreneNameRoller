/** 各语音服务的元数据：界面选项、默认参数、文档入口都集中在这里。 */

export const TTS_PROVIDER_IDS = ['edge', 'mimo', 'cosyvoice', 'qwen']

export const TTS_PROVIDERS = [
  {
    id: 'edge',
    name: 'Edge TTS',
    badge: '免费',
    description: { zh: '微软 Edge 的朗读音色，无需密钥，联网即用。', en: 'Microsoft Edge read-aloud voices. No key required.' },
    doc: 'https://github.com/rany2/edge-tts'
  },
  {
    id: 'mimo',
    name: 'MiMo TTS',
    badge: '可克隆',
    description: { zh: '小米 MiMo 语音合成，支持预置音色与音频样本克隆。', en: 'Xiaomi MiMo speech synthesis with voice cloning.' },
    doc: 'https://platform.xiaomimimo.com/docs/usage-guide/speech-synthesis-v2.5'
  },
  {
    id: 'cosyvoice',
    name: 'CosyVoice',
    badge: '可克隆',
    description: { zh: '阿里百炼 CosyVoice，使用声音编号（voice id），克隆音色填编号即可。', en: 'Alibaba Bailian CosyVoice. Cloned voices are referenced by voice id.' },
    doc: 'https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api'
  },
  {
    id: 'qwen',
    name: 'Qwen TTS',
    badge: '百炼',
    description: { zh: '通义千问 Qwen-TTS，多语种与方言音色。', en: 'Qwen-TTS from Alibaba Cloud Model Studio.' },
    doc: 'https://help.aliyun.com/zh/model-studio/qwen-tts-api'
  }
]

export const EDGE_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 女声（默认）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 · 女声' },
  { value: 'zh-CN-YunxiNeural', label: '云希 · 男声' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 · 男声（播报）' },
  { value: 'zh-CN-YunjianNeural', label: '云健 · 男声（激昂）' },
  { value: 'zh-CN-YunxiaNeural', label: '云夏 · 少年音' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北 · 东北话' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮 · 陕西话' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼 · 粤语女声' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻 · 台湾女声' }
]

export const QWEN_VOICES = [
  { value: 'Cherry', label: 'Cherry · 芊悦（女声）' },
  { value: 'Serena', label: 'Serena · 苏瑶（女声）' },
  { value: 'Ethan', label: 'Ethan · 晨煦（男声）' },
  { value: 'Chelsie', label: 'Chelsie · 千雪（女声）' },
  { value: 'Dylan', label: 'Dylan · 晓东（北京话）' },
  { value: 'Jada', label: 'Jada · 阿珍（上海话）' },
  { value: 'Sunny', label: 'Sunny · 晴儿（四川话）' }
]

export const QWEN_MODELS = [
  { value: 'qwen3-tts-flash', label: 'qwen3-tts-flash' },
  { value: 'qwen-tts', label: 'qwen-tts（旧版）' }
]

export const COSY_MODELS = [
  { value: 'cosyvoice-v2', label: 'cosyvoice-v2' },
  { value: 'cosyvoice-v3-flash', label: 'cosyvoice-v3-flash' },
  { value: 'cosyvoice-v3-plus', label: 'cosyvoice-v3-plus' }
]

export const COSY_VOICES = [
  { value: 'longxiaochun_v2', label: 'longxiaochun_v2 · 龙小淳（女声）' },
  { value: 'longxiaoxia_v2', label: 'longxiaoxia_v2 · 龙小夏（女声）' },
  { value: 'longxiaocheng_v2', label: 'longxiaocheng_v2 · 龙小诚（男声）' },
  { value: 'longxiaobai_v2', label: 'longxiaobai_v2 · 龙小白（男声）' },
  { value: 'longshu_v2', label: 'longshu_v2 · 龙书（男声）' },
  { value: 'longshuo_v2', label: 'longshuo_v2 · 龙硕（男声）' },
  { value: 'longjing_v2', label: 'longjing_v2 · 龙婧（女声）' },
  { value: 'longmiao_v2', label: 'longmiao_v2 · 龙妙（女声）' }
]

export const MIMO_VOICES = [
  { value: 'mimo_default', label: 'mimo_default · 默认' },
  { value: '冰糖', label: '冰糖 · 中文女声' },
  { value: '茉莉', label: '茉莉 · 中文女声' },
  { value: '苏打', label: '苏打 · 中文男声' },
  { value: '白桦', label: '白桦 · 中文男声' },
  { value: 'Mia', label: 'Mia · 英文女声' },
  { value: 'Chloe', label: 'Chloe · 英文女声' },
  { value: 'Milo', label: 'Milo · 英文男声' },
  { value: 'Dean', label: 'Dean · 英文男声' }
]

export const DEFAULT_TTS_TEMPLATE = '请 {names}'

export function providerMeta(id) {
  return TTS_PROVIDERS.find(provider => provider.id === id) || TTS_PROVIDERS[0]
}

export function voiceOptions(providerId) {
  if (providerId === 'mimo') return MIMO_VOICES
  if (providerId === 'cosyvoice') return COSY_VOICES
  if (providerId === 'qwen') return QWEN_VOICES
  return EDGE_VOICES
}

export function buildAnnouncementText(template, names) {
  const list = (Array.isArray(names) ? names : [names]).filter(name => typeof name === 'string' && name.trim())
  if (!list.length) return ''
  const joined = list.join('、')
  const pattern = typeof template === 'string' && template.trim() ? template : DEFAULT_TTS_TEMPLATE
  if (pattern.includes('{names}')) return pattern.replaceAll('{names}', joined).replace(/\s+/g, ' ').trim()
  return `${pattern} ${joined}`.replace(/\s+/g, ' ').trim()
}
