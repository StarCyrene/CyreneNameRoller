import { ALGORITHM_NAME, ALGORITHM_VERSION, normalizeCyreneBalanceSettings, personKey, pickCyreneBatch, secureRandom } from '../../utils/cyrene-balance.js'
import { normalizeCoreCaller, normalizeCoreCardInput, normalizeCoreDrawInput, normalizeCoreMaintenanceInput } from '../protocol.js'

function coreError(code, message) { return Object.assign(new Error(message), { code }) }

export function executeCoreDrawRequest({ input: rawInput, caller: rawCaller, state, peopleCache }) {
  const input = normalizeCoreDrawInput(rawInput)
  const caller = normalizeCoreCaller(rawCaller)
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw coreError('CORE_TRANSACTION_REJECTED', 'Core 状态无效')
  const list = state.names?.lists?.[input.listId]
  if (!list) throw coreError('CORE_TRANSACTION_REJECTED', '抽取名单不存在')

  const operationId = caller.operationId || crypto.randomUUID?.() || `draw-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const committedAt = Date.now()
  let picks
  if (input.target === 'groups') {
    const groups = (list.groups || []).map(group => ({ id: group.id, cn: group.name, en: group.enName || '', isGroup: true }))
    if ((list.names || []).some(person => !person.groupId)) groups.push({ id: '__unassigned__', cn: '未分组', en: 'Unassigned', isGroup: true })
    if (!groups.length) throw coreError('CORE_TRANSACTION_REJECTED', '所选名单没有可抽取小组')
    const count = input.allowDuplicates ? input.count : Math.min(input.count, groups.length)
    const available = [...groups]
    picks = []
    for (let index = 0; index < count; index += 1) {
      const pool = input.allowDuplicates ? groups : available
      const selectedIndex = Math.min(pool.length - 1, Math.floor(secureRandom() * pool.length))
      picks.push(pool[selectedIndex])
      if (!input.allowDuplicates) available.splice(selectedIndex, 1)
    }
  } else {
    const cacheKey = `${input.listId}:${input.gender}`
    let eligible = peopleCache?.get(cacheKey)
    if (!eligible) {
      const people = (list.names || []).filter(person => person.cn && person.cn !== '再来一次' && (input.gender === 'all' || person.gender === input.gender))
      eligible = { people, whiteList: people.filter(person => person.isWhiteList) }
      peopleCache?.set(cacheKey, eligible)
    }
    const { people, whiteList } = eligible
    if (!people.length) throw coreError('CORE_TRANSACTION_REJECTED', '所选名单没有符合条件的人员')
    const count = input.allowDuplicates ? input.count : Math.min(input.count, people.length)
    picks = pickCyreneBatch(people, whiteList, state.statistics?.counts || {}, normalizeCyreneBalanceSettings(state.balance), count, input.allowDuplicates)
  }

  const results = picks.map(pick => ({ id: pick.id || '', name: pick.cn || '', englishName: pick.en || '', isGroup: !!pick.isGroup, isWhiteList: !!pick.isWhiteList }))
  const receipt = {
    operationId,
    pluginId: caller.pluginId,
    listId: input.listId,
    target: input.target,
    count: results.length,
    allowDuplicates: input.allowDuplicates,
    gender: input.gender,
    algorithm: input.target === 'people' ? ALGORITHM_NAME : 'host-random/groups',
    algorithmVersion: input.target === 'people' ? ALGORITHM_VERSION : '1',
    committedAt,
    results
  }

  const nextStatistics = { counts: { ...(state.statistics?.counts || {}) }, totalCount: Math.max(0, Number(state.statistics?.totalCount) || 0) }
  if (caller.countStatistics && input.target === 'people') {
    for (const pick of picks) {
      if (pick.isWhiteList) continue
      const key = personKey(pick)
      if (!key) continue
      nextStatistics.counts[key] = (Number(nextStatistics.counts[key]) || 0) + 1
      nextStatistics.totalCount += 1
    }
  }
  const source = caller.kind === 'plugin' ? `plugin:${caller.pluginId}` : 'roller'
  const appended = picks.map(pick => ({
    personId: pick.isGroup ? null : (pick.id || null),
    listId: input.listId,
    groupId: pick.isGroup ? pick.id : null,
    source,
    pluginId: caller.kind === 'plugin' ? caller.pluginId : '',
    operationId,
    time: committedAt
  }))
  const nextRecords = [...appended, ...(Array.isArray(state.records) ? state.records : [])].slice(0, 500)
  return { receipt, nextStatistics, nextRecords }
}

export function executeCoreCardRequest({ input: rawInput, caller: rawCaller, state }) {
  const input = normalizeCoreCardInput(rawInput)
  const caller = normalizeCoreCaller(rawCaller)
  if (caller.kind !== 'core-ui') throw coreError('PLUGIN_PERMISSION_DENIED', 'card.commit 仅允许宿主界面调用')
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw coreError('CORE_TRANSACTION_REJECTED', 'Core 状态无效')
  const list = state.names?.lists?.[input.listId]
  if (!list) throw coreError('CORE_TRANSACTION_REJECTED', '卡牌名单不存在')
  const people = Array.isArray(list.names) ? list.names : []
  const byId = new Map(people.map(person => [String(person?.id || ''), person]))
  const selected = input.personIds.map(id => byId.get(id))
  if (selected.some(person => !person || person.isWhiteList)) throw coreError('CORE_TRANSACTION_REJECTED', '卡牌结果不属于当前可抽取名单')
  const operationId = caller.operationId || crypto.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const committedAt = Date.now()
  const results = selected.map(person => ({ id: String(person.id), name: String(person.cn || ''), englishName: String(person.en || '') }))
  const receipt = { kind: 'card', operationId, pluginId: caller.pluginId, listId: input.listId, count: results.length, committedAt, results }
  const appended = results.map(result => ({
    personId: result.id,
    listId: input.listId,
    groupId: null,
    source: 'card',
    pluginId: '',
    operationId,
    time: committedAt
  }))
  const nextRecords = [...appended, ...(Array.isArray(state.records) ? state.records : [])].slice(0, 500)
  return { receipt, nextStatistics: { ...(state.statistics || { counts: {}, totalCount: 0 }), counts: { ...(state.statistics?.counts || {}) } }, nextRecords }
}

export function executeCoreMaintenanceRequest({ input: rawInput, caller: rawCaller, state }) {
  const input = normalizeCoreMaintenanceInput(rawInput)
  const caller = normalizeCoreCaller(rawCaller)
  if (caller.kind !== 'core-ui') throw coreError('PLUGIN_PERMISSION_DENIED', 'maintenance is host-only')
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw coreError('CORE_TRANSACTION_REJECTED', 'Core state is invalid')
  const nextStatistics = { ...(state.statistics || { counts: {}, totalCount: 0 }), counts: { ...(state.statistics?.counts || {}) } }
  let nextRecords = Array.isArray(state.records) ? [...state.records] : []
  if (input.action === 'clear-records') {
    nextRecords = []
  } else {
    const list = state.names?.lists?.[input.listId]
    const people = Array.isArray(list?.names) ? list.names : []
    const person = people.find(item => String(item?.id || '') === input.personId)
    if (!person || person.isWhiteList) throw coreError('CORE_TRANSACTION_REJECTED', 'person is not eligible for statistics initialization')
    if (nextStatistics.counts[input.personId] === undefined) {
      const existingCounts = people
        .filter(item => String(item?.id || '') !== input.personId && !item?.isWhiteList && item?.cn)
        .map(item => Number(nextStatistics.counts[String(item.id || '')]) || 0)
      let minCount = Number.POSITIVE_INFINITY
      let maxCount = Number.NEGATIVE_INFINITY
      for (const count of existingCounts) {
        minCount = Math.min(minCount, count)
        maxCount = Math.max(maxCount, count)
      }
      const initialCount = input.mode === 'zero' || existingCounts.length === 0 ? 0 : Math.round((minCount + maxCount) / 2)
      nextStatistics.counts[input.personId] = initialCount
      nextStatistics.totalCount = Math.max(0, Number(nextStatistics.totalCount) || 0) + initialCount
    }
  }
  const committedAt = Date.now()
  return {
    receipt: {
      kind: 'maintenance',
      action: input.action,
      operationId: caller.operationId || `maintenance-${committedAt}`,
      pluginId: 'core',
      committedAt
    },
    nextStatistics,
    nextRecords
  }
}
