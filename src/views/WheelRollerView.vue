<template>
  <section class="wheel-view">
    <div class="wheel-stage">
      <div class="wheel-frame">
        <div ref="dial" class="wheel-dial" :style="{ background: dialFill, transform: 'rotate(' + rotation + 'deg)' }" aria-hidden="true" translate="no">
          <svg viewBox="0 0 300 300" focusable="false">
            <line v-for="sector in dividers" :key="sector.position" x1="150" y1="0" x2="150" y2="132"
              :transform="'rotate(' + sector.start + ' 150 150)'" />
            <text v-for="sector in labels" :key="sector.position" x="150" y="47" :data-person-position="sector.position"
              :transform="wheelLabelTransform(sector, labelRotation)" text-anchor="middle" dominant-baseline="central">{{ sector.label }}</text>
          </svg>
        </div>
        <span class="wheel-pointer" :class="{ landed: winnerSector }" aria-hidden="true"></span>
        <button type="button" class="wheel-hub" :disabled="!canSpin" :aria-label="spinLabel" @click="spin">
          <FluentIcon icon="sparkle-24-filled" :width="25" />
        </button>
      </div>
      <p class="wheel-caption">{{ caption }}</p>
      <details v-if="needsKey" class="wheel-key" @toggle="keyOpen = $event.target.open">
        <summary>{{ en ? 'View wheel roster' : '查看转盘名单' }}</summary>
        <template v-if="keyOpen">
          <ul>
            <li v-for="sector in keySectors" :key="sector.position">
              <b translate="no">{{ sector.position }}</b><span translate="no">{{ sector.name }}</span>
            </li>
          </ul>
          <div v-if="keyPages > 1" class="wheel-key-nav">
            <button type="button" :disabled="keyPage === 0" @click="keyPage--">{{ en ? 'Previous' : '上一页' }}</button>
            <span>{{ keyPage + 1 }} / {{ keyPages }}</span>
            <button type="button" :disabled="keyPage + 1 >= keyPages" @click="keyPage++">{{ en ? 'Next' : '下一页' }}</button>
          </div>
        </template>
      </details>
    </div>
    <div class="wheel-panel">
      <h1>{{ en ? 'Name wheel' : '转盘点名' }}</h1>
      <div class="wheel-field">
        <span id="wheel-roster-label">{{ en ? 'Name list' : '当前名单' }}</span>
        <I18nDataSelect :model-value="names.currentListId" :options="listOptions" :disabled="busy" aria-labelledby="wheel-roster-label" @update:model-value="changeList" />
      </div>
      <fieldset class="wheel-field" :disabled="busy">
        <legend>{{ en ? 'Include' : '点名范围' }}</legend>
        <div class="wheel-filters">
          <label v-for="option in filterOptions" :key="option.value" :class="{ selected: gender === option.value }">
            <input v-model="gender" type="radio" name="wheel-gender" :value="option.value" />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>
      <div class="wheel-result" role="status" aria-live="polite" aria-atomic="true">
        <span class="wheel-tag">{{ receipt ? (en ? 'Selected' : '抽中的是') : (en ? 'This spin' : '本轮点名') }}</span>
        <strong v-if="receipt" class="winner wheel-winner" translate="no">
          <VerifiedResult :receipt="receipt" :index="0" :presentation="presentation" />
        </strong>
        <span v-else>{{ statusText }}</span>
        <small v-if="winnerSector">{{ en ? 'List position:' : '名单序号：' }} {{ winnerSector.position }}</small>
      </div>
      <RouterLink v-if="names.isLoaded && !names.currentNames.length" to="/lists/manage" class="wheel-manage">{{ en ? 'Manage names' : '前往添加人员' }} →</RouterLink>
      <FluentButton v-else variant="primary" size="lg" class="spin-action" :disabled="!canSpin" @click="spin">
        <FluentIcon icon="arrow-rotate-clockwise-24-regular" :width="18" />{{ spinLabel }}
      </FluentButton>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { useStatisticsStore } from '../stores/statistics'
import { usePluginsStore } from '../plugins/store'
import { dataBridge } from '../utils/dataBridge'
import { normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { wheelHeading, wheelLabelTransform, wheelLanding, wheelSectors } from '../utils/nameWheel.mjs'
import I18nDataSelect from '../components/I18nDataSelect.vue'
import VerifiedResult from '../components/roller/VerifiedResult.vue'

const names = useNamesStore()
const settings = useSettingsStore()
const statistics = useStatisticsStore()
const plugins = usePluginsStore()
const en = computed(() => settings.settings.language === 'en')
const presentation = computed(() => plugins.resultPresentationForTarget('roller.result'))
const listOptions = computed(() => names.allLists.map(list => ({ value: list.id, label: list.name })))
const filterOptions = computed(() => [
  { value: 'all', label: en.value ? 'Everyone' : '全部' },
  { value: 'male', label: en.value ? 'Male' : '仅男' },
  { value: 'female', label: en.value ? 'Female' : '仅女' }
])
const gender = ref('all')
function eligiblePeople(list, filter) {
  return (list?.names || []).flatMap((p, index) =>
    p.cn && p.cn !== '再来一次' && (filter === 'all' || p.gender === filter) ? [{ ...p, position: index + 1 }] : [])
}
const eligible = computed(() => eligiblePeople(names.currentList, gender.value))
const balance = shallowRef(normalizeCyreneBalanceSettings())
const ready = ref(false)
const spinSnapshot = shallowRef(null)
function sectorsFor(pool, counts = statistics.counts) {
  return wheelSectors(pool, { english: settings.settings.englishMode, counts, balance: balance.value })
}
const sectors = computed(() => spinSnapshot.value ?? sectorsFor(eligible.value))
const labels = computed(() => sectors.value.filter(sector => sector.label))
// Tiny sectors still exist in the gradient; a thick separator would cover them.
const dividers = computed(() => sectors.value.length > 1
  ? sectors.value.filter((sector, i, list) => Math.min(sector.span, list.at(i - 1).span) >= 2)
  : [])
const needsKey = computed(() => sectors.value.some(sector => sector.label !== sector.name))
const keyOpen = ref(false)
const keyPage = ref(0)
const keyPageSize = 24
const keyPages = computed(() => Math.ceil(sectors.value.length / keyPageSize))
const keySectors = computed(() => sectors.value.slice(keyPage.value * keyPageSize, (keyPage.value + 1) * keyPageSize))
const receipt = shallowRef(null)
const winnerSector = computed(() => sectors.value.find(sector => sector.person.id === receipt.value?.results[0]?.id))
const busy = ref(false)
const error = ref('')
const dial = ref(null)
const rotation = ref(0)
const labelRotation = ref(0)
let generation = 0
let animation = null
const canSpin = computed(() => ready.value && eligible.value.length > 0 && !busy.value)
const spinLabel = computed(() => busy.value ? (en.value ? 'Spinning…' : '转动中…') : (en.value ? 'Spin the wheel' : '转动转盘'))
const caption = computed(() => {
  if (!sectors.value.length) return ''
  const sizing = balance.value.enabled
    ? (en.value ? 'Sector size reflects the chance of being picked.' : '扇区大小反映本轮抽中概率。')
    : (en.value ? 'Everyone has the same chance.' : '每个人抽中概率相同。')
  const key = needsKey.value ? (en.value ? ' Numbers refer to the original list.' : '数字对应原名单序号。') : ''
  return (en.value ? 'One person per sector. ' : '每个扇区对应一人。') + sizing + key
})
const statusText = computed(() => {
  if (error.value) return error.value
  if (!ready.value) return en.value ? 'Loading names…' : '正在载入名单…'
  if (!names.currentNames.length) return en.value ? 'Add names to this list to start.' : '先在这份名单中添加人员。'
  if (!eligible.value.length) return en.value ? 'No matches. Choose another filter or list.' : '当前范围没有可点名的人员，换个范围或名单试试。'
  if (busy.value) return en.value ? 'The wheel is turning…' : '转盘正在转动…'
  return en.value ? 'Spin to select a name.' : '转动转盘，看看这次会点到谁。'
})
const colors = ['var(--wheel-a)', 'var(--wheel-b)', 'var(--wheel-c)', 'var(--wheel-d)']
const dialFill = computed(() => {
  if (!sectors.value.length) return 'var(--bg-hover)'
  if (sectors.value.length === 1) return winnerSector.value ? 'var(--wheel-hit)' : colors[0]
  return 'conic-gradient(' + sectors.value.map((sector, index) =>
    `${sector === winnerSector.value ? 'var(--wheel-hit)' : colors[index % colors.length]} ${sector.start}deg ${sector.end}deg`).join(',') + ')'
})
function changeList(id) { if (!busy.value) names.switchList(id) }
function clear() {
  generation++
  animation?.cancel()
  animation = null
  busy.value = false
  spinSnapshot.value = null
  receipt.value = null
  error.value = ''
  rotation.value = 0
  labelRotation.value = 0
  keyPage.value = 0
}
watch([() => names.currentListId, gender, () => settings.settings.englishMode], clear, { flush: 'sync' })
watch(keyPages, pages => { keyPage.value = Math.min(keyPage.value, Math.max(0, pages - 1)) })
watch(() => names.isLoaded, async loaded => {
  if (!loaded) return
  const [savedBalance] = await Promise.all([dataBridge.load('balance'), statistics.initialize()])
  if (!busy.value) balance.value = normalizeCyreneBalanceSettings(savedBalance)
  ready.value = true
}, { immediate: true })
onBeforeUnmount(clear)

async function spin() {
  if (!canSpin.value) return
  const token = ++generation
  const listId = names.currentList.id
  const filter = gender.value
  busy.value = true
  error.value = ''
  receipt.value = null
  try {
    const savedBalance = await dataBridge.load('balance')
    if (token !== generation) return
    balance.value = normalizeCyreneBalanceSettings(savedBalance)
    const counts = { ...statistics.counts }
    spinSnapshot.value = sectorsFor(eligible.value, counts)
    const operationId = globalThis.crypto?.randomUUID?.() || `wheel-${Date.now()}`
    plugins.dispatchEvent('roller:start', { operationId, listId, target: 'people', count: 1 })
    const result = await plugins.executeRollerDraw({
      listId, target: 'people', count: 1, gender: filter, allowDuplicates: false,
      operationId, countStatistics: settings.settings.recordCounts || balance.value.enabled, singleDrawPreviousIds: [], source: 'wheel'
    })
    if (token !== generation) return
    const winner = result.results[0]
    if (!winner) throw new Error(en.value ? 'The draw returned no name.' : '此次点名未返回人员。')
    let sector = spinSnapshot.value.find(s => s.person.id === winner.id)
    if (!sector) {
      spinSnapshot.value = sectorsFor(eligiblePeople(names.nameLists[result.listId], result.gender), counts)
      sector = spinSnapshot.value.find(s => s.person.id === winner.id)
    }
    // The roster can change during the transaction. The receipt still owns the
    // result even if its winner no longer has a place on the current dial.
    if (sector) {
      const before = rotation.value
      const after = wheelLanding(before, sector)
      rotation.value = wheelHeading(after)
      if (dial.value?.animate && settings.settings.perfAnimations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = dial.value.animate([{ transform: `rotate(${before}deg)` }, { transform: `rotate(${after}deg)` }], {
          duration: 1850, easing: 'cubic-bezier(.16,.72,.18,1)'
        })
        await animation.finished.catch(() => {})
      }
    }
    if (token !== generation) return
    animation = null
    labelRotation.value = rotation.value
    receipt.value = result
    result.results.forEach((item, i) => plugins.dispatchEvent('roller:item-result', { ...result, index: i, result: item }))
    plugins.dispatchEvent('roller:result', result)
  } catch (reason) {
    if (token === generation) error.value = reason?.message || (en.value ? 'Could not complete the draw. Try again.' : '点名失败，请再试一次。')
  } finally {
    if (token === generation) busy.value = false
  }
}
</script>

<style scoped>
.wheel-view { --wheel-a: color-mix(in srgb, var(--accent) 27%, var(--bg-card-solid)); --wheel-b: color-mix(in srgb, var(--accent-light) 16%, var(--bg-card-solid)); --wheel-c: color-mix(in srgb, #8895e2 27%, var(--bg-card-solid)); --wheel-d: color-mix(in srgb, #dea278 21%, var(--bg-card-solid)); --wheel-hit: color-mix(in srgb, var(--accent) 55%, var(--bg-card-solid)); width: min(100%, 1020px); margin: auto; padding: clamp(18px, 4vw, 48px); display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .85fr); gap: clamp(18px, 4vw, 52px); align-items: start; box-sizing: border-box; }
.wheel-stage { text-align: center; min-width: 0; }
.wheel-frame { position: relative; width: min(100%, 410px); aspect-ratio: 1; margin: 12px auto; border-radius: 50%; background: var(--bg-card-solid); border: 1px solid var(--border-strong); padding: 8px; box-shadow: var(--shadow-8); }
.wheel-dial { width: 100%; height: 100%; overflow: hidden; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--border-default); }
.wheel-dial svg { display: block; width: 100%; height: 100%; }
.wheel-dial text { fill: var(--text-primary); font: 600 11px var(--font-ui); }
.wheel-dial line { stroke: var(--bg-card-solid); stroke-width: 1; }
.wheel-pointer { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 21px; height: 25px; border-radius: 5px; clip-path: polygon(0 0, 100% 0, 50% 100%); background: var(--text-muted); }
.wheel-pointer.landed { background: var(--accent-dark); }
.wheel-hub { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: 19%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; border: 3px solid var(--bg-card-solid); color: var(--text-on-accent); background: var(--accent-dark); box-shadow: var(--shadow-4); cursor: pointer; }
.wheel-hub:disabled { cursor: default; }
.wheel-hub:focus-visible, .wheel-manage:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.wheel-caption { margin: 16px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.wheel-key { margin-top: 10px; color: var(--text-secondary); font-size: 13px; }
.wheel-key summary, .wheel-key-nav button { cursor: pointer; }
.wheel-key ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 5px 10px; list-style: none; padding: 0; margin: 10px 0 0; text-align: start; }
.wheel-key li { min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; overflow-wrap: anywhere; }
.wheel-key li b { font-variant-numeric: tabular-nums; min-width: 2em; }
.wheel-key-nav { margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; }
.wheel-key-nav button { background: var(--bg-card-solid); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 3px 8px; color: var(--text-primary); font: inherit; }
.wheel-key-nav button:disabled { opacity: .52; cursor: default; }
.wheel-panel { display: grid; align-content: start; min-width: 0; gap: 18px; }
.wheel-panel h1 { margin: 0 0 4px; color: var(--text-primary); font: 700 clamp(24px, 3.5vw, 34px)/1.25 var(--font-display); }
.wheel-field { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; min-width: 0; font-size: 13px; color: var(--text-secondary); }
.wheel-field legend { padding: 0; margin: 0 0 8px; }
.wheel-filters { display: flex; flex-wrap: wrap; gap: 5px; }
.wheel-filters label { position: relative; padding: 5px 12px; cursor: pointer; background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius-full); }
.wheel-filters label.selected { color: var(--text-primary); border-color: var(--accent); background: var(--wheel-b); }
.wheel-filters input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.wheel-filters label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.wheel-result { display: grid; gap: 7px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); color: var(--text-secondary); font-size: 14px; overflow-wrap: anywhere; }
.wheel-tag, .wheel-result small { font-size: 12px; }
.winner { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--text-primary); font: 700 clamp(22px, 3.4vw, 34px)/1.35 var(--font-display); }
.spin-action { justify-self: start; }
.wheel-manage { color: var(--text-primary); text-decoration: underline; text-underline-offset: 4px; }
@container (max-width: 620px) { .wheel-view { grid-template-columns: minmax(0, 1fr); padding: 16px; max-width: 435px; } .wheel-frame { width: min(82%, 250px); } .wheel-panel { gap: 12px; } }
@media (max-width: 720px) { .wheel-view { grid-template-columns: minmax(0, 1fr); max-width: 435px; padding: 16px; } .wheel-frame { width: min(82%, 250px); } .wheel-panel { gap: 12px; } }
</style>
