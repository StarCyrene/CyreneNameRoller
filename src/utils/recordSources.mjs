// A record's source is the tool that produced it. Keep the identifiers short
// and stable because they are stored in encrypted history and read back later.
export const CORE_DRAW_SOURCES = Object.freeze(['roller', 'wheel', 'tunnel', 'seats', 'relay', 'riddle'])

const LABELS = Object.freeze({
  roller: { zh: '随机点名', en: 'Roller' },
  card: { zh: '翻牌点名', en: 'Cards' },
  wheel: { zh: '转盘点名', en: 'Wheel' },
  tunnel: { zh: '光轨穿梭', en: 'Light Tunnel' },
  seats: { zh: '座次寻光', en: 'Seat Spotlight' },
  relay: { zh: '流萤传灯', en: 'Firefly Relay' },
  riddle: { zh: '花笺藏名', en: 'Petal Riddle' }
})

export function isCoreDrawSource(source) {
  return CORE_DRAW_SOURCES.includes(source)
}

export function recordSourceLabel(source, lang = 'zh', pluginId = '') {
  const key = String(source || 'roller')
  const label = LABELS[key]
  if (label) return lang === 'en' ? label.en : label.zh
  if (key.startsWith('plugin:')) {
    const id = String(pluginId || key.slice(7)).trim()
    if (lang === 'en') return id ? `Plugin · ${id}` : 'Plugin'
    return id ? `插件 · ${id}` : '插件'
  }
  return key
}
