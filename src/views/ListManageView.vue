<template>
  <div class="list-manage-view">
    <!-- 顶部区域 -->
    <div class="list-header">
      <div class="list-header-left">
        <FluentButton variant="subtle" size="sm" icon-only @click="router.back()">
          <FluentIcon icon="arrow-left-16-regular" :width="18" />
        </FluentButton>
        <FluentIcon icon="people-list-24-regular" :width="22" />
        <h1 class="page-title">{{ lang === 'en' ? 'List Management' : '名单管理' }}</h1>
      </div>
    </div>

    <!-- 创建名单 -->
    <FluentCard class="create-section">
      <h2 class="section-title">{{ t('createList', lang) }}</h2>
      <div class="create-row">
        <FluentInput v-model="newListName" :placeholder="lang === 'en' ? 'New list name' : '新名单名称'" @enter="createList" />
        <FluentButton variant="primary" size="sm" @click="createList">
          <FluentIcon icon="add-16-regular" :width="14" /> {{ t('createList', lang) }}
        </FluentButton>
      </div>
    </FluentCard>

    <!-- 名单列表 -->
    <FluentCard class="list-table-card">
      <div class="list-table-header">
        <h2 class="section-title">{{ lang === 'en' ? 'All Lists' : '所有名单' }}</h2>
        <span class="list-count">{{ namesStore.allLists.length }} {{ lang === 'en' ? 'lists' : '个名单' }}</span>
      </div>
      <div class="list-table">
        <div v-for="list in namesStore.allLists" :key="list.id" class="list-row" :class="{ active: list.id === namesStore.currentListId }">
          <div class="list-info">
            <FluentIcon icon="people-list-16-regular" :width="16" class="list-icon" />
            <template v-if="editingListId === list.id">
              <FluentInput v-model="editListNameValue" :placeholder="lang === 'en' ? 'List name' : '名单名称'" @enter="saveListName(list.id)" />
              <FluentButton variant="primary" size="sm" icon-only @click="saveListName(list.id)">
                <FluentIcon icon="checkmark-16-regular" :width="14" />
              </FluentButton>
              <FluentButton variant="subtle" size="sm" icon-only @click="editingListId = null">
                <FluentIcon icon="dismiss-16-regular" :width="14" />
              </FluentButton>
            </template>
            <template v-else>
              <span class="list-name person-list-name">{{ list.name }}</span>
              <span class="list-member-count">{{ list.names.length }} {{ lang === 'en' ? 'people' : '人' }}</span>
              <span v-if="list.id === namesStore.currentListId" class="current-badge">{{ lang === 'en' ? 'Current' : '当前' }}</span>
            </template>
          </div>
          <div class="list-actions">
            <FluentButton v-if="editingListId !== list.id" variant="subtle" size="sm" icon-only @click="startEditListName(list)">
              <FluentIcon icon="edit-16-regular" :width="14" />
            </FluentButton>
            <FluentButton v-if="list.id !== namesStore.currentListId" variant="subtle" size="sm" @click="namesStore.switchList(list.id)">
              <FluentIcon icon="checkmark-16-regular" :width="14" /> {{ lang === 'en' ? 'Switch' : '切换' }}
            </FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only :title="lang === 'en' ? 'Export list' : '导出名单'" @click="openExport(list)">
              <FluentIcon icon="arrow-download-16-regular" :width="14" />
            </FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only :disabled="namesStore.allLists.length <= 1" @click="deleteList(list)">
              <FluentIcon icon="delete-16-regular" :width="14" />
            </FluentButton>
          </div>
        </div>
        <div v-if="namesStore.allLists.length === 0" class="empty-list">
          {{ lang === 'en' ? 'No lists' : '暂无名单' }}
        </div>
      </div>
    </FluentCard>

    <!-- 导入名单 -->
    <FluentCard class="import-section">
      <h2 class="section-title">{{ lang === 'en' ? 'Import List' : '导入名单' }}</h2>
      <FluentButton variant="secondary" size="sm" @click="importList">
        <FluentIcon icon="arrow-upload-16-regular" :width="14" /> {{ lang === 'en' ? 'Import CSV / JSON' : '导入 CSV / JSON' }}
      </FluentButton>
    </FluentCard>

    <FluentModal v-model="showExportModal" :title="lang === 'en' ? 'Export list' : '导出名单'">
      <div class="export-form">
        <div class="export-list-name">{{ pendingExportList?.name }}</div>
        <label class="export-label">{{ lang === 'en' ? 'File format' : '文件格式' }}</label>
        <FluentTabs v-model="exportFormat" :options="exportFormatOptions" />
      </div>
      <template #footer>
        <FluentButton variant="subtle" @click="showExportModal = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton>
        <FluentButton variant="primary" @click="exportList">
          <FluentIcon icon="arrow-download-16-regular" :width="14" /> {{ lang === 'en' ? 'Export' : '导出' }}
        </FluentButton>
      </template>
    </FluentModal>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'
import { emitFileNotice, openTextFile, saveTextFile } from '../utils/desktopFiles'
import { parseListFile, serializeListFile } from '../utils/listFile'

const router = useRouter()
const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)
const showBanner = inject('banner')

const newListName = ref('')
const editingListId = ref(null)
const editListNameValue = ref('')
const showExportModal = ref(false)
const pendingExportList = ref(null)
const exportFormat = ref('csv')
const exportFormatOptions = computed(() => [
  { value: 'csv', label: 'CSV', icon: 'table-16-regular' },
  { value: 'json', label: 'JSON', icon: 'code-16-regular' }
])

function createList() {
  if (!newListName.value.trim()) return
  namesStore.createList(newListName.value)
  newListName.value = ''
}

function startEditListName(list) {
  editingListId.value = list.id
  editListNameValue.value = list.name
}

function saveListName(listId) {
  if (!editListNameValue.value.trim()) return
  const list = namesStore.allLists.find(l => l.id === listId)
  if (list) {
    list.name = editListNameValue.value.trim()
    namesStore.save()
  }
  editingListId.value = null
}

function deleteList(list) {
  if (namesStore.allLists.length <= 1) return
  const deletedList = JSON.parse(JSON.stringify(list))
  const wasCurrent = list.id === namesStore.currentListId
  namesStore.deleteList(list.id)
  showBanner({
    message: lang.value === 'en' ? 'List deleted' : '名单已删除',
    privateDetail: deletedList.name,
    icon: 'delete-16-regular',
    type: 'warning',
    duration: 8000,
    undoAction: () => {
      namesStore.restoreList(deletedList)
      if (wasCurrent) namesStore.switchList(deletedList.id)
    }
  })
}

function openExport(list) {
  pendingExportList.value = list
  exportFormat.value = 'csv'
  showExportModal.value = true
}

async function exportList() {
  const list = pendingExportList.value
  if (!list) return
  const format = exportFormat.value === 'json' ? 'json' : 'csv'
  const safeName = list.name.replace(/[<>:"/\\|?*]/g, '_')
  const result = await saveTextFile(serializeListFile(list, format), `${safeName}.${format}`, format)
  if (result?.success) {
    showExportModal.value = false
    showBanner({ message: lang.value === 'en' ? 'Exported' : '导出成功', privateDetail: list.name, icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  } else if (!result?.cancelled) {
    showBanner({ message: lang.value === 'en' ? 'Export failed' : '导出失败', privateDetail: result?.error, icon: 'warning-16-regular', type: 'warning', duration: 8000 })
  }
}

async function importList() {
  const result = await openTextFile(['csv', 'json'])
  if (!result?.success) {
    if (!result?.cancelled) showBanner({ message: lang.value === 'en' ? 'Import failed' : '导入失败', privateDetail: result?.error, icon: 'warning-16-regular', type: 'warning', duration: 8000 })
    return
  }
  try {
    const { list: data } = parseListFile(result.content)
    const imported = await namesStore.importList(data)
    if (!imported) throw new Error(lang.value === 'en' ? 'Invalid list structure' : '名单结构无效')
    if (result.filePath) emitFileNotice(`${lang.value === 'en' ? 'List imported' : '名单已导入'}：${result.filePath}`, result.filePath)
    showBanner({ message: lang.value === 'en' ? 'Imported' : '导入成功', privateDetail: data.name, icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  } catch (error) {
    showBanner({ message: lang.value === 'en' ? 'Import failed' : '导入失败', privateDetail: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 })
  }
}
</script>

<style scoped>
.list-manage-view {
  padding: 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* 顶部区域 */
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.list-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}

.page-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

/* 区块标题 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

/* 创建名单 */
.create-section {
  flex-shrink: 0;
}

.create-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.create-row .fluent-input-wrapper {
  flex: 1;
  min-width: 0;
}

/* 名单列表 */
.list-table-card {
  padding: 0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 128px;
}

.list-table-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-count {
  font-size: 13px;
  color: var(--text-muted);
}

.list-table {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-default);
  transition: background var(--duration-fast) ease;
  gap: 12px;
}

.list-row:last-child {
  border-bottom: none;
}

.list-row:hover {
  background: var(--bg-hover);
}

.list-row.active {
  background: var(--accent-50);
}

.dark .list-row.active {
  background: rgba(234, 94, 193, 0.1);
}

.list-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.list-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.list-name {
  font-weight: 500;
  color: var(--text-primary);
}

.list-member-count {
  font-size: 12px;
  color: var(--text-muted);
}

.current-badge {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-50);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.dark .current-badge {
  background: rgba(234, 94, 193, 0.15);
}

.list-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.empty-list {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* 导入名单 */
.import-section {
  flex-shrink: 0;
}

.export-form { display: flex; flex-direction: column; gap: 10px; }
.export-list-name { color: var(--text-primary); font-weight: 600; }
.export-label { color: var(--text-muted); font-size: 12px; }
</style>
