import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { dataBridge } from '../utils/dataBridge'

function shuffle(ids) {
  const result = ids.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function useSeatDraw({ names, settings, plugins, seats, absentIds, activeListId, visiblePeople }) {
  const gender = ref('all')
  const multiple = ref(false)
  const count = ref(2)
  const busy = ref(false)
  const spotlightId = ref(null)
  const receipt = shallowRef(null)
  const error = ref('')
  const eligible = computed(() => {
    const absent = new Set(absentIds.value)
    return seats.value.filter(person => person?.id && person.cn && person.cn !== '再来一次' &&
      !absent.has(person.id) && (gender.value === 'all' || person.gender === gender.value))
  })
  const limit = computed(() => Math.min(100, eligible.value.length))
  const canDraw = computed(() => names.isLoaded && !!activeListId.value && !busy.value &&
    limit.value >= (multiple.value ? 2 : 1))
  let generation = 0
  let timer
  let finishHopping

  function stopHopping() {
    clearTimeout(timer)
    finishHopping?.()
    finishHopping = undefined
    spotlightId.value = null
  }

  function reset() {
    generation++
    stopHopping()
    busy.value = false
    receipt.value = null
    error.value = ''
  }

  watch(limit, value => {
    if (value >= 2) count.value = Math.max(2, Math.min(count.value, value))
  }, { flush: 'sync' })
  watch([gender, multiple], () => {
    if (!busy.value) reset()
  }, { flush: 'sync' })
  onBeforeUnmount(reset)

  function hop(ids) {
    return new Promise(resolve => {
      finishHopping = resolve
      const total = ids.length === 1 ? 1 : Math.min(30, Math.max(19, ids.length))
      let deck = []
      let shown = 0
      function step() {
        if (shown === total) { stopHopping(); return }
        if (!deck.length) {
          deck = shuffle(ids)
          if (deck.length > 1 && deck.at(-1) === spotlightId.value) {
            ;[deck[0], deck[deck.length - 1]] = [deck.at(-1), deck[0]]
          }
        }
        spotlightId.value = deck.pop()
        const progress = ++shown / total
        timer = setTimeout(step, total === 1 ? 420 : 38 + 105 * progress ** 4)
      }
      step()
    })
  }

  async function draw() {
    if (!canDraw.value) return
    const token = ++generation
    const listId = activeListId.value
    const filter = gender.value
    const n = multiple.value ? Math.min(limit.value, Math.max(2, Math.trunc(Number(count.value) || 2))) : 1
    const excluded = absentIds.value.slice()
    const ids = eligible.value.map(person => person.id)
    const eligibleIds = new Set(ids)
    const visible = visiblePeople?.value.map(person => person.id).filter(id => eligibleIds.has(id))
    busy.value = true
    receipt.value = null
    error.value = ''
    try {
      const balance = normalizeCyreneBalanceSettings(await dataBridge.load('balance'))
      if (token !== generation) return
      const operationId = globalThis.crypto?.randomUUID?.() || ('seats-' + Date.now())
      plugins.dispatchEvent('roller:start', { operationId, listId, target: 'people', count: n })
      const result = await plugins.executeRollerDraw({
        listId, target: 'people', count: n, gender: filter, allowDuplicates: false,
        seatAbsentIds: excluded, operationId, countStatistics: settings.settings.recordCounts || balance.enabled, source: 'seats'
      })
      if (token !== generation) return
      if (settings.settings.perfAnimations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await hop(visible?.length ? visible : ids)
      }
      if (token !== generation) return
      receipt.value = result
      result.results.forEach((item, index) => plugins.dispatchEvent('roller:item-result', { ...result, index, result: item }))
      plugins.dispatchEvent('roller:result', result)
    } catch (reason) {
      if (token === generation) error.value = reason?.message ||
        (settings.settings.language === 'en' ? 'Could not complete the draw.' : '点名失败，请再试一次。')
    } finally {
      if (token === generation) {
        stopHopping()
        busy.value = false
      }
    }
  }

  return { gender, multiple, count, busy, canDraw, eligible, spotlightId, receipt, error, draw, reset }
}
