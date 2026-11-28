<template>
  <div class="lottery-view" :class="`section-${section}`" :inert="savingPrize">
    <header class="page-header">
      <div>
        <h1 class="page-title"><FluentIcon :icon="pageIcon" :width="28" />{{ pageTitle }}</h1>
        <p class="page-meta"><span translate="no">{{ prizes.current.name }}</span> · {{ lang === 'en' ? `${displayStock} remaining` : `剩余 ${displayStock} 件` }}</p>
      </div>
    </header>

    <main v-if="section === 'draw'" class="draw-workspace">
      <div class="draw-column">
        <section class="draw-card">
          <fieldset class="draw-toolbar" :disabled="busy" :inert="busy">
            <legend class="sr-only">{{ tr('本轮设置', 'Round settings') }}</legend>
            <label class="prize-list-picker"><span>{{ tr('当前奖品单', 'Prize list') }}</span>
              <select :value="prizes.currentId" @change="selectPrizeList($event)">
                <option v-for="option in prizeListOptions" :key="option.value" :value="option.value" translate="no">{{ option.label }}</option>
              </select>
            </label>
            <label class="prize-list-picker"><span>{{ tr('每轮件数', 'Items per draw') }}</span>
              <input v-model.number="drawCount" type="number" min="1" :max="maxDrawCount" step="1" :disabled="!prizes.totalStock" :aria-invalid="!!drawValidation" />
            </label>
          </fieldset>
          <div class="style-tabs" role="group" :aria-label="tr('抽取方式', 'Draw style')">
            <button v-for="style in drawStyleOptions" :key="style.value" type="button" :aria-pressed="drawStyle === style.value" :disabled="busy" @click="changeStyle(style.value)">
              <FluentIcon :icon="style.icon" :width="16" />{{ style.label }}
            </button>
          </div>

          <div class="draw-stage" :class="[`style-${drawStyle}`, { rolling, settling }]">
            <div v-if="!busy && !resultPrize && !prizes.totalStock" class="stock-empty">
              <span class="stage-emblem"><FluentIcon icon="gift-open-24-regular" :width="30" /></span>
              <strong>{{ tr('奖池暂无库存', 'The prize pool is empty') }}</strong>
              <span>{{ tr('在奖品管理中添加奖品，或切换到其他奖品单。', 'Add stock in Manage prizes, or switch to another list.') }}</span>
            </div>
            <div v-else-if="isGame" class="game-stage">
              <PrizeRevealGame :key="gameKey" :mode="drawStyle" :prizes="sealedResults?.items || roundResults"
                :busy="settling && !sealedResults" :disabled="!busy && !validRoundCount(drawCount, maxDrawCount)"
                :english="lang === 'en'" @request="beginDraw" @reveal="revealGame" />
              <div v-if="resultPrize" ref="gameResultRef" class="game-result" data-plugin-component="lottery.result" :style="pluginsStore.componentStyleStyle('lottery.result')">
                <strong class="lottery-result-name" translate="no">{{ resultPrize.name }}</strong><small>{{ stageNote }}</small>
              </div>
            </div>
            <div v-else-if="drawStyle === 'roller'" class="roller-experience">
              <div :key="resultNonce" ref="rollerResultRef" class="roller-result"
                data-plugin-component="lottery.result" :style="pluginsStore.componentStyleStyle('lottery.result')">
                <span class="stage-emblem" aria-hidden="true"><FluentIcon icon="gift-24-regular" :width="28" /></span>
                <span class="result-quality lottery-meta-name" :translate="visiblePrize?.quality ? 'no' : null">{{ visiblePrize?.quality || stageCaption }}</span>
                <strong class="lottery-result-name" :translate="visiblePrize?.name ? 'no' : null">{{ visiblePrize?.name || (busy ? tr('抽取中', 'Drawing') : tr('准备就绪', 'Ready to draw')) }}</strong>
                <span class="result-stock">{{ stageNote }}</span>
              </div>
            </div>
            <div v-else class="wheel-experience">
              <div class="wheel-shell" aria-hidden="true">
                <div class="wheel-pointer"></div>
                <div class="prize-wheel" :style="wheelStyle">
                  <span v-for="segment in wheelLabels" :key="segment.prize.id" class="wheel-label" :style="labelStyle(segment)">{{ segment.prize.name }}</span>
                  <div class="wheel-hub"><FluentIcon icon="gift-24-filled" :width="24" /></div>
                </div>
              </div>
              <div :key="resultNonce" ref="wheelResultRef" class="wheel-result"
                data-plugin-component="lottery.result" :style="pluginsStore.componentStyleStyle('lottery.result')">
                <span>{{ stageCaption }}</span>
                <strong class="lottery-result-name" :translate="resultPrize?.name ? 'no' : null">{{ resultPrize?.name || (busy ? tr('抽取中', 'Drawing') : tr('准备就绪', 'Ready to draw')) }}</strong>
                <small>{{ stageNote }}</small>
              </div>
            </div>
          </div>

          <div v-if="!isGame || resultPrize || !displayStock || (!busy && drawValidation)" class="draw-actions">
            <FluentButton v-if="isGame && resultPrize && prizes.totalStock" class="primary-action" variant="primary" @click="nextGame">{{ tr('再来一轮', 'New round') }}</FluentButton>
            <FluentButton v-else-if="!isGame && (prizes.totalStock || busy)" class="primary-action" variant="primary" size="lg" :disabled="settling || (!rolling && !!drawValidation)" @click="handleDrawAction">
              <FluentIcon :icon="rolling ? 'stop-24-filled' : 'gift-24-filled'" :width="18" />{{ drawActionLabel }}
            </FluentButton>
            <FluentButton v-else-if="!displayStock && !busy" variant="primary" class="primary-action" size="lg" @click="router.push('/lottery/prizes')">
              <FluentIcon icon="gift-16-regular" :width="16" />{{ tr('去补充奖品', 'Add prize stock') }}
            </FluentButton>
            <p v-if="drawValidation && !busy" class="validation-message" role="status">{{ drawValidation }}</p>
            <small v-else-if="!isGame && (prizes.totalStock || busy)" class="draw-shortcut">{{ tr('空格键开始或揭晓', 'Space to start or reveal') }}</small>
          </div>
        </section>
        <div class="sr-only" role="status" :translate="roundResults.length === 1 ? 'no' : null">{{ liveAnnouncement }}</div>
        <section v-if="roundResults.length > 1" class="round-results">
          <header><h2>{{ tr('本轮结果', 'Round results') }}</h2><span>{{ tr(`共 ${roundResults.length} 件`, `${roundResults.length} items`) }}</span></header>
          <ol><li v-for="(item, index) in roundResults" :key="index"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong class="round-result-name" translate="no">{{ item.name }}</strong><small translate="no">{{ item.quality }}</small></li></ol>
        </section>
      </div>
      <PrizePoolPanel :key="prizes.currentId" :segments="visibleSegments" :en="lang === 'en'" />
    </main>

    <template v-else-if="section === 'assign'">
      <div class="assignment-page">
        <FluentCard class="assignment-tool">
          <fieldset class="assignment-controls" :disabled="assigning" :inert="assigning">
            <label><span>{{ lang === 'en' ? 'Prize list' : '奖品单' }}</span><I18nDataSelect :model-value="prizes.currentId" :options="prizeListOptions" @update:model-value="onPrizeListSwitch" /></label>
            <label><span>{{ lang === 'en' ? 'People list' : '人员名单' }}</span><I18nDataSelect :model-value="names.currentListId" :options="peopleListOptions" @update:model-value="names.switchList" /></label>
            <label><span>{{ lang === 'en' ? 'Assignments' : '分配人数' }}</span><FluentInput v-model="assignmentCount" type="number" :min="1" :max="maxAssignmentCount" /></label>
          </fieldset>
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
          <div v-for="(allocation, index) in allocations" :key="allocation.person.id" class="allocation-row" :ref="el => setAllocationRef(index, el)">
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
            <I18nDataSelect :model-value="prizes.currentId" :options="prizeListOptions" @update:model-value="onPrizeListSwitch" />
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
          <div class="prize-table-title"><h2 class="prize-table-name">{{ prizes.current.name }}</h2><span>{{ prizes.current.prizes.length }} {{ lang === 'en' ? 'prizes' : '项奖品' }}</span></div>
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
              <div class="prize-row-name"><strong>{{ prize.name }}</strong><small>{{ prize.id }}</small></div>
              <span class="quality-badge" translate="no">{{ prize.quality }}</span>
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
      <p>{{ lang === 'en' ? 'Delete this prize?' : '确定删除这个奖品吗？' }} <strong translate="no">{{ deletingPrize?.name }}</strong></p>
      <template #footer><FluentButton variant="secondary" @click="showDeletePrize = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton><FluentButton variant="danger" @click="deletePrize">{{ lang === 'en' ? 'Delete' : '删除' }}</FluentButton></template>
    </FluentModal>
  </div>
</template>

<script setup>
import I18nDataSelect from '../components/I18nDataSelect.vue'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePrizesStore } from '../stores/prizes'
import { getCoreClient } from '../core/client'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { gsap } from 'gsap'
import { createRollScheduler } from '../utils/rollSchedule.mjs'
import { runFinishAnimation, animationEnabled } from '../utils/animation.js'

import PrizePoolPanel from '../components/lottery/PrizePoolPanel.vue'
import PrizeRevealGame from '../components/lottery/PrizeRevealGame.vue'
import { normalizeAutoStopDuration } from '../utils/autoStop.mjs'
import { prizeSegments, landingRotation, validRoundCount, resultsWithStock } from '../utils/lotteryRound.mjs'

const WHEEL_SETTLE_DELAY = 1150
const props = defineProps({ section: { type: String, default: 'draw' } })
const router = useRouter()
const prizes = usePrizesStore()
const coreClient = getCoreClient()
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

const tr = (zh, en) => lang.value === 'en' ? en : zh
const drawStyle = ref('roller')
const drawStyleOptions = computed(() => [
  { value: 'roller', label: tr('滚动抽取', 'Roller'), icon: 'arrow-repeat-all-24-regular' },
  { value: 'wheel', label: tr('幸运转盘', 'Wheel'), icon: 'circle-24-regular' },
  { value: 'box', label: tr('花信盲盒', 'Bloom Boxes'), icon: 'gift-24-regular' },
  { value: 'scratch', label: tr('刮开好运', 'Scratch & Reveal'), icon: 'ticket-diagonal-24-regular' }
])
const isGame = computed(() => drawStyle.value === 'box' || drawStyle.value === 'scratch')
const gameKey = ref(0)
const gameResultRef = ref(null)
const sealedResults = shallowRef(null)
const drawCount = ref(1)
const maxDrawCount = computed(() => Math.min(100, prizes.totalStock))
const drawValidation = computed(() => maxDrawCount.value && !validRoundCount(drawCount.value, maxDrawCount.value)
  ? tr(`请输入 1 至 ${maxDrawCount.value} 之间的整数。`, `Enter a whole number from 1 to ${maxDrawCount.value}.`) : '')
const rolling = ref(false)
const settling = ref(false)
const busy = computed(() => rolling.value || settling.value)
const roundResults = ref([])
const resultPrize = computed(() => roundResults.value[0])
const previewPrize = ref(null)
const resultNonce = ref(0)
const rollerResultRef = ref(null)
const wheelResultRef = ref(null)
const liveAnnouncement = ref('')
const wheelSnapshot = ref(null)
const wheelRotation = ref(0)
const wheelTransition = ref('none')
const liveSegments = computed(() => prizeSegments(prizes.current.prizes))
const visibleSegments = computed(() => isGame.value && busy.value && wheelSnapshot.value ? wheelSnapshot.value : liveSegments.value)
const displayStock = computed(() => isGame.value && busy.value ? visibleSegments.value.reduce((total, s) => total + s.prize.quantity, 0) : prizes.totalStock)
const wheelSegments = computed(() => wheelSnapshot.value ?? liveSegments.value)
const wheelLabels = computed(() => wheelSegments.value.filter(segment => segment.end - segment.start >= 32))
const wheelStyle = computed(() => ({
  background: wheelSegments.value.length
    ? `conic-gradient(${wheelSegments.value.map(s => `${s.color} ${s.start}deg ${s.end}deg`).join(', ')})`
    : 'var(--bg-subtle)',
  transform: `rotate(${wheelRotation.value}deg)`, transition: wheelTransition.value,
  '--wheel-counter': `${-wheelRotation.value}deg`, '--wheel-transition': wheelTransition.value
}))
const visiblePrize = computed(() => rolling.value ? previewPrize.value : resultPrize.value)
const stageCaption = computed(() => resultPrize.value
  ? roundResults.value.length === 1 ? tr('抽取结果', 'Selected prize') : tr('本轮首件奖品', 'First prize this round')
  : tr('加权抽取', 'Weighted draw'))
const stageNote = computed(() => {
  if (resultPrize.value) {
    if (roundResults.value.length > 1) return tr(`本轮首件 · 共抽取 ${roundResults.value.length} 件`, `First of ${roundResults.value.length} items this round`)
    return tr(`此奖品剩余 ${resultPrize.value.remaining} 件`, `${resultPrize.value.remaining} of this prize left`)
  }
  if (settling.value) return tr('正在揭晓本轮结果…', 'Revealing this round…')
  if (rolling.value) return tr('点击揭晓查看结果', 'Reveal when you are ready')
  return validRoundCount(drawCount.value, maxDrawCount.value)
    ? tr(`本轮将抽取 ${drawCount.value} 件奖品`, `This round draws ${drawCount.value} ${Number(drawCount.value) === 1 ? 'item' : 'items'}`) : ''
})
const drawActionLabel = computed(() => settling.value ? tr('正在揭晓…', 'Revealing…')
  : rolling.value ? tr('揭晓结果', 'Reveal results') : tr('开始抽奖', 'Start draw'))

let activeRound = null
let disposed = false
let autoStopTimer
let settleTimer
const previewScheduler = createRollScheduler({ baseMs: 72 })
let drawTickerActive = false
function motionAllowed() { return animationEnabled() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches }

function drawTickerTick(_time, deltaTimeMs) {
  if (!rolling.value) return
  if (drawStyle.value === 'wheel') wheelRotation.value += Math.min(40, deltaTimeMs) * 0.32
  else if (previewScheduler.tick(Math.min(deltaTimeMs, 100))) {
    const sample = Math.random() * 360
    previewPrize.value = wheelSegments.value.find(segment => segment.end > sample)?.prize
  }
}
function clearDrawTimers() {
  if (drawTickerActive) gsap.ticker.remove(drawTickerTick)
  drawTickerActive = false
  clearTimeout(autoStopTimer)
  clearTimeout(settleTimer)
}
function clearRound() {
  dispatchSealed()
  clearDrawTimers()
  activeRound = null
  rolling.value = false
  settling.value = false
  previewPrize.value = null
  roundResults.value = []
  liveAnnouncement.value = ''
  wheelSnapshot.value = null
  wheelTransition.value = 'none'
  wheelRotation.value = 0
}
function dispatchSealed() {
  const sealed = sealedResults.value
  if (!sealed) return
  sealedResults.value = null
  publishDraw(sealed.receipt, sealed.style, sealed.items)
}
function nextGame() { clearRound(); gameKey.value++; if (!validRoundCount(drawCount.value, maxDrawCount.value)) drawCount.value = 1 }
function revealGame() {
  const items = sealedResults.value?.items
  if (!items || !activeRound) return
  dispatchSealed()
  revealResult(activeRound, items)
}
function changeStyle(style) {
  if (busy.value || style === drawStyle.value) return
  clearRound()
  drawStyle.value = style
}
function labelStyle(segment) {
  const radians = segment.center * Math.PI / 180
  return { left: `${50 + Math.sin(radians) * 32}%`, top: `${50 - Math.cos(radians) * 32}%` }
}
function beginDraw() {
  if (savingPrize.value || busy.value || (isGame.value && roundResults.value.length) || !validRoundCount(drawCount.value, maxDrawCount.value)) return
  clearRound()
  activeRound = { listId: prizes.currentId, count: Number(drawCount.value), style: drawStyle.value }
  // Keep the wheel that was drawn, even if the winning item sells out.
  wheelSnapshot.value = prizeSegments(prizes.current.prizes.map(prize => ({ ...prize })))
  rolling.value = true
  liveAnnouncement.value = tr('开始抽奖', 'Draw started')
  if (isGame.value) { stopDraw(); return }
  if (motionAllowed()) {
    previewScheduler.reset()
    drawTickerActive = true
    gsap.ticker.add(drawTickerTick)
  }
  if (settingsStore.settings.autoStop) autoStopTimer = setTimeout(stopDraw, normalizeAutoStopDuration(settingsStore.settings.autoStopDuration) * 1000)
}
function publishDraw(receipt, style, results) {
  const common = { operationId: receipt.operationId, prizeListId: receipt.listId }
  results.forEach((result, index) => pluginsStore.dispatchEvent('lottery:item-result', { ...common, index, count: results.length, result }))
  pluginsStore.dispatchEvent('lottery:result', { ...common, style, results })
}
async function revealResult(round, results) {
  if (activeRound !== round || disposed) return
  roundResults.value = results
  resultNonce.value += 1
  settling.value = false
  liveAnnouncement.value = results.length === 1 ? tr(`抽中：${results[0].name}`, `Selected: ${results[0].name}`)
    : tr(`已抽取 ${results.length} 件奖品，详见本轮结果。`, `${results.length} items selected. See Round results.`)
  await nextTick()
  if (!motionAllowed() || activeRound !== round || disposed) return
  const element = isGame.value ? gameResultRef.value : round.style === 'wheel' ? wheelResultRef.value : rollerResultRef.value
  pluginsStore.startAnimation('lottery.finish', element)
  if (!pluginsStore.hasAnimation('lottery.finish')) runFinishAnimation(element, settingsStore.settings.finishAnimation || 'spotlight', 'lottery')
  pluginsStore.startAnimation('global.transition', null, { variant: 'lottery' })
}
async function stopDraw() {
  if (!rolling.value || !activeRound) return
  const round = activeRound
  clearDrawTimers()
  rolling.value = false
  settling.value = true
  let receipt
  try {
    receipt = await coreClient.executePrizeOperation({ operation: 'lottery-draw', input: { listId: round.listId, count: round.count }, caller: { kind: 'core-ui', pluginId: 'core' } })
  } catch (error) {
    if (activeRound === round && !disposed) {
      clearRound()
      gameKey.value++
      notifyError(tr('抽奖未完成：', 'Could not complete the draw: ') + (error?.message || error))
    }
    return
  }
  // The core has already committed both inventory and one record per item.
  const committed = prizes.lists[receipt.listId]?.prizes || []
  const results = resultsWithStock(receipt.results, committed)
  if (isGame.value && activeRound === round && !disposed) {
    sealedResults.value = { receipt, style: round.style, items: results }
    liveAnnouncement.value = tr('本轮奖品已就绪，可以揭晓。', 'Your prizes are ready to reveal.')
    return
  }
  publishDraw(receipt, round.style, results)
  if (activeRound !== round || disposed) return
  if (round.style === 'wheel') {
    // Hooks may redirect the draw to a different list. Rebuild its pre-draw wheel.
    if (round.listId !== receipt.listId) {
      const counts = new Map()
      results.forEach(item => counts.set(item.id, (counts.get(item.id) || 0) + 1))
      wheelSnapshot.value = prizeSegments(committed.map(p => ({ ...p, quantity: p.quantity + (counts.get(p.id) || 0) })))
    }
    const segment = wheelSegments.value.find(s => s.prize.id === results[0].id)
    if (segment) {
      const animate = motionAllowed()
      wheelTransition.value = animate ? `transform ${WHEEL_SETTLE_DELAY}ms cubic-bezier(.12,.72,.12,1)` : 'none'
      wheelRotation.value = landingRotation(wheelRotation.value, segment, animate ? 3 : 0)
      if (animate) { settleTimer = setTimeout(() => revealResult(round, results), WHEEL_SETTLE_DELAY); return }
    }
  }
  await revealResult(round, results)
}
function handleDrawAction() { if (rolling.value) stopDraw(); else beginDraw() }
function onDrawKey(event) {
  if (section.value !== 'draw' || isGame.value || event.code !== 'Space' || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [contenteditable], [role="button"], [role="dialog"], [role="combobox"], [role="tab"]')) return
  if (document.querySelector('[aria-modal="true"]') || settling.value || (!rolling.value && !validRoundCount(drawCount.value, maxDrawCount.value))) return
  event.preventDefault()
  handleDrawAction()
}

const assignmentCount = ref(1)
const assigning = ref(false)
const allocations = ref([])
const allocationRowRefs = []
function setAllocationRef(index, element) { allocationRowRefs[index] = element }

function animateAllocations() {
  if (!motionAllowed()) return
  allocationRowRefs.forEach((element, index) => {
    if (!(element instanceof Element)) return
    try {
      gsap.fromTo(element,
        { opacity: 0, y: 12, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: Math.min(index, 8) * 0.06, ease: 'cnr-standard', overwrite: 'auto' })
    } catch {}
  })
}
const eligiblePeople = computed(() => names.currentNames.filter(person => !person.isWhiteList))
const maxAssignmentCount = computed(() => Math.min(100, eligiblePeople.value.length, prizes.totalStock))
const assignmentValidation = computed(() => {
  if (!eligiblePeople.value.length) return tr('所选人员名单没有可抽取成员', 'No eligible people on this list')
  if (!prizes.totalStock) return tr('当前奖品单没有库存', 'The prize list has no stock')
  return validRoundCount(assignmentCount.value, maxAssignmentCount.value) ? ''
    : tr(`分配人数须为 1 至 ${maxAssignmentCount.value} 之间的整数。`, `Enter 1 to ${maxAssignmentCount.value} whole assignments.`)
})
async function assignPrizes() {
  if (assigning.value || assignmentValidation.value) return
  assigning.value = true
  allocations.value = []
  allocationRowRefs.length = 0
  const input = { listId: prizes.currentId, peopleListId: names.currentListId, count: Number(assignmentCount.value) }
  try {
    const receipt = await coreClient.executePrizeOperation({ operation: 'prize-assignment', input, caller: { kind: 'core-ui', pluginId: 'core' } })
    const common = { operationId: receipt.operationId, prizeListId: receipt.listId, peopleListId: receipt.finalFilter?.peopleListId || input.peopleListId }
    const pairs = receipt.results.map(item => ({
      person: { id: item.person.id, name: item.person.name, englishName: item.person.englishName || '' },
      prize: { id: item.id, name: item.name, quality: item.quality || '' }
    }))
    pairs.forEach((result, index) => pluginsStore.dispatchEvent('lottery:item-result', { ...common, index, count: pairs.length, result }))
    pluginsStore.dispatchEvent('lottery:assign-result', { ...common, results: pairs })
    if (!disposed && prizes.currentId === input.listId && names.currentListId === input.peopleListId) {
      allocations.value = pairs
      await nextTick()
      if (!disposed && motionAllowed()) {
        animateAllocations()
        pluginsStore.startAnimation('global.transition', null, { variant: 'lottery' })
      }
    }
  } catch (error) {
    if (!disposed) notifyError(tr('分配未完成：', 'Could not assign prizes: ') + (error?.message || error))
  } finally {
    assigning.value = false
  }
}
function displayPerson(person) { return settingsStore.settings.englishMode && person.englishName ? person.englishName : person.name }

const showDeletePrize = ref(false)
const deletingPrize = ref(null)
const newPrize = reactive({ name: '', quality: '普通', quantity: 1, weight: 1 })
const editingPrizeId = ref('')
const editPrize = reactive({ name: '', quality: '', quantity: 0, weight: 1 })
let editOriginal
const savingPrize = ref(false)
async function writePrize(action) {
  if (savingPrize.value) return false
  savingPrize.value = true
  try {
    const value = await action()
    if (!value) throw new Error(tr('奖品单已更改，请重新选择。', 'The list has changed. Please select it again.'))
    return value
  } catch (error) { notifyError(error?.message || String(error)); return false }
  finally { savingPrize.value = false }
}
function validPrize(prize) {
  if (!prize.name.trim() || !Number.isSafeInteger(Number(prize.quantity)) || prize.quantity === '' || Number(prize.quantity) < 0 ||
    !Number.isFinite(Number(prize.weight)) || Number(prize.weight) < .01) {
    notifyError(tr('请填写奖品名称、非负整数库存和不低于 0.01 的权重。', 'Enter a name, whole non-negative stock, and a weight of at least 0.01.'))
    return false
  }
  return true
}
async function onPrizeListSwitch(id) { if (await writePrize(() => prizes.switchList(id))) editingPrizeId.value = '' }
async function selectPrizeList(event) {
  const select = event.target
  await onPrizeListSwitch(select.value)
  select.value = prizes.currentId
}
async function addPrize() {
  if (!validPrize(newPrize)) return
  if (await writePrize(() => prizes.add(newPrize.name, newPrize.quantity, newPrize.weight, newPrize.quality))) {
    Object.assign(newPrize, { name: '', quality: '普通', quantity: 1, weight: 1 })
  }
}
function startEditPrize(prize) { editingPrizeId.value = prize.id; editOriginal = { ...prize }; Object.assign(editPrize, prize) }
async function savePrize(id) {
  if (!validPrize(editPrize)) return
  const patch = Object.fromEntries(['name', 'quality', 'quantity', 'weight'].filter(key => String(editPrize[key]) !== String(editOriginal[key])).map(key => [key, editPrize[key]]))
  if (await writePrize(() => prizes.update(id, patch, editOriginal))) editingPrizeId.value = ''
}
function confirmDeletePrize(prize) { deletingPrize.value = prize; showDeletePrize.value = true }
async function deletePrize() {
  if (deletingPrize.value && await writePrize(() => prizes.remove(deletingPrize.value.id))) {
    showDeletePrize.value = false; deletingPrize.value = null
  }
}
function notifyError(message) { showBanner({ message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) }

watch(() => prizes.currentId, () => { clearRound(); gameKey.value++; drawCount.value = 1; allocations.value = [] })
watch(() => names.currentListId, () => { allocations.value = [] })
onMounted(async () => {
  window.addEventListener('keydown', onDrawKey)
  await Promise.all([prizes.initialize(), names.initialize()])
})
onBeforeUnmount(() => {
  disposed = true
  dispatchSealed()
  clearDrawTimers()
  window.removeEventListener('keydown', onDrawKey)
  gsap.killTweensOf([rollerResultRef.value, wheelResultRef.value, ...allocationRowRefs].filter(Boolean))
})
</script>

<style scoped>
.lottery-view { width: 100%; height: 100%; min-height: 0; padding: 28px 32px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.page-header { flex: 0 0 auto; display: flex; align-items: flex-end; justify-content: space-between; }
.page-title { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-family: var(--font-display); font-size: 24px; }
.page-meta { margin: 6px 0 0 38px; color: var(--text-muted); font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.section-draw { container-type: inline-size; }
.draw-workspace { width: min(1130px, 100%); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(205px, .38fr); align-items: start; gap: 16px; }
.draw-column { min-width: 0; display: grid; gap: 16px; }
.game-stage { width: 100%; min-width: 0; }
.game-result { text-align: center; padding: 0 15px 16px; display: grid; gap: 4px; color: var(--plugin-component-lottery-result-foreground, var(--text-primary)); }
.game-result strong { font-family: var(--font-display); font-size: 25px; overflow-wrap: anywhere; }.game-result small { color: var(--text-secondary); }
.draw-card, .round-results { min-width: 0; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-card); }
.draw-card { display: flex; flex-direction: column; overflow: hidden; }
.draw-toolbar, .assignment-controls { min-inline-size: 0; border: 0; margin: 0; }
.draw-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(100px, .45fr); gap: 12px; padding: 16px 18px 12px; }
.prize-list-picker { min-width: 0; display: grid; gap: 5px; color: var(--text-secondary); font-size: 12px; }
.prize-list-picker select, .prize-list-picker input { width: 100%; min-width: 0; box-sizing: border-box; height: 34px; padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg-card-solid); color: var(--text-primary); font: inherit; font-size: 13px; }
.prize-list-picker select:focus-visible, .prize-list-picker input:focus-visible, .style-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.style-tabs { display: inline-flex; flex-wrap: wrap; align-self: center; margin: 2px 10px 14px; padding: 3px; border: 1px solid var(--border-default); background: var(--bg-base); border-radius: var(--radius-md); }
.style-tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; padding: 5px 12px; border-radius: var(--radius-sm); color: var(--text-secondary); background: transparent; font: inherit; font-size: 13px; cursor: pointer; }
.style-tabs button[aria-pressed="true"] { border-color: var(--border-strong); background: var(--bg-card-solid); box-shadow: var(--shadow-2); color: var(--text-primary); font-weight: 650; }
.style-tabs button:disabled, .draw-toolbar:disabled { opacity: .7; }
.draw-stage { min-height: clamp(200px, 33vh, 350px); display: grid; place-items: center; overflow: hidden; border-block: 1px solid var(--border-default); background: radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--accent) 11%, transparent), transparent 75%), var(--bg-base); }
.roller-experience, .stock-empty { min-width: 0; width: 100%; display: grid; place-items: center; padding: 20px 16px; }
.stock-empty { text-align: center; gap: 9px; color: var(--text-secondary); font-size: 13px; }
.stock-empty strong { color: var(--text-primary); font-size: 22px; }
.stage-emblem { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--bg-card-solid); color: var(--accent-dark); }
.roller-result { width: 100%; max-width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--plugin-component-lottery-result-gap, 12px); color: var(--plugin-component-lottery-result-foreground, inherit); background: var(--plugin-component-lottery-result-background, transparent); padding: var(--plugin-component-lottery-result-padding, 0); border: var(--plugin-component-lottery-result-border-width, 0) solid var(--plugin-component-lottery-result-border-color, transparent); border-radius: var(--plugin-component-lottery-result-radius, 0); box-shadow: var(--plugin-component-lottery-result-shadow, none); }
.roller-result strong { max-width: 100%; color: var(--plugin-component-lottery-result-foreground, var(--text-primary)); font-family: var(--plugin-component-lottery-result-font-family, var(--font-display)); font-size: min(var(--plugin-component-lottery-result-font-size, var(--plugin-component-lottery-result-size, 82px)), clamp(32px, 5vw, 66px)); font-weight: var(--plugin-component-lottery-result-font-weight, 700); line-height: 1.08; overflow-wrap: anywhere; }
.wheel-result { max-width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--plugin-component-lottery-result-gap, 6px); text-align: center; color: var(--plugin-component-lottery-result-foreground, inherit); background: var(--plugin-component-lottery-result-background, transparent); padding: var(--plugin-component-lottery-result-padding, 0); border: var(--plugin-component-lottery-result-border-width, 0) solid var(--plugin-component-lottery-result-border-color, transparent); border-radius: var(--plugin-component-lottery-result-radius, 0); box-shadow: var(--plugin-component-lottery-result-shadow, none); }
.wheel-result > span { color: var(--accent); font-size: 13px; font-weight: 600; }
.wheel-result strong { color: var(--plugin-component-lottery-result-foreground, var(--text-primary)); font-family: var(--plugin-component-lottery-result-font-family, var(--font-display)); font-size: min(var(--plugin-component-lottery-result-font-size, var(--plugin-component-lottery-result-size, 48px)), clamp(22px, 3vw, 36px)); font-weight: var(--plugin-component-lottery-result-font-weight, 700); line-height: 1.08; overflow-wrap: anywhere; }
.wheel-result small { color: var(--text-muted); font-size: 13px; }
.result-quality { color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.result-stock { color: var(--text-secondary); font-size: 13px; }
.wheel-experience { width: 100%; min-width: 0; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.wheel-shell { position: relative; width: min(100%, clamp(165px, 30vh, 255px)); aspect-ratio: 1; filter: drop-shadow(0 4px 9px color-mix(in srgb, var(--accent) 15%, transparent)); }
.wheel-pointer { position: absolute; z-index: 3; top: 0; left: 50%; transform: translateX(-50%); border-inline: 9px solid transparent; border-top: 19px solid var(--text-primary); }
.prize-wheel { position: absolute; inset: 8px; border-radius: 50%; border: 4px solid var(--bg-card-solid); box-shadow: 0 0 0 1px var(--border-strong); overflow: hidden; will-change: transform; }
.wheel-label { position: absolute; transform: translate(-50%, -50%) rotate(var(--wheel-counter)); transition: var(--wheel-transition); width: 30%; color: #fff; text-align: center; font-size: 11px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 3px #0009; }
.wheel-hub { position: absolute; inset: 39%; display: grid; place-items: center; border-radius: 50%; background: var(--bg-card-solid); color: var(--accent-dark); box-shadow: var(--shadow-4); }
.draw-actions { padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.draw-shortcut { color: var(--text-secondary); font-size: 11px; }
.round-results { padding: 15px 18px; }
.round-results header, .round-results li { display: flex; align-items: center; gap: 8px; }
.round-results h2 { margin: 0; font-size: 15px; }
.round-results header span { font-size: 12px; color: var(--text-secondary); }
.round-results ol { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 6px; margin: 10px 0 0; padding: 0; }
.round-results li { padding: 8px; border-radius: var(--radius-sm); background: var(--bg-base); font-size: 13px; }
.round-results li strong { min-width: 0; overflow-wrap: anywhere; }
.round-results li span, .round-results li small { color: var(--text-secondary); font-size: 11px; }
.round-results li small { margin-left: auto; }
@container (max-width: 680px) { .draw-workspace { grid-template-columns: minmax(0, 1fr); } }
@container (max-width: 510px) { .style-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-self: stretch; } }
.wheel-hub { transform: rotate(var(--wheel-counter)); transition: var(--wheel-transition); }
.primary-action { width: min(300px, 100%); justify-content: center; }
.validation-message { margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--danger); font-size: 12px; }
.assignment-page, .prizes-page { width: min(1180px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.assignment-tool { padding: 20px; }
.assignment-controls { padding: 0; display: grid; grid-template-columns: 1fr 1fr minmax(130px, .55fr); gap: 16px; }
.assignment-controls label { display: flex; flex-direction: column; gap: 7px; color: var(--text-muted); font-size: 12px; }
.capacity-row { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-default); display: flex; gap: 22px; color: var(--text-secondary); font-size: 13px; }
.capacity-row span { display: flex; align-items: center; gap: 6px; }
.allocation-results { border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.allocation-row { display: grid; grid-template-columns: 44px 1fr 24px 1fr; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border-default); }
.allocation-row:last-child { border-bottom: 0; }
.allocation-row div { min-width: 0; display: flex; flex-direction: column; }
.allocation-row small { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
.allocation-index { color: var(--accent); font-weight: 700; }
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
  .assignment-controls, .prize-form { grid-template-columns: 1fr 1fr; }
  .prize-form > :first-child { grid-column: span 2; }
}
@media (max-width: 680px) {
  .lottery-view { padding: 18px 14px; }
  .assignment-controls, .prize-form { grid-template-columns: 1fr; }
  .prize-form > :first-child { grid-column: auto; }
  .prize-table { overflow-x: auto; }
  .prize-table-header, .prize-row { min-width: 720px; }
  .prize-page-toolbar { align-items: stretch; flex-direction: column; }
}
</style>
