const DRAW_ARGUMENTS = new Set(['listId', 'target', 'count', 'allowDuplicates', 'gender'])

export function validateCoreDrawArgs(rawArgs = {}) {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) throw new Error('draw.execute 参数必须为对象')
  const unsupported = Object.keys(rawArgs).find(key => !DRAW_ARGUMENTS.has(key))
  if (unsupported) throw new Error(`draw.execute 不允许插件指定参数 ${unsupported}`)
  return rawArgs
}

export async function commitCoreStateTransaction({ statisticsStore, recordsStore, prizesStore, nextStatistics, nextRecords, nextPrizes }) {
  const statisticsSnapshot = statisticsStore.snapshotState()
  const recordsSnapshot = recordsStore.snapshotState()
  const prizesSnapshot = prizesStore?.snapshotState()
  try {
    await statisticsStore.restoreState(nextStatistics, { persist: false })
    await recordsStore.restoreState(nextRecords, { persist: false })
    if (nextPrizes && prizesStore) await prizesStore.restoreState(nextPrizes, { persist: false })
    const persistence = await Promise.allSettled([statisticsStore.save(), recordsStore.save(), ...(nextPrizes && prizesStore ? [prizesStore.save(), prizesStore.saveRecords()] : [])])
    const failed = persistence.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
  } catch (error) {
    await statisticsStore.restoreState(statisticsSnapshot, { persist: false })
    await recordsStore.restoreState(recordsSnapshot, { persist: false })
    if (prizesSnapshot && prizesStore) await prizesStore.restoreState(prizesSnapshot, { persist: false })
    await Promise.allSettled([statisticsStore.save(), recordsStore.save(), ...(prizesSnapshot && prizesStore ? [prizesStore.save(), prizesStore.saveRecords()] : [])])
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { code: 'CORE_TRANSACTION_ROLLED_BACK' })
  }
}
