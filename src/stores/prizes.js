import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dataBridge } from '../utils/dataBridge'

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

  async function initialize() {
    if (isLoaded.value) return
    const saved = await dataBridge.load('prizeLists')
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const normalized = Object.values(saved).map(list => normalizeList(list, list?.id)).filter(Boolean)
      if (normalized.length) lists.value = Object.fromEntries(normalized.map(list => [list.id, list]))
    }
    const selectedId = await dataBridge.load('currentPrizeListId')
    if (selectedId && lists.value[selectedId]) currentId.value = selectedId
    const savedRecords = await dataBridge.load('prizeRecords')
    if (Array.isArray(savedRecords)) records.value = savedRecords.slice(0, 500)
    isLoaded.value = true
    await save()
  }

  async function save() {
    await dataBridge.save('prizeLists', lists.value)
    await dataBridge.save('currentPrizeListId', currentId.value)
  }

  async function saveRecords() {
    await dataBridge.save('prizeRecords', records.value)
  }

  function createList(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed) return null
    const id = uid()
    lists.value[id] = { id, name: trimmed, prizes: [] }
    currentId.value = id
    save()
    return id
  }

  function renameList(id, name) {
    const trimmed = String(name || '').trim()
    if (!lists.value[id] || !trimmed) return false
    lists.value[id].name = trimmed
    save()
    return true
  }

  function switchList(id) {
    if (!lists.value[id]) return false
    currentId.value = id
    save()
    return true
  }

  function removeList(id) {
    if (!lists.value[id] || Object.keys(lists.value).length < 2) return false
    delete lists.value[id]
    if (!lists.value[currentId.value]) currentId.value = Object.keys(lists.value)[0]
    save()
    return true
  }

  function importList(value) {
    const imported = normalizeList(value)
    if (!imported) return { success: false, error: '奖品单格式无效' }
    imported.id = !lists.value[imported.id] ? imported.id : uid()
    lists.value[imported.id] = imported
    currentId.value = imported.id
    save()
    return { success: true, list: imported }
  }

  function add(name, quantity = 1, weight = 1, quality = '普通') {
    const prize = normalizePrize({ name, quantity, weight, quality })
    if (!prize) return null
    current.value.prizes.push(prize)
    save()
    return prize
  }

  function update(prizeId, patch) {
    const index = current.value.prizes.findIndex(prize => prize.id === prizeId)
    if (index < 0) return false
    const normalized = normalizePrize({ ...current.value.prizes[index], ...patch, id: prizeId })
    if (!normalized) return false
    current.value.prizes[index] = normalized
    save()
    return true
  }

  function remove(prizeId) {
    const index = current.value.prizes.findIndex(prize => prize.id === prizeId)
    if (index < 0) return false
    current.value.prizes.splice(index, 1)
    save()
    return true
  }

  function pickFromPool(pool) {
    const totalWeight = pool.reduce((sum, prize) => sum + prize.weight, 0)
    let cursor = Math.random() * totalWeight
    return pool.find(prize => (cursor -= prize.weight) < 0) || pool.at(-1)
  }

  function draw(count = 1) {
    const requested = Math.max(1, Math.floor(Number(count) || 1))
    if (totalStock.value < requested) {
      return { success: false, error: `库存不足：需要 ${requested} 件，当前仅剩 ${totalStock.value} 件` }
    }
    const selected = []
    for (let index = 0; index < requested; index++) {
      const pool = current.value.prizes.filter(prize => prize.quantity > 0)
      const prize = pickFromPool(pool)
      prize.quantity -= 1
      selected.push({ ...prize, quantity: prize.quantity + 1 })
    }
    save()
    return { success: true, prizes: selected }
  }

  function pick() {
    const result = draw(1)
    return result.success ? result.prizes[0] : null
  }

  function recordDraw({ prizeId, personId = null, peopleListId = null, mode = 'draw' }) {
    records.value.unshift({
      id: uid(),
      prizeId,
      prizeListId: currentId.value,
      personId,
      peopleListId,
      mode,
      time: Date.now()
    })
    records.value = records.value.slice(0, 500)
    saveRecords()
  }

  function clearRecords(prizeListId = null) {
    records.value = prizeListId && prizeListId !== 'all'
      ? records.value.filter(record => record.prizeListId !== prizeListId)
      : []
    saveRecords()
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
    save,
    createList,
    renameList,
    switchList,
    removeList,
    importList,
    add,
    update,
    remove,
    draw,
    pick,
    recordDraw,
    clearRecords
  }
})
