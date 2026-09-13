import assert from 'node:assert/strict'
import test from 'node:test'

import { CoreHookCoordinator } from '../src/plugins/api15/coreHooks.js'

test('runs declared hooks serially in load order and applies only filter patches', async () => {
  const calls = []
  const coordinator = new CoreHookCoordinator({ now: () => 0 })
  coordinator.register({ pluginId: 'later', loadOrder: 2, operation: 'name-draw', invoke: async context => {
    calls.push(['later', context.filter.count])
    return { allow: true, patch: { count: 3 } }
  } })
  coordinator.register({ pluginId: 'first', loadOrder: 1, operation: 'name-draw', invoke: async context => {
    calls.push(['first', context.filter.count])
    context.filter.count = 99
    return { allow: true, patch: { count: 2 } }
  } })

  const result = await coordinator.before('name-draw', {
    listId: 'main', count: 1, gender: 'all', allowDuplicates: false,
    names: [{ id: 'secret' }], random: 0.5
  })

  assert.deepEqual(calls, [['first', 1], ['later', 2]])
  assert.deepEqual(result.filter, { listId: 'main', count: 3, gender: 'all', allowDuplicates: false })
  assert.equal(result.audit.length, 2)
  assert.equal(Object.hasOwn(result.audit[0], 'results'), false)
})

test('rejects invalid patches, aborts without committing, and disables repeated failures', async () => {
  let invocations = 0
  const coordinator = new CoreHookCoordinator({ now: () => 0 })
  coordinator.register({ pluginId: 'bad', loadOrder: 1, operation: 'card-flip', invoke: async () => {
    invocations += 1
    return { allow: true, patch: { random: 0.1 } }
  } })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(coordinator.before('card-flip', { listId: 'main', count: 1 }), error => error.code === 'PLUGIN_HOOK_INVALID_RESPONSE')
  }
  assert.equal(invocations, 3)
  assert.equal(coordinator.isEnabled('bad'), false)
  assert.deepEqual(coordinator.audit.map(entry => entry.decision), ['reject', 'reject', 'reject'])
})

test('enforces explicit abort and does not expose mutable context state', async () => {
  const coordinator = new CoreHookCoordinator({ now: () => 0 })
  coordinator.register({ pluginId: 'aborter', loadOrder: 1, operation: 'lottery-draw', invoke: async context => {
    assert.throws(() => { context.state.statistics.totalCount = 99 })
    return { allow: false, reason: 'not now' }
  } })
  await assert.rejects(coordinator.before('lottery-draw', { listId: 'main', count: 1, state: { statistics: { totalCount: 0 } } }), error => error.code === 'PLUGIN_HOOK_ABORTED')
  assert.equal(coordinator.audit[0].decision, 'abort')
})

test('rejects fairness-owned response fields and records timeout failures', async () => {
  const coordinator = new CoreHookCoordinator({ cumulativeTimeoutMs: 20 })
  coordinator.register({ pluginId: 'unsafe', operation: 'prize-assignment', invoke: async () => ({ allow: true, results: [] }) })
  await assert.rejects(coordinator.before('prize-assignment', { listId: 'main', count: 1 }), error => error.code === 'PLUGIN_HOOK_INVALID_RESPONSE')

  coordinator.register({ pluginId: 'slow', operation: 'prize-assignment', timeoutMs: 1, invoke: async () => new Promise(() => {}) })
  await assert.rejects(coordinator.before('prize-assignment', { listId: 'main', count: 1 }), error => error.code === 'PLUGIN_HOOK_TIMEOUT')
  assert.equal(coordinator.audit.at(-1).code, 'PLUGIN_HOOK_TIMEOUT')
})

test('delivers after hooks only after the host operation is committed', async () => {
  const received = []
  const coordinator = new CoreHookCoordinator({ now: () => 0 })
  coordinator.register({ pluginId: 'observer', operation: 'prize-assignment', phase: 'after', invoke: event => received.push(event) })
  await coordinator.after('prize-assignment', { operationId: 'assign-1', results: [] }, [], {
    originalFilter: { listId: 'default', count: 2 }, finalFilter: { listId: 'default', count: 1 }
  })
  assert.deepEqual(received[0], {
    operation: 'prize-assignment', operationId: 'assign-1', receipt: { operationId: 'assign-1', results: [] },
    filterDiff: { original: { listId: 'default', count: 2 }, final: { listId: 'default', count: 1 } }, committed: true, audit: []
  })
})

test('auto-disable callback is fired once after the failure threshold', async () => {
  const disabled = []
  const coordinator = new CoreHookCoordinator({ now: () => 0, onDisable: pluginId => disabled.push(pluginId) })
  coordinator.register({ pluginId: 'failing', operation: 'lottery-draw', invoke: async () => ({ allow: true, patch: { random: 0.5 } }) })
  for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(coordinator.before('lottery-draw', {}))
  assert.deepEqual(disabled, ['failing'])
  assert.equal(coordinator.isEnabled('failing'), false)
})
