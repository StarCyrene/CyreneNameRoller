import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useNamesStore } from './names.js'
import { useSettingsStore } from './settings.js'
import { usePluginsStore } from '../plugins/store.js'
import { dataBridge } from '../utils/dataBridge.js'
import { boundCount, formTeams } from '../utils/classroomRounds.js'

// Round state lives through tool switches, but never follows a different class.
export const useClassroomRounds = defineStore('classroom-rounds', () => {
  const names = useNamesStore()
  const settings = useSettingsStore()
  const plugins = usePluginsStore()
  const people = computed(() => names.currentNames.filter(p => p.id && p.cn && p.cn !== '再来一次'))
  const teamPool = computed(() => people.value.filter(p => !p.isWhiteList))
  const relaySize = ref(5)
  const activeTarget = ref(0)
  const teamCount = ref(4)
  const turns = ref([])
  const teams = ref([])
  const busy = ref(false)
  const error = ref('')
  let version = 0
  const nextTarget = computed(() => boundCount(relaySize.value, Math.min(100, people.value.length), 5))
  const relayLimit = computed(() => activeTarget.value || nextTarget.value)
  const groups = computed(() => boundCount(teamCount.value, teamPool.value.length, 4))
  function resetRelay() {
    version++
    activeTarget.value = 0
    turns.value = []
    busy.value = false
    error.value = ''
  }
  watch(() => JSON.stringify([names.currentList.id, people.value.map(p => [p.id, p.cn, p.en, p.isWhiteList])]), () => {
    resetRelay()
    teams.value = []
  }, { flush: 'sync' })

  async function passLight() {
    if (busy.value || turns.value.length >= relayLimit.value) return
    const round = version
    busy.value = true
    error.value = ''
    const listId = names.currentList.id
    const previous = turns.value.map(p => p.id)
    try {
      const countStatistics = settings.settings.recordCounts || (await dataBridge.load('balance'))?.enabled !== false
      if (round !== version) return
      const receipt = await plugins.executeRollerDraw({
        listId, target: 'people', gender: 'all', count: 1, allowDuplicates: false,
        singleDrawPreviousIds: previous, countStatistics, source: 'relay'
      })
      if (round !== version) return
      const result = receipt.results[0]
      if (!activeTarget.value) activeTarget.value = nextTarget.value
      turns.value.push(result)
      plugins.dispatchEvent('roller:item-result', { ...receipt, index: 0, result })
      plugins.dispatchEvent('roller:result', receipt)
    } catch (cause) {
      if (round === version) error.value = cause?.message || String(cause)
    } finally {
      if (round === version) busy.value = false
    }
  }
  function dealTeams() {
    teams.value = formTeams(teamPool.value, groups.value)
  }
  return { people, teamPool, relaySize, nextTarget, relayLimit, turns, passLight, resetRelay, busy, error, teamCount, groups, teams, dealTeams }
})
