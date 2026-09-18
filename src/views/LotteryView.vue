<template>
  <div class="lottery-view" :class="`section-${section}`">
    <header class="page-header">
      <div>
        <h1 class="page-title"><FluentIcon :icon="pageIcon" :width="28" />{{ pageTitle }}</h1>
        <p class="page-meta">{{ prizes.current.name }} · {{ lang === 'en' ? `${prizes.totalStock} remaining` : `剩余 ${prizes.totalStock} 件` }}</p>
      </div>
    </header>

    <template v-if="section === 'draw'">
      <main class="draw-workspace">
        <div class="draw-toolbar" :class="{ busy: rolling || settling }">
          <label class="prize-list-picker">
            <span>{{ lang === 'en' ? 'Current prize list' : '当前奖品单' }}</span>
            <FluentSelect :model-value="prizes.currentId" :options="prizeListOptions" @update:model-value="prizes.switchList" />
          </label>
          <FluentTabs v-model="drawStyle" class="style-tabs" :options="drawStyleOptions" />
        </div>

        <section class="draw-stage" :class="[`style-${drawStyle}`, { rolling, settling }]">
          <div v-if="drawStyle === 'roller'" class="roller-experience">
            <div
              :key="resultNonce"
              ref="rollerResultRef"
              class="roller-result"
              data-plugin-component="lottery.result"
              :style="pluginsStore.componentStyleStyle('lottery.result')"
              :class="resultPrize && !rolling && !pluginFinishEnabled ? `finish-${settingsStore.settings.finishAnimation || 'spotlight'}` : ''"
            >
              <span class="result-quality">{{ visiblePrize?.quality || (lang === 'en' ? 'READY' : '等待抽取') }}</span>
              <strong>{{ visiblePrize?.name || (lang === 'en' ? 'Prize draw' : '奖品抽取') }}</strong>
              <span class="result-stock">{{ resultPrize && !rolling ? `${lang === 'en' ? 'Remaining' : '剩余'} ${currentPrizeStock}` : (lang === 'en' ? 'Click start when ready' : '准备好后开始抽奖') }}</span>
            </div>
          </div>

          <div v-else class="wheel-experience">
            <div class="wheel-shell">
              <div class="wheel-pointer" aria-hidden="true"></div>
              <div class="prize-wheel" :style="wheelStyle">
                <span
                  v-for="segment in wheelSegments"
                  :key="segment.prize.id"
                  class="wheel-label"
                  :style="labelStyle(segment)"
                  :title="`${segment.prize.name} · ${segment.prize.weight}`"
                >{{ segment.prize.name }}</span>
                <div class="wheel-hub"><FluentIcon icon="gift-24-filled" :width="26" /></div>
              </div>
            </div>
            <div
              :key="resultNonce"
              ref="wheelResultRef"
              class="wheel-result"
              data-plugin-component="lottery.result"
              :style="pluginsStore.componentStyleStyle('lottery.result')"
              :class="resultPrize && !rolling && !settling && !pluginFinishEnabled ? `finish-${settingsStore.settings.finishAnimation || 'spotlight'}` : ''"
            >
              <span>{{ resultPrize ? (lang === 'en' ? 'Selected prize' : '抽取结果') : (lang === 'en' ? 'Weighted wheel' : '加权转盘') }}</span>
              <strong>{{ resultPrize?.name || (lang === 'en' ? 'Ready' : '等待开始') }}</strong>
              <small v-if="resultPrize">{{ resultPrize.quality }} · {{ lang === 'en' ? `${currentPrizeStock} remaining` : `剩余 ${currentPrizeStock} 件` }}</small>
              <small v-else>{{ lang === 'en' ? `${wheelSegments.length} available prizes` : `${wheelSegments.length} 种可用奖品` }}</small>
            </div>
          </div>
        </section>

        <div class="draw-actions">
          <FluentButton class="primary-action" variant="primary" size="lg" :disabled="settling || (!rolling && prizes.totalStock < 1)" @click="handleDrawAction">
            <FluentIcon :icon="settling ? 'arrow-sync-24-regular' : rolling ? 'stop-24-filled' : 'gift-24-filled'" :width="20" />
            {{ drawActionLabel }}
          </FluentButton>
          <p v-if="prizes.totalStock < 1" class="validation-message"><FluentIcon icon="warning-16-regular" :width="16" />{{ lang === 'en' ? 'No prizes in stock' : '当前奖品单没有可抽取库存' }}</p>
        </div>
      </main>
    </template>

    <template v-else-if="section === 'assign'">
      <div class="assignment-page">
        <FluentCard class="assignment-tool">
          <div class="assignment-controls">
            <label><span>{{ lang === 'en' ? 'Prize list' : '奖品单' }}</span><FluentSelect :model-value="prizes.currentId" :options="prizeListOptions" @update:model-value="prizes.switchList" /></label>
            <label><span>{{ lang === 'en' ? 'People list' : '人员名单' }}</span><FluentSelect :model-value="names.currentListId" :options="peopleListOptions" @update:model-value="names.switchList" /></label>
            <label><span>{{ lang === 'en' ? 'Assignments' : '分配人数' }}</span><FluentInput v-model="assignmentCount" type="number" :min="1" :max="maxAssignmentCount" /></label>
          </div>
          <div class="capacity-row">
            <span><FluentIcon icon="people-16-regular" :width="16" />{{ lang === 'en' ? `${eligiblePeople.length} eligible people` : `${eligiblePeople.length} 名可抽取人员` }}</span>
            <span><FluentIcon icon="gift-16-regular" :width="16" />{{ lang === 'en' ? `${prizes.totalStock} prizes in stock` : `${prizes.totalStock} 件奖品库存` }}</span>
          </div>
        </FluentCard>
        <p v-if="assignmentValidation" class="validation-message"><FluentIcon icon="warning-16-regular" :width="16" />{{ assignmentValidation }}</p>
        <FluentButton class="primary-action" variant="primary" size="lg" :disabled="assigning || !!assignmentValidation" @click="assignPrizes">
          <FluentIcon :icon="assigning ? 'arrow-sync-24-regular' : 'people-team-24-filled'" :width="20" />
          {{ assigning ? (lang === 'en' ? 'Assigning...' : '分配中...') : (lang === 'en' ? 'Draw people and assign' : '抽取人员并分配奖品') }}
        </FluentButton>
        <section v-if="allocations.length" class="allocation-results">
          <div v-for="(allocation, index) in allocations" :key="allocation.person.id" class="allocation-row" :style="{ '--delay': `${index * 70}ms` }">
            <span class="allocation-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <div><strong>{{ displayPerson(allocation.person) }}</strong><small>{{ allocation.person.id }}</small></div>
            <FluentIcon icon="arrow-right-20-regular" :width="20" />
            <div><strong>{{ allocation.prize.name }}</strong><small>{{ allocation.prize.quality }}</small></div>
          </div>
        </section>
      </div>
    </template>

    <template v-else>
      <main class="prizes-page">
        <div class="prize-page-toolbar">
          <div class="current-list-control">
            <span>{{ lang === 'en' ? 'Current prize list' : '当前奖品单' }}</span>
            <FluentSelect :model-value="prizes.currentId" :options="prizeListOptions" @update:model-value="onPrizeListSwitch" />
          </div>
          <FluentButton variant="secondary" @click="router.push('/lottery/prizes/manage')"><FluentIcon icon="settings-16-regular" :width="16" />{{ lang === 'en' ? 'Manage prize lists' : '管理奖品单' }}</FluentButton>
        </div>

        <FluentCard class="prize-editor">
          <h2>{{ lang === 'en' ? 'Add prize' : '添加奖品' }}</h2>
          <div class="prize-form">
            <FluentInput v-model="newPrize.name" :placeholder="lang === 'en' ? 'Prize name' : '奖品名称'" />
            <FluentInput v-model="newPrize.quality" :placeholder="lang === 'en' ? 'Quality' : '品质（例如 SR）'" />
            <FluentInput v-model="newPrize.quantity" type="number" :min="0" :placeholder="lang === 'en' ? 'Stock' : '库存'" />
            <FluentInput v-model="newPrize.weight" type="number" :min="0.01" :placeholder="lang === 'en' ? 'Weight' : '概率权重'" />
            <FluentButton variant="primary" @click="addPrize"><FluentIcon icon="add-16-regular" :width="15" />{{ lang === 'en' ? 'Add' : '添加' }}</FluentButton>
          </div>
        </FluentCard>

        <section class="prize-table">
          <div class="prize-table-title"><h2>{{ prizes.current.name }}</h2><span>{{ prizes.current.prizes.length }} {{ lang === 'en' ? 'prizes' : '项奖品' }}</span></div>
          <div class="prize-table-header"><span>{{ lang === 'en' ? 'Prize' : '奖品' }}</span><span>{{ lang === 'en' ? 'Quality' : '品质' }}</span><span>{{ lang === 'en' ? 'Stock' : '库存' }}</span><span>{{ lang === 'en' ? 'Weight' : '权重' }}</span><span></span></div>
          <div v-for="prize in prizes.current.prizes" :key="prize.id" class="prize-row">
            <template v-if="editingPrizeId === prize.id">
              <FluentInput v-model="editPrize.name" />
              <FluentInput v-model="editPrize.quality" />
              <FluentInput v-model="editPrize.quantity" type="number" :min="0" />
              <FluentInput v-model="editPrize.weight" type="number" :min="0.01" />
              <div class="row-actions"><FluentButton variant="primary" size="sm" icon-only title="保存" @click="savePrize(prize.id)"><FluentIcon icon="checkmark-16-regular" :width="15" /></FluentButton><FluentButton variant="subtle" size="sm" icon-only title="取消" @click="editingPrizeId = ''"><FluentIcon icon="dismiss-16-regular" :width="15" /></FluentButton></div>
            </template>
            <template v-else>
              <div><strong>{{ prize.name }}</strong><small>{{ prize.id }}</small></div>
              <span class="quality-badge">{{ prize.quality }}</span>
              <span>{{ prize.quantity }}</span>
              <span>{{ prize.weight }}</span>
              <div class="row-actions"><FluentButton variant="subtle" size="sm" icon-only title="编辑奖品" @click="startEditPrize(prize)"><FluentIcon icon="edit-16-regular" :width="15" /></FluentButton><FluentButton variant="subtle" size="sm" icon-only title="删除奖品" @click="confirmDeletePrize(prize)"><FluentIcon icon="delete-16-regular" :width="15" /></FluentButton></div>
            </template>
          </div>
          <div v-if="!prizes.current.prizes.length" class="empty-state"><FluentIcon icon="gift-open-24-regular" :width="28" />{{ lang === 'en' ? 'No prizes in this list' : '这个奖品单还没有奖品' }}</div>
        </section>
      </main>
    </template>

    <FluentModal v-model="showDeletePrize" :title="lang === 'en' ? 'Delete prize' : '删除奖品'">
      <p>{{ lang === 'en' ? `Delete ${deletingPrize?.name}?` : `确定删除「${deletingPrize?.name}」吗？` }}</p>
      <template #footer><FluentButton variant="secondary" @click="showDeletePrize = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton><FluentButton variant="danger" @click="deletePrize">{{ lang === 'en' ? 'Delete' : '删除' }}</FluentButton></template>
    </FluentModal>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePrizesStore } from '../stores/prizes'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'

const AUTO_STOP_DELAY = 3000
const WHEEL_SETTLE_DELAY = 1600
const WHEEL_COLORS = ['#e255aa', '#5d8fe5', '#39a783', '#eba13c', '#9670d5', '#df6963', '#38a6b9', '#cd7647']
const props = defineProps({ section: { type: String, default: 'draw' } })
const router = useRouter()
const prizes = usePrizesStore()
const names = useNamesStore()
const settingsStore = useSettingsStore()
const pluginsStore = usePluginsStore()
const showBanner = inject('banner')
const lang = computed(() => settingsStore.settings.language)
const section = computed(() => props.section)
const pageTitle = computed(() => section.value === 'assign' ? (lang.value === 'en' ? 'Prize assignment' : '人员奖品分配') : section.value === 'prizes' ? (lang.value === 'en' ? 'Prizes' : '奖品管理') : (lang.value === 'en' ? 'Prize draw' : '奖品抽取'))
const pageIcon = computed(() => section.value === 'assign' ? 'people-team-24-regular' : section.value === 'prizes' ? 'clipboard-task-list-24-regular' : 'gift-24-regular')
const prizeListOptions = computed(() => Object.values(prizes.lists).map(list => ({ value: list.id, label: list.name })))
const peopleListOptions = computed(() => names.allLists.map(list => ({ value: list.id, label: list.name })))

const drawStyle = ref('roller')
const drawStyleOptions = computed(() => [
  { value: 'roller', label: lang.value === 'en' ? 'Roller' : '滚动抽取', icon: 'fluent:arrow-repeat-all-24-regular' },
  { value: 'wheel', label: lang.value === 'en' ? 'Wheel' : '幸运转盘', icon: 'fluent:circle-24-regular' }
])
const rolling = ref(false)
const settling = ref(false)
const previewPrize = ref(null)
const resultPrize = ref(null)
const resultNonce = ref(0)
const rollerResultRef = ref(null)
const wheelResultRef = ref(null)
const pluginFinishEnabled = computed(() => pluginsStore.hasAnimation('lottery.finish'))
const wheelSnapshot = ref([])
const wheelRotation = ref(0)
const wheelTransition = ref('none')
let previewTimer
let autoStopTimer
let wheelFrame
let wheelLastTime
let settleTimer

const visiblePrize = computed(() => rolling.value ? previewPrize.value : resultPrize.value)
const currentPrizeStock = computed(() => prizes.current.prizes.find(prize => prize.id === resultPrize.value?.id)?.quantity ?? 0)
const drawActionLabel = computed(() => {
  if (settling.value) return lang.value === 'en' ? 'Selecting...' : '正在揭晓...'
  if (rolling.value) return lang.value === 'en' ? 'Stop' : '停止抽奖'
  return lang.value === 'en' ? 'Draw prize' : '开始抽奖'
})
const wheelPool = computed(() => wheelSnapshot.value.length ? wheelSnapshot.value : prizes.availablePrizes)
const wheelSegments = computed(() => {
  const total = wheelPool.value.reduce((sum, prize) => sum + Math.max(0.01, Number(prize.weight) || 1), 0)
  let cursor = 0
  return wheelPool.value.map((prize, index) => {
    const angle = Math.max(0.01, Number(prize.weight) || 1) / total * 360
    const segment = { prize, start: cursor, end: cursor + angle, center: cursor + angle / 2, color: WHEEL_COLORS[index % WHEEL_COLORS.length] }
    cursor += angle
    return segment
  })
})
const wheelGradient = computed(() => wheelSegments.value.length
  ? `conic-gradient(${wheelSegments.value.map(segment => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`
  : 'var(--bg-subtle)')
const wheelStyle = computed(() => ({ background: wheelGradient.value, transform: `rotate(${wheelRotation.value}deg)`, transition: wheelTransition.value }))

function labelStyle(segment) {
  const radians = segment.center * Math.PI / 180
  return {
    left: `${50 + Math.sin(radians) * 31}%`,
    top: `${50 - Math.cos(radians) * 31}%`,
    transform: 'translate(-50%, -50%)'
  }
}
function randomPreview() {
  const pool = wheelSnapshot.value
  if (!pool.length) return previewPrize.value = null
  const total = pool.reduce((sum, prize) => sum + prize.weight, 0)
  let cursor = Math.random() * total
  previewPrize.value = pool.find(prize => (cursor -= prize.weight) < 0) || pool.at(-1)
}
function animateWheel(timestamp) {
  if (!rolling.value || drawStyle.value !== 'wheel') return
  if (wheelLastTime) wheelRotation.value += Math.min(40, timestamp - wheelLastTime) * 0.32
  wheelLastTime = timestamp
  wheelFrame = requestAnimationFrame(animateWheel)
}
function clearDrawTimers() {
  clearInterval(previewTimer)
  clearTimeout(autoStopTimer)
  cancelAnimationFrame(wheelFrame)
  previewTimer = undefined
  autoStopTimer = undefined
  wheelFrame = undefined
  wheelLastTime = undefined
}
function beginDraw() {
  if (rolling.value || settling.value || prizes.totalStock < 1) return
  resultPrize.value = null
  wheelSnapshot.value = prizes.availablePrizes.map(prize => ({ ...prize }))
  wheelTransition.value = 'none'
  rolling.value = true
  if (drawStyle.value === 'roller') {
    randomPreview()
    previewTimer = setInterval(randomPreview, 72)
  } else {
    wheelFrame = requestAnimationFrame(animateWheel)
  }
  if (settingsStore.settings.autoStop) autoStopTimer = setTimeout(stopDraw, AUTO_STOP_DELAY)
}
async function revealResult(prize) {
  resultPrize.value = prize
  resultNonce.value += 1
  prizes.recordDraw({ prizeId: prize.id, mode: 'draw' })
  const operationId = crypto.randomUUID?.() || `lottery-${Date.now()}`
  const result = { id: prize.id, name: prize.name, quality: prize.quality || '', remaining: currentPrizeStock.value }
  pluginsStore.dispatchEvent('lottery:item-result', {
    operationId,
    index: 0,
    count: 1,
    prizeListId: prizes.currentId,
    result
  })
  pluginsStore.dispatchEvent('lottery:result', {
    operationId,
    prizeListId: prizes.currentId,
    style: drawStyle.value,
    results: [result]
  })
  await nextTick()
  const resultElement = drawStyle.value === 'wheel' ? wheelResultRef.value : rollerResultRef.value
  pluginsStore.startAnimation('lottery.finish', resultElement)
  pluginsStore.startAnimation('global.transition', null, { variant: 'lottery' })
}
function stopDraw() {
  if (!rolling.value || settling.value) return
  clearDrawTimers()
  rolling.value = false
  const result = prizes.draw(1)
  if (!result.success) {
    wheelSnapshot.value = []
    return notifyError(result.error)
  }
  const selected = result.prizes[0]
  if (drawStyle.value !== 'wheel') {
    revealResult(selected)
    wheelSnapshot.value = []
    return
  }

  const selectedSegment = wheelSegments.value.find(segment => segment.prize.id === selected.id)
  settling.value = true
  wheelTransition.value = `transform ${WHEEL_SETTLE_DELAY}ms cubic-bezier(0.12, 0.72, 0.12, 1)`
  const current = ((wheelRotation.value % 360) + 360) % 360
  const targetCenter = selectedSegment?.center || 0
  const alignment = ((-targetCenter - current) % 360 + 360) % 360
  wheelRotation.value += 5 * 360 + alignment
  settleTimer = setTimeout(() => {
    settling.value = false
    revealResult(selected)
    wheelSnapshot.value = []
  }, WHEEL_SETTLE_DELAY)
}
function handleDrawAction() {
  if (rolling.value) stopDraw()
  else beginDraw()
}

const assignmentCount = ref(2)
const assigning = ref(false)
const allocations = ref([])
const eligiblePeople = computed(() => names.currentNames.filter(person => !person.isWhiteList))
const maxAssignmentCount = computed(() => Math.max(1, Math.min(eligiblePeople.value.length, prizes.totalStock)))
const normalizedAssignmentCount = computed(() => Math.max(1, Math.floor(Number(assignmentCount.value) || 1)))
const assignmentValidation = computed(() => {
  const count = normalizedAssignmentCount.value
  if (!eligiblePeople.value.length) return lang.value === 'en' ? 'The selected people list is empty' : '所选人员名单没有可抽取成员'
  if (count > eligiblePeople.value.length) return lang.value === 'en' ? `Only ${eligiblePeople.value.length} eligible people are available` : `可抽取人员仅有 ${eligiblePeople.value.length} 名，无法分配 ${count} 人`
  if (count > prizes.totalStock) return lang.value === 'en' ? `Only ${prizes.totalStock} prizes remain` : `奖品库存仅剩 ${prizes.totalStock} 件，无法分配 ${count} 人`
  return ''
})
async function assignPrizes() {
  if (assignmentValidation.value || assigning.value) return
  assigning.value = true
  allocations.value = []
  await new Promise(resolve => setTimeout(resolve, 700))
  const people = [...eligiblePeople.value].sort(() => Math.random() - 0.5).slice(0, normalizedAssignmentCount.value)
  const result = prizes.draw(people.length)
  if (!result.success) { assigning.value = false; return notifyError(result.error) }
  const operationId = crypto.randomUUID?.() || `lottery-assign-${Date.now()}`
  allocations.value = people.map((person, index) => ({ person, prize: result.prizes[index] }))
  allocations.value.forEach((allocation, index) => {
    prizes.recordDraw({ prizeId: allocation.prize.id, personId: allocation.person.id, peopleListId: names.currentListId, mode: 'assign' })
    pluginsStore.dispatchEvent('lottery:item-result', {
      operationId,
      index,
      count: allocations.value.length,
      prizeListId: prizes.currentId,
      peopleListId: names.currentListId,
      result: {
        person: { id: allocation.person.id, name: allocation.person.cn, englishName: allocation.person.en || '' },
        prize: { id: allocation.prize.id, name: allocation.prize.name, quality: allocation.prize.quality || '' }
      }
    })
  })
  pluginsStore.dispatchEvent('lottery:assign-result', {
    operationId,
    prizeListId: prizes.currentId,
    peopleListId: names.currentListId,
    results: allocations.value.map(allocation => ({
      person: { id: allocation.person.id, name: allocation.person.cn, englishName: allocation.person.en || '' },
      prize: { id: allocation.prize.id, name: allocation.prize.name, quality: allocation.prize.quality || '' }
    }))
  })
  pluginsStore.startAnimation('global.transition', null, { variant: 'lottery' })
  assigning.value = false
}
function displayPerson(person) { return settingsStore.settings.englishMode && person.en ? person.en : person.cn }

const showDeletePrize = ref(false)
const deletingPrize = ref(null)
const newPrize = reactive({ name: '', quality: '普通', quantity: 1, weight: 1 })
const editingPrizeId = ref('')
const editPrize = reactive({ name: '', quality: '', quantity: 0, weight: 1 })
function onPrizeListSwitch(id) { prizes.switchList(id); editingPrizeId.value = '' }
function addPrize() {
  const added = prizes.add(newPrize.name, newPrize.quantity, newPrize.weight, newPrize.quality)
  if (!added) return notifyError(lang.value === 'en' ? 'Enter a prize name' : '请输入奖品名称')
  Object.assign(newPrize, { name: '', quality: '普通', quantity: 1, weight: 1 })
}
function startEditPrize(prize) { editingPrizeId.value = prize.id; Object.assign(editPrize, prize) }
function savePrize(id) { if (prizes.update(id, editPrize)) editingPrizeId.value = '' }
function confirmDeletePrize(prize) { deletingPrize.value = prize; showDeletePrize.value = true }
function deletePrize() { if (deletingPrize.value) prizes.remove(deletingPrize.value.id); showDeletePrize.value = false; deletingPrize.value = null }
function notifyError(message) { showBanner({ message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) }

onMounted(async () => { await Promise.all([prizes.initialize(), names.initialize()]) })
onBeforeUnmount(() => { clearDrawTimers(); clearTimeout(settleTimer) })
</script>

<style scoped>
.lottery-view { width: 100%; height: 100%; min-height: 0; padding: 28px 32px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.page-header { flex: 0 0 auto; display: flex; align-items: flex-end; justify-content: space-between; }
.page-title { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-family: var(--font-display); font-size: 24px; }
.page-meta { margin: 6px 0 0 38px; color: var(--text-muted); font-size: 12px; }
.draw-workspace { flex: 1; min-height: 470px; display: flex; flex-direction: column; }
.draw-toolbar { width: min(900px, 100%); margin: 0 auto; display: grid; grid-template-columns: minmax(180px, 240px) minmax(320px, 420px); align-items: end; justify-content: center; gap: 24px; padding: 4px 0 14px; }
.draw-toolbar.busy { pointer-events: none; opacity: 0.72; }
.prize-list-picker { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); font-size: 12px; }
.prize-list-picker .fluent-select-wrapper { width: 100%; }
.style-tabs { width: 100%; margin: 0; }
.draw-stage { flex: 1; min-height: 330px; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); display: grid; place-items: center; overflow: hidden; }
.roller-experience { width: 100%; height: 100%; min-height: 330px; display: grid; place-items: center; }
.roller-result { min-width: min(720px, 86%); max-width: 92%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--plugin-component-lottery-result-gap, 12px); color: var(--plugin-component-lottery-result-foreground, inherit); background: var(--plugin-component-lottery-result-background, transparent); padding: var(--plugin-component-lottery-result-padding, 0); border: var(--plugin-component-lottery-result-border-width, 0) solid var(--plugin-component-lottery-result-border-color, transparent); border-radius: var(--plugin-component-lottery-result-radius, 0); box-shadow: var(--plugin-component-lottery-result-shadow, none); }
.roller-result strong { max-width: 100%; color: var(--plugin-component-lottery-result-foreground, var(--text-primary)); font-family: var(--plugin-component-lottery-result-font-family, var(--font-display)); font-size: min(var(--plugin-component-lottery-result-font-size, var(--plugin-component-lottery-result-size, 82px)), clamp(48px, 7vh, 82px)); font-weight: var(--plugin-component-lottery-result-font-weight, 700); line-height: 1.08; overflow-wrap: anywhere; }
.result-quality { color: var(--accent); font-size: 13px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
.result-stock { min-height: 20px; color: var(--text-muted); font-size: 13px; }
.wheel-experience { width: min(820px, 100%); min-height: 430px; padding: 18px 24px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.wheel-shell { position: relative; width: clamp(270px, min(38vw, 42vh), 430px); aspect-ratio: 1; flex: 0 0 auto; filter: drop-shadow(0 12px 22px color-mix(in srgb, var(--accent) 15%, transparent)); }
.wheel-pointer { position: absolute; z-index: 4; top: 2px; left: 50%; width: 0; height: 0; transform: translateX(-50%); border-left: 15px solid transparent; border-right: 15px solid transparent; border-top: 29px solid var(--accent); filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18)); }
.prize-wheel { position: absolute; inset: 18px 10px 10px; border-radius: 50%; border: 5px solid var(--bg-card-solid); box-shadow: 0 0 0 1px var(--border-strong), inset 0 0 0 2px rgba(255, 255, 255, 0.5); overflow: hidden; will-change: transform; }
.wheel-label { position: absolute; z-index: 1; top: 50%; left: 50%; width: 34%; color: #fff; font-size: clamp(10px, 1.1vw, 14px); font-weight: 700; line-height: 1.2; text-align: center; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.72); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transform-origin: center; }
.wheel-hub { position: absolute; z-index: 2; inset: 38%; border-radius: 50%; display: grid; place-items: center; color: var(--accent); background: var(--bg-card-solid); border: 1px solid var(--border-strong); box-shadow: var(--shadow-8); }
.wheel-result { width: min(560px, 92%); min-height: 92px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--plugin-component-lottery-result-gap, 6px); text-align: center; color: var(--plugin-component-lottery-result-foreground, inherit); background: var(--plugin-component-lottery-result-background, transparent); padding: var(--plugin-component-lottery-result-padding, 0); border: var(--plugin-component-lottery-result-border-width, 0) solid var(--plugin-component-lottery-result-border-color, transparent); border-radius: var(--plugin-component-lottery-result-radius, 0); box-shadow: var(--plugin-component-lottery-result-shadow, none); }
.wheel-result > span { color: var(--accent); font-size: 13px; font-weight: 600; }
.wheel-result strong { color: var(--plugin-component-lottery-result-foreground, var(--text-primary)); font-family: var(--plugin-component-lottery-result-font-family, var(--font-display)); font-size: min(var(--plugin-component-lottery-result-font-size, var(--plugin-component-lottery-result-size, 48px)), clamp(28px, 3.5vw, 48px)); font-weight: var(--plugin-component-lottery-result-font-weight, 700); line-height: 1.08; overflow-wrap: anywhere; }
.wheel-result small { color: var(--text-muted); font-size: 13px; }
.draw-actions { flex: 0 0 auto; padding: 16px 0 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.primary-action { width: min(300px, 100%); justify-content: center; }
.validation-message { margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--danger); font-size: 12px; }
.finish-spotlight { animation: result-spotlight .62s cubic-bezier(.1,.9,.2,1); }
.finish-lift { animation: result-lift .68s cubic-bezier(.12,.85,.2,1.15); }
.finish-glow { animation: result-glow .8s cubic-bezier(.16,.84,.3,1); }
@keyframes result-spotlight { 0% { transform: scale(.84); opacity: 0; filter: brightness(2.1) blur(4px); } 62% { transform: scale(1.07); filter: brightness(1.3); } 100% { transform: scale(1); opacity: 1; filter: brightness(1); } }
@keyframes result-lift { 0% { transform: translateY(20px) scale(.9); opacity: 0; filter: blur(5px); } 58% { transform: translateY(-6px) scale(1.04); opacity: 1; } 100% { transform: none; filter: none; } }
@keyframes result-glow { 0% { transform: scale(.92); opacity: 0; text-shadow: 0 0 0 var(--accent); } 50% { transform: scale(1.05); opacity: 1; text-shadow: 0 0 34px var(--accent); } 100% { transform: scale(1); text-shadow: none; } }
.assignment-page, .prizes-page { width: min(1180px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.assignment-tool { padding: 20px; }
.assignment-controls { display: grid; grid-template-columns: 1fr 1fr minmax(130px, .55fr); gap: 16px; }
.assignment-controls label { display: flex; flex-direction: column; gap: 7px; color: var(--text-muted); font-size: 12px; }
.capacity-row { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-default); display: flex; gap: 22px; color: var(--text-secondary); font-size: 13px; }
.capacity-row span { display: flex; align-items: center; gap: 6px; }
.allocation-results { border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.allocation-row { display: grid; grid-template-columns: 44px 1fr 24px 1fr; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border-default); animation: allocation-in .5s var(--ease-standard) both; animation-delay: var(--delay); }
.allocation-row:last-child { border-bottom: 0; }
.allocation-row div { min-width: 0; display: flex; flex-direction: column; }
.allocation-row small { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
.allocation-index { color: var(--accent); font-weight: 700; }
@keyframes allocation-in { from { opacity: 0; transform: translateY(12px) scale(.98); } }
.prize-page-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 4px 0; }
.current-list-control { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); font-size: 12px; }
.prize-editor { padding: 18px 20px; }
.prize-editor h2, .prize-table-title h2 { margin: 0; color: var(--text-primary); font-size: 15px; }
.prize-form { margin-top: 12px; display: grid; grid-template-columns: minmax(220px, 2fr) minmax(130px, .8fr) minmax(100px, .55fr) minmax(100px, .55fr) auto; gap: 10px; }
.prize-table { border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-card); }
.prize-table-title { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-default); }
.prize-table-title span { color: var(--text-muted); font-size: 12px; }
.prize-table-header, .prize-row { display: grid; grid-template-columns: minmax(220px, 2fr) minmax(120px, .8fr) minmax(80px, .5fr) minmax(80px, .5fr) 90px; gap: 12px; align-items: center; }
.prize-table-header { padding: 10px 14px; color: var(--text-muted); font-size: 12px; background: var(--bg-subtle); }
.prize-row { min-height: 62px; padding: 10px 14px; border-top: 1px solid var(--border-default); }
.prize-row > div:first-child, .managed-list-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.prize-row small, .managed-list-info small { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quality-badge, .current-badge { width: fit-content; padding: 3px 8px; border-radius: var(--radius-sm); color: var(--accent); background: var(--accent-50); font-size: 11px; }
.row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
.empty-state { min-height: 130px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); }
@media (max-width: 900px) {
  .lottery-view { padding: 22px; }
  .draw-workspace { min-height: 560px; }
  .wheel-experience { gap: 10px; padding: 18px 0; }
  .wheel-shell { width: clamp(260px, min(66vw, 42vh), 390px); }
  .wheel-result { width: 90%; min-height: 82px; }
  .assignment-controls, .prize-form { grid-template-columns: 1fr 1fr; }
  .prize-form > :first-child { grid-column: span 2; }
}
@media (max-width: 680px) {
  .lottery-view { padding: 18px 14px; }
  .draw-toolbar { grid-template-columns: 1fr; gap: 10px; }
  .roller-result { min-width: 100%; }
  .roller-result strong { font-size: 46px; }
  .assignment-controls, .prize-form { grid-template-columns: 1fr; }
  .prize-form > :first-child { grid-column: auto; }
  .prize-table { overflow-x: auto; }
  .prize-table-header, .prize-row { min-width: 720px; }
  .prize-page-toolbar { align-items: stretch; flex-direction: column; }
}
</style>
