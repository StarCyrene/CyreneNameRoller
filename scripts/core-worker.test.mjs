import assert from 'node:assert/strict'
import test from 'node:test'
import { createCoreWorkerHandler } from '../src/core/web/core.worker.js'
import { executeCoreCardRequest, executeCoreDrawRequest } from '../src/core/web/coreService.js'
import { normalizeCoreCardInput, normalizeCoreCommitState, normalizeCoreDrawInput } from '../src/core/protocol.js'
import { commitCoreStateTransaction } from '../src/plugins/coreDraw.js'

const state = {
  names: {
    currentListId: 'list-1',
    lists: {
      'list-1': {
        id: 'list-1',
        groups: [],
        names: [
          { id: 'person-1', cn: '甲', en: 'A', gender: 'male', isWhiteList: false },
          { id: 'person-2', cn: '乙', en: 'B', gender: 'female', isWhiteList: false }
        ]
      }
    }
  },
  records: [],
  statistics: { counts: {}, totalCount: 0 },
  balance: { enabled: true }
}

test('Core 输入拒绝未知字段并规范化宿主字段', () => {
  assert.throws(() => normalizeCoreDrawInput({ listId: 'list-1', results: ['person-1'] }), error => error.code === 'CORE_TRANSACTION_REJECTED')
  assert.deepEqual(normalizeCoreDrawInput({ listId: 'list-1', count: 0 }), {
    listId: 'list-1', target: 'people', count: 1, allowDuplicates: false, gender: 'all'
  })
  assert.throws(() => normalizeCoreCommitState({
    nextStatistics: { counts: {}, totalCount: 0 },
    nextRecords: [],
    results: ['person-1']
  }), error => error.code === 'CORE_TRANSACTION_REJECTED')
  assert.throws(() => normalizeCoreCommitState({
    nextStatistics: { counts: { 'person-1': -1 }, totalCount: -1 },
    nextRecords: []
  }), error => error.code === 'CORE_TRANSACTION_REJECTED')
})

test('Core 事务生成宿主绑定 Receipt 并只返回可提交状态', () => {
  const result = executeCoreDrawRequest({
    state,
    caller: { kind: 'plugin', pluginId: 'cn.example.plugin', operationId: 'op-1' },
    input: { listId: 'list-1', target: 'people', count: 1, allowDuplicates: false, gender: 'all' }
  })
  assert.equal(result.receipt.pluginId, 'cn.example.plugin')
  assert.equal(result.receipt.operationId, 'op-1')
  assert.equal(result.receipt.results.length, 1)
  assert.ok(result.nextStatistics.totalCount >= 0)
  assert.equal(result.nextRecords.length, 1)
  assert.deepEqual(Object.keys(result.receipt.results[0]).sort(), ['englishName', 'id', 'isGroup', 'isWhiteList', 'name'])
})

test('Core Worker 在宿主确认持久化后按请求顺序串行处理并保持状态', async () => {
  const replies = []
  let handler
  handler = createCoreWorkerHandler(message => {
    replies.push(message)
    if (message.type === 'commit.request') queueMicrotask(() => handler({ data: { type: 'commit.resolve', requestId: message.requestId } }))
  })
  await Promise.all([
    handler({ data: { type: 'state.sync', requestId: 'sync-1', state } }),
    handler({ data: { type: 'draw.execute', requestId: 'draw-1', caller: { kind: 'core-ui', pluginId: 'core', operationId: 'op-1' }, input: { listId: 'list-1', count: 1 } } }),
    handler({ data: { type: 'draw.execute', requestId: 'draw-2', caller: { kind: 'core-ui', pluginId: 'core', operationId: 'op-2' }, input: { listId: 'list-1', count: 1 } } })
  ])
  assert.deepEqual(replies.filter(reply => reply.type === 'success').map(reply => reply.requestId), ['sync-1', 'draw-1', 'draw-2'])
  assert.deepEqual(replies.filter(reply => reply.type === 'commit.request').map(reply => reply.requestId), ['draw-1', 'draw-2'])
  assert.ok(replies.filter(reply => reply.type === 'success').every(reply => reply.value?.results?.length === 1 || reply.value === true))
})

test('Core Worker 在宿主提交失败时不推进内部统计和记录状态', async () => {
  const replies = []
  let handler
  let rejectNext = true
  handler = createCoreWorkerHandler(message => {
    replies.push(message)
    if (message.type !== 'commit.request') return
    const shouldReject = rejectNext
    rejectNext = false
    queueMicrotask(() => handler({
      data: shouldReject
        ? { type: 'commit.reject', requestId: message.requestId, code: 'CORE_TRANSACTION_ROLLED_BACK', message: 'save failed' }
        : { type: 'commit.resolve', requestId: message.requestId }
    }))
  })
  await handler({ data: { type: 'state.sync', requestId: 'sync-1', state } })
  await handler({ data: { type: 'draw.execute', requestId: 'draw-failed', caller: { kind: 'core-ui', pluginId: 'core' }, input: { listId: 'list-1' } } })
  await handler({ data: { type: 'draw.execute', requestId: 'draw-ok', caller: { kind: 'core-ui', pluginId: 'core' }, input: { listId: 'list-1' } } })
  assert.equal(replies.find(reply => reply.requestId === 'draw-failed' && reply.type === 'error')?.type, 'error')
  assert.equal(replies.find(reply => reply.requestId === 'draw-ok' && reply.type === 'success')?.type, 'success')
  const commits = replies.filter(reply => reply.type === 'commit.request')
  assert.equal(commits.length, 2)
  assert.equal(commits[0].value.nextRecords.length, 1)
  assert.equal(commits[1].value.nextRecords.length, 1)
})

test('Core Worker 在未同步状态时拒绝抽签', async () => {
  const replies = []
  const handler = createCoreWorkerHandler(message => replies.push(message))
  await handler({ data: { type: 'draw.execute', requestId: 'draw-1', caller: { kind: 'core-ui', pluginId: 'core' }, input: { listId: 'list-1' } } })
  assert.equal(replies[0].type, 'error')
  assert.equal(replies[0].code, 'CORE_TRANSACTION_REJECTED')
})

test('Core Worker 重新同步同一名单 ID 时清除候选池缓存', async () => {
  const replies = []
  let handler
  handler = createCoreWorkerHandler(message => {
    replies.push(message)
    if (message.type === 'commit.request') handler({ data: { type: 'commit.resolve', requestId: message.requestId } })
  })
  await handler({ data: { type: 'state.sync', requestId: 'sync-old', state } })
  await handler({ data: { type: 'draw.execute', requestId: 'draw-old', caller: { kind: 'core-ui', pluginId: 'core' }, input: { listId: 'list-1', gender: 'male' } } })
  const replacement = structuredClone(state)
  replacement.names.lists['list-1'].names = [{ id: 'person-new', cn: '新', en: 'New', gender: 'male', isWhiteList: false }]
  await handler({ data: { type: 'state.sync', requestId: 'sync-new', state: replacement } })
  await handler({ data: { type: 'draw.execute', requestId: 'draw-new', caller: { kind: 'core-ui', pluginId: 'core' }, input: { listId: 'list-1', gender: 'male' } } })
  assert.equal(replies.find(reply => reply.type === 'success' && reply.requestId === 'draw-new')?.value.results[0].id, 'person-new')
})

test('Core 状态提交失败时回滚统计和记录', async () => {
  const statisticsStore = {
    state: { counts: { old: 1 }, totalCount: 1 },
    snapshotState() { return structuredClone(this.state) },
    restoreState(next) { this.state = structuredClone(next) },
    async save() { if (this.state.totalCount === 2) throw new Error('save failed') }
  }
  const recordsStore = {
    state: [{ operationId: 'old' }],
    snapshotState() { return structuredClone(this.state) },
    restoreState(next) { this.state = structuredClone(next) },
    async save() {}
  }
  await assert.rejects(commitCoreStateTransaction({
    statisticsStore,
    recordsStore,
    nextStatistics: { counts: { old: 1, next: 1 }, totalCount: 2 },
    nextRecords: [{ operationId: 'new' }, { operationId: 'old' }]
  }), error => error.code === 'CORE_TRANSACTION_ROLLED_BACK')
  assert.deepEqual(statisticsStore.state, { counts: { old: 1 }, totalCount: 1 })
  assert.deepEqual(recordsStore.state, [{ operationId: 'old' }])
})

test('插件 Store 不暴露 Worker、端口或内部请求 ID', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/plugins/store.js', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /worker\s*:/)
  assert.doesNotMatch(source, /MessagePort/)
  assert.doesNotMatch(source, /requestId\s*:/)
})

test('Core Client 只在 Worker 提交确认路径落地主线程状态', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/core/client.js', import.meta.url), 'utf8'))
  assert.match(source, /this\.commitQueue\s*=\s*Promise\.resolve\(\)/)
  assert.match(source, /this\.commitQueue\.catch\(\(\)\s*=>\s*\{\}\)\.then\(/)
  assert.match(source, /message\.type === 'commit\.request'/)
  assert.match(source, /type: 'commit\.resolve'/)
  assert.match(source, /this\.webQueue\s*=\s*Promise\.resolve\(\)/)
  assert.match(source, /enqueueWebTransaction/)
  assert.doesNotMatch(source, /executeCoreDrawRequest|fallbackState/)
  assert.match(source, /Core Worker 不可用/)
})
