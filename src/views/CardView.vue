<template>
  <div class="card-view">
    <h1 class="card-title">
      <FluentIcon icon="card-ui-portrait-flip-24-regular" :width="28" />
      {{ t('cardMode', lang) }}
    </h1>

    <div class="cards-grid" data-plugin-component="card.deck" :style="pluginsStore.componentStyleStyle('card.deck')">
      <div
        v-for="(card, i) in cards"
        :key="card.id"
        :ref="element => setCardRef(element, card.id)"
        class="card"
        data-plugin-component="card.item"
        :class="{ show: card.visible, flipped: card.flipped, 'plugin-deal': card.pluginDeal }"
        :style="[pluginsStore.componentStyleStyle('card.item'), { animationDelay: (i * 0.08) + 's' }]"
        role="button"
        tabindex="0"
        :aria-label="`${lang === 'en' ? 'Card' : '牌子'} ${i + 1}${card.flipped ? (lang === 'en' ? ', revealed' : '，已翻开') : ''}`"
        @click="flipCard(i)"
        @keydown.enter.space.prevent="flipCard(i)"
      >
        <div class="card-inner">
          <div class="card-face card-back">
            <FluentIcon icon="question-24-regular" :width="48" class="card-q-icon" />
          </div>
          <div class="card-face card-front">{{ card.displayName }}</div>
        </div>
      </div>
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
          <FluentToggle v-model="englishMode" label="English Mode" />
          <span class="control-sep" />
          <span class="control-label">{{ t('listLabel', lang) }}:</span>
          <FluentSelect :model-value="namesStore.currentListId" :options="listOptions" @update:model-value="onListChange" />
          <span class="control-sep" />
          <span class="control-label">{{ t('cardsLabel', lang) }}:</span>
          <div class="count-control">
            <FluentButton :aria-label="lang === 'en' ? 'Decrease card count' : '减少牌子数量'" variant="secondary" size="sm" icon-only @click="cardCount = Math.max(1, cardCount - 1); saveCardSettings()"><FluentIcon icon="subtract-16-regular" :width="14" /></FluentButton>
            <FluentInput v-model="cardCount" type="number" :min="1" :max="maxCards" :aria-label="lang === 'en' ? 'Card count' : '牌子数量'" style="width: 60px; text-align: center;" @update:model-value="saveCardSettings" />
            <FluentButton :aria-label="lang === 'en' ? 'Increase card count' : '增加牌子数量'" variant="secondary" size="sm" icon-only @click="cardCount = Math.min(maxCards, cardCount + 1); saveCardSettings()"><FluentIcon icon="add-16-regular" :width="14" /></FluentButton>
          </div>
          <FluentButton variant="primary" @click="shuffle">
            <FluentIcon icon="arrow-shuffle-24-regular" :width="16" />
            {{ t('shuffle', lang) }}
          </FluentButton>
        </div>
        <div class="ctrl-row">
          <span class="control-label">{{ t('quickDraw', lang) }}:</span>
          <div class="count-control">
            <FluentButton :aria-label="lang === 'en' ? 'Decrease quick draw count' : '减少一键多抽数量'" variant="secondary" size="sm" icon-only @click="quickCount = Math.max(2, quickCount - 1); saveCardSettings()"><FluentIcon icon="subtract-16-regular" :width="14" /></FluentButton>
            <FluentInput v-model="quickCount" type="number" :min="2" :max="maxCards" :aria-label="lang === 'en' ? 'Quick draw count' : '一键多抽数量'" style="width: 60px; text-align: center;" @update:model-value="saveCardSettings" />
            <FluentButton :aria-label="lang === 'en' ? 'Increase quick draw count' : '增加一键多抽数量'" variant="secondary" size="sm" icon-only @click="quickCount = Math.min(maxCards, quickCount + 1); saveCardSettings()"><FluentIcon icon="add-16-regular" :width="14" /></FluentButton>
          </div>
          <FluentButton variant="secondary" @click="quickDraw">
            <FluentIcon icon="flash-24-regular" :width="16" />
            {{ t('draw', lang) }}
          </FluentButton>
          <FluentButton variant="secondary" @click="reset">
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
let historyIdCounter = 0
const cardRefs = new Map()
const pendingOperationTimers = new Set()
let operationGeneration = 0
let unmounted = false
let cardTransactionInFlight = false
let stopNamesLoadedWatch

const TRAY_KEY = 'cardTrayHistory'
const USED_KEY = 'cardUsedNames'
const SETTINGS_KEY = 'cardSettings'

const allNonWL = computed(() => namesStore.currentNames.filter(n => !n.isWhiteList))
const remainingCount = computed(() => allNonWL.value.length - usedNames.value.size)
const maxCards = computed(() => Math.max(1, allNonWL.value.length - usedNames.value.size))

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
  return true
}

function onListChange(id) {
  namesStore.switchList(id)
  reset()
}

async function saveCardSettings() {
  await dataBridge.save(SETTINGS_KEY, { cardCount: cardCount.value, quickCount: quickCount.value })
}

async function loadCardSettings() {
  const saved = await dataBridge.load(SETTINGS_KEY)
  if (saved) {
    if (saved.cardCount) cardCount.value = saved.cardCount
    if (saved.quickCount) quickCount.value = saved.quickCount
  }
}

async function saveTrayState() {
  await dataBridge.save(TRAY_KEY, trayHistory.value)
  await dataBridge.save(USED_KEY, [...usedNames.value])
}

async function loadTrayState() {
  const savedTray = await dataBridge.load(TRAY_KEY)
  const savedUsed = await dataBridge.load(USED_KEY)
  if (savedTray && Array.isArray(savedTray)) trayHistory.value = savedTray
  if (savedUsed && Array.isArray(savedUsed)) usedNames.value = new Set(savedUsed)
  if (trayHistory.value.length > 0) historyIdCounter = Math.max(...trayHistory.value.map(t => t.id)) + 1
}

function shuffle() {
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
  const k = Math.min(parseInt(cardCount.value) || 5, available.length)
  if (k < 1) return
  const chosen = []
  const copy = [...available]
  while (chosen.length < k && copy.length > 0) { const idx = Math.floor(Math.random() * copy.length); chosen.push(copy.splice(idx, 1)[0]) }
  cards.value = chosen.map(p => ({ id: ++cardIdCounter, personId: p.id, cn: p.cn, en: p.en, displayName: getDisplayName(p), visible: false, flipped: false, pluginDeal: false }))
  cards.value.forEach((card, i) => scheduleOperation(generation, () => { revealCard(card, generation) }, i * 80))
}

async function flipCard(index, operation = null, generation = operationGeneration) {
  if (!operationIsActive(generation)) return
  const card = cards.value[index]
  if (!card || card.flipped) return
  let activeOperation = operation || card.operation
  if (!activeOperation && cardTransactionInFlight) return
  const precommitted = !!activeOperation?.receipt
  card.flipped = true
  nextTick(() => {
    if (operationIsActive(generation)) pluginsStore.startAnimation('card.flip', cardRefs.get(card.id))
  })
  const globalState = activeOperation?.globalState || activeOperation
  if (!globalState || !globalState.globalTriggered) {
    if (globalState) globalState.globalTriggered = true
    pluginsStore.startAnimation('global.transition', null, { variant: 'card' })
  }
  const personId = card.personId || namesStore.currentNames.find(person => person.cn === card.cn && (!card.en || person.en === card.en))?.id || null
  try {
    if (!activeOperation?.receipt) {
      const receipt = await coreClient.commitCard({
        listId: namesStore.currentList.id,
        personIds: [personId],
        operationId: `card-${card.id}`
      })
      card.operation = { id: receipt.operationId, count: 1, index: 0, generation, receipt, globalState: {} }
      activeOperation = card.operation
    }
  } catch (error) {
    card.flipped = false
    showBanner({ message: error?.message || '卡牌记录保存失败', icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    return
  }
  if (!precommitted) {
    usedNames.value.add(card.personId || card.cn)
    trayHistory.value.unshift({ id: ++historyIdCounter, name: card.displayName })
  }
  const receiptResult = activeOperation?.receipt?.results?.[activeOperation.index]
  const result = receiptResult
    ? { id: receiptResult.id || '', name: receiptResult.name || '', englishName: receiptResult.englishName || '' }
    : { id: personId || '', name: card.cn, englishName: card.en || '' }
  pluginsStore.dispatchEvent('card:item-result', {
    operationId: activeOperation?.id || card.operation?.id || `card-${card.id}`,
    index: activeOperation?.index || 0,
    count: activeOperation?.count || 1,
    listId: namesStore.currentList.id,
    result
  })
  if (!activeOperation || activeOperation.index === activeOperation.count - 1) {
    pluginsStore.dispatchEvent('card:result', {
      operationId: activeOperation?.id || card.operation?.id || `card-${card.id}`,
      listId: namesStore.currentList.id,
      results: activeOperation?.receipt?.results || [result]
    })
  }
  if (!precommitted) saveTrayState()
}

async function quickDraw() {
  if (cardTransactionInFlight) return
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
  let count = Math.min(parseInt(quickCount.value) || 4, maxCards.value)
  if (available.length === 1 && count >= 2) {
    showBanner({ message: lang.value === 'en' ? 'Only one left, drawing it for you' : '嘻...多抽嘛？可是只剩一个啦，不过人家还是帮你抽啦♪', icon: 'heart-16-regular', type: 'info', duration: 5000 })
    count = 1
  } else if (available.length < count) {
    count = available.length
  }
  const chosen = []
  const copy = [...available]
  while (chosen.length < count && copy.length > 0) { const idx = Math.floor(Math.random() * copy.length); chosen.push(copy.splice(idx, 1)[0]) }
  cards.value = chosen.map(p => ({ id: ++cardIdCounter, personId: p.id, cn: p.cn, en: p.en, displayName: getDisplayName(p), visible: false, flipped: false, pluginDeal: false }))
  const operationId = crypto.randomUUID?.() || `card-${Date.now()}`
  let receipt
  cardTransactionInFlight = true
  try {
    receipt = await coreClient.commitCard({
      listId: namesStore.currentList.id,
      personIds: chosen.map(person => person.id),
      operationId
    })
  } catch (error) {
    cardTransactionInFlight = false
    if (operationIsActive(generation)) cards.value = []
    if (operationIsActive(generation)) showBanner({ message: error?.message || '卡牌记录保存失败', icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    return
  }
  cardTransactionInFlight = false
  if (!operationIsActive(generation)) return
  const operation = { id: receipt.operationId || operationId, count: cards.value.length, globalTriggered: false, generation, receipt }
  cards.value.forEach((card, index) => { card.operation = { ...operation, index, globalState: operation } })
  chosen.forEach(card => {
    usedNames.value.add(card.id)
    trayHistory.value.unshift({ id: ++historyIdCounter, name: getDisplayName(card) })
  })
  saveTrayState()
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
  trayHistory.value = []
  usedNames.value.clear()
  saveTrayState()
}

onMounted(() => {
  stopNamesLoadedWatch = watch(() => namesStore.isLoaded, (loaded) => {
    if (!unmounted && loaded && remainingCount.value >= 1) shuffle()
  })
  Promise.all([loadCardSettings(), loadTrayState()]).then(() => {
    if (!unmounted && namesStore.isLoaded && allNonWL.value.length > 0 && remainingCount.value >= 1) shuffle()
  })
})

onBeforeUnmount(() => {
  unmounted = true
  stopNamesLoadedWatch?.()
  cancelPendingOperations()
  cardRefs.clear()
})
</script>

<style scoped>
.card-view { padding: 32px; display: flex; flex-direction: column; align-items: center; min-height: 100%; }
.card-title { font-family: var(--font-display); font-size: 28px; font-weight: 700; color: var(--text-primary); margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--plugin-component-card-deck-size, 140px), 1fr)); gap: var(--plugin-component-card-deck-gap, 20px); width: 100%; justify-items: center; flex: 1; align-content: center; padding: 0 var(--plugin-component-card-deck-padding, 0) 24px; background: var(--plugin-component-card-deck-background, transparent); color: var(--plugin-component-card-deck-foreground, inherit); }
.card { width: var(--plugin-component-card-item-size, 140px); aspect-ratio: 7 / 10; height: auto; perspective: 1500px; cursor: pointer; opacity: 0; transform: translateY(30px); }
.card.show:not(.plugin-deal) { animation: card-deal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.card.show.plugin-deal { opacity: 1; transform: translateY(0); }
@keyframes card-deal { to { opacity: 1; transform: translateY(0); } }
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
