import test from 'node:test'
import assert from 'node:assert/strict'
import { exactUiTranslation } from '../src/utils/i18nGlossary.mjs'
import { EXTRA_LANGUAGES } from '../src/utils/settingsLocale.mjs'

test('extra languages ship exact roll-call terms and Russian relay copy before machine translation', () => {
  for (const { value } of EXTRA_LANGUAGES) {
    assert.ok(exactUiTranslation(value, '随机点名'), value)
    assert.ok(exactUiTranslation(value, 'Roll call tools'), value)
  }
  assert.equal(exactUiTranslation('russian', ' 谁来点亮？ '), ' Кто зажжёт фонарь? ')
  assert.equal(exactUiTranslation('russian', 'Random roll call'), 'Случайный выбор из списка')
  assert.equal(exactUiTranslation('russian', 'A custom list: 随机点名'), null)
  assert.equal(exactUiTranslation('en', '随机点名'), null)
})
