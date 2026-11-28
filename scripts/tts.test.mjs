import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnnouncementText, DEFAULT_TTS_TEMPLATE, voiceOptions } from '../src/utils/tts/catalog.js'
import { normalizeTtsSettings } from '../src/utils/tts/preferences.js'
import { generateSecMsGec } from '../src/utils/tts/gec.js'

test('builds the announcement text from the template', () => {
  assert.equal(buildAnnouncementText(DEFAULT_TTS_TEMPLATE, ['张三']), '请 张三')
  assert.equal(buildAnnouncementText('有请 {names} 同学', ['张三', '李四']), '有请 张三、李四 同学')
  assert.equal(buildAnnouncementText('{names}', ['王五']), '王五')
  assert.equal(buildAnnouncementText('', ['王五']), '请 王五')
  assert.equal(buildAnnouncementText('请 {names}', []), '')
  assert.equal(buildAnnouncementText('请 {names}', ['', null, '赵六']), '请 赵六')
})

test('falls back to the default template without a placeholder', () => {
  assert.equal(buildAnnouncementText('点名结果', ['钱七']), '点名结果 钱七')
})

test('normalizes tts preferences', () => {
  const normalized = normalizeTtsSettings({
    ttsEnabled: 'yes',
    ttsProvider: 'unknown',
    ttsRate: 999,
    ttsVolume: -20,
    ttsMimoMode: 'clone',
    ttsTemplate: ''
  })
  assert.equal(normalized.ttsEnabled, false)
  assert.equal(normalized.ttsProvider, 'edge')
  assert.equal(normalized.ttsRate, 100)
  assert.equal(normalized.ttsVolume, 0)
  assert.equal(normalized.ttsMimoMode, 'clone')
  assert.equal(normalized.ttsTemplate, DEFAULT_TTS_TEMPLATE)
})

test('exposes curated voice options for every provider', () => {
  for (const provider of ['edge', 'mimo', 'cosyvoice', 'qwen']) {
    const options = voiceOptions(provider)
    assert.ok(options.length > 0, provider)
    assert.ok(options.every(option => option.value && option.label), provider)
  }
})

test('derives the Edge TTS Sec-MS-GEC token', () => {
  assert.equal(
    generateSecMsGec(1700000000),
    '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2'
  )
  assert.equal(
    generateSecMsGec(1764340000.0),
    'F7F3D7B54201ECE0-CF5B4516AE101451064F7ABC04DC03C0C82FDC923B793EC299688B8C5FF86311'
  )
  assert.match(generateSecMsGec(), /^[0-9A-F]{16}-[0-9A-F]{64}$/)
})
