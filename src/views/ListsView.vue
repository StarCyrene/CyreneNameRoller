<template>
  <div class="lists-view">
    <!-- 顶部区域 -->
    <div class="list-header">
      <div class="list-header-left">
        <FluentIcon icon="people-list-24-regular" :width="22" />
        <h1 class="page-title">{{ t('listManager', lang) }}</h1>
      </div>
      <div class="list-header-right">
        <I18nDataSelect :model-value="namesStore.currentListId" :options="listOptions" @update:model-value="namesStore.switchList" />
        <FluentButton variant="primary" size="sm" @click="router.push({ name: 'QRSend', query: { kind: 'names' } })">
          {{ lang === 'en' ? 'Sync to phone' : '同步到手机' }}
        </FluentButton>
        <FluentButton variant="secondary" size="sm" @click="router.push({ name: 'QRReceive' })">
          {{ lang === 'en' ? 'Scan to receive' : '扫码接收' }}
        </FluentButton>
        <FluentButton variant="secondary" size="sm" @click="router.push('/lists/manage')">
          <FluentIcon icon="settings-16-regular" :width="14" /> {{ t('listManager', lang) }}
        </FluentButton>
      </div>
    </div>

    <!-- 添加栏 -->
    <FluentCard class="add-person-card">
      <div class="add-person-row">
        <FluentInput v-model="newCn" :placeholder="t('cnName', lang)" @enter="newEnRef?.focus()" />
        <FluentInput ref="newEnRef" v-model="newEn" :placeholder="t('enName', lang)" @enter="addPerson" />
        <FluentTabs v-model="newGender" :options="genderOptions" class="gender-tabs" />
        <FluentButton variant="primary" size="sm" @click="addPerson">
          <FluentIcon icon="add-16-regular" :width="14" /> {{ t('addPerson', lang) }}
        </FluentButton>
      </div>
    </FluentCard>

    <!-- 列表区域 -->
    <FluentCard class="person-list-card">
      <div class="person-list-header">
        <label class="select-all-label">
          <FluentCheckBox
            :model-value="allSelected ? true : someSelected ? null : false"
            :indeterminate="someSelected"
            @update:model-value="toggleSelectAll"
          />
          <span class="person-count">{{ namesStore.currentNames.length }} {{ lang === 'en' ? 'people' : '人' }}</span>
        </label>
        <Transition name="fade">
          <div v-if="selectedIndices.length > 0" class="batch-actions">
            <FluentButton variant="secondary" size="sm" @click="openBatchGroup">
              <FluentIcon icon="fluent:people-team-16-regular" :width="14" />
              {{ t('batchAssignGroup', lang) }}
            </FluentButton>
            <FluentButton variant="secondary" size="sm" @click="openBatchGender">
              <FluentIcon icon="fluent:person-settings-20-regular" :width="14" />
              {{ lang === 'en' ? 'Set gender' : '批量设置性别' }}
            </FluentButton>
            <FluentButton variant="danger" size="sm" @click="batchDelete">
              <FluentIcon icon="delete-16-regular" :width="14" />
              {{ lang === 'en' ? `Delete ${selectedIndices.length}` : `删除 ${selectedIndices.length} 项` }}
            </FluentButton>
          </div>
        </Transition>
      </div>
      <div class="person-list">
        <div v-for="(person, index) in namesStore.currentNames" :key="person.id" class="person-item" :class="{ editing: editingIndex === index }">
          <!-- 编辑模式 -->
          <template v-if="editingIndex === index">
            <div class="edit-row">
              <FluentInput v-model="editCn" style="flex:1;" :placeholder="t('cnName', lang)" />
              <FluentInput v-model="editEn" style="flex:1;" :placeholder="t('enName', lang)" />
              <I18nDataSelect v-model="editGroup" :options="groupOptions" :placeholder="t('groupOf', lang)" style="min-width: 150px;" />
              <FluentTabs v-model="editGender" :options="genderOptions" class="gender-tabs" />
              <FluentToggle v-model="editWhite" :label="t('whitelist', lang)" :title="t('whitelistHint', lang)" />
              <FluentButton variant="primary" size="sm" icon-only @click="saveEdit(index)"><FluentIcon icon="checkmark-16-regular" :width="14" /></FluentButton>
              <FluentButton variant="subtle" size="sm" icon-only @click="editingIndex = -1"><FluentIcon icon="dismiss-16-regular" :width="14" /></FluentButton>
            </div>
          </template>
          <!-- 显示模式 -->
          <template v-else>
            <label class="person-check-label">
              <FluentCheckBox :model-value="selectedSet.has(index)" @update:model-value="toggleSelect(index)" />
            </label>
            <div class="person-info">
              <div class="person-identity">
                <div class="person-name-line"><span class="person-cn">{{ person.cn }}</span><span class="person-en">{{ person.en }}</span></div>
                <span class="person-id" :title="person.id">{{ person.id }}</span>
              </div>
              <span v-if="person.isWhiteList" class="whitelist-badge">{{ lang === 'en' ? 'WL' : '白名单' }}</span>
              <span class="gender-badge" :class="person.gender === 'female' ? 'female' : 'male'">{{ person.gender === 'female' ? (lang === 'en' ? 'Female' : '女') : (lang === 'en' ? 'Male' : '男') }}</span>
              <span v-if="person.groupId" class="group-badge" translate="no">{{ groupNameOf(person.groupId) }}</span>
            </div>
            <div class="person-actions">
              <FluentButton variant="subtle" size="sm" icon-only @click="startEdit(index, person)">
                <FluentIcon icon="edit-16-regular" :width="14" />
              </FluentButton>
              <FluentButton variant="subtle" size="sm" icon-only @click="namesStore.deletePerson(index)">
                <FluentIcon icon="delete-16-regular" :width="14" />
              </FluentButton>
            </div>
          </template>
        </div>
        <div v-if="namesStore.currentNames.length === 0" class="empty-list">
          {{ lang === 'en' ? 'No names in this list' : '名单为空' }}
        </div>
      </div>
    </FluentCard>

    <!-- 批量设置小组 -->
    <FluentModal v-model="showBatchModal" :title="t('batchAssignGroup', lang)">
      <div class="field">
        <label class="field-label">{{ t('groupOf', lang) }}</label>
        <I18nDataSelect v-model="batchGroup" :options="groupOptions" :placeholder="t('unassigned', lang)" />
      </div>
      <p class="batch-note">{{ t('selectedCount', lang).replace('{n}', selectedIndices.length) }}</p>
      <template #footer>
        <FluentButton variant="subtle" @click="showBatchModal = false">{{ t('cancel', lang) }}</FluentButton>
        <FluentButton variant="primary" @click="applyBatchGroup">{{ t('apply', lang) }}</FluentButton>
      </template>
    </FluentModal>

    <FluentModal v-model="showBatchGenderModal" :title="lang === 'en' ? 'Set gender' : '批量设置性别'">
      <FluentTabs v-model="batchGender" :options="genderOptions" />
      <p class="batch-note">{{ t('selectedCount', lang).replace('{n}', selectedIndices.length) }}</p>
      <template #footer>
        <FluentButton variant="subtle" @click="showBatchGenderModal = false">{{ t('cancel', lang) }}</FluentButton>
        <FluentButton variant="primary" @click="applyBatchGender">{{ t('apply', lang) }}</FluentButton>
      </template>
    </FluentModal>
  </div>
</template>

<script setup>
import I18nDataSelect from '../components/I18nDataSelect.vue'
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { getCoreClient } from '../core/client'
import { t } from '../utils/i18n'

const router = useRouter()
const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const coreClient = getCoreClient()
const lang = computed(() => settingsStore.settings.language)
const showBanner = inject('banner')

const listOptions = computed(() => namesStore.allLists.map(l => ({ value: l.id, label: l.name })))

const currentGroups = computed(() => namesStore.currentList.groups || [])
const groupOptions = computed(() => [
  { value: '', uiLabel: true, label: t('unassigned', lang.value) },
  ...currentGroups.value.map(g => ({ value: g.id, label: g.name }))
])
function groupNameOf(id) {
  const g = currentGroups.value.find(x => x.id === id)
  return g ? g.name : (id || '')
}

const newCn = ref('')
const newEn = ref('')
const newGender = ref('male')
const newEnRef = ref(null)

const editingIndex = ref(-1)
const editCn = ref('')
const editEn = ref('')
const editGroup = ref('')
const editWhite = ref(false)
const editGender = ref('male')
const genderOptions = computed(() => [
  { value: 'male', label: lang.value === 'en' ? 'Male' : '男', icon: 'fluent:person-16-regular' },
  { value: 'female', label: lang.value === 'en' ? 'Female' : '女', icon: 'fluent:person-16-regular' }
])

const selectedSet = ref(new Set())
const selectedIndices = computed(() => [...selectedSet.value])
const allSelected = computed(() => namesStore.currentNames.length > 0 && selectedSet.value.size === namesStore.currentNames.length)
const someSelected = computed(() => selectedSet.value.size > 0 && !allSelected.value)

function toggleSelect(index) {
  const s = new Set(selectedSet.value)
  if (s.has(index)) s.delete(index)
  else s.add(index)
  selectedSet.value = s
}

function toggleSelectAll() {
  if (allSelected.value) { selectedSet.value = new Set(); return }
  const s = new Set()
  namesStore.currentNames.forEach((p, i) => s.add(i))
  selectedSet.value = s
}

async function addPerson() {
  if (!newCn.value.trim()) return
  const person = namesStore.addPerson(newCn.value, newEn.value, newGender.value)
  if (!person) return
  await namesStore.save()
  await coreClient.initializePersonCount({
    listId: namesStore.currentListId,
    personId: person.id,
    mode: settingsStore.settings.newMemberCountMode
  })
  newCn.value = ''
  newEn.value = ''
  newGender.value = 'male'
}

function startEdit(index, person) {
  editingIndex.value = index
  editCn.value = person.cn
  editEn.value = person.en
  editGroup.value = person.groupId || ''
  editWhite.value = !!person.isWhiteList
  editGender.value = person.gender === 'female' ? 'female' : 'male'
}

function saveEdit(index) {
  if (!editCn.value.trim()) return
  namesStore.editPerson(index, editCn.value, editEn.value, editGender.value)
  namesStore.assignGroup(namesStore.currentListId, index, editGroup.value)
  namesStore.currentNames[index].isWhiteList = editWhite.value
  namesStore.save()
  editingIndex.value = -1
}

const showBatchModal = ref(false)
const batchGroup = ref('')
function openBatchGroup() {
  batchGroup.value = ''
  showBatchModal.value = true
}
function applyBatchGroup() {
  namesStore.batchAssignGroup(namesStore.currentListId, selectedIndices.value, batchGroup.value)
  selectedSet.value = new Set()
  showBatchModal.value = false
}

const showBatchGenderModal = ref(false)
const batchGender = ref('male')
function openBatchGender() {
  batchGender.value = 'male'
  showBatchGenderModal.value = true
}
function applyBatchGender() {
  namesStore.batchSetGender(namesStore.currentListId, selectedIndices.value, batchGender.value)
  selectedSet.value = new Set()
  showBatchGenderModal.value = false
}

function batchDelete() {
  const indices = [...selectedIndices.value].sort((a, b) => b - a)
  const deletedPersons = indices.map(index => ({ index, person: { ...namesStore.currentNames[index] } }))
  indices.forEach(i => namesStore.deletePerson(i))
  selectedSet.value = new Set()
  showBanner({
    message: lang.value === 'en' ? `Deleted ${deletedPersons.length} names` : `已删除 ${deletedPersons.length} 个名字`,
    icon: 'delete-16-regular',
    type: 'warning',
    duration: 8000,
    undoAction: () => {
      deletedPersons
        .slice()
        .sort((left, right) => left.index - right.index)
        .forEach(({ index, person }) => namesStore.currentList.names.splice(index, 0, person))
      namesStore.save()
    }
  })
}
</script>

<style scoped>
.lists-view {
  padding: 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.list-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

/* 添加栏 */
.add-person-card {
  flex-shrink: 0;
}

.add-person-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-person-row .fluent-input-wrapper {
  flex: 1;
  min-width: 0;
}

.add-person-row .gender-tabs { flex: 0 0 150px; }

/* 列表区域 */
.person-list-card {
  padding: 0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.person-list-header {
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.person-count {
  font-size: 13px;
  color: var(--text-muted);
}

.person-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.person-item {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-default);
  transition: background var(--duration-fast) ease;
  gap: 8px;
}

.person-item:last-child {
  border-bottom: none;
}

.person-item:hover {
  background: var(--bg-hover);
}

.person-check-label {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.person-checkbox {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.person-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.person-cn {
  font-weight: 500;
  color: var(--text-primary);
}

.person-en {
  font-size: 12px;
  color: var(--text-muted);
}

.person-identity { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.person-name-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }

.person-id {
  color: var(--text-muted);
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.readonly-id {
  flex: 0 1 190px;
  padding: 5px 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
}

.whitelist-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.group-badge {
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-50);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gender-tabs { width: 150px; flex: 0 0 150px; }
.gender-tabs :deep(.fluent-tab) { min-height: 30px; padding: 0 8px; }
.gender-badge { padding: 2px 7px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 11px; color: var(--text-secondary); background: var(--bg-card-solid); }
.gender-badge.female { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--border-default)); }

.dark .group-badge {
  background: rgba(234, 94, 193, 0.15);
}

.person-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.edit-row {
  display: flex;
  gap: 8px;
  flex: 1;
  align-items: center;
  flex-wrap: wrap;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-note {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-list {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* 过渡动画 */
.fade-enter-active { transition: opacity 0.2s; }
.fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (orientation: portrait) and (max-width: 700px) {
  .lists-view { padding: 12px; gap: 10px; }
  .list-header { align-items: stretch; flex-direction: column; gap: 8px; }
  .list-header-right { justify-content: flex-start; }
  .add-person-row, .batch-actions, .person-list-header { flex-wrap: wrap; }
  .add-person-row .fluent-input-wrapper { flex: 1 1 40%; }
  .person-list-header, .person-item { padding: 8px; }
  .person-info { flex-wrap: wrap; }
  .person-identity { min-width: 5rem; }
}
</style>
