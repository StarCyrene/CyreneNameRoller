import assert from 'node:assert/strict'
import test from 'node:test'
import { executePrizeRequest } from '../src/core/web/coreService.js'
import { normalizeCorePrizeInput } from '../src/core/protocol.js'
import fs from 'node:fs/promises'

const state = () => ({ names: { lists: {} }, prizes: { lists: { prizes: { id: 'prizes', prizes: [{ id: 'p1', name: 'Token', quality: '普通', quantity: 2, weight: 1 }] } }, currentId: 'prizes', records: [] } })

test('Core prize transaction owns random result, decrements inventory, and appends a receipt record', () => {
  const result = executePrizeRequest({ operation: 'lottery-draw', input: { listId: 'prizes', count: 1 }, state: state(), caller: { pluginId: 'core', operationId: 'op-1' } })
  assert.equal(result.nextPrizes.lists.prizes.prizes[0].quantity, 1)
  assert.equal(result.nextPrizes.records[0].prizeId, 'p1')
  assert.equal(result.receipt.operationId, 'op-1')
})

test('Core prize transaction rejects forged result, random, candidate, and state fields', () => {
  for (const field of ['result', 'random', 'candidates', 'state']) assert.throws(() => normalizeCorePrizeInput({ listId: 'prizes', count: 1, [field]: [] }), /forged authority/i)
})

test('Core prize transaction leaves the input unchanged when assignment validation fails', () => {
  const original = state()
  assert.throws(() => executePrizeRequest({ operation: 'prize-assignment', input: { listId: 'prizes', count: 2, peopleListId: 'people' }, state: original, caller: { pluginId: 'core' } }), /Assignment people/)
  assert.equal(original.prizes.lists.prizes.prizes[0].quantity, 2)
  assert.deepEqual(original.prizes.records, [])
})

test('Core prize assignment applies the host gender filter', () => {
  const original = state()
  original.names.lists.people = { names: [
    { id: 'male', cn: 'M', gender: 'male', isWhiteList: false },
    { id: 'female', cn: 'F', gender: 'female', isWhiteList: false }
  ] }
  const result = executePrizeRequest({ operation: 'prize-assignment', input: { listId: 'prizes', count: 1, peopleListId: 'people', gender: 'female' }, state: original, caller: { pluginId: 'core' } })
  assert.equal(result.receipt.results[0].person.id, 'female')
})

test('Tauri prize command is authenticated, state-bound, and registered', async () => {
  const source = await fs.readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
  assert.match(source, /fn core_prize_execute/)
  assert.match(source, /authority\.authorize\(&request\.grant_token/)
  assert.match(source, /OsRng\.fill_bytes/)
  assert.match(source, /core_prize_execute,/) 
  assert.doesNotMatch(source, /matches!\(field\.as_str\(\), "listId" \| "count" \| "people"/) 
  assert.match(source, /verify_bound_values\(&old_values, &envelope\)/)
  assert.match(source, /"gender"/)
  assert.match(source, /weight/)
})

test('Tauri prize command checks bound state before prize reads and uses Web record modes', async () => {
  const source = await fs.readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
  assert.ok(source.indexOf('verify_bound_values(&old_values, &envelope)') < source.indexOf('let input = request.input.as_object()'))
  assert.match(source, /"mode": if request\.operation == "prize-assignment" \{ "assign" \} else \{ "draw" \}/)
})
