<template>
  <div class="roller-view" ref="rollerViewRef">
    <h1 class="roller-title">{{ t('h1', lang) }}</h1>
    <div class="balance-status" :class="{ enabled: balanceSettings.enabled }">
      <FluentIcon :icon="balanceSettings.enabled ? 'fluent:shield-checkmark-24-regular' : 'fluent:shield-error-24-regular'" :width="18" />
      <span>{{ balanceSettings.enabled ? (lang === 'en' ? 'Balance enabled' : '平衡算法已启用') : (lang === 'en' ? 'Balance disabled' : '平衡算法未启用') }}</span>
    </div>
    <PluginSlot class="roller-plugin-side-panel" slot="slot:roller.side-panel" />

    <div
      class="display-container"
      data-plugin-component="roller.result"
      ref="displayRef"
      :style="pluginsStore.componentStyleStyle('roller.result')"
    >
      <div
        v-for="(display, i) in nameDisplays"
        :key="i"
        :ref="element => setNameDisplayRef(element, i)"
        class="name-display"
        :class="{ rainbow: settings.nameColorMode === 'gradient', final: display.animating, [`final-${settings.finishAnimation || 'spotlight'}`]: display.animating }"
        :style="getNameStyle(display, i)"
      >
        <VerifiedResult v-if="currentReceipt && revealed[i]" :receipt="currentReceipt" :index="i" :presentation="resultPresentation" />
        <template v-else>{{ display.text }}</template>
      </div>
    </div>

    <!-- 用于测量文字宽度的隐藏探针 -->
    <span ref="probeRef" class="fit-probe" aria-hidden="true"></span>

    <div class="controls-center" ref="controlsCenterRef">
      <template v-if="filterOverride.visibility !== 'hidden' || filtersCompactOpen">
        <div class="switches" data-plugin-component="roller.filters" :style="pluginsStore.componentStyleStyle('roller.filters')">
          <FluentToggle v-if="englishModeOverride.visibility !== 'hidden'" class="english-mode-toggle" data-plugin-component="roller.filter.english-mode" v-model="settings.englishMode" label="English Mode" @update:model-value="saveSetting('englishMode', $event)" />
          <FluentTabs v-if="drawTargetOverride.visibility !== 'hidden'" class="draw-target-tabs" data-plugin-component="roller.filter.draw-target" :model-value="settings.groupMode ? 'groups' : 'people'" :options="drawTargetOptions" @update:model-value="onDrawTargetChange" />
          <Transition name="toggle-expand">
            <FluentTabs v-if="!settings.groupMode && genderOverride.visibility !== 'hidden'" class="gender-filter-tabs" data-plugin-component="roller.filter.gender" v-model="genderFilter" :options="genderFilterOptions" />
          </Transition>
          <FluentTabs v-if="drawCountOverride.visibility !== 'hidden'" class="draw-count-tabs" data-plugin-component="roller.filter.draw-count" :model-value="settings.multiMode ? 'multiple' : 'single'" :options="drawCountOptions" @update:model-value="onDrawCountChange" />
          <Transition name="toggle-expand">
            <FluentTabs v-if="settings.multiMode && duplicatesOverride.visibility !== 'hidden'" class="duplicate-filter-tabs" data-plugin-component="roller.filter.duplicates" :model-value="settings.forbidDuplicates ? 'unique' : 'repeat'" :options="duplicateOptions" @update:model-value="onDuplicateModeChange" />
          </Transition>
        </div>

        <Transition name="toggle-expand">
          <div v-if="settings.multiMode && countOverride.visibility !== 'hidden'" class="multi-settings" data-plugin-component="roller.filter.count" :style="pluginsStore.componentStyleStyle('roller.filters')">
            <span class="setting-label">{{ countSettingLabel }}</span>
            <div class="count-control">
              <FluentButton variant="secondary" size="sm" @click="changeCount(-1)"><FluentIcon icon="subtract-16-regular" :width="14" /></FluentButton>
              <FluentInput v-model="settings.peopleCount" type="number" :min="1" :max="maxPeopleCount" class="count-input" @update:model-value="onPeopleCountChange" />
              <FluentButton variant="secondary" size="sm" @click="changeCount(1)"><FluentIcon icon="add-16-regular" :width="14" /></FluentButton>
            </div>
          </div>
        </Transition>
      </template>
      <div v-else-if="filterOverride.layout === 'reserve'" class="filters-reserved" aria-hidden="true"></div>
      <FluentButton v-else-if="filterOverride.layout === 'compact'" variant="secondary" size="sm" class="filters-compact-entry" @click="filtersCompactOpen = true">
        <FluentIcon icon="filter-16-regular" :width="14" />{{ lang === 'en' ? 'Show filters' : '显示筛选' }}
      </FluentButton>

      <div class="list-selector-bar" data-plugin-component="roller.current-list" :style="pluginsStore.componentStyleStyle('roller.current-list')">
        <span class="selector-label">{{ t('currentList', lang) }}</span>
        <FluentSelect :model-value="namesStore.currentListId" :options="listOptions" @update:model-value="namesStore.switchList" />
      </div>

      <FluentButton :variant="isRunning ? 'danger' : 'primary'" size="lg" class="start-btn" data-plugin-component="roller.primary-action" :style="pluginsStore.componentStyleStyle('roller.primary-action')" :class="{ 'btn-dimmed': !canStart && !isRunning }" :disabled="isFinishing" @click="toggleRoll">
        <FluentIcon :icon="isRunning ? 'stop-24-filled' : 'play-24-filled'" :width="18" />
        {{ isRunning ? t('stop', lang) : t('start', lang) }}
        <span
          v-if="isRunning && settings.autoStop"
          class="start-btn-countdown"
          :style="{ width: `${autoStopProgress}%` }"
          aria-hidden="true"
        ></span>
      </FluentButton>
    </div>
    <PluginSlot class="roller-plugin-below-result" slot="slot:roller.below-result" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick, inject } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { useStatisticsStore } from '../stores/statistics'
import { t } from '../utils/i18n'
import { usePluginsStore } from '../plugins/store'
import PluginSlot from '../components/plugins/PluginSlot.vue'
import VerifiedResult from '../components/roller/VerifiedResult.vue'
import { dataBridge } from '../utils/dataBridge'
import { consumePendingUriNavigation } from '../utils/uriNavigation'
import { getAutoStopProgress, normalizeAutoStopDuration } from '../utils/autoStop.mjs'
import {
  pickCyreneBalanced,
  DEFAULT_CYRENE_BALANCE_SETTINGS,
  normalizeCyreneBalanceSettings
} from '../utils/cyrene-balance'

const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const statisticsStore = useStatisticsStore()
const pluginsStore = usePluginsStore()
const showBanner = inject('banner')

const lang = computed(() => settingsStore.settings.language)
const settings = computed(() => settingsStore.settings)
const filterOverride = computed(() => pluginsStore.componentOverrideState('roller.filters'))
const englishModeOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.english-mode'))
const drawTargetOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.draw-target'))
const genderOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.gender'))
const drawCountOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.draw-count'))
const duplicatesOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.duplicates'))
const countOverride = computed(() => pluginsStore.componentOverrideState('roller.filter.count'))
const filtersCompactOpen = ref(false)
const listOptions = computed(() => namesStore.allLists.map(l => ({ value: l.id, label: l.name })))
const genderFilter = ref('all')
const drawTargetOptions = computed(() => [
  { value: 'people', label: lang.value === 'en' ? 'Draw people' : '抽取人员', icon: 'fluent:person-24-regular' },
  { value: 'groups', label: lang.value === 'en' ? 'Draw groups' : '抽取小组', icon: 'fluent:group-24-regular' }
])
const drawCountOptions = computed(() => [
  {
    value: 'single',
    label: settings.value.groupMode
      ? (lang.value === 'en' ? 'Single draw' : '单次抽取')
      : (lang.value === 'en' ? 'Draw one person' : '抽取单人'),
    icon: 'fluent:person-24-regular'
  },
  {
    value: 'multiple',
    label: settings.value.groupMode
      ? (lang.value === 'en' ? 'Multiple draws' : '多次抽取')
      : (lang.value === 'en' ? 'Draw multiple people' : '抽取多人'),
    icon: 'fluent:people-24-regular'
  }
])
const genderFilterOptions = computed(() => [
  { value: 'all', label: lang.value === 'en' ? 'All' : '全部', icon: 'fluent:people-16-regular' },
  { value: 'male', label: lang.value === 'en' ? 'Male only' : '仅男', symbol: '♂' },
  { value: 'female', label: lang.value === 'en' ? 'Female only' : '仅女', symbol: '♀' }
])
const countSettingLabel = computed(() => settings.value.groupMode
  ? (lang.value === 'en' ? 'Draw count' : '抽取次数')
  : t('peopleCount', lang.value))
const duplicateOptions = computed(() => [
  { value: 'unique', label: lang.value === 'en' ? 'No repeats' : '禁止重复', icon: 'fluent:shield-checkmark-24-regular' },
  { value: 'repeat', label: lang.value === 'en' ? 'Repeats allowed' : '允许重复', icon: 'fluent:arrow-repeat-all-24-regular' }
])

const groupPoolCount = computed(() => {
  const groups = namesStore.currentList.groups || []
  const hasUnassigned = namesStore.currentNames.some(n => !n.groupId)
  return groups.length + (hasUnassigned ? 1 : 0)
})

const availableNames = computed(() => namesStore.currentNames.filter(person =>
  genderFilter.value === 'all' || person.gender === genderFilter.value
))
const nonWhiteListCount = computed(() => availableNames.value.filter(n => !n.isWhiteList).length)
const maxPeopleCount = computed(() => {
  if (!settings.value.multiMode) return 1
  if (!settings.value.forbidDuplicates) return Number.MAX_SAFE_INTEGER
  if (!settings.value.groupMode) return Math.max(1, nonWhiteListCount.value)
  return Math.max(2, groupPoolCount.value)
})
const canStart = computed(() => {
  if (settings.value.groupMode) {
    if (groupPoolCount.value < 1) return false
    if (settings.value.multiMode && settings.value.forbidDuplicates && (settings.value.peopleCount || 2) > groupPoolCount.value) return false
    return true
  }
  if (nonWhiteListCount.value < 1) return false
  if (settings.value.multiMode && settings.value.forbidDuplicates && (settings.value.peopleCount || 2) > nonWhiteListCount.value) return false
  return true
})

const nameDisplays = reactive([])
const isRunning = ref(false)
const isFinishing = ref(false)
const currentReceipt = ref(null)
const resultPresentation = computed(() => pluginsStore.resultPresentationForTarget('roller.result'))
const lastPickedNames = ref([])
const sessionCounts = ref({})
let intervalId = null
let autoStopTimer = null
let autoStopInterval = null
const autoStopRemaining = ref(0)
const autoStopProgress = computed(() => getAutoStopProgress(autoStopRemaining.value, normalizeAutoStopDuration(settings.value.autoStopDuration) * 1000))
let drawOperationId = ''
let suppressAutoStopOnce = false
let pendingUriNavigation = null
const pendingTimers = []
const revealed = ref([])
const gridParams = reactive({ valid: false, font: 52, lineH: 60, cellW: 0, count: 0, positions: [], revealScale: 1 })

const balanceSettings = ref({ ...DEFAULT_CYRENE_BALANCE_SETTINGS })

onMounted(async () => {
  const saved = await dataBridge.load('balance')
  balanceSettings.value = normalizeCyreneBalanceSettings(saved)
  if (balanceSettings.value.enabled && !settings.value.recordCounts) {
    settingsStore.update('recordCounts', true)
  }
  if (saved && JSON.stringify(saved) !== JSON.stringify(balanceSettings.value)) {
    await dataBridge.save('balance', balanceSettings.value)
  }
})

function initializeDisplays(count) {
  nameDisplays.splice(0); lastPickedNames.value = []
  const pool = settings.value.groupMode ? getCurrentPool() : availableNames.value
  for (let i = 0; i < count; i++) {
    const src = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { cn: '...', en: '' }
    const txt = getDisplayName(src)
    nameDisplays.push({ text: txt, opacity: 0, animating: false, isWhiteList: false })
    lastPickedNames.value.push('')
  }
  nextTick(() => { computeGridParams(); computeNameLayout() })
}

function getNameStyle(display, i) {
  const style = { opacity: display.opacity }
  const layout = nameLayout.value[i]
  if (layout) {
    style.left = layout.x + 'px'
    style.top = layout.y + 'px'
    style.width = gridParams.cellW + 'px'
    style.textAlign = 'center'
    const fittedFontSize = nameFontSize.value * (settings.value.nameFontSize || 1)
    style.fontSize = `min(var(--plugin-component-roller-result-font-size, var(--plugin-component-roller-result-size, ${fittedFontSize}px)), ${fittedFontSize}px)`
    style['--reveal-scale'] = gridParams.revealScale
  }
  if (settings.value.nameColorMode === 'custom') {
    const color = settingsStore.darkMode
      ? (settings.value.customNameColorDark || '#f09bd7')
      : (settings.value.customNameColorLight || '#d04a9d')
    style.color = color
  }
  return style
}

function saveSetting(key, value) { settingsStore.update(key, value) }

function enforceGenderAvailability() {
  if (settings.value.groupMode || !settings.value.multiMode) return false
  const availableCount = nonWhiteListCount.value
  if (availableCount < 2) {
    settingsStore.update('peopleCount', 1)
    settingsStore.update('multiMode', false)
    initializeDisplays(1)
    nextTick(computeNameLayout)
    return true
  }
  const currentCount = Math.max(2, settings.value.peopleCount || 2)
  const nextCount = settings.value.forbidDuplicates
    ? Math.min(currentCount, availableCount)
    : currentCount
  if (nextCount !== settings.value.peopleCount) settingsStore.update('peopleCount', nextCount)
  initializeDisplays(nextCount)
  nextTick(computeNameLayout)
  return true
}

function onMultiModeChange(val) {
  settingsStore.update('multiMode', val)
  if (!val) initializeDisplays(1)
  else {
    if (enforceGenderAvailability()) return
    let c = Math.max(2, Math.min(settings.value.peopleCount || 2, maxPeopleCount.value))
    if (settings.value.groupMode && settings.value.forbidDuplicates) c = Math.min(c, groupPoolCount.value)
    settingsStore.update('peopleCount', c); initializeDisplays(c)
  }
  nextTick(computeNameLayout)
}

function onDrawCountChange(value) { onMultiModeChange(value === 'multiple') }

function onGroupModeChange(val) {
  settingsStore.update('groupMode', val)
  if (settings.value.multiMode) {
    if (!val && enforceGenderAvailability()) return
    if (val && settings.value.forbidDuplicates && (settings.value.peopleCount || 2) > groupPoolCount.value) {
      const c = Math.max(2, groupPoolCount.value)
      settingsStore.update('peopleCount', c); initializeDisplays(c)
    }
  }
  nextTick(computeNameLayout)
}

function onDrawTargetChange(value) { onGroupModeChange(value === 'groups') }

function onForbidDuplicatesChange(val) {
  settingsStore.update('forbidDuplicates', val)
  if (val && settings.value.multiMode) {
    const cap = settings.value.groupMode ? groupPoolCount.value : nonWhiteListCount.value
    if ((settings.value.peopleCount || 2) > cap) {
      const c = Math.max(2, cap)
      settingsStore.update('peopleCount', c)
      initializeDisplays(c)
      nextTick(computeNameLayout)
    }
  }
}
function onDuplicateModeChange(value) { onForbidDuplicatesChange(value === 'unique') }

function onPeopleCountChange(val) {
  const requested = parseInt(val) || 1
  if (requested <= 1) {
    switchToSingleFromCount()
    return
  }
  const c = Math.max(2, Math.min(maxPeopleCount.value, requested))
  settingsStore.update('peopleCount', c); if (settings.value.multiMode) initializeDisplays(c)
}

function changeCount(delta) {
  if (delta < 0 && (settings.value.peopleCount || 2) <= 2) {
    switchToSingleFromCount()
    return
  }
  const c = Math.max(2, Math.min(maxPeopleCount.value, (settings.value.peopleCount || 2) + delta))
  settingsStore.update('peopleCount', c); if (settings.value.multiMode) initializeDisplays(c)
}

function switchToSingleFromCount() {
  settingsStore.update('peopleCount', 2)
  settingsStore.update('multiMode', false)
  initializeDisplays(1)
  nextTick(computeNameLayout)
}

const nameDisplayRefs = []
function setNameDisplayRef(element, index) { nameDisplayRefs[index] = element || null }
function emphasize(index) {
  const run = pluginsStore.startAnimation('roller.finish', nameDisplayRefs[index])
  if (run) {
    nameDisplays[index].animating = false
    return
  }
  nameDisplays[index].animating = true
  setTimeout(() => { nameDisplays[index].animating = false }, 900)
}

function getDisplayName(person) {
  return settings.value.englishMode && person.en ? person.en : person.cn
}

function getCurrentPool() {
  const groups = (namesStore.currentList.groups || [])
  const pool = groups.map(g => ({ cn: g.name, en: g.enName || '', id: g.id, isGroup: true }))
  const hasUnassigned = namesStore.currentNames.some(n => !n.groupId)
  if (hasUnassigned) pool.push({ cn: t('unassigned', lang.value), en: 'Unassigned', id: '__unassigned__', isGroup: true, isUnassigned: true })
  return pool
}

function doPick(excludeList = []) {
  if (settings.value.groupMode) {
    const pool = getCurrentPool()
    const forbidDup = settings.value.multiMode && settings.value.forbidDuplicates
    if (forbidDup) {
      const avail = pool.filter(p => !excludeList.includes(p.id))
      return avail.length ? avail[Math.floor(Math.random() * avail.length)] : pool[Math.floor(Math.random() * pool.length)]
    }
    return pool[Math.floor(Math.random() * pool.length)]
  }
  const names = availableNames.value
  const wl = names.filter(n => n.isWhiteList)
  const forbidDup = settings.value.multiMode && settings.value.forbidDuplicates
  const combinedCounts = { ...statisticsStore.counts }
  for (const [k, v] of Object.entries(sessionCounts.value)) {
    combinedCounts[k] = (combinedCounts[k] || 0) + v
  }
  return pickCyreneBalanced(
    names,
    wl,
    combinedCounts,
    balanceSettings.value,
    excludeList,
    !forbidDup
  )
}

function animationLoop() {
  if (!isRunning.value) return
  const count = settings.value.multiMode ? (settings.value.peopleCount || 2) : 1
  for (let i = 0; i < count; i++) {
    const pick = doPick([])
    const txt = getDisplayName(pick)
    if (nameDisplays[i]) {
      nameDisplays[i].text = txt
      nameDisplays[i].opacity = 1
      nameDisplays[i].isWhiteList = !!pick.isWhiteList
    }
    if (pick.id && !pick.isWhiteList) {
      sessionCounts.value[pick.id] = (sessionCounts.value[pick.id] || 0) + 1
    }
  }
  // 只更新文字内容的位置，不重新计算网格参数（避免抖动）
  updateNamePositionsOnly()
  intervalId = setTimeout(animationLoop, 50)
}

function updateNamePositionsOnly() {
  const n = nameDisplays.length
  if (!displayRef.value || n === 0 || !gridParams.valid) return
  nameFontSize.value = gridParams.font
  nameLayout.value = gridParams.positions.slice(0, n)
}

function stopRoll() {
  clearTimeout(intervalId)
  clearTimeout(autoStopTimer)
  clearInterval(autoStopInterval)
  autoStopInterval = null
  autoStopRemaining.value = 0
  isRunning.value = false
  void finishRoll()
}

function startAutoStopCountdown() {
  const durationMs = normalizeAutoStopDuration(settings.value.autoStopDuration) * 1000
  const deadline = Date.now() + durationMs
  autoStopRemaining.value = durationMs
  clearInterval(autoStopInterval)
  autoStopInterval = setInterval(() => {
    autoStopRemaining.value = Math.max(0, deadline - Date.now())
  }, 50)
  autoStopTimer = setTimeout(stopRoll, durationMs)
}

function toggleRoll() {
  if (isFinishing.value) return
  if (isRunning.value) { stopRoll(); return }
  pendingTimers.forEach(id => clearTimeout(id)); pendingTimers.length = 0
  if (!canStart.value) {
    if (settings.value.groupMode && groupPoolCount.value < 1) {
      showBanner({ message: lang.value === 'en' ? 'No groups yet, create some in Group Management' : '还没有小组，请先在「小组管理」中创建小组♪', icon: 'info-16-regular', type: 'warning', duration: 8000 })
    } else if (nonWhiteListCount.value < 1) {
      showBanner({ message: lang.value === 'en' ? 'No names available yet' : '唔...你还没添加名单呢♪', icon: 'info-16-regular', type: 'warning', duration: 8000 })
    } else {
      showBanner({ message: lang.value === 'en' ? 'Too many people for available names' : '人数超过了可用名单数量', icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    }
    return
  }
  isRunning.value = true
  currentReceipt.value = null
  drawOperationId = crypto.randomUUID?.() || `roller-${Date.now()}`
  pluginsStore.dispatchEvent('roller:start', {
    operationId: drawOperationId,
    listId: namesStore.currentList.id,
    target: settings.value.groupMode ? 'groups' : 'people',
    count: settings.value.multiMode ? (settings.value.peopleCount || 2) : 1
  })
  sessionCounts.value = {}
  initializeDisplays(settings.value.multiMode ? (settings.value.peopleCount || 2) : 1)
  // 动画开始前先计算好网格参数
  nextTick(() => {
    computeGridParams()
    computeNameLayout()
    animationLoop()
    if (settings.value.autoStop && !suppressAutoStopOnce) startAutoStopCountdown()
    else autoStopRemaining.value = 0
    suppressAutoStopOnce = false
  })
}

async function applyUriNavigation(event) {
  const navigation = event?.detail
  if (!navigation || navigation.route !== '/roller') return
  consumePendingUriNavigation('/roller')
  if (!namesStore.isLoaded) {
    pendingUriNavigation = navigation
    return
  }
  if (isRunning.value) {
    clearTimeout(intervalId)
    clearTimeout(autoStopTimer)
    clearInterval(autoStopInterval)
    autoStopInterval = null
    autoStopRemaining.value = 0
    pendingTimers.forEach(id => clearTimeout(id))
    pendingTimers.length = 0
    isRunning.value = false
  }
  const parameters = navigation.roller || {}
  if (typeof parameters.englishMode === 'boolean') settings.value.englishMode = parameters.englishMode
  if (typeof parameters.groupMode === 'boolean') settings.value.groupMode = parameters.groupMode
  if (typeof parameters.noDuplication === 'boolean') settings.value.forbidDuplicates = parameters.noDuplication
  if (!settings.value.groupMode && parameters.sex) genderFilter.value = parameters.sex

  const requestedMulti = typeof parameters.multiMode === 'boolean'
    ? parameters.multiMode
    : Number(parameters.count) > 1
  settings.value.multiMode = requestedMulti
  if (requestedMulti) {
    const availableMaximum = maxPeopleCount.value
    if (availableMaximum < 2) {
      settings.value.multiMode = false
      await settingsStore.save()
      initializeDisplays(1)
      await nextTick()
      if (navigation.autoStart && !isRunning.value) {
        suppressAutoStopOnce = true
        toggleRoll()
        if (!isRunning.value) suppressAutoStopOnce = false
      }
      return
    }
    const requestedCount = Math.max(2, Number(parameters.count) || settings.value.peopleCount || 2)
    const count = Math.max(2, Math.min(requestedCount, availableMaximum))
    settings.value.peopleCount = count
    initializeDisplays(count)
  } else {
    initializeDisplays(1)
  }
  await settingsStore.save()
  await nextTick()
  if (navigation.autoStart && !isRunning.value) {
    suppressAutoStopOnce = true
    toggleRoll()
    if (!isRunning.value) suppressAutoStopOnce = false
  }
}

async function finishRoll() {
  isFinishing.value = true
  const count = settings.value.multiMode ? (settings.value.peopleCount || 2) : 1
  const forbidDup = settings.value.multiMode && settings.value.forbidDuplicates
  const shouldRecordCounts = settings.value.recordCounts || balanceSettings.value.enabled
  let receipt
  try {
    receipt = await pluginsStore.executeRollerDraw({
      listId: namesStore.currentList.id,
      target: settings.value.groupMode ? 'groups' : 'people',
      count,
      allowDuplicates: !forbidDup,
      gender: settings.value.groupMode ? 'all' : genderFilter.value,
      operationId: drawOperationId,
      countStatistics: shouldRecordCounts
    })
  } catch (error) {
    currentReceipt.value = null
    showBanner({ message: error?.message || (lang.value === 'en' ? 'Draw could not be committed' : '抽签结果保存失败'), icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    isFinishing.value = false
    return
  }
  currentReceipt.value = receipt
  lastPickedNames.value = receipt.results.map(result => result.id)
  const finalPicks = receipt.results
  nextTick(computeNameLayout)

  const useStepStop = settings.value.multiMode && settings.value.multiStepStop
  const stagger = useStepStop ? Math.round((settings.value.stepStopInterval || 0.15) * 1000) : 0
  revealed.value = new Array(finalPicks.length).fill(false)
  pluginsStore.startAnimation('global.transition', null, { variant: 'roller' })
  for (let i = 0; i < finalPicks.length; i++) {
    const tid = setTimeout(() => {
      revealed.value[i] = true
      const result = finalPicks[i]
      nameDisplays[i].text = settings.value.englishMode && result.englishName ? result.englishName : result.name
      nameDisplays[i].opacity = 1
      nameDisplays[i].isWhiteList = !!result.isWhiteList
      emphasize(i)
      pluginsStore.dispatchEvent('roller:item-result', { ...receipt, index: i, result })
      if (i === finalPicks.length - 1) pluginsStore.dispatchEvent('roller:result', receipt)
    }, i * stagger)
    pendingTimers.push(tid)
  }
  if (settings.value.multiMode) windDownLoop(finalPicks.length, useStepStop ? stagger : 0)
  isFinishing.value = false
}

function windDownLoop(count, stagger) {
  let tick = 0
  const maxTicks = stagger > 0 ? Math.ceil((count - 1) * stagger / 50) + 3 : 1
  function tickFn() {
    if (tick++ > maxTicks) return
    for (let i = 0; i < count; i++) {
      if (revealed.value[i]) continue
      const pick = doPick([])
      nameDisplays[i].text = getDisplayName(pick)
      nameDisplays[i].opacity = 1
    }
    computeNameLayout()
    const tid = setTimeout(tickFn, 50)
    pendingTimers.push(tid)
  }
  tickFn()
}

const rollerViewRef = ref(null)
const displayRef = ref(null)
const controlsCenterRef = ref(null)
const probeRef = ref(null)
const nameFontSize = ref(52)
const nameLayout = ref([])

const measureCache = new Map()
function measureNameWidth(text) {
  const key = text && text.length ? text : '...'
  if (measureCache.has(key)) return measureCache.get(key)
  let w
  if (!probeRef.value) { w = key.length * 30 }
  else { probeRef.value.textContent = key; w = probeRef.value.offsetWidth }
  measureCache.set(key, w)
  return w
}

function getPoolMaxWidth() {
  const pool = settings.value.groupMode ? getCurrentPool() : namesStore.currentNames
  let m = 1
  for (const p of pool) {
    const w = measureNameWidth(getDisplayName(p))
    if (w > m) m = w
  }
  return m
}

function computeGridParams() {
  const cont = displayRef.value
  if (!cont || nameDisplays.length === 0) { gridParams.valid = false; return }
  const cW = cont.clientWidth
  const cH = cont.clientHeight
  const factor = settings.value.nameFontSize || 1
  const n = nameDisplays.length
  const maxW = getPoolMaxWidth()
  const exclusion = getControlsExclusion(cont, cW, cH)
  const visualCenter = getVisualCenter(cont, cW, cH)

  if (n === 1) {
    const font = 52
    const actualFont = font * factor
    const lineH = actualFont * 1.18
    const textLineH = actualFont * 1.05
    const cellW = Math.max(actualFont * 1.5, maxW * (font / 52) * factor + 2)
    const x = Math.max(0, Math.min(cW - cellW, visualCenter.x - cellW / 2))
    const y = Math.max(0, Math.min(cH - textLineH, visualCenter.y - textLineH / 2))
    Object.assign(gridParams, {
      valid: true,
      font,
      lineH,
      cellW,
      positions: [{ x, y }],
      score: 0,
      count: 1,
      revealScale: 2.2
    })
    return
  }

  function buildPlan(font, columns) {
    const actualFont = font * factor
    const lineH = actualFont * 1.18
    const gapX = Math.max(8, actualFont * 0.42)
    const gapY = Math.max(8, actualFont * 0.42)
    const cellW = Math.max(actualFont * 1.5, maxW * (font / 52) * factor + 2)
    const contentW = columns * cellW + (columns - 1) * gapX
    if (contentW > cW + 0.5) return null

    const originX = Math.max(0, Math.min(cW - contentW, visualCenter.x - contentW / 2))
    const columnPlans = []
    for (let column = 0; column < columns; column++) {
      const x = originX + column * (cellW + gapX)
      const overlapsControls = exclusion
        && x < exclusion.right
        && x + cellW > exclusion.left
      columnPlans.push({ x, overlapsControls, count: 0 })
    }

    if (n >= 64) {
      // 大量抽取时按列可用高度均衡填充。所有列稍后仍共享同一个 originY，
      // 因此左侧长列可以利用控制台下方空间，同时保持严格的横向行基线。
      columnPlans.forEach(column => {
        column.availableHeight = column.overlapsControls ? exclusion.top : cH
        column.capacity = Math.floor((column.availableHeight + gapY) / (lineH + gapY))
        column.count = 0
      })
      const totalCapacity = columnPlans.reduce((sum, column) => sum + column.capacity, 0)
      if (totalCapacity < n) return null
      for (let index = 0; index < n; index++) {
        const candidates = columnPlans.filter(column => column.count < column.capacity)
        if (!candidates.length) return null
        const target = candidates.reduce((best, candidate) => {
          const candidateFill = (candidate.count + 1) * (lineH + gapY) / candidate.availableHeight
          const bestFill = (best.count + 1) * (lineH + gapY) / best.availableHeight
          return candidateFill < bestFill ? candidate : best
        })
        target.count++
      }
      if (columnPlans.some(column => column.count === 0)) return null
    } else {
      const baseCount = Math.floor(n / columns)
      const extraCount = n % columns
      if (baseCount < 1) return null
      columnPlans.forEach(column => { column.count = baseCount })
      // 常规人数保持各列人数最多差 1，余数优先放在不受控件影响且靠近中心的列。
      columnPlans
        .map((column, index) => ({
          column,
          index,
          priority: column.overlapsControls ? 1 : 0,
          distance: Math.abs(column.x + cellW / 2 - visualCenter.x)
        }))
        .sort((left, right) => left.priority - right.priority || left.distance - right.distance || left.index - right.index)
        .slice(0, extraCount)
        .forEach(({ column }) => { column.count++ })
    }

    const maxColumnCount = Math.max(...columnPlans.map(column => column.count))
    const maxColumnHeight = maxColumnCount * lineH + (maxColumnCount - 1) * gapY
    if (maxColumnHeight > cH + 0.5) return null
    let latestOriginY = cH - maxColumnHeight
    for (const column of columnPlans) {
      if (!column.overlapsControls) continue
      const columnHeight = column.count * lineH + (column.count - 1) * gapY
      latestOriginY = Math.min(latestOriginY, exclusion.top - columnHeight)
    }
    if (latestOriginY < 0) return null
    const originY = Math.max(0, Math.min(latestOriginY, visualCenter.y - maxColumnHeight / 2))

    const selected = []
    columnPlans.forEach((columnPlan, column) => {
      for (let row = 0; row < columnPlan.count; row++) {
        selected.push({
          row,
          column,
          x: columnPlan.x,
          y: originY + row * (lineH + gapY) + (lineH - actualFont) / 2
        })
      }
    })

    const center = selected.reduce((result, cell) => {
      result.x += cell.x + cellW / 2
      result.y += cell.y + actualFont / 2
      return result
    }, { x: 0, y: 0 })
    center.x /= n
    center.y /= n

    const bounds = selected.reduce((result, cell) => ({
      left: Math.min(result.left, cell.x),
      top: Math.min(result.top, cell.y),
      right: Math.max(result.right, cell.x + cellW),
      bottom: Math.max(result.bottom, cell.y + actualFont)
    }), { left: cW, top: cH, right: 0, bottom: 0 })
    const layoutAspect = (bounds.right - bounds.left) / Math.max(1, bounds.bottom - bounds.top)
    const targetAspect = cW / Math.max(1, cH)
    const centerDistance = ((center.x - visualCenter.x) / cW) ** 2
      + ((center.y - visualCenter.y) / cH) ** 2
    const minColumnCount = Math.min(...columnPlans.map(column => column.count))
    const orphanPenalty = columns >= 3 && maxColumnCount >= 3 && minColumnCount === 1 ? 14 : 0
    const score = Math.abs(Math.log(Math.max(0.01, layoutAspect / targetAspect))) * 28
      + centerDistance * 260
      + orphanPenalty
      + (n <= 4 ? (columns - 1) * 100 : 0)

    return {
      font,
      lineH,
      cellW,
      positions: selected.map(cell => ({ x: cell.x, y: cell.y })),
      score
    }
  }

  function findPlan() {
    for (let font = 52; font >= 2; font--) {
      const actualFont = font * factor
      const gapX = Math.max(8, actualFont * 0.42)
      const gapY = Math.max(8, actualFont * 0.42)
      const lineH = actualFont * 1.18
      const cellW = Math.max(actualFont * 1.5, maxW * (font / 52) * factor + 2)
      const plans = []

      const maxColumns = Math.min(n, Math.floor((cW + gapX) / (cellW + gapX)))
      for (let columns = 1; columns <= maxColumns; columns++) {
        const plan = buildPlan(font, columns)
        if (plan) plans.push(plan)
      }
      if (plans.length > 0) return plans.reduce((best, plan) => plan.score < best.score ? plan : best)
    }
    return null
  }
  const chosen = findPlan()
  if (!chosen) { gridParams.valid = false; return }

  const revealScale = n === 1 ? 2.2 : 1
  Object.assign(gridParams, { valid: true, ...chosen, count: n, revealScale })
}

function getVisualCenter(container, containerWidth, containerHeight) {
  const view = rollerViewRef.value
  if (!view) return { x: containerWidth / 2, y: containerHeight / 2 }
  const containerRect = container.getBoundingClientRect()
  const viewRect = view.getBoundingClientRect()
  const scaleX = containerWidth / Math.max(1, containerRect.width)
  const scaleY = containerHeight / Math.max(1, containerRect.height)
  return {
    x: Math.max(0, Math.min(containerWidth, (viewRect.left + viewRect.width / 2 - containerRect.left) * scaleX)),
    y: Math.max(0, Math.min(containerHeight, (viewRect.top + viewRect.height / 2 - containerRect.top) * scaleY))
  }
}

function getControlsExclusion(container, containerWidth, containerHeight) {
  const controls = controlsCenterRef.value
  if (!controls) return null
  const containerRect = container.getBoundingClientRect()
  const controlsRect = controls.getBoundingClientRect()
  if (containerRect.width <= 0 || containerRect.height <= 0) return null

  const scaleX = containerWidth / containerRect.width
  const scaleY = containerHeight / containerRect.height
  const margin = Math.max(16, Math.min(28, containerWidth * 0.018))
  const left = Math.max(0, Math.min(containerWidth, (controlsRect.left - containerRect.left) * scaleX - margin))
  const top = Math.max(0, Math.min(containerHeight, (controlsRect.top - containerRect.top) * scaleY - margin))
  if (left >= containerWidth || top >= containerHeight) return null
  return { left, top, right: containerWidth, bottom: containerHeight }
}

function computeNameLayout() {
  const n = nameDisplays.length
  if (!displayRef.value || n === 0) { nameFontSize.value = 52; nameLayout.value = []; return }
  if (!gridParams.valid || gridParams.count !== n) computeGridParams()
  if (!gridParams.valid) { nameLayout.value = []; return }
  nameFontSize.value = gridParams.font
  nameLayout.value = gridParams.positions.slice(0, n)
}

function onResize() { computeGridParams(); computeNameLayout() }

let layoutObserver = null

onMounted(() => {
  window.addEventListener('cyrene-uri-navigation', applyUriNavigation)
  const initialNavigation = consumePendingUriNavigation('/roller')
  if (initialNavigation) applyUriNavigation({ detail: initialNavigation })
  if (namesStore.isLoaded) initializeDisplays(settings.value.multiMode ? (settings.value.peopleCount || 2) : 1)
  watch(() => namesStore.isLoaded, (loaded) => {
    if (!loaded) return
    initializeDisplays(settings.value.multiMode ? (settings.value.peopleCount || 2) : 1)
    if (pendingUriNavigation) {
      const navigation = pendingUriNavigation
      pendingUriNavigation = null
      applyUriNavigation({ detail: navigation })
    }
  })
  watch(() => namesStore.currentListId, () => {
    if (!settings.value.groupMode && enforceGenderAvailability()) return
    initializeDisplays(settings.value.multiMode ? (settings.value.peopleCount || 2) : 1)
  })
  watch(() => settings.value.englishMode, () => nextTick(() => { computeGridParams(); computeNameLayout() }))
  watch(genderFilter, () => {
    if (!settings.value.groupMode && !enforceGenderAvailability()) initializeDisplays(1)
  })
  watch(() => [settings.value.multiMode, settings.value.groupMode, settings.value.forbidDuplicates, settings.value.peopleCount, settings.value.nameFontSize], () => nextTick(() => { computeGridParams(); computeNameLayout() }))
  layoutObserver = new ResizeObserver(onResize)
  if (displayRef.value) layoutObserver.observe(displayRef.value)
  if (controlsCenterRef.value) layoutObserver.observe(controlsCenterRef.value)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => { if (intervalId) clearTimeout(intervalId); clearTimeout(autoStopTimer); clearInterval(autoStopInterval); pendingTimers.forEach(id => clearTimeout(id)); layoutObserver?.disconnect(); window.removeEventListener('resize', onResize); window.removeEventListener('cyrene-uri-navigation', applyUriNavigation) })
</script>

<style scoped>
.roller-view { padding: 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; position: relative; }
.roller-title { font-family: var(--font-display); font-size: 28px; font-weight: 700; color: var(--text-primary); margin-bottom: 24px; width: 100%; text-align: center; position: absolute; top: 32px; left: 0; right: 0; z-index: 5; }
.balance-status { position: absolute; top: 28px; right: 28px; z-index: 8; display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 11px; border: 1px solid color-mix(in srgb, var(--text-muted) 45%, transparent); border-radius: var(--radius-sm); color: var(--text-muted); background: color-mix(in srgb, var(--bg-card-solid) 68%, transparent); backdrop-filter: blur(10px); font-size: 12px; opacity: 0.82; }
.balance-status.enabled { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 48%, transparent); }

/* 名字舞台覆盖整个页面主体；布局算法只剔除与右下控制台实际重叠的单元格。 */
.display-container {
  position: absolute;
  top: 96px;
  left: 24px;
  right: 24px;
  bottom: 24px;
  overflow: hidden;
  pointer-events: none;
  color: var(--plugin-component-roller-result-foreground, var(--text-primary));
  font-family: var(--plugin-component-roller-result-font-family, var(--font-display));
  font-weight: var(--plugin-component-roller-result-font-weight, inherit);
  background: var(--plugin-component-roller-result-background, transparent);
  border: var(--plugin-component-roller-result-border-width, 0) solid var(--plugin-component-roller-result-border-color, transparent);
  border-radius: var(--plugin-component-roller-result-radius, 0);
  padding: var(--plugin-component-roller-result-padding, 0);
  box-shadow: var(--plugin-component-roller-result-shadow, none);
}

.name-display { position: absolute; white-space: nowrap; overflow: visible; font-family: var(--plugin-component-roller-result-font-family, var(--font-display)); font-weight: var(--plugin-component-roller-result-font-weight, 700); color: var(--plugin-component-roller-result-foreground, var(--text-primary)); line-height: 1.05; letter-spacing: 0.5px; transition: left 0.3s ease, top 0.3s ease, width 0.3s ease, font-size 0.3s ease, opacity 0.3s ease; text-shadow: 0 4px 20px rgba(234, 94, 193, 0.15); z-index: 5; }
.name-display::before { content: ''; position: absolute; inset: -4px; background: var(--accent); border-radius: var(--radius-sm); z-index: -1; opacity: 0; transition: opacity 0.3s ease; }
.name-display.rainbow {
  background: linear-gradient(90deg, #ff6ad9, #72afec, #ff6ad9, #72afec, #ff6ad9, #72afec, #ff6ad9, #72afec, #ff6ad9);
  background-size: 800% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: none;
  animation: gradient-shift 32s linear infinite;
}

.name-display.rainbow.final-spotlight { animation: gradient-shift 32s linear infinite, final-reveal 0.5s cubic-bezier(0.1, 0.9, 0.2, 1); }
.name-display.rainbow.final-lift { animation: gradient-shift 32s linear infinite, final-lift 0.68s cubic-bezier(0.12, 0.85, 0.2, 1.15); }
.name-display.rainbow.final-glow { animation: gradient-shift 32s linear infinite, final-glow 0.8s cubic-bezier(0.16, 0.84, 0.3, 1); }

@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  100% { background-position: 800% 50%; }
}

.name-display:not(.rainbow).final-spotlight { animation: final-reveal 0.5s cubic-bezier(0.1, 0.9, 0.2, 1); }
.name-display:not(.rainbow).final-lift { animation: final-lift 0.68s cubic-bezier(0.12, 0.85, 0.2, 1.15); }
.name-display:not(.rainbow).final-glow { animation: final-glow 0.8s cubic-bezier(0.16, 0.84, 0.3, 1); }
@keyframes final-reveal { 0% { transform: scale(var(--reveal-scale, 1)); opacity: 0; filter: brightness(2); } 72% { transform: scale(0.97); opacity: 1; filter: brightness(1.08); } 100% { transform: scale(1); filter: brightness(1); } }
@keyframes final-lift { 0% { transform: translateY(18px) scale(0.88); opacity: 0; filter: blur(5px); } 58% { transform: translateY(-6px) scale(1.05); opacity: 1; filter: brightness(1.3); } 100% { transform: translateY(0) scale(1); filter: brightness(1); } }
@keyframes final-glow { 0% { transform: scale(0.92); opacity: 0; text-shadow: 0 0 0 var(--accent); } 50% { transform: scale(1.06); opacity: 1; text-shadow: 0 0 32px var(--accent); } 100% { transform: scale(1); text-shadow: 0 4px 20px rgba(234, 94, 193, 0.15); } }

/* 隐藏的文字测量探针 */
.fit-probe {
  position: absolute;
  visibility: hidden;
  white-space: nowrap;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 52px;
  letter-spacing: 0.5px;
  top: 0;
  left: 0;
  pointer-events: none;
}

.controls-center { position: absolute; bottom: 24px; right: 24px; width: min(280px, calc(100% - 48px)); display: flex; flex-direction: column; gap: 10px; align-items: stretch; z-index: 10; box-sizing: border-box; }
.roller-plugin-side-panel { position: absolute; top: 96px; left: 24px; width: min(300px, calc(100% - 48px)); z-index: 9; }
.roller-plugin-below-result { position: absolute; left: 24px; right: 24px; bottom: 24px; max-width: 520px; }
.filters-reserved { width: min(280px, 100%); min-height: 120px; }
.filters-compact-entry { min-width: 132px; }
.switches { display: flex; flex-direction: column; gap: var(--plugin-component-roller-filters-gap, 6px); align-items: stretch; width: 100%; min-width: 0; color: var(--plugin-component-roller-filters-foreground, inherit); background: var(--plugin-component-roller-filters-background, transparent); font-size: var(--plugin-component-roller-filters-font-size, inherit); font-weight: var(--plugin-component-roller-filters-font-weight, inherit); }
.english-mode-toggle { align-self: flex-end; }
.multi-settings { display: flex; align-items: center; gap: var(--plugin-component-roller-filters-gap, 12px); min-width: 0; flex-wrap: wrap; color: var(--plugin-component-roller-filters-foreground, inherit); background: var(--plugin-component-roller-filters-background, transparent); font-size: var(--plugin-component-roller-filters-font-size, inherit); font-weight: var(--plugin-component-roller-filters-font-weight, inherit); }
.setting-label { font-size: 14px; color: var(--text-secondary); }
.count-control { display: flex; align-items: center; gap: 8px; }
.count-input { width: 60px; text-align: center; }
.count-input :deep(input) { text-align: center; -moz-appearance: textfield; }
.count-input :deep(input)::-webkit-inner-spin-button,
.count-input :deep(input)::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.list-selector-bar { display: flex; align-items: center; gap: var(--plugin-component-roller-current-list-gap, 12px); min-width: 0; box-sizing: border-box; background: var(--plugin-component-roller-current-list-background, var(--bg-card)); color: var(--plugin-component-roller-current-list-foreground, inherit); backdrop-filter: blur(20px); padding: var(--plugin-component-roller-current-list-padding, 8px 16px); border-radius: var(--radius-lg); border: 1px solid var(--border-default); box-shadow: var(--shadow-4); width: 100%; justify-content: center; font-size: var(--plugin-component-roller-current-list-font-size, inherit); font-weight: var(--plugin-component-roller-current-list-font-weight, inherit); }
.selector-label { font-size: 14px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
.start-btn { width: min(var(--plugin-component-roller-primary-action-size, 280px), 100%); min-width: 0; box-sizing: border-box; align-self: stretch; font-family: var(--plugin-component-roller-primary-action-font-family, var(--font-ui)); font-size: var(--plugin-component-roller-primary-action-font-size, 16px); font-weight: var(--plugin-component-roller-primary-action-font-weight, inherit); min-height: 48px; margin-top: 8px; position: relative; overflow: hidden; color: var(--plugin-component-roller-primary-action-foreground, var(--text-on-accent)); background: var(--plugin-component-roller-primary-action-background, var(--accent)); border-radius: var(--plugin-component-roller-primary-action-radius, var(--radius-md)); }
.start-btn-countdown { position: absolute; left: 0; right: auto; bottom: 0; height: 3px; background: #ffd6e8; box-shadow: 0 0 8px rgba(255, 214, 232, 0.75); pointer-events: none; transition: width 0.05s linear; }
.btn-dimmed { opacity: 0.45; cursor: not-allowed; }

.toggle-expand-enter-active { animation: toggle-in 0.25s cubic-bezier(0.1, 0.9, 0.2, 1); }
.toggle-expand-leave-active { animation: toggle-in 0.15s ease-in reverse; }
@keyframes toggle-in { from { opacity: 0; transform: translateY(-8px); max-height: 0; } to { opacity: 1; transform: translateY(0); max-height: 40px; } }

@media (max-width: 720px) {
  .balance-status { top: 84px; right: auto; left: 50%; max-width: calc(100% - 80px); transform: translateX(-50%); white-space: nowrap; }
  .display-container { top: 128px; }
}
</style>
