import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataBridge } from '../utils/dataBridge.js'

const DEFAULT_LIST_ID = 'default'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function generatePersonId() {
  return globalThis.crypto?.randomUUID?.() || `person-${generateId()}`
}

export const useNamesStore = defineStore('names', () => {
  const nameLists = ref({})
  const currentListId = ref(DEFAULT_LIST_ID)
  const defaultNamesData = ref({ names: [] })
  const isLoaded = ref(false)
  const revision = ref(0)
  let saveQueue = Promise.resolve()
  let initializing

  const currentList = computed(() => {
    return nameLists.value[currentListId.value] || nameLists.value[DEFAULT_LIST_ID] || getDefaultList()
  })

  const currentNames = computed(() => currentList.value.names || [])
  const currentWhiteList = computed(() => currentNames.value.filter(n => n.isWhiteList))
  const allLists = computed(() => Object.values(nameLists.value))

  function getDefaultList() {
    return {
      id: DEFAULT_LIST_ID,
      name: '默认名单',
      groups: [],
      names: []
    }
  }

  function migrateList(list) {
    if (!list) return
    if (!Array.isArray(list.groups)) list.groups = []
    if (!Array.isArray(list.names)) list.names = []
    if (Array.isArray(list.whiteList)) {
      list.whiteList.forEach(w => {
        const p = list.names.find(x => x.cn === (w.cn || w))
        if (p) p.isWhiteList = true
      })
      delete list.whiteList
    }
    list.names.forEach(p => {
      if (!p.id) p.id = generatePersonId()
      if (p.groupId === undefined) p.groupId = ''
      if (p.isWhiteList === undefined) p.isWhiteList = false
      p.gender = p.gender === 'female' || p.gender === '女' ? 'female' : 'male'
    })
  }

  async function initialize() {
    if (isLoaded.value) return
    if (!initializing) initializing = loadLists().finally(() => { initializing = null })
    return initializing
  }

  async function loadLists() {
    try {
      const savedLists = await dataBridge.load('lists')
      const savedCurrentId = await dataBridge.load('currentListId')
      const namesJson = await dataBridge.loadNames()

      defaultNamesData.value = namesJson || { names: [] }

      if (savedLists && typeof savedLists === 'object' && Object.keys(savedLists).length > 0) {
        nameLists.value = savedLists
      } else {
        nameLists.value = {
          [DEFAULT_LIST_ID]: {
            id: DEFAULT_LIST_ID,
            name: '默认名单',
            groups: [],
            names: defaultNamesData.value.names || []
          }
        }
      }

      if (savedCurrentId && nameLists.value[savedCurrentId]) {
        currentListId.value = savedCurrentId
      }
      Object.values(nameLists.value).forEach(migrateList)
      await save()
    } catch (e) {
      console.error('[names] initialize failed:', e)
      nameLists.value = {
        [DEFAULT_LIST_ID]: {
          id: DEFAULT_LIST_ID,
          name: '默认名单',
          groups: [],
          names: []
        }
      }
    }
    isLoaded.value = true
  }

  function save() {
    revision.value += 1
    const listsSnapshot = JSON.parse(JSON.stringify(nameLists.value))
    const currentIdSnapshot = currentListId.value
    const task = saveQueue.catch(() => {}).then(async () => {
      await dataBridge.save('lists', listsSnapshot)
      await dataBridge.save('currentListId', currentIdSnapshot)
    })
    saveQueue = task
    return task
  }

  function switchList(id) {
    if (nameLists.value[id]) {
      currentListId.value = id
      save()
    }
  }

  function addPerson(cn, en, gender = 'male') {
    if (!cn || !cn.trim()) return null
    const person = { id: generatePersonId(), cn: cn.trim(), en: (en || '').trim(), gender: gender === 'female' ? 'female' : 'male', groupId: '', isWhiteList: false }
    currentList.value.names.push(person)
    save()
    return person
  }

  function deletePerson(index) {
    if (index >= 0 && index < currentList.value.names.length) {
      currentList.value.names.splice(index, 1)
      save()
    }
  }

  function editPerson(index, newCn, newEn, gender) {
    if (index >= 0 && index < currentList.value.names.length) {
      const old = currentList.value.names[index]
      currentList.value.names[index] = {
        cn: newCn.trim(),
        en: (newEn || '').trim(),
        id: old?.id || generatePersonId(),
        count: old?.count || 0,
        gender: gender === 'female' || (gender === undefined && old?.gender === 'female') ? 'female' : 'male',
        groupId: old?.groupId || '',
        isWhiteList: old?.isWhiteList || false
      }
      save()
    }
  }

  function createList(name) {
    if (!name || !name.trim()) return null
    const id = generateId()
    nameLists.value[id] = {
      id,
      name: name.trim(),
      groups: [],
      names: []
    }
    currentListId.value = id
    save()
    return id
  }

  function deleteList(id) {
    if (Object.keys(nameLists.value).length <= 1) return false
    delete nameLists.value[id]
    currentListId.value = Object.keys(nameLists.value)[0]
    save()
    return true
  }

  function restoreList(listData) {
    if (!listData || !listData.id) return
    migrateList(listData)
    nameLists.value[listData.id] = listData
    save()
  }

  async function importList(listData) {
    if (!listData || !listData.name || !Array.isArray(listData.names)) return null
    await initialize()
    const imported = JSON.parse(JSON.stringify(listData))
    imported.id = !imported.id || nameLists.value[imported.id] ? generateId() : imported.id
    migrateList(imported)
    nameLists.value[imported.id] = imported
    const previousId = currentListId.value
    currentListId.value = imported.id
    try {
      await save()
    } catch (error) {
      delete nameLists.value[imported.id]
      if (currentListId.value === imported.id) {
        currentListId.value = nameLists.value[previousId] ? previousId : Object.keys(nameLists.value)[0] || DEFAULT_LIST_ID
      }
      // The list write may have succeeded before the selection write failed.
      // Put both keys back without dropping unrelated lists changed meanwhile.
      await save()
      throw error
    }
    return imported
  }

  function resetCurrentList() {
    currentList.value.names = (defaultNamesData.value.names || []).map(p => ({
      ...p,
      id: p.id || generatePersonId(),
      isWhiteList: !!p.isWhiteList
    }))
    save()
  }

  function listGroups(listId) {
    const l = nameLists.value[listId]
    if (!l) return []
    if (!Array.isArray(l.groups)) l.groups = []
    return l.groups
  }

  function groupMemberCount(listId, groupId) {
    const l = nameLists.value[listId]
    if (!l || !l.names) return 0
    return l.names.filter(p => p.groupId === groupId).length
  }

  function addGroup(listId, { id, name, enName }) {
    const l = nameLists.value[listId]
    if (!l) return { ok: false, error: 'invalidList' }
    if (!Array.isArray(l.groups)) l.groups = []
    if (!name || !name.trim()) return { ok: false, error: 'nameRequired' }
    if (!id || !id.trim()) return { ok: false, error: 'idRequired' }
    const gid = id.trim()
    if (l.groups.some(g => g.id === gid)) return { ok: false, error: 'idDuplicate' }
    l.groups.push({ id: gid, name: name.trim(), enName: (enName || '').trim() })
    save()
    return { ok: true }
  }

  function updateGroup(listId, groupId, patch) {
    const l = nameLists.value[listId]
    if (!l || !l.groups) return false
    const g = l.groups.find(g => g.id === groupId)
    if (!g) return false
    if (patch.name !== undefined) g.name = patch.name.trim()
    if (patch.enName !== undefined) g.enName = (patch.enName || '').trim()
    if (patch.id !== undefined && patch.id.trim() && patch.id.trim() !== groupId) {
      const newId = patch.id.trim()
      if (l.groups.some(x => x.id === newId && x.id !== groupId)) return false
      if (l.names) l.names.forEach(p => { if (p.groupId === groupId) p.groupId = newId })
      g.id = newId
    }
    save()
    return true
  }

  function deleteGroup(listId, groupId) {
    const l = nameLists.value[listId]
    if (!l || !l.groups) return false
    const idx = l.groups.findIndex(g => g.id === groupId)
    if (idx === -1) return false
    l.groups.splice(idx, 1)
    if (l.names) l.names.forEach(p => { if (p.groupId === groupId) p.groupId = '' })
    save()
    return true
  }

  function assignGroup(listId, personIndex, groupId) {
    const l = nameLists.value[listId]
    if (!l || !l.names || !l.names[personIndex]) return false
    l.names[personIndex].groupId = groupId || ''
    save()
    return true
  }

  function batchAssignGroup(listId, indices, groupId) {
    const l = nameLists.value[listId]
    if (!l || !l.names) return false
    indices.forEach(i => { if (l.names[i]) l.names[i].groupId = groupId || '' })
    save()
    return true
  }

  function setGender(listId, personIndex, gender) {
    const list = nameLists.value[listId]
    if (!list?.names?.[personIndex]) return false
    list.names[personIndex].gender = gender === 'female' ? 'female' : 'male'
    save()
    return true
  }

  function batchSetGender(listId, indices, gender) {
    const list = nameLists.value[listId]
    if (!list?.names) return false
    const normalized = gender === 'female' ? 'female' : 'male'
    indices.forEach(index => { if (list.names[index]) list.names[index].gender = normalized })
    save()
    return true
  }

  function clearCurrentList() {
    currentList.value.names = []
    save()
  }

  function isWhiteList(cn) {
    return currentNames.value.some(p => p.cn === cn && p.isWhiteList)
  }

  return {
    nameLists,
    currentListId,
    currentList,
    currentNames,
    currentWhiteList,
    allLists,
    isLoaded,
    revision,
    initialize,
    save,
    switchList,
    addPerson,
    deletePerson,
    editPerson,
    createList,
    deleteList,
    restoreList,
    importList,
    resetCurrentList,
    clearCurrentList,
    isWhiteList,
    listGroups,
    groupMemberCount,
    addGroup,
    updateGroup,
    deleteGroup,
    assignGroup,
    batchAssignGroup,
    setGender,
    batchSetGender
  }
})
