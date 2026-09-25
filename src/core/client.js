import { dataBridge } from '../utils/dataBridge.js'
import { useNamesStore } from '../stores/names.js'
import { useRecordsStore } from '../stores/records.js'
import { useStatisticsStore } from '../stores/statistics.js'
import { usePrizesStore } from '../stores/prizes.js'
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
    this.hookCoordinator = null
  }

  setHookCoordinator(coordinator) { this.hookCoordinator = coordinator }

  async runAfterHooks(operation, receipt, audit, metadata) {
    return this.hookCoordinator?.after(operation, receipt, audit, metadata) || []
  }

  async executeHookedOperation(operation, filter, execute) {
    const hooked = this.hookCoordinator && await this.hookCoordinator.before(operation, filter)
    const finalFilter = hooked ? { ...filter, ...hooked.filter } : filter
    const receipt = await execute(finalFilter)
    if (!hooked) return receipt
    const afterAudit = await this.runAfterHooks(operation, receipt, hooked.audit, { originalFilter: filter, finalFilter })
    return JSON.parse(JSON.stringify({ ...receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: filter, finalFilter }))
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

  // Web 端提前拉起 Worker，避免首抽停止时才付冷启动代价
  prewarm() {
    if (isTauri()) return false
    try {
      this.ensureWorker()
      return true
    } catch {
      return false
    }
  }

  // stores 就绪后预同步，让第一次 draw.execute 不必再等 state.sync
  async warmWebState() {
    if (isTauri()) return false
    try {
      this.ensureWorker()
      const namesStore = useNamesStore()
      const recordsStore = useRecordsStore()
      const statisticsStore = useStatisticsStore()
      await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
      await this.syncWebState(namesStore, recordsStore, statisticsStore)
      return true
    } catch (error) {
      console.warn('[core] web warm failed:', error)
      return false
    }
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
      const { nextStatistics, nextRecords, nextPrizes } = normalizeCoreCommitState(message.value)
      const statisticsStore = useStatisticsStore()
      const recordsStore = useRecordsStore()
      const prizesStore = usePrizesStore()
      const commit = this.commitQueue.catch(() => {}).then(() => commitCoreStateTransaction({
        statisticsStore,
        recordsStore,
        prizesStore,
        nextStatistics,
        nextRecords,
        ...(nextPrizes ? { nextPrizes } : {})
      }))
      this.commitQueue = commit
      await commit
      if (nextPrizes) await usePrizesStore().restoreState(nextPrizes)
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
    return JSON.stringify({
      names: { currentListId: namesStore.currentListId, lists: namesStore.nameLists },
      records: recordsStore.snapshotState(),
      statistics: statisticsStore.snapshotState(),
      balance: balance || {},
      prizes: usePrizesStore().snapshotState()
    })
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
          prizes: usePrizesStore().snapshotState(),
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
    const hooked = this.hookCoordinator && await this.hookCoordinator.before('name-draw', input)
    const effectiveInput = hooked ? { ...input, ...hooked.filter } : input
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
        input: effectiveInput
      })
      await statisticsStore.restoreState(value.statistics, { persist: false })
      await recordsStore.restoreState(value.records, { persist: false })
      if (value.prizes) await usePrizesStore().restoreState(value.prizes, { persist: false })
        const afterAudit = await this.runAfterHooks('name-draw', value.receipt, hooked?.audit, { originalFilter: input, finalFilter: effectiveInput })
       return JSON.parse(JSON.stringify(hooked ? { ...value.receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: input, finalFilter: effectiveInput } : value.receipt))
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const receipt = await this.request({ type: 'draw.execute', caller, input: effectiveInput })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
       const afterAudit = await this.runAfterHooks('name-draw', receipt, hooked?.audit, { originalFilter: input, finalFilter: effectiveInput })
      return JSON.parse(JSON.stringify(hooked ? { ...receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: input, finalFilter: effectiveInput } : receipt))
    })
  }

  async executePrizeOperation({ operation, input, caller = { kind: 'core-ui', pluginId: 'core' } }) {
    const prizesStore = usePrizesStore()
    await prizesStore.initialize()
    const namesStore = useNamesStore()
    const recordsStore = useRecordsStore()
    const statisticsStore = useStatisticsStore()
    await Promise.all([namesStore.initialize(), recordsStore.initialize(), statisticsStore.initialize()])
    const normalizedCaller = normalizeCoreCaller(caller)
    const hooked = this.hookCoordinator && await this.hookCoordinator.before(operation, input)
    const effectiveInput = hooked ? { ...input, ...hooked.filter } : input
    if (isTauri()) {
      const value = await tauriAPI.corePrizeExecute({
        grantToken: await tauriAPI.coreGrantTokenFor('core-ui'), principal: 'core-ui', callerKind: 'core-ui', pluginId: 'core',
        operationId: normalizedCaller.operationId, operation, input: effectiveInput
      })
      await prizesStore.restoreState(value.prizes, { persist: false })
      return hooked ? { ...value.receipt, hookAudit: [...hooked.audit, ...(await this.runAfterHooks(operation, value.receipt, hooked.audit, { originalFilter: input, finalFilter: effectiveInput }))], originalFilter: input, finalFilter: effectiveInput } : value.receipt
    }
    return this.enqueueWebTransaction(async () => {
      await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const value = await this.request({ type: 'prize.execute', caller: normalizedCaller, operation, input: effectiveInput })
      await prizesStore.restoreState(value.prizes, { persist: false })
      const afterAudit = await this.runAfterHooks(operation, value.receipt, hooked?.audit, { originalFilter: input, finalFilter: effectiveInput })
      return hooked ? { ...value.receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: input, finalFilter: effectiveInput } : value.receipt
    })
  }

  async commitCard({ listId, personIds, operationId = '' }) {
    const caller = normalizeCoreCaller({ kind: 'core-ui', pluginId: 'core', operationId, countStatistics: false })
    const input = normalizeCoreCardInput({ listId, personIds })
    const hooked = this.hookCoordinator && await this.hookCoordinator.before('card-flip', { ...input, count: input.personIds.length, allowDuplicates: false, gender: 'all' })
    const auditFilter = hooked ? { ...input, ...hooked.filter } : input
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
        input: hooked ? { ...input, listId: hooked.filter.listId } : input
      })
      await recordsStore.restoreState(value.records, { persist: false })
        const afterAudit = await this.runAfterHooks('card-flip', value.receipt, hooked?.audit, { originalFilter: input, finalFilter: auditFilter })
       return JSON.parse(JSON.stringify(hooked ? { ...value.receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: input, finalFilter: auditFilter } : value.receipt))
    }
    return this.enqueueWebTransaction(async () => {
      const balance = await this.syncWebState(namesStore, recordsStore, statisticsStore)
      const receipt = await this.request({ type: 'card.commit', caller, input: hooked ? { ...input, listId: hooked.filter.listId } : input })
      this.lastStateSignature = this.webStateSignature(namesStore, recordsStore, statisticsStore, balance)
       const afterAudit = await this.runAfterHooks('card-flip', receipt, hooked?.audit, { originalFilter: input, finalFilter: auditFilter })
      return JSON.parse(JSON.stringify(hooked ? { ...receipt, hookAudit: [...hooked.audit, ...afterAudit], originalFilter: input, finalFilter: auditFilter } : receipt))
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
