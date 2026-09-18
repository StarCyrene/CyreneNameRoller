import { dataBridge } from '../utils/dataBridge.js'
import { useNamesStore } from '../stores/names.js'
import { useRecordsStore } from '../stores/records.js'
import { useStatisticsStore } from '../stores/statistics.js'
import { commitCoreStateTransaction } from '../plugins/coreDraw.js'
import { normalizeCoreCaller, normalizeCoreCardInput, normalizeCoreCommitState, normalizeCoreDrawInput, normalizeCoreMaintenanceInput } from './protocol.js'
import { isTauri, tauriAPI } from '../utils/tauriAPI.js'

class CoreClient {
  constructor() {
    this.worker = null
    this.pending = new Map()
    this.requestSequence = 0
    this.lastStateSignature = ''
    this.commitQueue = Promise.resolve()
    this.webQueue = Promise.resolve()
  }

  ensureWorker() {
    if (this.worker) return this.worker
    if (typeof Worker === 'undefined') {
      throw Object.assign(new Error('Core Worker 不可用，已拒绝执行抽签'), { code: 'CORE_TRANSACTION_REJECTED' })
    }
    const worker = new Worker(new URL('./web/core.worker.js', import.meta.url), { type: 'module', name: 'cyrene-core' })
    this.worker = worker
    worker.onmessage = event => this.handleWorkerMessage(worker, event)
    worker.onerror = event => {
      const error = Object.assign(new Error(event.message || 'Core Worker crashed'), { code: 'CORE_TRANSACTION_REJECTED' })
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      worker.terminate()
      if (this.worker === worker) this.worker = null
    }
    return worker
  }

  request(message) {
    const worker = this.ensureWorker()
    const requestId = `core-${++this.requestSequence}`
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      worker.postMessage({ ...message, requestId })
    })
  }

  handleWorkerMessage(worker, event) {
    const message = event.data || {}
    if (message.type === 'commit.request') {
      if (this.pending.has(message.requestId)) void this.commitWorkerState(worker, message)
      return
    }
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    if (message.type === 'success') pending.resolve(message.value)
    else pending.reject(Object.assign(new Error(message.message || 'Core transaction failed'), { code: message.code || 'CORE_TRANSACTION_REJECTED' }))
  }

  async commitWorkerState(worker, message) {
    try {
      const { nextStatistics, nextRecords } = normalizeCoreCommitState(message.value)
      const statisticsStore = useStatisticsStore()
      const recordsStore = useRecordsStore()
      const commit = this.commitQueue.catch(() => {}).then(() => commitCoreStateTransaction({
        statisticsStore,
        recordsStore,
        nextStatistics,
        nextRecords
      }))
      this.commitQueue = commit
      await commit
      worker.postMessage({ type: 'commit.resolve', requestId: message.requestId })
    } catch (error) {
      worker.postMessage({
        type: 'commit.reject',
        requestId: message.requestId,
        code: error?.code || 'CORE_TRANSACTION_ROLLED_BACK',
        message: error?.message || String(error)
      })
    }
  }

  enqueueWebTransaction(task) {
    const next = this.webQueue.catch(() => {}).then(task)
    this.webQueue = next
    return next
  }

  webStateSignature(namesStore, recordsStore, statisticsStore, balance) {
    return `${namesStore.revision}:${recordsStore.revision}:${statisticsStore.revision}:${JSON.stringify(balance || {})}`
  }

  async syncWebState(namesStore, recordsStore, statisticsStore) {
    const balance = await dataBridge.load('balance')
    const stateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
    if (stateSignature !== this.lastStateSignature) {
      await this.request({
        type: 'state.sync',
        state: {
          names: { currentListId: namesStore.currentListId, lists: JSON.parse(JSON.stringify(namesStore.nameLists)) },
          records: recordsStore.snapshotState(),
          statistics: statisticsStore.snapshotState(),
          balance
        }
      })
      this.lastStateSignature = stateSignature
    }
    return balance
  }

  async executeDraw({ caller: rawCaller, input: rawInput }) {
    const caller = normalizeCoreCaller(rawCaller)
    const input = normalizeCoreDrawInput(rawInput)
    const namesStore = useNamesStore()
    const recordsStore = useRecordsStore()
    const statisticsStore = useStatisticsStore()
    await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
    if (isTauri()) {
      const principal = caller.kind === 'plugin' ? `plugin:${caller.pluginId}` : 'core-ui'
      const value = await tauriAPI.coreDrawExecute({
        grantToken: await tauriAPI.coreGrantTokenFor(principal),
        principal,
        callerKind: caller.kind === 'plugin' ? 'plugin' : 'core-ui',
        pluginId: caller.pluginId,
        operationId: caller.operationId,
        countStatistics: caller.countStatistics,
        input
      })
      await statisticsStore.restoreState(value.statistics, { persist: false })
      await recordsStore.restoreState(value.records, { persist: false })
      return JSON.parse(JSON.stringify(value.receipt))
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const receipt = await this.request({ type: 'draw.execute', caller, input })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
      return JSON.parse(JSON.stringify(receipt))
    })
  }

  async commitCard({ listId, personIds, operationId = '' }) {
    const caller = normalizeCoreCaller({ kind: 'core-ui', pluginId: 'core', operationId, countStatistics: false })
    const input = normalizeCoreCardInput({ listId, personIds })
    const namesStore = useNamesStore()
    const recordsStore = useRecordsStore()
    const statisticsStore = useStatisticsStore()
    await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
    if (isTauri()) {
      const value = await tauriAPI.coreCardCommit({
        grantToken: await tauriAPI.coreGrantTokenFor('core-ui'),
        principal: 'core-ui',
        callerKind: 'core-ui',
        pluginId: 'core',
        operationId: caller.operationId,
        input
      })
      await recordsStore.restoreState(value.records, { persist: false })
      return JSON.parse(JSON.stringify(value.receipt))
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const receipt = await this.request({ type: 'card.commit', caller, input })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
      return JSON.parse(JSON.stringify(receipt))
    })
  }

  async clearRecords() {
    const caller = normalizeCoreCaller({ kind: 'core-ui', pluginId: 'core', operationId: `clear-records-${Date.now()}`, countStatistics: false })
    const input = normalizeCoreMaintenanceInput({ action: 'clear-records' })
    const namesStore = useNamesStore()
    const recordsStore = useRecordsStore()
    const statisticsStore = useStatisticsStore()
    await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
    if (isTauri()) {
      const value = await tauriAPI.coreMaintenanceExecute('clear-records')
      await statisticsStore.restoreState(value.statistics, { persist: false })
      await recordsStore.restoreState(value.records, { persist: false })
      return JSON.parse(JSON.stringify(value.receipt))
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const receipt = await this.request({ type: 'maintenance.execute', caller, input })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
      return JSON.parse(JSON.stringify(receipt))
    })
  }

  async initializePersonCount({ listId, personId, mode = 'midpoint' }) {
    const caller = normalizeCoreCaller({ kind: 'core-ui', pluginId: 'core', operationId: `initialize-person-${personId}`, countStatistics: false })
    const input = normalizeCoreMaintenanceInput({ action: 'initialize-person-count', listId, personId, mode })
    const namesStore = useNamesStore()
    const recordsStore = useRecordsStore()
    const statisticsStore = useStatisticsStore()
    await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
    if (isTauri()) {
      const value = await tauriAPI.coreMaintenanceExecute(input.action, input)
      await statisticsStore.restoreState(value.statistics, { persist: false })
      await recordsStore.restoreState(value.records, { persist: false })
      return Number(value.statistics?.counts?.[personId]) || 0
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      await this.request({ type: 'maintenance.execute', caller, input })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
      return Number(statisticsStore.counts?.[personId]) || 0
    })
  }

  async revokePlugin(pluginId) {
    const principal = `plugin:${String(pluginId || '')}`
    if (isTauri()) await tauriAPI.coreRevokePrincipal(principal)
  }
}

const client = new CoreClient()
export function getCoreClient() { return client }
