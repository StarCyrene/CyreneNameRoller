import { executeCoreCardRequest, executeCoreDrawRequest, executeCoreMaintenanceRequest } from './coreService.js'
import { normalizeCoreCommitState } from '../protocol.js'

export function createCoreWorkerHandler(postMessage) {
  let queue = Promise.resolve()
  let coreState = null
  const peopleCache = new Map()
  const pendingCommits = new Map()

  function validateHostState(state) {
    const allowed = new Set(['names', 'records', 'statistics', 'balance'])
    if (!state || typeof state !== 'object' || Array.isArray(state) || Object.keys(state).some(key => !allowed.has(key))) {
      throw Object.assign(new Error('Core 状态包含非宿主字段'), { code: 'CORE_INTEGRITY_CHECK_FAILED' })
    }
    return state
  }

  function requestCommit(requestId, value) {
    return new Promise((resolve, reject) => {
      pendingCommits.set(requestId, { resolve, reject })
      postMessage({
        type: 'commit.request',
        requestId,
        value: { nextStatistics: value.nextStatistics, nextRecords: value.nextRecords }
      })
    })
  }

  return event => {
    const message = event?.data || {}
    if (message.type === 'commit.resolve' || message.type === 'commit.reject') {
      const pending = pendingCommits.get(message.requestId)
      if (!pending) return
      pendingCommits.delete(message.requestId)
      if (message.type === 'commit.resolve') pending.resolve()
      else pending.reject(Object.assign(new Error(message.message || 'Core 状态提交失败'), { code: message.code || 'CORE_TRANSACTION_ROLLED_BACK' }))
      return
    }
    if (!['state.sync', 'draw.execute', 'card.commit', 'maintenance.execute'].includes(message.type) || typeof message.requestId !== 'string') return
    queue = queue.catch(() => {}).then(async () => {
      try {
        if (message.type === 'state.sync') {
           coreState = structuredClone(validateHostState(message.state))
          peopleCache.clear()
          postMessage({ type: 'success', requestId: message.requestId, value: true })
          return
        }
        if (!coreState) throw Object.assign(new Error('Core Worker 尚未同步状态'), { code: 'CORE_TRANSACTION_REJECTED' })
        const value = message.type === 'card.commit'
          ? executeCoreCardRequest({ ...message, state: coreState })
          : message.type === 'maintenance.execute'
            ? executeCoreMaintenanceRequest({ ...message, state: coreState })
            : executeCoreDrawRequest({ ...message, state: coreState, peopleCache })
        const commit = normalizeCoreCommitState({ nextStatistics: value.nextStatistics, nextRecords: value.nextRecords })
        await requestCommit(message.requestId, commit)
        coreState = { ...coreState, statistics: value.nextStatistics, records: value.nextRecords }
        postMessage({ type: 'success', requestId: message.requestId, value: value.receipt })
      } catch (error) {
        postMessage({ type: 'error', requestId: message.requestId, code: error?.code || 'CORE_TRANSACTION_REJECTED', message: error?.message || String(error) })
      }
    })
    return queue
  }
}

if (typeof self !== 'undefined') self.onmessage = createCoreWorkerHandler(message => self.postMessage(message))
