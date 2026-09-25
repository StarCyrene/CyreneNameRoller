<template>
  <div class="statistics-view">
    <h1 class="page-title">
      <FluentIcon icon="chart-multiple-24-regular" :width="28" />
      {{ t('statistics', lang) }}
    </h1>

    <div class="stats-header">
      <FluentSelect
        :model-value="selectedListId"
        :options="listOptions"
        @update:model-value="selectedListId = $event"
      />
    </div>

    <FluentCard
      v-if="summaryOverride.visibility !== 'hidden'"
      class="stats-summary"
      data-plugin-component="statistics.summary"
      :class="{ 'plugin-reserved': summaryOverride.layout === 'reserve' }"
      :style="pluginsStore.componentStyleStyle('statistics.summary')"
    >
      <div class="summary-item">
        <span class="summary-label">{{ lang === 'en' ? 'Total Rolls' : '总计抽取' }}</span>
        <span class="summary-value">{{ statsData.totalCount }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">{{ lang === 'en' ? 'Candidates' : '候选人数' }}</span>
        <span class="summary-value">{{ selectedNames.filter(n => !n.isWhiteList).length }}</span>
      </div>
    </FluentCard>
    <div v-else-if="summaryOverride.layout === 'reserve'" class="stats-summary-reserved" aria-hidden="true" />

    <FluentCard class="stats-list-card">
      <div class="stats-table-header">
        <span class="col-name">{{ lang === 'en' ? 'Name' : '姓名' }}</span>
        <span class="col-en">{{ lang === 'en' ? 'English' : '英文名' }}</span>
        <span class="col-count">{{ lang === 'en' ? 'Count' : '次数' }}</span>
        <span class="col-prob">{{ lang === 'en' ? 'Probability' : '概率' }}</span>
        <span class="col-balanced">{{ lang === 'en' ? 'Balanced' : '平衡概率' }}</span>
      </div>
      <ul class="stats-list">
        <li v-for="stat in statsWithBalance" :key="stat.id" class="stats-item">
          <span class="col-name">{{ stat.name }}</span>
          <span class="col-en">{{ stat.en }}</span>
          <span class="col-count">{{ stat.count }}</span>
          <span class="col-prob">{{ stat.probability.toFixed(2) }}%</span>
          <span class="col-balanced">{{ stat.balancedProbability.toFixed(2) }}%</span>
        </li>
        <li v-if="statsWithBalance.length === 0" class="stats-empty">
          {{ lang === 'en' ? 'No data yet' : '暂无数据' }}
        </li>
      </ul>
    </FluentCard>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { useStatisticsStore } from '../stores/statistics'
import { usePluginsStore } from '../plugins/store'
import {
  computeCyreneBalanceProbability,
  DEFAULT_CYRENE_BALANCE_SETTINGS,
  normalizeCyreneBalanceSettings
} from '../utils/cyrene-balance'
import { dataBridge } from '../utils/dataBridge'
import { t } from '../utils/i18n'

const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const statisticsStore = useStatisticsStore()
const pluginsStore = usePluginsStore()

const lang = computed(() => settingsStore.settings.language)
const balanceSettings = ref({ ...DEFAULT_CYRENE_BALANCE_SETTINGS })
const summaryOverride = computed(() => pluginsStore.componentOverrideState('statistics.summary'))

const selectedListId = ref(namesStore.currentListId)
// 名单尚未加载时 currentListId 可能是占位值；加载完成后必须跟上真实列表
watch(
  () => namesStore.currentListId,
  id => {
    if (id && namesStore.nameLists[id]) selectedListId.value = id
  },
  { immediate: true }
)

const listOptions = computed(() =>
  namesStore.allLists.map(l => ({ value: l.id, label: l.name }))
)

const selectedList = computed(() =>
  namesStore.nameLists[selectedListId.value] || namesStore.currentList
)

const selectedNames = computed(() => selectedList.value.names || [])
const selectedWhiteList = computed(() => selectedNames.value.filter(n => n.isWhiteList))

const statsData = computed(() => {
  return statisticsStore.getStatsForList(
    selectedNames.value,
    selectedWhiteList.value
  )
})

const statsWithBalance = computed(() => {
  const probMap = computeCyreneBalanceProbability(
    selectedNames.value,
    selectedWhiteList.value,
    statisticsStore.counts,
    balanceSettings.value
  )
  return statsData.value.stats.map(s => ({
    ...s,
    balancedProbability: probMap[s.id] || 0
  }))
})

onMounted(async () => {
  // 刷新直达本页时，子页可能先于 AppLayout 完成初始化而渲染
  await namesStore.initialize()
  await statisticsStore.initialize()
  if (namesStore.nameLists[namesStore.currentListId]) {
    selectedListId.value = namesStore.currentListId
  }
  const saved = await dataBridge.load('balance')
  balanceSettings.value = normalizeCyreneBalanceSettings(saved)
})
</script>

<style scoped>
.statistics-view {
  padding: 32px;
}

.page-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.stats-header {
  margin-bottom: 16px;
}

.stats-summary {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: 13px;
  color: var(--text-muted);
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  font-family: var(--font-display);
  color: var(--accent);
}

.stats-list-card {
  padding: 0;
  overflow: hidden;
}

.stats-table-header,
.stats-item {
  display: grid;
  grid-template-columns: 1fr 1fr 70px 90px 90px;
  align-items: center;
  min-height: var(--plugin-component-statistics-summary-size, 0);
  padding: var(--plugin-component-statistics-summary-padding, 10px 20px);
  gap: var(--plugin-component-statistics-summary-gap, 0);
  color: var(--plugin-component-statistics-summary-foreground, inherit);
  background: var(--plugin-component-statistics-summary-background, var(--bg-card));
  font-family: var(--plugin-component-statistics-summary-font-family, var(--font-ui));
  font-size: var(--plugin-component-statistics-summary-font-size, inherit);
  font-weight: var(--plugin-component-statistics-summary-font-weight, inherit);
}
.stats-summary.plugin-reserved { visibility: hidden; }
.stats-summary-reserved { min-height: 96px; }

.stats-table-header {
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-default);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.stats-list {
  list-style: none;
  max-height: 50vh;
  overflow-y: auto;
  margin: 0;
  padding: 0;
}

.stats-item {
  border-bottom: 1px solid var(--border-default);
  transition: background var(--duration-fast) ease;
  font-size: 14px;
}

.stats-item:last-child {
  border-bottom: none;
}

.stats-item:hover {
  background: var(--bg-hover);
}

.col-name {
  font-weight: 500;
  color: var(--text-primary);
}

.col-en {
  font-size: 12px;
  color: var(--text-muted);
}

.col-count {
  color: var(--text-secondary);
  text-align: center;
}

.col-prob {
  font-weight: 500;
  color: var(--text-secondary);
  text-align: right;
}

.col-balanced {
  font-weight: 600;
  color: var(--accent);
  text-align: right;
}

.stats-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
