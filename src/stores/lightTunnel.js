import { ref } from 'vue'
import { defineStore } from 'pinia'
import { usePluginsStore } from '../plugins/store'
import { useSettingsStore } from './settings'
import { dataBridge } from '../utils/dataBridge'

// A projection round survives tool switches. Revealing another name reads
// the original receipt; it never submits a second draw.
export const useLightTunnel = defineStore('light-tunnel', () => {
  const rounds = ref({}), busy = ref(false), error = ref('')
  const plugins = usePluginsStore(), settings = useSettingsStore()
  async function draw(listId, count, inSteps) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      const countStatistics = settings.settings.recordCounts || (await dataBridge.load('balance'))?.enabled !== false
      const receipt = await plugins.executeRollerDraw({ listId, target:'people', gender:'all', count, allowDuplicates:false, countStatistics, fixedLineup:true })
      rounds.value[listId] = { results:receipt.results, inSteps, shown:inSteps ? 1 : receipt.results.length }
      receipt.results.forEach((result,index)=>plugins.dispatchEvent('roller:item-result',{...receipt,index,result}))
      plugins.dispatchEvent('roller:result',receipt)
      return true
    } catch (cause) {
      error.value = cause?.message || String(cause)
      return false
    } finally { busy.value = false }
  }
  function reveal(listId, all=false) {
    const round = rounds.value[listId]
    if (round) round.shown = all ? round.results.length : Math.min(round.results.length, round.shown+1)
  }
  return {rounds,busy,error,draw,reveal}
})
