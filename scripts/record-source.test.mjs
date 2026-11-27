import assert from 'node:assert/strict'
import test from 'node:test'
import { executeCoreDrawRequest } from '../src/core/web/coreService.js'
import { recordSourceLabel } from '../src/utils/recordSources.mjs'

const people = [{ id: 'a', cn: '甲' }, { id: 'b', cn: '乙' }]
const state = { names: { lists: { class: { names: people } } }, statistics: { counts: {}, totalCount: 0 }, records: [] }
const caller = { kind: 'core-ui', pluginId: 'core' }
const input = { listId: 'class', target: 'people', count: 1, allowDuplicates: false, gender: 'all' }

test('every host roll-call tool records its own source', () => {
  for (const source of ['roller', 'wheel', 'tunnel', 'seats', 'relay', 'riddle']) {
    const tx = executeCoreDrawRequest({ caller, input, state, source })
    assert.equal(tx.nextRecords[0].source, source)
  }
  // Older callers and legacy records keep the generic roller label.
  assert.equal(executeCoreDrawRequest({ caller, input, state }).nextRecords[0].source, 'roller')
})

test('unknown host sources are rejected; plugin draws stay plugin-scoped', () => {
  assert.throws(
    () => executeCoreDrawRequest({ caller, input, state, source: 'unknown' }),
    { code: 'CORE_TRANSACTION_REJECTED' }
  )
  // card is a separate commit path, not a generic draw source.
  assert.throws(
    () => executeCoreDrawRequest({ caller, input, state, source: 'card' }),
    { code: 'CORE_TRANSACTION_REJECTED' }
  )
  const plugin = executeCoreDrawRequest({ caller: { kind: 'plugin', pluginId: 'cn.demo' }, input, state, source: 'wheel' })
  assert.equal(plugin.nextRecords[0].source, 'plugin:cn.demo')
})

test('record source labels are localized and keep legacy names', () => {
  assert.equal(recordSourceLabel('wheel', 'zh'), '转盘点名')
  assert.equal(recordSourceLabel('wheel', 'en'), 'Wheel')
  assert.equal(recordSourceLabel('card', 'zh'), '翻牌点名')
  assert.equal(recordSourceLabel('tunnel', 'en'), 'Light Tunnel')
  assert.equal(recordSourceLabel('plugin:cn.demo', 'zh', 'cn.demo'), '插件 · cn.demo')
  assert.equal(recordSourceLabel(undefined, 'zh'), '随机点名')
})
