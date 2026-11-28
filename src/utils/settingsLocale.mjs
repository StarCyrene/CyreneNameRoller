export const NATIVE_LANGUAGES = [
  { value: 'zh', label: '简体中文', lang: 'zh-Hans' },
  { value: 'en', label: 'English', lang: 'en' }
]

export const EXTRA_LANGUAGES = [
  { value: 'japanese', label: '日本語', lang: 'ja' },
  { value: 'korean', label: '한국어', lang: 'ko' },
  { value: 'chinese_traditional', label: '繁體中文', lang: 'zh-Hant' },
  { value: 'french', label: 'Français', lang: 'fr' },
  { value: 'deutsch', label: 'Deutsch', lang: 'de' },
  { value: 'spanish', label: 'Español', lang: 'es' },
  { value: 'russian', label: 'Русский', lang: 'ru' },
  { value: 'portuguese', label: 'Português', lang: 'pt' },
  { value: 'italian', label: 'Italiano', lang: 'it' },
  { value: 'vietnamese', label: 'Tiếng Việt', lang: 'vi' }
]

const nativeValues = new Set(NATIVE_LANGUAGES.map(({ value }) => value))
const extraValues = new Set(EXTRA_LANGUAGES.map(({ value }) => value))
const groupLabels = new Map([
  ['zh', ['内置语言', '自动翻译 · Beta']],
  ['en', ['Built-in languages', 'Automatic translation · Beta']],
  ['japanese', ['組み込み言語', '自動翻訳 · Beta']],
  ['korean', ['기본 제공 언어', '자동 번역 · Beta']],
  ['chinese_traditional', ['內建語言', '自動翻譯 · Beta']],
  ['french', ['Langues intégrées', 'Traduction automatique · Beta']],
  ['deutsch', ['Integrierte Sprachen', 'Automatische Übersetzung · Beta']],
  ['spanish', ['Idiomas integrados', 'Traducción automática · Beta']],
  ['russian', ['Встроенные языки', 'Автоперевод · Beta']],
  ['portuguese', ['Idiomas integrados', 'Tradução automática · Beta']],
  ['italian', ['Lingue integrate', 'Traduzione automatica · Beta']],
  ['vietnamese', ['Ngôn ngữ tích hợp', 'Dịch tự động · Beta']]
])

export function isExtraLanguage(value) {
  return extraValues.has(value)
}

export function normalizeSettingsLocale({ language, extraLanguage } = {}) {
  return {
    language: nativeValues.has(language) ? language : 'zh',
    extraLanguage: isExtraLanguage(extraLanguage) ? extraLanguage : ''
  }
}

export function interfaceLanguage(settings) {
  const { language, extraLanguage } = normalizeSettingsLocale(settings)
  return extraLanguage || language
}

export function languageGroupLabels(settings) {
  return groupLabels.get(interfaceLanguage(settings))
}

export function selectInterfaceLanguage(settings, value) {
  if (nativeValues.has(value)) return { language: value, extraLanguage: '' }
  if (isExtraLanguage(value)) return { language: normalizeSettingsLocale(settings).language, extraLanguage: value }
  return null
}
