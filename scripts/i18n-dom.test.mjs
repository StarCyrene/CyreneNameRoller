import test from 'node:test'
import assert from 'node:assert/strict'
import { exactUiTranslation } from '../src/utils/i18nGlossary.mjs'
import { EXTRA_LANGUAGES } from '../src/utils/settingsLocale.mjs'
import { uiFragmentSource } from '../src/utils/i18nDom.mjs'

test('every extra language resolves bilingual tool, prompt, lottery and settings labels', () => {
  for (const { value } of EXTRA_LANGUAGES) {
    for (const [zh, en] of [
      ['随机点名', 'Random roll call'], ['点名工具', 'Roll call tools'], ['滚动点名', 'Roller'], ['翻牌点名', 'Cards'],
      ['转盘点名', 'Wheel'], ['光轨穿梭', 'Light Tunnel'], ['座次寻光', 'Seat Spotlight'], ['流萤传灯', 'Firefly Relay'],
      ['花笺藏名', 'Petal Riddle'], ['连星成诗', 'Constellations'], ['谁来点亮？', 'Who goes first?'],
      ['下一站，是谁？', 'Who arrives next?'], ['抽奖', 'Lottery'], ['界面语言', 'Interface language'],
    ]) {
      const zhTerm = exactUiTranslation(value, zh)
      assert.ok(zhTerm, value + ': ' + zh)
      assert.equal(zhTerm, exactUiTranslation(value, en))
    }
  }
  assert.equal(exactUiTranslation('russian', ' 谁来点亮？ '), ' Кто зажжёт фонарь? ')
  assert.equal(exactUiTranslation('russian', 'Random roll call'), 'Случайный выбор из списка')
  assert.equal(exactUiTranslation('russian', 'A custom list: 随机点名'), null)
  assert.equal(exactUiTranslation('en', '随机点名'), null)
})

test('whole fragment source does not confuse shared Han characters and Latin product names', () => {
  assert.equal(uiFragmentSource('Cyreneの随机点名器'), 'chinese_simplified')
  assert.equal(uiFragmentSource('用 Microsoft Edge 翻译'), 'chinese_simplified')
  assert.equal(uiFragmentSource('18 items'), 'english')
  assert.equal(uiFragmentSource('English Mode'), 'english')
  assert.equal(uiFragmentSource('ホタルのリレー'), null)
  assert.equal(uiFragmentSource('123 · 45%'), null)
})
