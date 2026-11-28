<template>
  <section class="seat-view">
    <header class="seat-header">
      <div><h1>{{ en ? 'Seat spotlight' : '座次寻光' }}</h1><p>{{ mapped ? (en ? 'Using your classroom seating chart.' : '按照已确认的教室座位表点名。') : (en ? 'Draw directly from the roster. Seat numbers apply only after you set up a seating chart.' : '按名单即可直接点名；排好实际座位后，才会报告排号和座号。') }}</p></div>
      <span class="seat-count">{{ en ? present + ' present · ' + absentIds.length + ' absent' : '到场 ' + present + ' 人 · 缺席 ' + absentIds.length + ' 人' }}</span>
    </header>
    <div v-if="seats.length && !loading" class="classroom">
      <div class="seat-toolbar">
        <div class="seat-modes" role="group" :aria-label="en ? 'Seat actions' : '座位操作'">
          <button type="button" :aria-pressed="mode === 'attendance'" :disabled="busy" @click="setMode('attendance')">{{ en ? 'Attendance' : '标记出勤' }}</button>
          <button type="button" :aria-pressed="mode === 'swap'" :disabled="busy" @click="setMode('swap')">{{ en ? 'Swap seats' : '交换座位' }}</button>
        </div>
        <FluentButton variant="secondary" size="sm" :disabled="locked || !absentIds.length" @click="resetAttendance">{{ en ? 'Reset attendance' : '重置本堂出勤' }}</FluentButton>
      </div>
      <p class="seat-instructions" role="status">{{ instructions }} <strong v-if="selectedPerson" translate="no">{{ displayName(selectedPerson) }}</strong></p>
      <div class="seat-chart-actions">
        <FluentButton size="sm" variant="secondary" :disabled="locked" @click="showPaste = !showPaste">{{ en ? 'Paste seating chart' : '粘贴座位表' }}</FluentButton>
        <template v-if="mode === 'swap'">
          <FluentButton class="seat-add-empty" size="sm" variant="secondary" :disabled="locked || seats.length >= MAX_SEAT_SLOTS" @click="appendEmptySeat"><FluentIcon icon="add-16-regular" :width="16" />{{ en ? 'Add empty seat' : '添加空座' }}</FluentButton>
          <FluentButton class="seat-remove-empty" size="sm" variant="secondary" :disabled="locked || !selectedEmpty" @click="deleteEmptySeat">{{ en ? 'Remove selected empty seat' : '删除选中的空座' }}</FluentButton>
        </template>
        <FluentButton v-if="mode === 'swap' && !mapped" size="sm" variant="secondary" :disabled="locked" @click="confirmLayout">{{ en ? 'Confirm classroom layout' : '确认当前为实际座位' }}</FluentButton>
        <FluentButton v-if="configured || order.length" size="sm" variant="secondary" :disabled="locked" @click="restoreOrder">{{ en ? 'Use roster order' : '回到名单顺序' }}</FluentButton>
      </div>
      <SeatPlanPaste v-if="showPaste" :en="en" :names="names.currentNames" :locked="locked" @apply="usePasted" @cancel="showPaste = false" />
      <div class="front"><span>{{ mapped ? (en ? 'Front of classroom' : '讲台方向') : (en ? 'Roster view' : '名单视图') }}</span></div>
      <div ref="planViewport" class="seat-scroll">
        <div class="seat-map" :class="{ 'seat-editing': mode === 'swap' }" :style="{ '--seat-columns': columns, '--seat-rows': Math.max(1, Math.ceil(visibleSeats.length / columns)) }"
          :aria-label="en ? 'Seating plan' : '座次图'" role="group" @keydown.esc="clearSelection">
          <button v-for="item in visibleSeats" :key="item.index" type="button" class="desk" :data-seat-id="item.person?.id" :data-seat-index="item.index"
            :class="{ empty: !item.person, absent: item.person && absent.has(item.person.id), picked: selectedSlot === item.index,
              lit: item.person && winnerIds.has(item.person.id), hopping: item.person && spotlightId === item.person.id,
              'drag-source': dragSource === item.index, 'drag-target': dropTarget === item.index && dragSource !== item.index }"
            :data-i18n-private-attrs="item.person ? 'aria-label title' : undefined"
            :aria-label="deskLabel(item)" :aria-pressed="mode === 'swap' ? selectedSlot === item.index : item.person ? absent.has(item.person.id) : undefined"
            :title="deskLabel(item)" :disabled="locked || (!item.person && mode !== 'swap')"
            @click="activate(item.index, $event)" @pointerdown="startPointer(item.index, $event)" @pointermove="movePointer"
            @pointerup="finishPointer" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer" @contextmenu="seatContextMenu">
            <small>
              <span translate="no">{{ mapped ? item.address.row + ' · ' + item.address.seat : '#' + (item.index + 1) }}</span>
              <b v-if="item.person && winnerIds.has(item.person.id)">✦</b><b v-else-if="item.person && absent.has(item.person.id)">−</b><b v-else-if="selectedSlot === item.index">✓</b>
            </small>
            <strong v-if="item.person" class="seat-name" data-seat-grip translate="no">{{ displayName(item.person) }}</strong>
            <span v-else class="seat-empty-name" data-seat-grip>{{ en ? 'Empty seat' : '空座' }}</span>
            <em v-if="item.person && absent.has(item.person.id)">{{ en ? 'Absent' : '缺席' }}</em>
          </button>
        </div>
      </div>
      <div v-if="pages > 1" class="seat-pages">
        <FluentButton variant="secondary" size="sm" :disabled="!page || busy" @click="changePage(page - 1)">{{ en ? 'Previous' : '上一页' }}</FluentButton>
        <span>{{ page + 1 }} / {{ pages }}</span>
        <FluentButton variant="secondary" size="sm" :disabled="page + 1 >= pages || busy" @click="changePage(page + 1)">{{ en ? 'Next' : '下一页' }}</FluentButton>
      </div>
    </div>
    <footer class="seat-strip">
      <div class="seat-controls">
        <label><span>{{ en ? 'Name list' : '当前名单' }}</span><I18nDataSelect :model-value="activeListId" :options="lists" :disabled="locked" :aria-label="en ? 'Name list' : '当前名单'" @update:model-value="changeList" /></label>
        <label><span>{{ mapped ? (en ? 'Seats per row' : '每排座位') : (en ? 'Columns' : '显示列数') }}</span><select :value="columns" :disabled="locked" @change="changeColumns($event.target.value)"><option v-for="n in MAX_COLUMNS" :key="n" :value="n">{{ n }}</option></select></label>
        <SeatDrawOptions v-model:multiple="multiple" v-model:count="count" v-model:gender="gender" :eligible-count="eligibleCount" :disabled="locked" :en="en" />
      </div>
      <div class="seat-action-row">
        <div class="seat-result" role="status" aria-live="polite" aria-atomic="true">
          <template v-if="receipt && results.length">
            <span class="seat-result-label">{{ resultLabel }}</span>
            <div class="seat-results">
              <div v-for="item in results" :key="item.resultIndex" class="seat-result-item">
                <strong class="seat-name" translate="no"><VerifiedResult :receipt="receipt" :index="item.resultIndex" :presentation="presentation" /></strong>
                <span v-if="item.address" class="seat-address">{{ positionLabel(item.address, item.index) }}</span>
              </div>
            </div>
          </template>
          <span v-else-if="busy">{{ en ? 'The spotlight is moving…' : '灯光正在座位间跳转…' }}</span>
          <span v-else-if="loading">{{ en ? 'Loading the seating plan…' : '正在载入座次…' }}</span>
          <span v-else-if="!occupied.length">{{ en ? 'No names in this seating plan.' : '这份名单还没有可排座的人员。' }} <RouterLink to="/lists/manage">{{ en ? 'Manage names' : '管理人员' }} →</RouterLink></span>
          <span v-else-if="!present">{{ en ? 'Everyone is marked absent. Select a seat or reset attendance to continue.' : '全员已标记缺席。点选座位让同学返回，或重置出勤后继续。' }}</span>
          <span v-else-if="!eligibleCount">{{ en ? 'No one present matches this filter.' : '到场同学中没有符合当前范围的人。' }}</span>
          <span v-else>{{ en ? 'Ready to draw from those present.' : '准备就绪，将从本堂课到场的同学中点名。' }}</span>
        </div>
        <FluentButton class="seat-draw" variant="primary" :disabled="locked || !canDraw" @click="beginDraw"><FluentIcon icon="sparkle-24-filled" :width="16" />{{ drawLabel }}</FluentButton>
      </div>
      <p v-if="error || drawError" class="seat-error" role="alert">{{ error || drawError }}</p>
    </footer>
  </section>
</template>

<script setup>
import I18nDataSelect from '../components/I18nDataSelect.vue'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { dataBridge } from '../utils/dataBridge'
import { useSeatDraw } from '../composables/useSeatDraw.js'
import { DEFAULT_COLUMNS, MAX_COLUMNS, MAX_SEAT_SLOTS, ROWS_PER_PAGE, addEmptySeat, orderedSeats, readSeatPlan, removeEmptySeat, seatAddress, seatColumns, seatOrder, swapSeatSlots, writeSeatPlan } from '../utils/seatPlan.mjs'
import VerifiedResult from '../components/roller/VerifiedResult.vue'
import SeatDrawOptions from '../components/roller/SeatDrawOptions.vue'
import SeatPlanPaste from '../components/roller/SeatPlanPaste.vue'

const names = useNamesStore()
const settings = useSettingsStore()
const plugins = usePluginsStore()
const en = computed(() => settings.settings.language === 'en')
const lists = computed(() => names.allLists.map(l => ({ value: l.id, label: l.name })))
const activeListId = computed(() => names.currentListId)
const presentation = computed(() => plugins.resultPresentationForTarget('roller.result'))
const columns = ref(DEFAULT_COLUMNS)
const order = shallowRef([])
const configured = ref(false)
const showPaste = ref(false)
const absent = shallowRef(new Set())
const seats = computed(() => orderedSeats(names.currentNames, order.value, configured.value || order.value.includes(null)))
const occupied = computed(() => seats.value.filter(Boolean))
const mapped = computed(() => configured.value && seats.value.length === order.value.length && seats.value.every((p,i) => (p?.id || null) === order.value[i]))
const absentIds = computed(() => occupied.value.filter(p => absent.value.has(p.id)).map(p => p.id))
const present = computed(() => occupied.value.length - absentIds.value.length)
const loading = ref(true)
const mode = ref('attendance')
const selectedSlot = ref(null)
const selectedPerson = computed(() => seats.value[selectedSlot.value] ?? null)
const selectedEmpty = computed(() => selectedSlot.value !== null && seats.value[selectedSlot.value] === null)
const pageIndex = ref(0)
const pageSize = computed(() => columns.value * ROWS_PER_PAGE)
const pages = computed(() => Math.max(1, Math.ceil(seats.value.length / pageSize.value)))
const page = computed(() => Math.min(pageIndex.value, pages.value - 1))
const visibleSeats = computed(() => {
  const start = page.value * pageSize.value
  return seats.value.slice(start, start + pageSize.value).map((person, i) => ({ person, index: start + i, address: seatAddress(start + i, columns.value) }))
})
const visiblePeople = computed(() => visibleSeats.value.flatMap(item => item.person ? [item.person] : []))
const { gender, multiple, count, busy, canDraw, eligible, spotlightId, receipt, error: drawError, draw, reset } = useSeatDraw({
  names, settings, plugins, seats, absentIds, activeListId, visiblePeople
})
const locked = computed(() => loading.value || busy.value)
const eligibleCount = computed(() => eligible.value.length)
const seatIndices = computed(() => new Map(seats.value.flatMap((person, i) => person ? [[person.id, i]] : [])))
const results = computed(() => (receipt.value?.results || []).map((result, resultIndex) => {
  const index = seatIndices.value.get(result.id) ?? -1
  return { index, resultIndex, address: seatAddress(index, columns.value) }
}))
const winnerIds = computed(() => new Set((receipt.value?.results || []).map(result => result.id)))
const resultLabel = computed(() => {
  if (results.value.length > 1) return mapped.value ? (en.value ? 'Selected seats' : '点亮的座位') : (en.value ? 'Selected names' : '本轮抽中的同学')
  return mapped.value ? (en.value ? 'Selected seat' : '座位已点亮') : (en.value ? 'Selected name' : '抽中的是')
})
const drawLabel = computed(() => {
  if (busy.value) return en.value ? 'Selecting…' : '点名中…'
  if (multiple.value) return en.value ? 'Light up seats' : '点亮多个座位'
  return en.value ? 'Light up a seat' : '点亮一个座位'
})
const dragSource = ref(null)
const dropTarget = ref(null)
const instructions = computed(() => {
  if (mode.value === 'attendance') return en.value ? 'Select a seat to mark someone absent or present for this class.' : '点选座位可标记缺席，再点一次即可返回。出勤标记仅用于本堂课。'
  if (dragSource.value !== null) return en.value ? 'Release on another seat to swap.' : '拖到另一个座位再松手，就能换位。'
  if (selectedEmpty.value) return en.value ? 'Choose another seat to swap, or remove this empty seat.' : '可以选另一个座位来换位，也可以删除这个空座。'
  if (selectedPerson.value) return en.value ? 'Choose a second seat to swap with:' : '再选一个座位，与这位同学换位：'
  return en.value ? 'Hold a name to drag it, or select two seats to swap. Swipe outside the names to scroll.' : '按住名字可拖动，也可以依次点选两个座位来换位。从名字旁滑动可滚动座位图。'
})
const planViewport = ref(null)
const error = ref('')
let generation = 0
let gesture
let suppressClickUntil = 0
function displayName(p) { return (settings.settings.englishMode && p?.en) || p?.cn || '' }
function addressLabel(a) { return en.value ? `Row ${a.row}, seat ${a.seat}` : `第 ${a.row} 排 · 第 ${a.seat} 座` }
function positionLabel(address, index) { return mapped.value ? addressLabel(address) : (en.value ? 'Position ' : '名单视图序号 ') + (index + 1) }
function attendanceLabel(id) { return absent.value.has(id) ? (en.value ? 'Absent' : '缺席') : (en.value ? 'Present' : '到场') }
function deskLabel(item) {
  const { person, address, index } = item
  const position = positionLabel(address, index)
  return person ? displayName(person) + ' · ' + position + ' · ' + attendanceLabel(person.id) : (en.value ? 'Empty seat' : '空座') + ' · ' + position
}
function changeList(id) { if (!locked.value) names.switchList(id) }
function clearSelection() { clearPointer(dragSource.value !== null); selectedSlot.value = null }
function setMode(value) {
  if (!locked.value) { clearSelection(); mode.value = value }
}
function changePage(value) { clearPointer(); pageIndex.value = value }
function save() {
  const token = generation
  error.value = ''
  writeSeatPlan(dataBridge, activeListId.value, { columns: columns.value, order: order.value, mapped: configured.value }).catch(e => {
    if (token === generation) error.value = e?.message || (en.value ? 'The seating plan could not be saved.' : '座次保存失败。')
  })
}
function usePasted(plan) {
  if (locked.value || !plan.valid) return
  clearSelection()
  reset()
  columns.value = plan.columns; order.value = plan.order.slice(); configured.value = true
  showPaste.value = false; pageIndex.value = 0; save()
}
function confirmLayout() {
  if (locked.value) return
  clearSelection()
  reset()
  order.value = seatOrder(seats.value); configured.value = true; save()
}
function restoreOrder() {
  if (locked.value) return
  clearSelection()
  reset()
  order.value = []; configured.value = false; pageIndex.value = 0; showPaste.value = false; save()
}
function applyOrder(next) {
  reset()
  order.value = next
  save()
}
function swapSlots(from, to) {
  if (locked.value || mode.value !== 'swap') return
  const current = seatOrder(seats.value)
  const next = swapSeatSlots(current, from, to)
  if (next !== current) applyOrder(next)
  selectedSlot.value = null
}
async function appendEmptySeat() {
  if (locked.value || mode.value !== 'swap') return
  const current = seatOrder(seats.value)
  const next = addEmptySeat(current)
  if (next === current) return
  clearSelection()
  applyOrder(next)
  selectedSlot.value = next.length - 1
  pageIndex.value = seatAddress(selectedSlot.value, columns.value).page
  await nextTick()
  if (selectedSlot.value === next.length - 1) seatElement(selectedSlot.value)?.focus()
}
function deleteEmptySeat() {
  if (locked.value || mode.value !== 'swap' || !selectedEmpty.value) return
  const next = removeEmptySeat(seatOrder(seats.value), selectedSlot.value)
  clearSelection()
  applyOrder(next)
  pageIndex.value = page.value
}
function changeColumns(value) {
  if (locked.value) return
  clearSelection()
  reset()
  columns.value = seatColumns(value)
  pageIndex.value = 0
  save()
}
function updateAttendance(ids) {
  reset()
  absent.value = new Set(ids)
  try { sessionStorage.setItem('seatAttendance:' + activeListId.value, JSON.stringify([...absent.value])) } catch { /* Keep current class usable without session storage. */ }
}
function resetAttendance() { if (!locked.value) updateAttendance([]) }
function activate(index, event) {
  if (locked.value) return
  if (event.detail && performance.now() < suppressClickUntil) {
    suppressClickUntil = 0
    return
  }
  if (mode.value === 'attendance') {
    const id = seats.value[index]?.id
    if (!id) return
    const next = new Set(absent.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    updateAttendance(next)
  } else if (selectedSlot.value === null) selectedSlot.value = index
  else if (selectedEmpty.value && seats.value[index] === null) selectedSlot.value = selectedSlot.value === index ? null : index
  else swapSlots(selectedSlot.value, index)
}
function seatElement(index) { return planViewport.value?.querySelector('[data-seat-index="' + index + '"]') }
function hitSeat(x, y) {
  const desk = document.elementFromPoint(x, y)?.closest('[data-seat-index]')
  return desk && planViewport.value?.contains(desk) ? Number(desk.dataset.seatIndex) : null
}
function clearPointer(blockClick = false) {
  const current = gesture
  gesture = undefined
  dragSource.value = null
  dropTarget.value = null
  if (!current) return
  clearTimeout(current.timer)
  cancelAnimationFrame(current.frame)
  if (blockClick) suppressClickUntil = performance.now() + 500
  if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id)
}
function dragScroll(current) {
  if (gesture !== current || dragSource.value === null || !planViewport.value) return
  const viewport = planViewport.value
  const box = viewport.getBoundingClientRect()
  if (current.y >= box.top && current.y <= box.bottom && current.x >= box.left && current.x <= box.right) {
    const step = current.x < box.left + 32 ? -9 : current.x > box.right - 32 ? 9 : 0
    const before = viewport.scrollLeft
    if (step) viewport.scrollLeft += step
    if (viewport.scrollLeft !== before) dropTarget.value = hitSeat(current.x, current.y)
  }
  current.frame = requestAnimationFrame(() => dragScroll(current))
}
function startPointer(index, event) {
  if (!event.isPrimary || event.button !== 0) return
  suppressClickUntil = 0
  if (locked.value || mode.value !== 'swap' || (event.pointerType !== 'mouse' && !event.target.closest('[data-seat-grip]'))) return
  clearPointer()
  const target = event.currentTarget
  const current = { id: event.pointerId, index, personId: seats.value[index]?.id ?? null, target, startX: event.clientX, startY: event.clientY,
    x: event.clientX, y: event.clientY, timer: 0, frame: 0 }
  gesture = current
  target.setPointerCapture(event.pointerId)
  current.timer = setTimeout(() => {
    if (gesture !== current || locked.value || mode.value !== 'swap') return
    selectedSlot.value = null
    dragSource.value = index
    dropTarget.value = index
    dragScroll(current)
  }, 290)
}
function movePointer(event) {
  const current = gesture
  if (!current || current.id !== event.pointerId) return
  current.x = event.clientX
  current.y = event.clientY
  if (dragSource.value === null) {
    if (Math.hypot(current.x - current.startX, current.y - current.startY) > 12) clearPointer(true)
  } else dropTarget.value = hitSeat(current.x, current.y)
}
function finishPointer(event) {
  const current = gesture
  if (!current || current.id !== event.pointerId) return
  const dragging = dragSource.value !== null
  const destination = dragging ? hitSeat(event.clientX, event.clientY) : null
  clearPointer(dragging)
  if (destination !== null && (seats.value[current.index]?.id ?? null) === current.personId) swapSlots(current.index, destination)
}
function cancelPointer(event) {
  if (gesture?.id === event.pointerId) clearPointer(dragSource.value !== null)
}
function seatContextMenu(event) {
  if (gesture || (mode.value === 'swap' && event.target.closest('[data-seat-grip]'))) event.preventDefault()
}
function beginDraw() {
  if (locked.value || !canDraw.value) return
  clearSelection()
  const candidateIds = new Set(eligible.value.map(person => person.id))
  if (!visiblePeople.value.some(person => candidateIds.has(person.id))) {
    const firstCandidate = seatIndices.value.get(eligible.value[0]?.id)
    if (firstCandidate !== undefined) pageIndex.value = seatAddress(firstCandidate, columns.value).page
  }
  draw()
}
watch([() => names.isLoaded, activeListId], async ([ready, id]) => {
  const token = ++generation
  loading.value = true
  clearSelection()
  reset()
  error.value = ''
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
onBeforeUnmount(() => { generation++; clearPointer() })

function scrollSeatIntoView(index) {
  const viewport = planViewport.value
  const seat = seatElement(index)
  if (!viewport || !seat) return
  const block = viewport.getBoundingClientRect()
  const box = seat.getBoundingClientRect()
  if (box.left < block.left || box.right > block.right) viewport.scrollLeft += box.left - block.left - (block.width - box.width) / 2
}
watch(spotlightId, id => {
  if (id) scrollSeatIntoView(seatIndices.value.get(id))
}, { flush: 'post' })
watch(receipt, async value => {
  const winner = results.value.find(item => item.address)
  if (!value || !winner) return
  pageIndex.value = winner.address.page
  await nextTick()
  if (receipt.value === value) scrollSeatIntoView(winner.index)
})
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
.seat-strip {
  display: grid;
  min-width: 0;
  gap: 12px;
  margin-block-start: auto;
  padding: clamp(11px, 1.8cqw, 19px);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-4);
}
.seat-header h1 { margin: 0; font: 700 clamp(22px, 3.5vw, 32px)/1.25 var(--font-display); }
.seat-header p,.seat-instructions { color: var(--text-secondary); font-size: 13px; margin: 5px 0 0; line-height: 1.5; }
.seat-count,.seat-address { padding: 5px 10px; border-radius: var(--radius-full); background: color-mix(in srgb, var(--accent) 12%, var(--bg-card-solid)); font-size: 12px; font-weight: 600; }
.seat-controls > label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); max-width: 100%; }
.seat-controls select { padding: 5px 10px; min-height: 32px; color: var(--text-primary); background: var(--bg-card-solid); border: 1px solid var(--border-strong); border-radius: var(--radius-md); font: inherit; }
.seat-action-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 12px; }
.seat-draw { justify-self: end; min-height: 40px; }
.seat-result { min-height: 56px; padding: 12px 18px; border: 1px solid var(--border-strong); border-inline-start: 3px solid var(--accent); border-radius: var(--radius-lg); background: linear-gradient(100deg, color-mix(in srgb, var(--accent) 10%, var(--bg-card-solid)), var(--bg-card)); color: var(--text-secondary); font-size: 14px; }
.seat-result-label { font-weight: 600; }
.seat-results { display: flex; flex-wrap: wrap; gap: 7px 14px; min-width: 0; }
.seat-result-item { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 9px; min-width: 0; }
.seat-result strong { color: var(--text-primary); font: 700 clamp(17px, 2.25cqw, 26px)/1.25 var(--font-display); overflow-wrap: anywhere; }
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
.desk.empty { border-style: dashed; justify-content: center; text-align: center; color: var(--text-secondary); background: transparent; font: 12px var(--font-ui); }
.front { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 18px 0 12px; color: var(--text-secondary); font-size: 12px; }
.front::before,.front::after { content: ''; height: 2px; background: var(--border-strong); width: min(24%, 160px); }
.seat-scroll { overflow-x: auto; padding: 4px; margin: -4px; overscroll-behavior-inline: contain; }
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
.desk:disabled { cursor: default; }
.desk.absent { border-style: dashed; background: transparent; }
.desk.absent strong { color: var(--text-secondary); text-decoration: line-through; }
.desk.picked,.desk:focus-visible,.seat-modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.desk.lit { background: color-mix(in srgb, var(--accent) 23%, var(--bg-card-solid)); border-color: var(--accent); box-shadow: var(--shadow-4); }
.desk.hopping { background: color-mix(in srgb, var(--accent) 34%, var(--bg-card-solid)); border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.seat-editing [data-seat-grip] { display: block; touch-action: none; user-select: none; -webkit-touch-callout: none; cursor: grab; }
.seat-editing .desk.drag-source { opacity: .55; border-color: var(--accent); }
.seat-editing .desk.drag-source [data-seat-grip] { cursor: grabbing; }
.seat-editing .desk.drag-target { outline: 2px dashed var(--accent); outline-offset: 1px; background: color-mix(in srgb, var(--accent) 16%, var(--bg-card-solid)); }
.seat-pages { justify-content: center; margin-top: 14px; font-size: 12px; color: var(--text-secondary); }
@container roller-panel (max-width: 500px) {
  .seat-view { padding: 13px; gap: 12px; }
  .seat-action-row { grid-template-columns: minmax(0, 1fr); }
  .seat-map { grid-template-columns: repeat(var(--seat-columns), minmax(60px, 1fr)); grid-auto-rows: minmax(57px, auto); gap: 5px; }
}
</style>
