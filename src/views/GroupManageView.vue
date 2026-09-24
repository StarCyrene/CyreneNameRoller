<template>
  <div class="group-manage-view">
    <!-- 顶部区域 -->
    <div class="gm-header">
      <div class="gm-header-left">
        <FluentButton variant="subtle" size="sm" icon-only @click="goBack">
          <FluentIcon icon="fluent:arrow-left-24-regular" :width="18" />
        </FluentButton>
        <FluentIcon icon="fluent:group-24-regular" :width="22" />
        <h1 class="page-title">{{ t('groupManage', lang) }}</h1>
      </div>
    </div>

    <!-- 工具条：选择人员名单 + 新建小组 -->
    <FluentCard class="gm-toolbar">
      <div class="field">
        <label class="field-label">{{ t('selectList', lang) }}</label>
        <FluentSelect v-model="selectedListId" :options="listOptions" />
      </div>
      <FluentButton variant="primary" size="sm" @click="openCreate">
        <FluentIcon icon="fluent:add-16-regular" :width="14" /> {{ t('createGroup', lang) }}
      </FluentButton>
    </FluentCard>

    <!-- 小组列表 -->
    <FluentCard class="gm-groups">
      <div v-if="groups.length === 0" class="gm-empty">
        <FluentIcon icon="fluent:group-24-regular" :width="36" />
        <p class="gm-empty-title">{{ t('noGroups', lang) }}</p>
        <p class="gm-hint">{{ t('groupListHint', lang) }}</p>
      </div>
      <div v-else class="group-grid">
        <div v-for="g in groups" :key="g.id" class="group-card">
          <div class="group-card-main">
            <div class="group-name">{{ g.name }}</div>
            <div v-if="g.enName" class="group-en">{{ g.enName }}</div>
            <div class="group-meta">
              <span class="group-id">ID: {{ g.id }}</span>
              <span class="group-members">{{ t('groupMembers', lang) }}: {{ memberCount(g.id) }}</span>
            </div>
          </div>
          <div class="group-actions">
            <FluentButton variant="subtle" size="sm" icon-only @click="openEdit(g)">
              <FluentIcon icon="fluent:edit-16-regular" :width="14" />
            </FluentButton>
            <FluentButton variant="subtle" size="sm" icon-only @click="removeGroup(g)">
              <FluentIcon icon="fluent:delete-16-regular" :width="14" />
            </FluentButton>
          </div>
        </div>
      </div>
    </FluentCard>

    <!-- 新建 / 编辑小组 -->
    <FluentModal
      v-model="showModal"
      :title="editingGroupId ? t('editGroup', lang) : t('createGroup', lang)"
    >
      <div class="gm-form">
        <div class="field">
          <label class="field-label">{{ t('groupName', lang) }} <span class="req">*</span></label>
          <FluentInput v-model="formName" :placeholder="t('groupName', lang)" />
        </div>
        <div class="field">
          <label class="field-label">{{ t('groupEnName', lang) }}</label>
          <FluentInput v-model="formEnName" :placeholder="t('groupEnName', lang)" />
        </div>
        <div class="field">
          <label class="field-label">{{ t('groupId', lang) }} <span class="req">*</span></label>
          <FluentInput v-model="formId" :placeholder="t('groupId', lang)" />
        </div>
        <div v-if="formError" class="form-error">{{ formError }}</div>
      </div>
      <template #footer>
        <FluentButton variant="subtle" @click="showModal = false">{{ t('cancel', lang) }}</FluentButton>
        <FluentButton variant="primary" @click="saveGroup">{{ t('save', lang) }}</FluentButton>
      </template>
    </FluentModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'

const router = useRouter()
const namesStore = useNamesStore()
const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)

const listOptions = computed(() =>
  namesStore.allLists.map(l => ({ value: l.id, label: l.name }))
)
const selectedListId = ref(namesStore.currentListId)
watch(
  () => namesStore.currentListId,
  id => {
    if (id && namesStore.nameLists[id]) selectedListId.value = id
  },
  { immediate: true }
)
onMounted(async () => {
  await namesStore.initialize()
  if (namesStore.nameLists[namesStore.currentListId]) {
    selectedListId.value = namesStore.currentListId
  }
})
const groups = computed(() => namesStore.listGroups(selectedListId.value))

function memberCount(groupId) {
  return namesStore.groupMemberCount(selectedListId.value, groupId)
}

function goBack() {
  router.push('/roller')
}

const showModal = ref(false)
const editingGroupId = ref(null)
const formName = ref('')
const formEnName = ref('')
const formId = ref('')
const formError = ref('')

function openCreate() {
  editingGroupId.value = null
  formName.value = ''
  formEnName.value = ''
  formId.value = ''
  formError.value = ''
  showModal.value = true
}

function openEdit(g) {
  editingGroupId.value = g.id
  formName.value = g.name
  formEnName.value = g.enName || ''
  formId.value = g.id
  formError.value = ''
  showModal.value = true
}

function saveGroup() {
  const name = formName.value.trim()
  const enName = formEnName.value
  const id = formId.value.trim()
  if (!name) { formError.value = t('groupNameRequired', lang.value); return }
  if (!id) { formError.value = t('groupIdRequired', lang.value); return }
  const existing = namesStore.listGroups(selectedListId.value)
  if (existing.some(g => g.id === id && g.id !== editingGroupId.value)) {
    formError.value = t('groupIdDuplicate', lang.value)
    return
  }
  if (editingGroupId.value) {
    namesStore.updateGroup(selectedListId.value, editingGroupId.value, { name, enName, id })
  } else {
    namesStore.addGroup(selectedListId.value, { id, name, enName })
  }
  showModal.value = false
}

function removeGroup(g) {
  if (window.confirm(t('deleteGroupConfirm', lang.value))) {
    namesStore.deleteGroup(selectedListId.value, g.id)
  }
}
</script>

<style scoped>
.group-manage-view {
  padding: 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.gm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.gm-header-left {
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

.gm-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
}

.gm-toolbar .field {
  flex: 1;
  max-width: 360px;
}

.gm-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.gm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 20px;
  color: var(--text-muted);
  text-align: center;
}

.gm-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.gm-hint {
  font-size: 12px;
  margin: 0;
  max-width: 320px;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 4px;
}

.group-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) ease, background var(--duration-fast) ease;
}

.group-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.group-card-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-name {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-en {
  font-size: 12px;
  color: var(--text-muted);
}

.group-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.group-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.gm-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.req {
  color: #c42b1c;
}

.form-error {
  color: #c42b1c;
  font-size: 13px;
}
</style>
