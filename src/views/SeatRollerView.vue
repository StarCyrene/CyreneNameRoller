<template>
  <section class="seat-view">
    <header class="seat-header">
      <div><h1>{{ en ? 'Seat spotlight' : '座次寻光' }}</h1><p>{{ mapped ? (en ? 'Using your classroom seating chart.' : '按照已确认的教室座位表点名。') : (en ? 'Draw directly from the roster. Seat numbers apply only after you set up a seating chart.' : '按名单即可直接点名；排好实际座位后，才会报告排号和座号。') }}</p></div>
      <span class="seat-count">{{ en ? present + ' present · ' + absentIds.length + ' absent' : '到场 ' + present + ' 人 · 缺席 ' + absentIds.length + ' 人' }}</span>
    </header>
    <div class="seat-strip">
      <div class="seat-controls">
        <label><span>{{ en ? 'Name list' : '当前名单' }}</span><I18nDataSelect :model-value="names.currentListId" :options="lists" :disabled="busy" :aria-label="en ? 'Name list' : '当前名单'" @update:model-value="changeList" /></label>
        <label><span>{{ mapped ? (en ? 'Seats per row' : '每排座位') : (en ? 'Columns' : '显示列数') }}</span><select :value="columns" :disabled="locked" @change="changeColumns($event.target.value)"><option v-for="n in MAX_COLUMNS" :key="n" :value="n">{{ n }}</option></select></label>
        <FluentButton class="seat-draw" variant="primary" :disabled="locked || !present" @click="draw"><FluentIcon icon="sparkle-24-filled" :width="16" />{{ busy ? (en ? 'Selecting…' : '点名中…') : (en ? 'Light up a seat' : '点亮一个座位') }}</FluentButton>
      </div>
      <div class="seat-result" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="receipt && winnerAddress">
          <span>{{ mapped ? (en ? 'Selected seat' : '座位已点亮') : (en ? 'Selected name' : '抽中的是') }}</span>
          <strong class="seat-name"><VerifiedResult :receipt="receipt" :index="0" :presentation="presentation" /></strong>
          <span class="seat-address">{{ positionLabel(winnerAddress, winnerIndex) }}</span>
        </template>
        <span v-else-if="loading">{{ en ? 'Loading the seating plan…' : '正在载入座次…' }}</span>
        <span v-else-if="!occupied.length">{{ en ? 'No names in this seating plan.' : '这份名单还没有可排座的人员。' }} <RouterLink to="/lists/manage">{{ en ? 'Manage names' : '管理人员' }} →</RouterLink></span>
        <span v-else-if="!present">{{ en ? 'Everyone is marked absent. Select a seat or reset attendance to continue.' : '全员已标记缺席。点选座位让同学返回，或重置出勤后继续。' }}</span>
        <span v-else>{{ en ? 'Ready to select a seat from those present.' : '准备就绪，将从本堂课到场的同学中点名。' }}</span>
      </div>
    </div>
    <p v-if="error" class="seat-error" role="alert">{{ error }}</p>
    <div v-if="occupied.length && !loading" class="classroom">
      <div class="seat-toolbar">
        <div class="seat-modes" role="group" :aria-label="en ? 'Seat actions' : '座位操作'">
          <button type="button" :aria-pressed="mode === 'attendance'" :disabled="busy" @click="setMode('attendance')">{{ en ? 'Attendance' : '标记出勤' }}</button>
          <button type="button" :aria-pressed="mode === 'swap'" :disabled="busy" @click="setMode('swap')">{{ en ? 'Swap seats' : '交换座位' }}</button>
        </div>
        <FluentButton variant="secondary" size="sm" :disabled="locked || !absentIds.length" @click="resetAttendance">{{ en ? 'Reset attendance' : '重置本堂出勤' }}</FluentButton>
      </div>
      <p class="seat-instructions" role="status">{{ instructions }} <strong v-if="pickedName" translate="no">{{ pickedName }}</strong></p>
      <div class="seat-chart-actions">
        <FluentButton size="sm" variant="secondary" :disabled="locked" @click="showPaste = !showPaste">{{ en ? 'Paste seating chart' : '粘贴座位表' }}</FluentButton>
        <FluentButton v-if="mode === 'swap' && !mapped" size="sm" variant="secondary" :disabled="locked" @click="confirmLayout">{{ en ? 'Confirm classroom layout' : '确认当前为实际座位' }}</FluentButton>
        <FluentButton v-if="configured || order.length" size="sm" variant="secondary" :disabled="locked" @click="restoreOrder">{{ en ? 'Use roster order' : '回到名单顺序' }}</FluentButton>
      </div>
      <SeatPlanPaste v-if="showPaste" :en="en" :names="names.currentNames" :locked="locked" @apply="usePasted" @cancel="showPaste = false" />
      <div class="front"><span>{{ mapped ? (en ? 'Front of classroom' : '讲台方向') : (en ? 'Roster view' : '名单视图') }}</span></div>
      <div ref="planViewport" class="seat-scroll">
        <div class="seat-map" :style="{ '--seat-columns': columns, '--seat-rows': Math.max(1, Math.ceil(visibleSeats.length / columns)) }" :aria-label="en ? 'Seating plan' : '座次图'" role="group">
          <template v-for="item in visibleSeats" :key="item.index">
          <button v-if="item.person" type="button" class="desk" :data-seat-id="item.person.id" data-i18n-private-attrs="aria-label title"
            :class="{ absent: absent.has(item.person.id), picked: picked === item.person.id, lit: winner?.id === item.person.id }"
            :aria-label="displayName(item.person) + ' · ' + positionLabel(item.address, item.index) + ' · ' + attendanceLabel(item.person.id)"
            :aria-pressed="mode === 'swap' ? picked === item.person.id : absent.has(item.person.id)"
            :title="displayName(item.person) + ' · ' + positionLabel(item.address, item.index)" :disabled="busy"
            @click="activate(item.person.id)" @keydown.esc="picked = ''">
            <small><span>{{ mapped ? item.address.row + ' · ' + item.address.seat : '#' + (item.index + 1) }}</span>
              <b v-if="winner?.id === item.person.id">✦</b><b v-else-if="absent.has(item.person.id)">−</b><b v-else-if="picked === item.person.id">✓</b>
            </small>
            <strong class="seat-name">{{ displayName(item.person) }}</strong>
            <em v-if="absent.has(item.person.id)">{{ en ? 'Absent' : '缺席' }}</em>
          </button>
          <button v-else type="button" class="desk empty" :disabled="busy || mode !== 'swap' || !picked" @click="moveToEmpty(item.index)">{{ en ? 'Empty' : '空座' }}</button>
          </template>
        </div>
      </div>
      <div v-if="pages > 1" class="seat-pages">
        <FluentButton variant="secondary" size="sm" :disabled="!page" @click="pageIndex = page - 1">{{ en ? 'Previous' : '上一页' }}</FluentButton>
        <span>{{ page + 1 }} / {{ pages }}</span>
        <FluentButton variant="secondary" size="sm" :disabled="page + 1 >= pages" @click="pageIndex = page + 1">{{ en ? 'Next' : '下一页' }}</FluentButton>
      </div>
    </div>
  </section>
</template>

<script setup>
import I18nDataSelect from '../components/I18nDataSelect.vue'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { dataBridge } from '../utils/dataBridge'
import { normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { DEFAULT_COLUMNS, MAX_COLUMNS, ROWS_PER_PAGE, orderedSeats, readSeatPlan, seatAddress, seatColumns, swapSeats, writeSeatPlan } from '../utils/seatPlan.mjs'
import VerifiedResult from '../components/roller/VerifiedResult.vue'
import SeatPlanPaste from '../components/roller/SeatPlanPaste.vue'

const names = useNamesStore()
const settings = useSettingsStore()
const plugins = usePluginsStore()
const en = computed(() => settings.settings.language === 'en')
const lists = computed(() => names.allLists.map(l => ({ value: l.id, label: l.name })))
const presentation = computed(() => plugins.resultPresentationForTarget('roller.result'))
const columns = ref(DEFAULT_COLUMNS)
const order = shallowRef([])
const configured = ref(false)
const showPaste = ref(false)
const absent = shallowRef(new Set())
const seats = computed(() => orderedSeats(names.currentNames, order.value, configured.value))
const occupied = computed(() => seats.value.filter(Boolean))
const mapped = computed(() => configured.value && seats.value.length === order.value.length && seats.value.every((p,i) => (p?.id || null) === order.value[i]))
const absentIds = computed(() => occupied.value.filter(p => absent.value.has(p.id)).map(p => p.id))
const present = computed(() => occupied.value.length - absentIds.value.length)
const loading = ref(true)
const busy = ref(false)
const locked = computed(() => loading.value || busy.value)
const mode = ref('attendance')
const picked = ref('')
const receipt = shallowRef(null)
const winner = computed(() => receipt.value?.results[0])
const winnerIndex = computed(() => seats.value.findIndex(p => p && p.id === winner.value?.id))
const winnerAddress = computed(() => seatAddress(winnerIndex.value, columns.value))
const pageIndex = ref(0)
const pageSize = computed(() => columns.value * ROWS_PER_PAGE)
const pages = computed(() => Math.max(1, Math.ceil(seats.value.length / pageSize.value)))
const page = computed(() => Math.min(pageIndex.value, pages.value - 1))
const visibleSeats = computed(() => {
  const start = page.value * pageSize.value
  return seats.value.slice(start, start + pageSize.value).map((person, i) => ({ person, index: start + i, address: seatAddress(start + i, columns.value) }))
})
const instructions = computed(() => {
  if (mode.value === 'attendance') return en.value ? 'Select a seat to mark someone absent or present for this class.' : '点选座位可标记缺席，再点一次即可返回。出勤标记仅用于本堂课。'
  if (!picked.value) return en.value ? 'Select two seats to swap their places.' : '依次选择两个座位，即可交换位置。'
  return en.value ? 'Choose a second seat to swap with this person:' : '请选择要与此人交换的座位：'
})
const pickedName = computed(() => displayName(occupied.value.find(p => p.id === picked.value)))
const planViewport = ref(null)
const error = ref('')
let generation = 0
function displayName(p) { return (settings.settings.englishMode && p?.en) || p?.cn || '' }
function addressLabel(a) { return en.value ? `Row ${a.row}, seat ${a.seat}` : `第 ${a.row} 排 · 第 ${a.seat} 座` }
function positionLabel(address, index) { return mapped.value ? addressLabel(address) : (en.value ? 'Position ' : '名单视图序号 ') + (index + 1) }
function attendanceLabel(id) { return absent.value.has(id) ? (en.value ? 'Absent' : '缺席') : (en.value ? 'Present' : '到场') }
function changeList(id) { if (!busy.value) names.switchList(id) }
function setMode(value) { if (!locked.value) { mode.value = value; picked.value = '' } }
function save() {
  const token = generation
  writeSeatPlan(dataBridge, names.currentList.id, { columns: columns.value, order: order.value, mapped: configured.value }).catch(e => {
    if (token === generation) error.value = e?.message || (en.value ? 'The seating plan could not be saved.' : '座次保存失败。')
  })
}
function usePasted(plan) {
  if (locked.value || !plan.valid) return
  columns.value = plan.columns; order.value = plan.order.slice(); configured.value = true
  showPaste.value = false; picked.value = ''; pageIndex.value = 0; receipt.value = null; save()
}
function confirmLayout() {
  if (locked.value) return
  order.value = seats.value.map(p => p?.id || null); configured.value = true; picked.value = ''; save()
}
function restoreOrder() {
  if (locked.value) return
  order.value = []; configured.value = false; picked.value = ''; pageIndex.value = 0; receipt.value = null; showPaste.value = false; save()
}
function moveToEmpty(index) {
  if (locked.value || !picked.value || seats.value[index]) return
  const ids = seats.value.map(p => p?.id || null), from = ids.indexOf(picked.value)
  if (from >= 0) { ids[index] = ids[from]; ids[from] = null; order.value = ids; save() }
  picked.value = ''
}
function changeColumns(value) {
  if (locked.value) return
  columns.value = seatColumns(value)
  pageIndex.value = winnerAddress.value?.page || 0
  save()
}
function updateAttendance(ids) {
  absent.value = new Set(ids)
  try { sessionStorage.setItem('seatAttendance:' + names.currentList.id, JSON.stringify([...absent.value])) } catch { /* Keep current class usable without session storage. */ }
}
function resetAttendance() { if (!locked.value) updateAttendance([]) }
function activate(id) {
  if (locked.value) return
  if (mode.value === 'attendance') {
    const next = new Set(absent.value)
    if (next.has(id)) next.delete(id)
    else { next.add(id); if (winner.value?.id === id) receipt.value = null }
    updateAttendance(next)
  } else if (!picked.value) picked.value = id
  else {
    if (picked.value !== id) { order.value = swapSeats(seats.value, picked.value, id); save() }
    picked.value = ''
  }
}
watch([() => names.isLoaded, () => names.currentListId], async ([ready, id]) => {
  const token = ++generation
  loading.value = true
  busy.value = false
  receipt.value = null
  error.value = ''
  picked.value = ''
  pageIndex.value = 0
  columns.value = DEFAULT_COLUMNS
  order.value = []
  configured.value = false
  showPaste.value = false
  absent.value = new Set()
  if (!ready) return
  try {
    const saved = await readSeatPlan(dataBridge, id)
    if (token !== generation) return
    columns.value = saved.columns
    order.value = saved.order
    configured.value = saved.mapped
    try {
      const ids = JSON.parse(sessionStorage.getItem('seatAttendance:' + id))
      if (Array.isArray(ids)) absent.value = new Set(ids)
    } catch { /* No previous attendance for this window. */ }
  } catch (e) {
    if (token === generation) error.value = e?.message || (en.value ? 'Could not load the seating plan.' : '未能载入座次。')
  } finally { if (token === generation) loading.value = false }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++ })

async function draw() {
  if (locked.value || !present.value) return
  const token = generation
  const listId = names.currentList.id
  const exclusions = absentIds.value.slice()
  busy.value = true
  error.value = ''
  picked.value = ''
  try {
    const balance = normalizeCyreneBalanceSettings(await dataBridge.load('balance'))
    if (token !== generation) return
    const operationId = globalThis.crypto?.randomUUID?.() || `seats-${Date.now()}`
    plugins.dispatchEvent('roller:start', { operationId, listId, target: 'people', count: 1 })
    const result = await plugins.executeRollerDraw({ listId, target: 'people', count: 1, gender: 'all', allowDuplicates: false,
      singleDrawPreviousIds: exclusions, operationId, countStatistics: settings.settings.recordCounts || balance.enabled, source: 'seats' })
    if (token !== generation) return
    receipt.value = result
    pageIndex.value = winnerAddress.value?.page || 0
    plugins.dispatchEvent('roller:item-result', { ...result, index: 0, result: result.results[0] })
    plugins.dispatchEvent('roller:result', result)
    await nextTick()
    if (token !== generation) return
    const lit = planViewport.value?.querySelector('.lit')
    if (lit) {
      const block = planViewport.value.getBoundingClientRect()
      const box = lit.getBoundingClientRect()
      if (box.left < block.left || box.right > block.right) planViewport.value.scrollLeft += box.left - block.left - (block.width - box.width) / 2
      if (settings.settings.perfAnimations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        lit.animate?.([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' })
      }
    }
  } catch (e) {
    if (token === generation) error.value = e?.message || (en.value ? 'Could not complete the draw.' : '点名失败，请再试一次。')
  } finally { if (token === generation) busy.value = false }
}
</script>

<style scoped>
.seat-view {
  min-height: 100%;
  min-width: 0;
  padding: clamp(14px, 2.6cqw, 38px);
  display: flex;
  flex-direction: column;
  gap: clamp(11px, 2.5cqh, 19px);
  color: var(--text-primary);
}
.seat-header,.seat-controls,.seat-toolbar,.seat-result,.seat-pages { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.seat-header { justify-content: space-between; }
.seat-strip { display: grid; gap: clamp(11px, 2.5cqh, 19px); }
.seat-controls { align-content: center; }
.seat-header h1 { margin: 0; font: 700 clamp(22px, 3.5vw, 32px)/1.25 var(--font-display); }
.seat-header p,.seat-instructions { color: var(--text-secondary); font-size: 13px; margin: 5px 0 0; line-height: 1.5; }
.seat-count,.seat-address { padding: 5px 10px; border-radius: var(--radius-full); background: color-mix(in srgb, var(--accent) 12%, var(--bg-card-solid)); font-size: 12px; font-weight: 600; }
.seat-controls label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); max-width: 100%; }
.seat-controls select { padding: 5px 10px; min-height: 32px; color: var(--text-primary); background: var(--bg-card-solid); border: 1px solid var(--border-strong); border-radius: var(--radius-md); font: inherit; }
.seat-draw { margin-left: auto; }
.seat-result { min-height: 56px; padding: 12px 18px; border: 1px solid var(--border-strong); border-inline-start: 3px solid var(--accent); border-radius: var(--radius-lg); background: linear-gradient(100deg, color-mix(in srgb, var(--accent) 10%, var(--bg-card-solid)), var(--bg-card)); color: var(--text-secondary); font-size: 14px; }
.seat-result strong { color: var(--text-primary); font: 700 clamp(22px, 3.2vw, 30px)/1.25 var(--font-display); overflow-wrap: anywhere; }
.seat-result a { text-decoration: underline; color: var(--text-primary); }
.seat-error { margin: 0; color: var(--text-primary); font-size: 13px; }
.classroom {
  flex: 1 0 auto;
  min-width: 0;
  padding: clamp(12px, 2cqw, 24px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
}
.seat-toolbar { justify-content: space-between; }
.seat-modes { display: inline-flex; gap: 3px; background: var(--bg-hover); padding: 3px; border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.seat-modes button { font: 500 13px var(--font-ui); color: var(--text-secondary); border: 0; padding: 4px 9px; border-radius: var(--radius-sm); background: transparent; cursor: pointer; }
.seat-modes button[aria-pressed="true"] { color: var(--text-primary); background: var(--bg-card-solid); box-shadow: var(--shadow-2); }
.seat-instructions { margin-top: 9px; }
.seat-chart-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.desk.empty { border-style: dashed; justify-content: center; text-align: center; align-items: center; color: var(--text-secondary); background: transparent; font: 12px var(--font-ui); }
.front { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 18px 0 12px; color: var(--text-secondary); font-size: 12px; }
.front::before,.front::after { content: ''; height: 2px; background: var(--border-strong); width: min(24%, 160px); }
.seat-scroll { overflow-x: auto; padding: 4px; margin: -4px; }
.seat-map {
  display: grid;
  grid-template-columns: repeat(var(--seat-columns), minmax(clamp(60px, 8cqw, 92px), 1fr));
  grid-auto-rows: minmax(clamp(58px, calc((100cqh - 455px) / var(--seat-rows)), 110px), auto);
  gap: clamp(6px, .9cqw, 14px);
}
.desk { display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 2px; min-width: 0; cursor: pointer; padding: 5px 8px 7px; border: 1px solid var(--border-strong); border-bottom-width: 3px; border-radius: 9px 9px 6px 6px; color: var(--text-primary); background: var(--bg-card-solid); text-align: start; }
.desk small { display: flex; justify-content: space-between; font: 500 10px var(--font-ui); color: var(--text-secondary); }
.desk strong { font: 650 clamp(13px, 1.55cqw, 20px)/1.3 var(--font-ui); overflow-wrap: anywhere; }
.desk em { color: var(--text-secondary); font: normal 10px var(--font-ui); }
.desk.absent { border-style: dashed; background: transparent; }
.desk.absent strong { color: var(--text-secondary); text-decoration: line-through; }
.desk.picked,.desk:focus-visible,.seat-modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.desk.lit { background: color-mix(in srgb, var(--accent) 23%, var(--bg-card-solid)); border-color: var(--accent); box-shadow: var(--shadow-4); }
.seat-pages { justify-content: center; margin-top: 14px; font-size: 12px; color: var(--text-secondary); }
@container roller-panel (min-width: 930px) {
  .seat-strip { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
}
@container roller-panel (max-width: 500px) {
  .seat-view { padding: 13px; gap: 12px; }
  .seat-draw { margin-left: 0; }
  .seat-map { grid-template-columns: repeat(var(--seat-columns), minmax(60px, 1fr)); grid-auto-rows: minmax(57px, auto); gap: 5px; }
}
</style>
