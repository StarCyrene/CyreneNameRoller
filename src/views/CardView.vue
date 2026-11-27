<template>
  <div class="card-view">
    <h1 class="card-title">
      <FluentIcon icon="card-ui-portrait-flip-24-regular" :width="28" />
      {{ t('cardMode', lang) }}
    </h1>

    <div v-if="cards.length" class="cards-grid" data-plugin-component="card.deck" :style="pluginsStore.componentStyleStyle('card.deck')">
      <div
        v-for="(card, i) in cards"
        :key="card.id"
        :ref="element => setCardRef(element, card.id)"
        class="card"
        data-plugin-component="card.item"
        :class="{ show: card.visible, flipped: card.flipped, 'plugin-deal': card.pluginDeal }"
        :style="pluginsStore.componentStyleStyle('card.item')"
        role="button"
        :tabindex="card.visible && !card.flipped && !controlsBusy ? 0 : -1"
        :aria-disabled="card.flipped || !card.visible || controlsBusy"
        :aria-label="`${lang === 'en' ? 'Card' : '牌子'} ${i + 1}${card.flipped ? ' · ' + card.displayName : ''}`"
        @click="flipCard(i)"
        @keydown.enter.space.prevent="flipCard(i)"
      >
        <div class="card-inner">
          <div class="card-face card-back">
            <FluentIcon icon="question-24-regular" :width="48" class="card-q-icon" />
          </div>
          <div class="card-face card-front" aria-hidden="true">{{ card.displayName }}</div>
        </div>
      </div>
    </div>
    <div v-if="!cards.length && !loadingTray" class="card-empty" role="status">
      <span>{{ allNonWL.length ? (lang === 'en' ? 'Every card has been drawn. Reset to start another round.' : '这份名单已经抽完，重置即可开启新一轮。') : (lang === 'en' ? 'This list has no eligible names.' : '这份名单还没有可翻牌的人员。') }}</span>
      <RouterLink v-if="!allNonWL.length" to="/lists/manage">{{ lang === 'en' ? 'Manage names' : '前往管理人员' }} →</RouterLink>
    </div>

    <div class="bottom-section">
      <div class="tray">
        <div class="tray-label">
          <FluentIcon icon="archive-16-regular" :width="14" />
          {{ t('history', lang) }} ({{ trayHistory.length }})
        </div>
        <div class="tray-stack">
          <TransitionGroup name="tray-item">
            <div v-for="item in trayHistory" :key="item.id" class="history-chip">{{ item.name }}</div>
          </TransitionGroup>
        </div>
      </div>

      <div class="card-controls" data-plugin-component="card.controls" :style="pluginsStore.componentStyleStyle('card.controls')">
        <div class="ctrl-row">
          <FluentToggle v-model="englishMode" :label="lang === 'en' ? 'English names' : '显示英文名'" @update:model-value="saveCardSettings" />
          <span class="control-sep" />
          <span class="control-label">{{ t('listLabel', lang) }}:</span>
          <FluentSelect :model-value="namesStore.currentListId" :options="listOptions" :disabled="controlsBusy" @update:model-value="onListChange" />
          <span class="control-sep" />
          <span class="control-label">{{ t('cardsLabel', lang) }}:</span>
          <div class="count-control">
            <FluentButton :aria-label="lang === 'en' ? 'Decrease card count' : '减少牌子数量'" variant="secondary" size="sm" icon-only :disabled="shownCardCount <= 1" @click="setCount(false, shownCardCount - 1)"><FluentIcon icon="subtract-16-regular" :width="14" /></FluentButton>
            <FluentInput :model-value="shownCardCount" type="number" :min="1" :max="maxCards" :aria-label="lang === 'en' ? 'Card count' : '牌子数量'" style="width: 60px; text-align: center;" @update:model-value="setCount(false, $event)" />
            <FluentButton :aria-label="lang === 'en' ? 'Increase card count' : '增加牌子数量'" variant="secondary" size="sm" icon-only :disabled="shownCardCount >= maxCards" @click="setCount(false, shownCardCount + 1)"><FluentIcon icon="add-16-regular" :width="14" /></FluentButton>
          </div>
          <FluentButton variant="primary" :disabled="controlsBusy || !remainingCount" @click="shuffle">
            <FluentIcon icon="arrow-shuffle-24-regular" :width="16" />
            {{ t('shuffle', lang) }}
          </FluentButton>
        </div>
        <div class="ctrl-row">
          <span class="control-label">{{ t('quickDraw', lang) }}:</span>
          <div class="count-control">
            <FluentButton :aria-label="lang === 'en' ? 'Decrease quick draw count' : '减少一键多抽数量'" variant="secondary" size="sm" icon-only :disabled="shownQuickCount <= 1" @click="setCount(true, shownQuickCount - 1)"><FluentIcon icon="subtract-16-regular" :width="14" /></FluentButton>
            <FluentInput :model-value="shownQuickCount" type="number" :min="1" :max="maxCards" :aria-label="lang === 'en' ? 'Quick draw count' : '一键多抽数量'" style="width: 60px; text-align: center;" @update:model-value="setCount(true, $event)" />
            <FluentButton :aria-label="lang === 'en' ? 'Increase quick draw count' : '增加一键多抽数量'" variant="secondary" size="sm" icon-only :disabled="shownQuickCount >= maxCards" @click="setCount(true, shownQuickCount + 1)"><FluentIcon icon="add-16-regular" :width="14" /></FluentButton>
          </div>
          <FluentButton variant="secondary" :disabled="controlsBusy || !remainingCount" @click="quickDraw">
            <FluentIcon icon="flash-24-regular" :width="16" />
            {{ t('draw', lang) }}
          </FluentButton>
          <FluentButton variant="secondary" :disabled="controlsBusy || !trayHistory.length" @click="reset">
            <FluentIcon icon="arrow-undo-16-regular" :width="14" />
            {{ t('reset', lang) }}
          </FluentButton>
          <span class="remaining-badge">{{ t('remaining', lang) }}: {{ remainingCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, inject, nextTick } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { getCoreClient } from '../core/client'
import { dataBridge } from '../utils/dataBridge'
import { t } from '../utils/i18n'
import { gsap } from 'gsap'
import { runCardDeal } from '../utils/animation.js'
import { appendCardReceipt, cardSessionKey, readCardTray, withCardSession } from '../utils/cardSessions.mjs'

const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const pluginsStore = usePluginsStore()
const coreClient = getCoreClient()
const showBanner = inject('banner')

const lang = computed(() => settingsStore.settings.language)
const listOptions = computed(() => namesStore.allLists.map(l => ({ value: l.id, label: l.name })))

const englishMode = ref(false)
const cardCount = ref(5)
const quickCount = ref(4)
const cards = ref([])
const trayHistory = ref([])
const usedNames = ref(new Set())
let cardIdCounter = 0
const cardRefs = new Map()
const pendingOperationTimers = new Set()
let operationGeneration = 0
let unmounted = false
const cardTransactionInFlight = ref(false)
const loadingTray = ref(true)
const controlsBusy = computed(() => loadingTray.value || cardTransactionInFlight.value)
let stopNamesLoadedWatch

const SETTINGS_KEY = 'cardSettings'

const allNonWL = computed(() => namesStore.currentNames.filter(n => !n.isWhiteList))
const remainingCount = computed(() => getAvailableNames().length)
const maxCards = computed(() => Math.min(100, Math.max(1, remainingCount.value)))
const clampCount = count => Math.max(1, Math.min(Math.trunc(Number(count) || 1), maxCards.value))
const shownCardCount = computed(() => clampCount(cardCount.value))
const shownQuickCount = computed(() => clampCount(quickCount.value))

function setCount(quick, value) {
  if (quick) quickCount.value = clampCount(value)
  else cardCount.value = clampCount(value)
  saveCardSettings()
}

function getAvailableNames() {
  return allNonWL.value.filter(person => !usedNames.value.has(person.id) && !usedNames.value.has(person.cn))
}

function getDisplayName(person) {
  return englishMode.value && person.en ? person.en : person.cn
}

function setCardRef(element, cardId) {
  if (element) cardRefs.set(cardId, element)
  else cardRefs.delete(cardId)
}

function cancelPendingOperations() {
  operationGeneration += 1
  for (const timer of pendingOperationTimers) clearTimeout(timer)
  pendingOperationTimers.clear()
  return operationGeneration
}

function operationIsActive(generation) {
  return !unmounted && generation === operationGeneration
}

function scheduleOperation(generation, callback, delay) {
  if (!operationIsActive(generation)) return null
  const timer = setTimeout(() => {
    pendingOperationTimers.delete(timer)
    if (!operationIsActive(generation)) return
    callback()
  }, delay)
  pendingOperationTimers.add(timer)
  return timer
}

async function revealCard(card, generation = operationGeneration) {
  if (!operationIsActive(generation)) return false
  card.pluginDeal = pluginsStore.hasAnimation('card.deal')
  card.visible = true
  await nextTick()
  if (!operationIsActive(generation)) return false
  const run = pluginsStore.startAnimation('card.deal', cardRefs.get(card.id))
  if (!run && card.pluginDeal) card.pluginDeal = false
  if (!run) runCardDeal(cardRefs.get(card.id))
  return true
}

function onListChange(id) {
  if (!controlsBusy.value) namesStore.switchList(id)
}

async function saveCardSettings() {
  try { await dataBridge.save(SETTINGS_KEY, { cardCount: cardCount.value, quickCount: quickCount.value, englishMode: englishMode.value }) }
  catch (error) { if (!unmounted) showCardError(error) }
}

async function loadCardSettings() {
  const saved = await dataBridge.load(SETTINGS_KEY)
  if (saved) {
    if (saved.cardCount) cardCount.value = saved.cardCount
    if (saved.quickCount) quickCount.value = saved.quickCount
  }
  englishMode.value = saved?.englishMode ?? settingsStore.settings.englishMode
}

function showCardError(error) {
  showBanner({ message: error?.message || (lang.value === 'en' ? 'Could not save the cards.' : '卡牌记录保存失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
}

function applyTray(tray) {
  usedNames.value = new Set(tray.used)
  trayHistory.value = tray.history
}
async function loadTrayState() {
  const generation = operationGeneration
  const listId = namesStore.currentList.id
  const tray = await withCardSession(listId, () => readCardTray(dataBridge, listId, namesStore.allLists))
  if (operationIsActive(generation)) applyTray(tray)
}
async function commitIntoTray(listId, generation, draw) {
  const previous = { used: [...usedNames.value], history: [...trayHistory.value] }
  const english = englishMode.value
  cardTransactionInFlight.value = true
  try {
    return await withCardSession(listId, async () => {
      const receipt = await draw()
      const tray = appendCardReceipt(previous, receipt, english)
      if (operationIsActive(generation)) applyTray(tray)
      // The authoritative draw has already been recorded. Never retry the
      // draw just because saving the auxiliary tray failed.
      try { await dataBridge.save(cardSessionKey(listId), tray) }
      catch (error) { if (operationIsActive(generation)) showCardError(error) }
      return receipt
    })
  } finally {
    if (operationIsActive(generation)) cardTransactionInFlight.value = false
  }
}
function makeCards(count, available) {
  const chosen = []
  const copy = [...available]
  while (chosen.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length)
    chosen.push(copy[idx])
    copy[idx] = copy[copy.length - 1]
    copy.pop()
  }
  cards.value = chosen.map(p => ({ id: ++cardIdCounter, personId: p.id, displayName: getDisplayName(p), visible: false, flipped: false, pluginDeal: false }))
  return chosen
}

function shuffle() {
  if (controlsBusy.value) return
  const generation = cancelPendingOperations()
  const available = getAvailableNames()
  if (available.length === 0) {
    const hasNames = allNonWL.value.length > 0
    showBanner({
      message: hasNames
        ? (lang.value === 'en' ? 'All drawn! Remember to reset~' : '嘻...已经被你抽完啦，记得重置一下哦♪')
        : (lang.value === 'en' ? 'No names available' : '唔...你还没添加名单呢♪'),
      icon: 'info-16-regular', type: 'warning', duration: 8000
    })
    return
  }
  makeCards(shownCardCount.value, available)
  cards.value.forEach((card, i) => scheduleOperation(generation, () => { revealCard(card, generation) }, i * 80))
}

async function flipCard(index, operation = null, generation = operationGeneration) {
  if (!operationIsActive(generation)) return
  const card = cards.value[index]
  if (!card?.visible || card.flipped || loadingTray.value) return
  let activeOperation = operation || card.operation
  if (!activeOperation?.receipt) {
    if (cardTransactionInFlight.value) return
    const listId = namesStore.currentList.id
    try {
      const receipt = await commitIntoTray(listId, generation, () => coreClient.commitCard({
        listId, personIds: [card.personId], operationId: globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${card.id}`
      }))
      if (!operationIsActive(generation)) return
      activeOperation = { id: receipt.operationId, count: 1, index: 0, generation, receipt, globalState: {} }
      card.operation = activeOperation
    } catch (error) {
      if (operationIsActive(generation)) showCardError(error)
      return
    }
  }
  const result = activeOperation.receipt.results[activeOperation.index]
  card.displayName = (englishMode.value && result.englishName) || result.name
  card.flipped = true
  nextTick(() => {
    if (operationIsActive(generation)) pluginsStore.startAnimation('card.flip', cardRefs.get(card.id))
  })
  const globalState = activeOperation?.globalState || activeOperation
  if (!globalState || !globalState.globalTriggered) {
    if (globalState) globalState.globalTriggered = true
    pluginsStore.startAnimation('global.transition', null, { variant: 'card' })
  }
  pluginsStore.dispatchEvent('card:item-result', {
    operationId: activeOperation.id,
    index: activeOperation.index,
    count: activeOperation.count,
    listId: activeOperation.receipt.listId,
    result
  })
  if (activeOperation.index === activeOperation.count - 1) {
    pluginsStore.dispatchEvent('card:result', {
      operationId: activeOperation.id, listId: activeOperation.receipt.listId, results: activeOperation.receipt.results
    })
  }
}

async function quickDraw() {
  if (controlsBusy.value) return
  const generation = cancelPendingOperations()
  const available = getAvailableNames()
  if (available.length === 0) {
    const hasNames = allNonWL.value.length > 0
    showBanner({
      message: hasNames
        ? (lang.value === 'en' ? 'All drawn! Remember to reset~' : '嘻...已经被你抽完啦，记得重置一下哦♪')
        : (lang.value === 'en' ? 'No names available' : '唔...你还没添加名单呢♪'),
      icon: 'info-16-regular', type: 'warning', duration: 8000
    })
    return
  }
  const chosen = makeCards(shownQuickCount.value, available)
  const listId = namesStore.currentList.id
  const operationId = crypto.randomUUID?.() || `card-${Date.now()}`
  let receipt
  try {
    receipt = await commitIntoTray(listId, generation, () => coreClient.commitCard({
      listId,
      personIds: chosen.map(person => person.id),
      operationId
    }))
  } catch (error) {
    if (operationIsActive(generation)) { showCardError(error); shuffle() }
    return
  }
  if (!operationIsActive(generation)) return
  const operation = { id: receipt.operationId || operationId, count: cards.value.length, globalTriggered: false, generation, receipt }
  cards.value.forEach((card, index) => { card.operation = { ...operation, index, globalState: operation } })
  cards.value.forEach((card, i) => {
    scheduleOperation(generation, () => {
      revealCard(card, generation)
      scheduleOperation(generation, () => flipCard(i, { ...operation, index: i, globalState: operation }, generation), 300 + i * 200)
    }, i * 80)
  })
}

function reset() {
  cancelPendingOperations()
  cards.value = []
  cardRefs.clear()
  const generation = operationGeneration
  const listId = namesStore.currentList.id
  const tray = { history: [], used: [] }
  loadingTray.value = true
  withCardSession(listId, () => dataBridge.save(cardSessionKey(listId), tray)).then(() => {
    if (operationIsActive(generation)) applyTray(tray)
  }).catch(error => { if (operationIsActive(generation)) showCardError(error) }).finally(() => {
    if (!operationIsActive(generation)) return
    loadingTray.value = false
    if (remainingCount.value) shuffle()
  })
}

onMounted(() => {
  stopNamesLoadedWatch = watch([() => namesStore.isLoaded, () => namesStore.currentListId], ([loaded]) => {
    if (!loaded) return
    const generation = cancelPendingOperations()
    cards.value = []
    cardRefs.clear()
    applyTray({ history: [], used: [] })
    cardTransactionInFlight.value = false
    loadingTray.value = true
    Promise.all([loadCardSettings(), loadTrayState()]).then(() => {
      if (!unmounted && operationIsActive(generation)) {
        loadingTray.value = false
        if (remainingCount.value) shuffle()
      }
    }).catch(error => { if (operationIsActive(generation)) showCardError(error) })
  }, { immediate: true, flush: 'sync' })
})

onBeforeUnmount(() => {
  unmounted = true
  stopNamesLoadedWatch?.()
  cancelPendingOperations()
  gsap.killTweensOf([...cardRefs.values()])
  cardRefs.clear()
})
</script>

<style scoped>
.card-view { padding: 32px; display: flex; flex-direction: column; align-items: center; min-height: 100%; }
.card-title { font-family: var(--font-display); font-size: 28px; font-weight: 700; color: var(--text-primary); margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--plugin-component-card-deck-size, 140px), 1fr)); gap: var(--plugin-component-card-deck-gap, 20px); width: 100%; justify-items: center; flex: 1; align-content: center; padding: 0 var(--plugin-component-card-deck-padding, 0) 24px; background: var(--plugin-component-card-deck-background, transparent); color: var(--plugin-component-card-deck-foreground, inherit); }
.card { width: var(--plugin-component-card-item-size, 140px); aspect-ratio: 7 / 10; height: auto; perspective: 1500px; cursor: pointer; opacity: 0; transform: translateY(30px); }
.card.show { opacity: 1; transform: none; }
.card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: var(--radius-xl); }
.card-empty { display: grid; gap: 10px; text-align: center; color: var(--text-secondary); margin: auto 0; padding: 20px; }
.card-empty a { color: var(--text-primary); text-underline-offset: 4px; }
.card-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1); }
.card:hover .card-inner { transform: translateY(-8px); }
.card.flipped .card-inner { transform: rotateY(180deg); }
.card-face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: var(--plugin-component-card-item-radius, var(--radius-xl)); overflow: hidden; display: flex; align-items: center; justify-content: center; border: 2px solid var(--plugin-component-card-item-border-color, var(--border-default)); box-shadow: var(--plugin-component-card-item-shadow, var(--shadow-8)); color: var(--plugin-component-card-item-foreground, inherit); }
.card-back { background: var(--plugin-component-card-item-background, linear-gradient(135deg, var(--bg-card-solid), var(--bg-hover))); }
.card-q-icon { color: var(--accent); opacity: 0.3; }
.card-front { transform: rotateY(180deg); background: var(--plugin-component-card-item-background, var(--bg-card-solid)); font-family: var(--plugin-component-card-item-font-family, var(--font-display)); font-weight: var(--plugin-component-card-item-font-weight, 700); font-size: var(--plugin-component-card-item-font-size, calc(20px * var(--name-font-factor, 1))); color: var(--plugin-component-card-item-foreground, var(--accent)); padding: var(--plugin-component-card-item-padding, 12px); text-align: center; border-color: var(--plugin-component-card-item-border-color, var(--accent)); text-shadow: 0 0 12px rgba(234, 94, 193, 0.3); }

.bottom-section { width: 100%; margin-top: auto; }
.tray { margin-bottom: 12px; }
.tray-label { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.tray-stack { display: flex; gap: 8px; flex-wrap: wrap; min-height: 40px; padding: 10px; background: var(--bg-card); border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); }
.history-chip { background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff; padding: 5px 12px; border-radius: var(--radius-full); font-size: 13px; font-weight: 600; white-space: nowrap; }
.tray-item-enter-active { animation: slide-in 0.3s ease-out; }
.tray-item-leave-active { animation: slide-in 0.2s ease-in reverse; }
@keyframes slide-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

.card-controls { min-height: var(--plugin-component-card-controls-size, 0); background: var(--plugin-component-card-controls-background, var(--bg-card)); color: var(--plugin-component-card-controls-foreground, inherit); font-family: var(--plugin-component-card-controls-font-family, var(--font-ui)); font-size: var(--plugin-component-card-controls-font-size, inherit); font-weight: var(--plugin-component-card-controls-font-weight, inherit); backdrop-filter: blur(20px); padding: var(--plugin-component-card-controls-padding, 12px 20px); border-radius: var(--radius-lg); border: 1px solid var(--border-default); box-shadow: var(--shadow-4); display: flex; flex-direction: column; gap: var(--plugin-component-card-controls-gap, 8px); }
.ctrl-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.control-label { font-size: 14px; color: var(--text-secondary); font-weight: 500; }
.control-sep { width: 1px; height: 24px; background: var(--border-default); }
.remaining-badge { font-size: 13px; color: var(--accent); background: var(--accent-50); padding: 4px 10px; border-radius: var(--radius-full); font-weight: 600; margin-left: auto; }
.count-control { display: flex; align-items: center; gap: 8px; }
</style>
