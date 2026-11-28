import assert from 'node:assert/strict'
import test from 'node:test'
import { interfaceLanguage, languageGroupLabels, normalizeSettingsLocale, selectInterfaceLanguage } from '../src/utils/settingsLocale.mjs'

test('saved native and automatic language settings map to the one interface choice', () => {
  assert.equal(interfaceLanguage({ language: 'en' }), 'en')
  assert.equal(interfaceLanguage({ language: 'zh', extraLanguage: 'japanese' }), 'japanese')
  assert.deepEqual(normalizeSettingsLocale({ language: 'bad', extraLanguage: 'not-a-target' }), { language: 'zh', extraLanguage: '' })
})

test('switching to a built-in language always stops automatic translation', () => {
  const translated = selectInterfaceLanguage({ language: 'en', extraLanguage: '' }, 'japanese')
  assert.deepEqual(translated, { language: 'en', extraLanguage: 'japanese' })
  assert.deepEqual(selectInterfaceLanguage(translated, 'french'), { language: 'en', extraLanguage: 'french' })
  assert.deepEqual(selectInterfaceLanguage(translated, 'en'), { language: 'en', extraLanguage: '' })
  assert.deepEqual(selectInterfaceLanguage(translated, 'zh'), { language: 'zh', extraLanguage: '' })
  assert.equal(selectInterfaceLanguage(translated, 'unknown'), null)
})

test('group headings follow the chosen interface and fall back to the saved built-in language', () => {
  assert.deepEqual(languageGroupLabels({ language: 'zh', extraLanguage: 'russian' }), ['Встроенные языки', 'Автоперевод · Beta'])
  assert.deepEqual(languageGroupLabels({ language: 'en', extraLanguage: 'unknown' }), ['Built-in languages', 'Automatic translation · Beta'])
  assert.deepEqual(languageGroupLabels({}), ['内置语言', '自动翻译 · Beta'])
})
