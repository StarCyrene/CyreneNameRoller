import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dataBridge } from '../utils/dataBridge.js'
import { withPrizeLock } from '../utils/prizeLock.mjs'

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const DEFAULT_LIST = { id: 'default', name: '默认奖品单', prizes: [] }

function normalizePrize(prize) {
  if (!prize || !String(prize.name || '').trim()) return null
  return {
    id: prize.id || uid(),
    name: String(prize.name).trim(),
    quality: String(prize.quality || '普通').trim() || '普通',
    quantity: Math.max(0, Math.floor(Number(prize.quantity) || 0)),
    weight: Math.max(0.01, Number(prize.weight) || 1)
  }
}

function normalizeList(list, fallbackId = uid()) {
  if (!list || !String(list.name || '').trim() || !Array.isArray(list.prizes)) return null
  return {
    id: list.id || fallbackId,
    name: String(list.name).trim(),
    prizes: list.prizes.map(normalizePrize).filter(Boolean)
  }
}

export const usePrizesStore = defineStore('prizes', () => {
  const lists = ref({ default: { ...DEFAULT_LIST, prizes: [] } })
  const currentId = ref('default')
  const records = ref([])
  const isLoaded = ref(false)
  const current = computed(() => lists.value[currentId.value] || Object.values(lists.value)[0] || DEFAULT_LIST)
  const totalStock = computed(() => current.value.prizes.reduce((sum, prize) => sum + prize.quantity, 0))
  const availablePrizes = computed(() => current.value.prizes.filter(prize => prize.quantity > 0))

  let initializing
  let transactionActive = false
  async function initialize() {
    if (isLoaded.value) return
    if (!initializing) initializing = withPrizeLock(() => loadState(true)).catch(error => {
      if (error.code !== 'PRIZE_LOCK_UNAVAILABLE') throw error
      // Read-only access is still useful in an old/restricted browser; a
      // mutation will explicitly report that safe storage is unavailable.
      return loadState(false)
    }).then(() => { isLoaded.value = true }).finally(() => { initializing = null })
    return initializing
  }
  async function loadState(migrate) {
    const saved = await dataBridge.load('prizes')
    // Pre-migration Tauri envelopes can contain an empty default prize snapshot.
    if (saved?.lists && Object.keys(saved.lists).length && Array.isArray(saved.records)) {
      applySnapshot(saved)
    } else {
      const [oldLists, selectedId, oldRecords] = await Promise.all(
        ['prizeLists', 'currentPrizeListId', 'prizeRecords'].map(key => dataBridge.load(key))
      )
      const normalized = Object.entries(oldLists || {}).map(([id, list]) => normalizeList(list, id)).filter(Boolean)
      lists.value = normalized.length ? Object.fromEntries(normalized.map(list => [list.id, list])) : { default: { ...DEFAULT_LIST, prizes: [] } }
      currentId.value = lists.value[selectedId] ? selectedId : Object.keys(lists.value)[0]
      records.value = Array.isArray(oldRecords) ? oldRecords.slice(0, 500) : []
      if (migrate) await dataBridge.save('prizes', snapshotState())
    }
  }
  async function transaction(task) {
    await initialize()
    return withPrizeLock(async () => {
      await loadState(true)
      transactionActive = true
      try { return await task() }
      finally { transactionActive = false }
    })
  }
  function snapshotState() { return { lists: JSON.parse(JSON.stringify(lists.value)), currentId: currentId.value, records: JSON.parse(JSON.stringify(records.value)) } }
  function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.lists || typeof snapshot.lists !== 'object' || !Array.isArray(snapshot.records)) throw new Error('invalid prize state')
    lists.value = snapshot.lists
    currentId.value = snapshot.currentId
    records.value = snapshot.records.slice(0, 500)
  }
  async function commitDraw(snapshot) {
    if (!transactionActive) throw new Error('Prize commit requires an active draw')
    await dataBridge.save('prizes', snapshot)
    applySnapshot(snapshot)
  }
  async function restoreState(snapshot, { persist = true } = {}) {
    if (!persist) { applySnapshot(snapshot); return }
    const baseline = JSON.stringify(snapshotState())
    return transaction(() => {
      if (baseline !== JSON.stringify(snapshotState())) throw new Error('奖池已更新 / Prize inventory changed')
      return commitDraw(snapshot)
    })
  }
  function edit(action) {
    return transaction(async () => {
      const next = snapshotState()
      const result = action(next)
      if (result !== false && result !== null && result?.success !== false) await commitDraw(next)
      return result
    })
  }

  function createList(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed) return null
    const id = uid()
    return edit(state => { state.lists[id] = { id, name: trimmed, prizes: [] }; state.currentId = id; return id })
  }

  function renameList(id, name) {
    const trimmed = String(name || '').trim()
    return edit(state => { if (!state.lists[id] || !trimmed) return false; state.lists[id].name = trimmed; return true })
  }

  function switchList(id) {
    return edit(state => { if (!state.lists[id]) return false; state.currentId = id; return true })
  }

  function removeList(id) {
    return edit(state => {
      if (!state.lists[id] || Object.keys(state.lists).length < 2) return false
      delete state.lists[id]
      if (!state.lists[state.currentId]) state.currentId = Object.keys(state.lists)[0]
      return true
    })
  }

  function importList(value) {
    const imported = normalizeList(value)
    if (!imported) return { success: false, error: '奖品单格式无效' }
    return edit(state => {
      if (state.lists[imported.id]) imported.id = uid()
      state.lists[imported.id] = imported; state.currentId = imported.id
      return { success: true, list: imported }
    })
  }

  function add(name, quantity = 1, weight = 1, quality = '普通') {
    const prize = normalizePrize({ name, quantity, weight, quality })
    if (!prize) return null
    const listId = current.value.id
    return edit(state => { if (!state.lists[listId]) return null; state.lists[listId].prizes.push(prize); return prize })
  }

  function update(prizeId, patch, original = null) {
    const listId = current.value.id
    const displayed = original?.id === prizeId ? { ...original } : current.value.prizes.find(prize => prize.id === prizeId)
    if (!displayed) return false
    const normalized = normalizePrize({ ...displayed, ...patch, id: prizeId })
    if (!normalized) return false
    const changed = Object.keys(normalized).filter(key => normalized[key] !== displayed[key])
    return edit(state => {
      const stored = state.lists[listId]?.prizes.find(prize => prize.id === prizeId)
      if (!stored) return false
      for (const key of changed) {
        if (stored[key] !== displayed[key] && stored[key] !== normalized[key]) throw new Error('此奖品已变更，请核对后重新保存。 / This prize changed. Review it before saving.')
        stored[key] = normalized[key]
      }
      return true
    })
  }

  function remove(prizeId) {
    const listId = current.value.id
    return edit(state => {
      const items = state.lists[listId]?.prizes
      const index = items?.findIndex(p => p.id === prizeId) ?? -1
      if (index < 0) return false
      items.splice(index, 1); return true
    })
  }

  function clearRecords(prizeListId = null) {
    return edit(state => {
      state.records = prizeListId && prizeListId !== 'all' ? state.records.filter(r => r.prizeListId !== prizeListId) : []
      return true
    })
  }

  return {
    lists,
    currentId,
    current,
    records,
    totalStock,
    availablePrizes,
    isLoaded,
    initialize,
    transaction,
    commitDraw,
    snapshotState,
    restoreState,
    createList,
    renameList,
    switchList,
    removeList,
    importList,
    add,
    update,
    remove,
    clearRecords
  }
})
