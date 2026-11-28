<template>
  <div class="lottery-records-view">
    <header class="page-header">
      <div><h1><FluentIcon icon="history-24-regular" :width="28" />{{ lang === 'en' ? 'Lottery Records' : '抽奖记录' }}</h1><p>{{ recordSummary }}</p></div>
      <div class="record-filter"><span>{{ lang === 'en' ? 'Prize list' : '奖品单' }}</span><FluentSelect v-model="selectedListId" :options="listOptions" width="240px" /></div>
    </header>

    <FluentCard class="records-card">
      <div class="records-toolbar"><strong class="lottery-record-prize">{{ selectedListName }}</strong><FluentButton v-if="filteredRecords.length" variant="subtle" size="sm" @click="showClear = true"><FluentIcon icon="delete-16-regular" :width="14" />{{ lang === 'en' ? 'Clear' : '清空记录' }}</FluentButton></div>
      <div class="records-header"><span>{{ lang === 'en' ? 'Time' : '时间' }}</span><span>{{ lang === 'en' ? 'Prize' : '奖品' }}</span><span>{{ lang === 'en' ? 'Person' : '人员' }}</span><span>{{ lang === 'en' ? 'Mode' : '方式' }}</span></div>
      <div class="records-list">
        <div v-for="record in filteredRecords" :key="record.id" class="record-row">
          <span class="record-time">{{ formatTime(record.time) }}</span>
          <strong class="lottery-record-prize">{{ resolvePrize(record) }}</strong>
          <span class="lottery-record-person" :title="record.personId || ''">{{ resolvePerson(record) || '-' }}</span>
          <span class="record-mode">{{ record.mode === 'assign' ? (lang === 'en' ? 'Assignment' : '人员分配') : (lang === 'en' ? 'Prize draw' : '直接抽奖') }}</span>
        </div>
        <div v-if="!filteredRecords.length" class="empty-state"><FluentIcon icon="history-24-regular" :width="24" />{{ lang === 'en' ? 'No lottery records for this prize list' : '该奖品单暂无抽奖记录' }}</div>
      </div>
    </FluentCard>

    <FluentModal v-model="showClear" :title="lang === 'en' ? 'Clear lottery records' : '清空抽奖记录'">
      <p>{{ lang === 'en' ? `Clear records for ${selectedListName}?` : `确定清空「${selectedListName}」中的抽奖记录吗？` }}</p>
      <template #footer><FluentButton variant="secondary" @click="showClear = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton><FluentButton variant="danger" @click="clearRecords">{{ lang === 'en' ? 'Clear' : '清空' }}</FluentButton></template>
    </FluentModal>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { usePrizesStore } from '../stores/prizes'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'

const prizes = usePrizesStore()
const names = useNamesStore()
const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)
const selectedListId = ref('all')
const showClear = ref(false)
const listOptions = computed(() => [{ value: 'all', label: lang.value === 'en' ? 'All prize lists' : '全部奖品单' }, ...Object.values(prizes.lists).map(list => ({ value: list.id, label: list.name }))])
const selectedListName = computed(() => listOptions.value.find(option => option.value === selectedListId.value)?.label || '')
const filteredRecords = computed(() => selectedListId.value === 'all' ? prizes.records : prizes.records.filter(record => record.prizeListId === selectedListId.value))
const recordSummary = computed(() => lang.value === 'en' ? `${filteredRecords.value.length} records` : `${filteredRecords.value.length} 条记录`)

function formatTime(timestamp) { return new Date(timestamp).toLocaleString(lang.value === 'en' ? 'en-US' : 'zh-CN') }
function resolvePrize(record) { return prizes.lists[record.prizeListId]?.prizes?.find(prize => prize.id === record.prizeId)?.name || (lang.value === 'en' ? 'Deleted prize' : '已删除奖品') }
function resolvePerson(record) {
  if (!record.personId) return ''
  const person = names.nameLists[record.peopleListId]?.names?.find(item => item.id === record.personId)
  if (!person) return lang.value === 'en' ? 'Deleted person' : '已删除成员'
  return settingsStore.settings.englishMode && person.en ? person.en : person.cn
}
const showBanner = inject('banner')
const clearing = ref(false)
async function clearRecords() {
  if (clearing.value) return
  clearing.value = true
  try { await prizes.clearRecords(selectedListId.value); showClear.value = false }
  catch (error) { showBanner({ message: error?.message || String(error), icon: 'warning-16-regular', type: 'warning', duration: 8000 }) }
  finally { clearing.value = false }
}
onMounted(async () => { await Promise.all([prizes.initialize(), names.initialize()]); selectedListId.value = prizes.currentId })
</script>

<style scoped>
.lottery-records-view { height: 100%; padding: 32px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.page-header h1 { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-family: var(--font-display); font-size: 24px; }
.page-header p { margin: 6px 0 0 38px; color: var(--text-muted); font-size: 12px; }
.record-filter { display: flex; flex-direction: column; gap: 6px; color: var(--text-muted); font-size: 12px; }
.records-card { padding: 0; flex: 1; min-height: 220px; display: flex; flex-direction: column; overflow: hidden; }
.records-toolbar { min-height: 56px; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-default); }
.records-toolbar strong { color: var(--text-primary); font-size: 14px; }
.records-header, .record-row { display: grid; grid-template-columns: 190px minmax(180px, 1fr) minmax(160px, 1fr) 120px; gap: 14px; align-items: center; }
.records-header { padding: 10px 18px; color: var(--text-muted); background: var(--bg-hover); font-size: 12px; font-weight: 600; }
.records-list { flex: 1; overflow-y: auto; }
.record-row { min-height: 52px; padding: 10px 18px; border-top: 1px solid var(--border-default); color: var(--text-secondary); font-size: 13px; }
.record-row:hover { background: var(--bg-hover); }
.record-row strong { color: var(--text-primary); }
.record-time { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.record-mode { color: var(--accent); }
.empty-state { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); }
@media (max-width: 760px) { .lottery-records-view { padding: 20px 14px; } .page-header { align-items: stretch; flex-direction: column; } .records-card { overflow-x: auto; } .records-header, .record-row { min-width: 720px; } }
</style>
