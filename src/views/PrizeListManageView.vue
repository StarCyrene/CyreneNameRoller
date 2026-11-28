<template>
  <div class="prize-list-manage-view" :inert="saving">
    <header class="list-header">
      <div class="list-header-left">
        <FluentButton variant="subtle" size="sm" icon-only :title="lang === 'en' ? 'Back' : '返回'" @click="router.back()"><FluentIcon icon="arrow-left-16-regular" :width="18" /></FluentButton>
        <FluentIcon icon="clipboard-task-list-24-regular" :width="22" />
        <h1>{{ lang === 'en' ? 'Prize List Management' : '奖品单管理' }}</h1>
      </div>
    </header>

    <FluentCard class="create-section">
      <h2>{{ lang === 'en' ? 'Create prize list' : '新建奖品单' }}</h2>
      <div class="create-row">
        <FluentInput v-model="newListName" :placeholder="lang === 'en' ? 'New prize list name' : '新奖品单名称'" @enter="createList" />
        <FluentButton variant="primary" size="sm" @click="createList"><FluentIcon icon="add-16-regular" :width="14" />{{ lang === 'en' ? 'Create' : '新建奖品单' }}</FluentButton>
      </div>
    </FluentCard>

    <FluentCard class="list-table-card">
      <div class="table-heading">
        <h2>{{ lang === 'en' ? 'All prize lists' : '所有奖品单' }}</h2>
        <div class="export-format"><span>{{ lang === 'en' ? 'Export format' : '导出格式' }}</span><FluentSelect v-model="exportFormat" :options="formatOptions" width="120px" /></div>
        <span>{{ allLists.length }} {{ lang === 'en' ? 'lists' : '个奖品单' }}</span>
      </div>
      <div class="list-table">
        <div v-for="list in allLists" :key="list.id" class="list-row" :class="{ active: list.id === prizes.currentId }">
          <div class="list-info">
            <FluentIcon icon="clipboard-bullet-list-16-regular" :width="17" />
            <template v-if="editingListId === list.id">
              <FluentInput v-model="editListName" @enter="saveListName(list.id)" />
              <FluentButton variant="primary" size="sm" icon-only title="保存" @click="saveListName(list.id)"><FluentIcon icon="checkmark-16-regular" :width="14" /></FluentButton>
              <FluentButton variant="subtle" size="sm" icon-only title="取消" @click="editingListId = ''"><FluentIcon icon="dismiss-16-regular" :width="14" /></FluentButton>
            </template>
            <template v-else>
              <div class="list-name"><strong class="prize-list-name">{{ list.name }}</strong><small>{{ list.prizes.length }} {{ lang === 'en' ? 'prizes' : '项奖品' }} · {{ stockOf(list) }} {{ lang === 'en' ? 'in stock' : '件库存' }}</small></div>
              <span v-if="list.id === prizes.currentId" class="current-badge">{{ lang === 'en' ? 'Current' : '当前' }}</span>
            </template>
          </div>
          <div v-if="editingListId !== list.id" class="list-actions">
            <FluentButton v-if="list.id !== prizes.currentId" variant="subtle" size="sm" @click="writeList(() => prizes.switchList(list.id))"><FluentIcon icon="checkmark-16-regular" :width="14" />{{ lang === 'en' ? 'Switch' : '切换' }}</FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only :title="lang === 'en' ? 'Rename' : '重命名'" @click="startRename(list)"><FluentIcon icon="edit-16-regular" :width="14" /></FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only :title="lang === 'en' ? 'Export' : '导出'" @click="exportList(list)"><FluentIcon icon="arrow-download-16-regular" :width="14" /></FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only :disabled="allLists.length <= 1" :title="lang === 'en' ? 'Delete' : '删除'" @click="confirmDelete(list)"><FluentIcon icon="delete-16-regular" :width="14" /></FluentButton>
          </div>
        </div>
      </div>
    </FluentCard>

    <FluentCard class="import-section">
      <div><h2>{{ lang === 'en' ? 'Import prize list' : '导入奖品单' }}</h2><p>{{ lang === 'en' ? 'A valid file is added as a new prize list.' : '有效文件会作为新的奖品单添加，不覆盖现有内容。' }}</p></div>
      <div class="import-actions"><span>{{ lang === 'en' ? 'Import format' : '导入格式' }}</span><FluentSelect v-model="importFormat" :options="formatOptions" width="120px" /><FluentButton variant="secondary" size="sm" @click="importList"><FluentIcon icon="arrow-upload-16-regular" :width="14" />{{ lang === 'en' ? 'Import' : '导入' }}</FluentButton></div>
    </FluentCard>

    <FluentModal v-model="showDelete" :title="lang === 'en' ? 'Delete prize list' : '删除奖品单'">
      <p>{{ lang === 'en' ? 'Delete this prize list? This cannot be undone.' : '确定删除这个奖品单吗？此操作无法撤销。' }} <strong translate="no">{{ deletingList?.name }}</strong></p>
      <template #footer><FluentButton variant="secondary" @click="showDelete = false">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton><FluentButton variant="danger" @click="deleteList">{{ lang === 'en' ? 'Delete' : '删除' }}</FluentButton></template>
    </FluentModal>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePrizesStore } from '../stores/prizes'
import { useSettingsStore } from '../stores/settings'
import { emitFileNotice, openTextFile, saveTextFile } from '../utils/desktopFiles'
import { parsePrizeListCsv, serializePrizeListCsv } from '../utils/prizeCsv'

const router = useRouter()
const prizes = usePrizesStore()
const settingsStore = useSettingsStore()
const showBanner = inject('banner')
const lang = computed(() => settingsStore.settings.language)
const allLists = computed(() => Object.values(prizes.lists))
const newListName = ref('')
const editingListId = ref('')
const editListName = ref('')
const exportFormat = ref('json')
const importFormat = ref('json')
const formatOptions = [{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }]
const showDelete = ref(false)
const deletingList = ref(null)

function stockOf(list) { return list.prizes.reduce((sum, prize) => sum + prize.quantity, 0) }
function notifyError(message, privateDetail) { showBanner({ message, privateDetail, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) }
const saving = ref(false)
async function writeList(action) {
  if (saving.value) return false
  saving.value = true
  try {
    const value = await action()
    if (!value) throw new Error(lang.value === 'en' ? 'The list could not be changed.' : '未能修改奖品单。')
    return value
  } catch (error) { notifyError(error?.message || String(error)); return false }
  finally { saving.value = false }
}
async function createList() {
  if (!newListName.value.trim()) return notifyError(lang.value === 'en' ? 'Enter a prize list name' : '请输入奖品单名称')
  if (await writeList(() => prizes.createList(newListName.value))) newListName.value = ''
}
function startRename(list) { editingListId.value = list.id; editListName.value = list.name }
async function saveListName(id) { if (await writeList(() => prizes.renameList(id, editListName.value))) editingListId.value = '' }
function confirmDelete(list) { deletingList.value = list; showDelete.value = true }
async function deleteList() {
  if (deletingList.value && await writeList(() => prizes.removeList(deletingList.value.id))) { deletingList.value = null; showDelete.value = false }
}
async function exportList(list) {
  const extension = exportFormat.value
  const safeName = list.name.replace(/[<>:"/\\|?*]/g, '_')
  const content = extension === 'csv' ? serializePrizeListCsv(list) : JSON.stringify(list, null, 2)
  const result = await saveTextFile(content, `${safeName}.${extension}`, extension)
  if (result?.success) showBanner({ message: lang.value === 'en' ? 'Prize list exported' : '奖品单导出成功', icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  else if (!result?.cancelled) notifyError(lang.value === 'en' ? 'Export failed' : '导出失败', result?.error)
}
async function importList() {
  const result = await openTextFile(importFormat.value)
  if (!result?.success) { if (!result?.cancelled) notifyError(lang.value === 'en' ? 'Import failed' : '导入失败', result?.error); return }
  try {
    const value = importFormat.value === 'csv' ? parsePrizeListCsv(result.content) : JSON.parse(result.content)
    const imported = await writeList(() => prizes.importList(value))
    if (!imported) return
    if (!imported.success) throw new Error(imported.error)
    if (result.filePath) emitFileNotice(`${lang.value === 'en' ? 'Prize list imported' : '奖品单已导入'}：${result.filePath}`, result.filePath)
    showBanner({ message: lang.value === 'en' ? 'Imported' : '导入成功', privateDetail: imported.list.name, icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 })
  } catch (error) { notifyError(lang.value === 'en' ? 'Invalid prize list' : '奖品单格式无效', error.message) }
}
onMounted(() => prizes.initialize())
</script>

<style scoped>
.prize-list-manage-view { padding: 32px; height: 100%; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.list-header { display: flex; align-items: center; justify-content: space-between; }
.list-header-left { display: flex; align-items: center; gap: 10px; color: var(--text-primary); }
.list-header h1 { margin: 0; font-family: var(--font-display); font-size: 20px; }
.create-section, .import-section { flex: 0 0 auto; }
.create-section h2, .table-heading h2, .import-section h2 { margin: 0; color: var(--text-secondary); font-size: 14px; }
.create-row { margin-top: 12px; display: flex; gap: 8px; }
.create-row > :first-child { flex: 1; }
.list-table-card { padding: 0; flex: 1; min-height: 180px; display: flex; flex-direction: column; overflow: hidden; }
.table-heading { padding: 12px 20px; display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 18px; border-bottom: 1px solid var(--border-default); }
.table-heading span { color: var(--text-muted); font-size: 12px; }
.export-format { display: flex; align-items: center; gap: 8px; }
.list-table { flex: 1; overflow-y: auto; }
.list-row { min-height: 66px; padding: 11px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-default); transition: background var(--duration-fast) ease; }
.list-row:last-child { border-bottom: 0; }
.list-row:hover { background: var(--bg-hover); }
.list-row.active { background: var(--accent-50); }
.list-info { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
.list-name { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.list-name strong { color: var(--text-primary); }
.list-name small { color: var(--text-muted); font-size: 12px; }
.current-badge { padding: 2px 8px; border-radius: var(--radius-sm); color: var(--accent); background: var(--bg-card-solid); font-size: 11px; }
.list-actions { display: flex; gap: 4px; }
.import-section { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.import-section p { margin: 5px 0 0; color: var(--text-muted); font-size: 12px; }
.import-actions { display: flex; align-items: center; gap: 8px; }
.import-actions > span { color: var(--text-muted); font-size: 12px; }
@media (max-width: 720px) { .prize-list-manage-view { padding: 20px 14px; } .list-row { align-items: flex-start; flex-direction: column; } .list-actions { width: 100%; justify-content: flex-end; } .import-section { align-items: stretch; flex-direction: column; } }
</style>
