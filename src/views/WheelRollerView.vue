<template>
  <section class="wheel-view">
    <div class="wheel-stage">
      <div class="wheel-frame">
        <div ref="dial" class="wheel-dial" :style="{ background: dialFill, transform: 'rotate(' + rotation + 'deg)' }" aria-hidden="true">
          <svg viewBox="0 0 300 300" focusable="false">
            <g v-for="(sector, index) in sectors" :key="sector.start">
              <line v-if="sectors.length > 1" x1="150" y1="8" x2="150" y2="130" :transform="'rotate(' + index * 360 / sectors.length + ' 150 150)'" />
              <text x="150" y="50" :transform="'rotate(' + sector.angle + ' 150 150)'" text-anchor="middle" dominant-baseline="middle">{{ trimLabel(sector.label) }}</text>
            </g>
          </svg>
        </div>
        <span class="wheel-pointer" aria-hidden="true"></span>
        <button type="button" class="wheel-hub" :disabled="!canSpin" :aria-label="spinLabel" @click="spin">
          <FluentIcon icon="sparkle-24-filled" :width="25" />
        </button>
      </div>
      <p class="wheel-caption">{{ caption }}</p>
    </div>
    <div class="wheel-panel">
      <h1>{{ en ? 'Name wheel' : '转盘点名' }}</h1>
      <div class="wheel-field">
        <span>{{ en ? 'Name list' : '当前名单' }}</span>
        <FluentSelect :model-value="names.currentListId" :options="listOptions" :disabled="busy" :aria-label="en ? 'Name list' : '当前名单'" @update:model-value="changeList" />
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
        <strong v-if="receipt" class="winner">
          <VerifiedResult :receipt="receipt" :index="0" :presentation="presentation" />
        </strong>
        <span v-else>{{ statusText }}</span>
        <small v-if="receipt && isGrouped">{{ en ? 'Position' : '名单序号' }} · {{ winnerIndex + 1 }}</small>
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
import { usePluginsStore } from '../plugins/store'
import { dataBridge } from '../utils/dataBridge'
import { normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { MAX_WHEEL_SECTORS, wheelLanding, wheelSectors } from '../utils/nameWheel.mjs'
import VerifiedResult from '../components/roller/VerifiedResult.vue'

const names = useNamesStore()
const settings = useSettingsStore()
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
  return (list?.names || []).filter(p => p.cn && p.cn !== '再来一次' && (filter === 'all' || p.gender === filter))
}
const eligible = computed(() => eligiblePeople(names.currentList, gender.value))
const spinPool = shallowRef(null)
const people = computed(() => spinPool.value ?? eligible.value)
const sectors = computed(() => wheelSectors(people.value, settings.settings.englishMode))
const isGrouped = computed(() => people.value.length > MAX_WHEEL_SECTORS)
const receipt = shallowRef(null)
const winnerIndex = computed(() => people.value.findIndex(p => p.id === receipt.value?.results[0]?.id))
const busy = ref(false)
const error = ref('')
const dial = ref(null)
const rotation = ref(0)
let generation = 0
let animation = null
const canSpin = computed(() => names.isLoaded && eligible.value.length > 0 && !busy.value)
const spinLabel = computed(() => busy.value ? (en.value ? 'Spinning…' : '转动中…') : (en.value ? 'Spin the wheel' : '转动转盘'))
const caption = computed(() => {
  const count = people.value.length
  if (!count) return ''
  if (isGrouped.value) return en.value ? `${count} names · Sectors show list positions` : `共 ${count} 人 · 扇区数字为名单序号`
  return en.value ? `${count} ${count === 1 ? 'name' : 'names'} on the wheel` : `转盘上有 ${count} 人`
})
const statusText = computed(() => {
  if (error.value) return error.value
  if (!names.isLoaded) return en.value ? 'Loading names…' : '正在载入名单…'
  if (!names.currentNames.length) return en.value ? 'Add names to this list to start.' : '先在这份名单中添加人员。'
  if (!eligible.value.length) return en.value ? 'No matches. Choose another filter or list.' : '当前范围没有可点名的人员，换个范围或名单试试。'
  if (busy.value) return en.value ? 'The wheel is turning…' : '转盘正在转动…'
  return en.value ? 'Spin to select a name.' : '转动转盘，看看这次会点到谁。'
})
const colors = ['var(--wheel-a)', 'var(--wheel-b)', 'var(--wheel-c)', 'var(--wheel-d)']
const dialFill = computed(() => {
  if (!sectors.value.length) return 'var(--bg-hover)'
  if (sectors.value.length === 1) return colors[0]
  const step = 360 / sectors.value.length
  return 'conic-gradient(' + sectors.value.map((_, i) => `${colors[i % colors.length]} ${i * step}deg ${(i + 1) * step}deg`).join(',') + ')'
})
function trimLabel(value) {
  const chars = Array.from(value || '')
  const limit = sectors.value.length > 6 ? 6 : 10
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : value
}
function changeList(id) { if (!busy.value) names.switchList(id) }
function clear() {
  generation++
  animation?.cancel()
  animation = null
  busy.value = false
  spinPool.value = null
  receipt.value = null
  error.value = ''
  rotation.value = 0
}
watch([() => names.currentListId, gender], clear, { flush: 'sync' })
onBeforeUnmount(clear)

async function spin() {
  if (!canSpin.value) return
  const token = ++generation
  const listId = names.currentList.id
  const filter = gender.value
  busy.value = true
  error.value = ''
  receipt.value = null
  spinPool.value = eligible.value.slice()
  try {
    const balance = normalizeCyreneBalanceSettings(await dataBridge.load('balance'))
    if (token !== generation) return
    const operationId = globalThis.crypto?.randomUUID?.() || `wheel-${Date.now()}`
    plugins.dispatchEvent('roller:start', { operationId, listId, target: 'people', count: 1 })
    const result = await plugins.executeRollerDraw({
      listId, target: 'people', count: 1, gender: filter, allowDuplicates: false,
      operationId, countStatistics: settings.settings.recordCounts || balance.enabled, singleDrawPreviousIds: []
    })
    if (token !== generation) return
    const winner = result.results[0]
    if (!winner) throw new Error(en.value ? 'The draw returned no name.' : '此次点名未返回人员。')
    // A host hook may change the draw filters. Align the wheel with the
    // committed pool instead of landing on an unrelated name.
    if (result.listId !== listId || result.gender !== filter) {
      spinPool.value = eligiblePeople(names.nameLists[result.listId], result.gender)
    }
    let index = spinPool.value.findIndex(p => p.id === winner.id)
    if (index < 0) {
      spinPool.value = [...spinPool.value, { id: winner.id, cn: winner.name, en: winner.englishName }]
      index = spinPool.value.length - 1
    }
    const before = rotation.value
    const after = wheelLanding(before, sectors.value, index)
    rotation.value = after
    if (dial.value?.animate && settings.settings.perfAnimations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = dial.value.animate([{ transform: `rotate(${before}deg)` }, { transform: `rotate(${after}deg)` }], {
        duration: 1850, easing: 'cubic-bezier(.16,.72,.18,1)'
      })
      await animation.finished.catch(() => {})
    }
    if (token !== generation) return
    animation = null
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
.wheel-view { --wheel-a: color-mix(in srgb, var(--accent) 38%, var(--bg-card-solid)); --wheel-b: color-mix(in srgb, var(--accent-light) 19%, var(--bg-card-solid)); --wheel-c: color-mix(in srgb, #8895e2 34%, var(--bg-card-solid)); --wheel-d: color-mix(in srgb, #dea278 26%, var(--bg-card-solid)); width: min(100%, 960px); margin: auto; padding: clamp(18px, 4vw, 48px); display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .85fr); gap: clamp(18px, 4vw, 52px); align-items: center; box-sizing: border-box; }
.wheel-stage { text-align: center; min-width: 0; }
.wheel-frame { position: relative; width: min(100%, 380px); aspect-ratio: 1; margin: 12px auto; border-radius: 50%; background: var(--bg-card-solid); border: 1px solid var(--border-strong); padding: 8px; box-shadow: var(--shadow-8); }
.wheel-dial { width: 100%; height: 100%; overflow: hidden; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--border-default); }
.wheel-dial svg { display: block; width: 100%; height: 100%; }
.wheel-dial text { fill: var(--text-primary); font: 600 12px var(--font-ui); }
.wheel-dial line { stroke: var(--bg-card-solid); stroke-width: 1.4; }
.wheel-pointer { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 23px; height: 29px; border-radius: 5px; clip-path: polygon(0 0, 100% 0, 50% 100%); background: var(--accent-dark); }
.wheel-hub { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: 19%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; border: 3px solid var(--bg-card-solid); color: var(--text-on-accent); background: var(--accent-dark); box-shadow: var(--shadow-4); cursor: pointer; }
.wheel-hub:disabled { cursor: default; }
.wheel-hub:focus-visible, .wheel-manage:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.wheel-caption { margin: 16px 0 0; color: var(--text-secondary); font-size: 13px; }
.wheel-panel { display: grid; align-content: center; min-width: 0; gap: 18px; }
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
