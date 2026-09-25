<template>
  <div class="plugin-settings-panel">
    <div v-if="loading" class="page-status">
      <FluentIcon icon="spinner-ios-20-regular" :width="20" />
      {{ lang === 'en' ? 'Loading plugin settings…' : '正在加载插件设置…' }}
    </div>
    <div v-else-if="loadError" class="page-status error">
      <FluentIcon icon="warning-20-regular" :width="20" />{{ loadError }}
    </div>
    <section v-else class="settings-card">
      <div class="settings-intro">
        <div class="settings-icon"><FluentIcon :icon="icon" :width="25" /></div>
        <div>
          <h2>{{ heading || (lang === 'en' ? 'Plugin settings' : '插件设置') }}</h2>
          <p>{{ model.description || fallbackDescription }}</p>
        </div>
      </div>

      <div v-for="section in model.sections" :key="section.id" class="settings-section">
        <div v-if="section.title || section.description" class="section-copy">
          <h3 v-if="section.title">{{ section.title }}</h3>
          <p v-if="section.description">{{ section.description }}</p>
        </div>
        <div class="settings-list">
          <div v-for="field in section.fields" :key="field.id" class="setting-row" :class="`control-${field.type}`">
            <div class="setting-copy">
              <strong>{{ field.label }}</strong>
              <span v-if="field.description">{{ field.description }}</span>
              <span v-if="field.type === 'audio'" class="file-name">{{ valueAt(field.path)?.name || (lang === 'en' ? 'No audio selected' : '尚未选择音频') }}</span>
            </div>

            <FluentToggle
              v-if="field.type === 'toggle' || field.type === 'checkbox'"
              :model-value="!!valueAt(field.path)"
              @update:model-value="updateValue(field, $event)"
            />

            <FluentToggle
              v-else-if="field.type === 'component-override-toggle'"
              :model-value="overrideToggleValue(field)"
              @update:model-value="updateOverrideToggle(field, $event)"
            />

            <div v-else-if="field.type === 'slider'" class="range-control">
              <input
                type="range"
                :min="field.min"
                :max="field.max"
                :step="field.step"
                :value="valueAt(field.path)"
                @input="previewRange(field, $event)"
                @change="commitRange(field, $event)"
              />
              <output>{{ rangeLabel(field) }}</output>
            </div>

            <FluentSelect
              v-else-if="field.type === 'select'"
              :model-value="valueAt(field.path)"
              :options="field.options"
              width="220px"
              @update:model-value="updateValue(field, $event)"
            />

            <FluentSelect
              v-else-if="isContributionSelect(field)"
              :model-value="contributionValue(field)"
              :options="contributionOptions(field)"
              width="250px"
              @update:model-value="updateContribution(field, $event)"
            />

            <div v-else-if="field.type === 'animation-select'" class="animation-actions">
              <div :ref="element => setAnimationPreviewRef(field.id, element)" class="animation-preview" aria-hidden="true">
                <FluentIcon icon="sparkle-20-filled" :width="18" />
              </div>
              <FluentSelect
                :model-value="animationValue(field)"
                :options="animationOptions(field)"
                width="250px"
                @update:model-value="updateAnimation(field, $event)"
              />
              <FluentButton variant="subtle" size="sm" @click="previewAnimation(field)">
                <FluentIcon icon="play-16-regular" :width="14" />{{ lang === 'en' ? 'Preview' : '预览' }}
              </FluentButton>
            </div>

            <div v-else-if="field.type === 'audio'" class="audio-actions">
              <FluentButton v-if="valueAt(field.path)?.dataUrl" variant="subtle" size="sm" @click="previewAudio(field)">
                <FluentIcon icon="play-16-regular" :width="14" />{{ lang === 'en' ? 'Preview' : '试听' }}
              </FluentButton>
              <FluentButton variant="secondary" size="sm" @click="chooseAudio(field)">
                <FluentIcon icon="folder-open-16-regular" :width="14" />{{ valueAt(field.path) ? (lang === 'en' ? 'Replace' : '更换') : (lang === 'en' ? 'Choose audio' : '选择音频') }}
              </FluentButton>
              <FluentButton v-if="valueAt(field.path)" variant="subtle" size="sm" icon-only @click="clearAudio(field)">
                <FluentIcon icon="delete-16-regular" :width="14" />
              </FluentButton>
            </div>
          </div>
        </div>
      </div>
      <div class="storage-note"><FluentIcon icon="lock-closed-16-regular" :width="14" />{{ lang === 'en' ? 'Plugin settings stay on this device. Core draw results remain controlled by the application.' : '插件设置仅保存在当前设备；核心抽取结果始终由程序管理。' }}</div>
    </section>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { usePluginsStore } from '../../plugins/store'

const props = defineProps({
  pluginId: { type: String, required: true },
  model: { type: Object, required: true },
  icon: { type: String, default: 'settings-24-regular' },
  heading: { type: String, default: '' },
  fallbackDescription: { type: String, default: '' }
})

const plugins = usePluginsStore()
const settingsStore = useSettingsStore()
const showBanner = inject('banner')
const lang = computed(() => settingsStore.settings.language)
const loading = ref(true)
const loadError = ref('')
const values = reactive({})
const animationPreviewRefs = new Map()
const contributionTypes = new Set(['component-style-select', 'component-override-select', 'result-presentation-select'])
const hostControlTypes = new Set([...contributionTypes, 'component-override-toggle', 'animation-select'])

function allFields() {
  return (props.model.sections || []).flatMap(section => section.fields || [])
}
function valueAt(path) { return values[path] }
function isHostSelect(field) { return hostControlTypes.has(field.type) }
function isContributionSelect(field) { return contributionTypes.has(field.type) }
function defaultFor(field) {
  if (field.default !== undefined) return field.default
  if (field.type === 'toggle' || field.type === 'checkbox') return false
  if (field.type === 'slider') return field.min
  return ''
}
function defaults() {
  return Object.fromEntries(allFields().filter(field => !isHostSelect(field)).map(field => [field.path, defaultFor(field)]))
}
async function saveValues() {
  const stored = Object.fromEntries(allFields().filter(field => !isHostSelect(field)).map(field => [field.path, values[field.path]]))
  await plugins.requestPlugin(props.pluginId, 'storage.write', { key: props.model.storageKey, value: stored })
}
function notify(message, type = 'info') {
  showBanner?.({
    message,
    type,
    icon: type === 'success' ? 'checkmark-circle-16-regular' : type === 'warning' ? 'warning-16-regular' : 'info-16-regular',
    duration: 4500,
    dismissible: true
  })
}
function contributionValue(field) {
  if (field.type === 'component-style-select') return plugins.componentStyleSelections[field.target] || ''
  if (field.type === 'component-override-select') return plugins.componentOverrideSelections[field.target] || ''
  return plugins.resultPresentationSelections[field.target] || ''
}
function contributionOptions(field) {
  const own = option => option.pluginId === props.pluginId
  const defaultOption = { value: '', label: lang.value === 'en' ? `Default: ${field.target}` : `默认：${field.target}` }
  if (field.type === 'component-style-select') return [defaultOption, ...plugins.componentStyleOptions(field.target, lang.value).filter(own)]
  if (field.type === 'component-override-select') return [defaultOption, ...plugins.componentOverrideOptions(field.target, lang.value).filter(own)]
  return [defaultOption, ...plugins.resultPresentationOptions(field.target, lang.value).filter(own)]
}
async function updateContribution(field, value) {
  try {
    if (field.type === 'component-style-select') await plugins.setComponentStyleSelection(field.target, value)
    else if (field.type === 'component-override-select') await plugins.setComponentOverrideSelection(field.target, value)
    else await plugins.setResultPresentationSelection(field.target, value)
  } catch (error) { notify(error.message || String(error), 'warning') }
}
function overrideToggleSelection(field) {
  return `plugin-component-override::${props.pluginId}::${field.packId}`
}
function overrideToggleValue(field) {
  return plugins.componentOverrideSelections[field.target] === overrideToggleSelection(field)
}
async function updateOverrideToggle(field, enabled) {
  try {
    await plugins.setComponentOverrideSelection(field.target, enabled ? overrideToggleSelection(field) : '')
  } catch (error) { notify(error.message || String(error), 'warning') }
}
async function updateValue(field, value) {
  values[field.path] = value
  try {
    await saveValues()
    if (field.path === 'durationScale') await plugins.setAnimationDurationScale(props.pluginId, value)
  } catch (error) { notify(error.message || String(error), 'warning') }
}
function previewRange(field, event) { values[field.path] = Number(event.target.value) }
async function commitRange(field, event) { await updateValue(field, Number(event.target.value)) }
function rangeLabel(field) {
  const value = Number(valueAt(field.path))
  if (field.path === 'durationScale') return `${Math.round(value * 100)}%`
  return field.min === 0 && field.max === 1 ? `${Math.round(value * 100)}%` : String(value)
}
async function chooseAudio(field) {
  try {
    const selected = await plugins.requestPlugin(props.pluginId, 'audio.select', { accept: field.accept })
    if (!selected) return
    values[field.path] = selected
    await saveValues()
    notify(
      lang.value === 'en' ? `Selected ${selected.name}. Use Preview to test it.` : `已选择 ${selected.name}，可点击“试听”进行测试。`,
      'success'
    )
  } catch (error) { notify(error.message || String(error), 'warning') }
}
async function previewAudio(field) {
  const audio = valueAt(field.path)
  if (!audio?.dataUrl) return
  try {
    const played = await plugins.requestPlugin(props.pluginId, 'audio.play', { source: audio.dataUrl, volume: Number(values.volume ?? 1) })
    if (!played) throw new Error(lang.value === 'en' ? 'The browser blocked audio playback.' : '浏览器阻止了音频播放，请再次点击试听。')
  } catch (error) { notify(error.message || String(error), 'warning') }
}
async function clearAudio(field) { await updateValue(field, null) }
function setAnimationPreviewRef(id, element) {
  if (element) animationPreviewRefs.set(id, element)
  else animationPreviewRefs.delete(id)
}
function animationValue(field) { return plugins.animationSelectionValue(field.target) }
function animationOptions(field) {
  return plugins.animationOptions(field.target, {
    pluginId: props.pluginId,
    packId: field.packId,
    language: lang.value
  })
}
async function updateAnimation(field, value) {
  try {
    await plugins.setAnimationSelection(field.target, value)
    previewAnimation(field)
  } catch (error) { notify(error.message || String(error), 'warning') }
}
function previewAnimation(field) {
  const element = animationPreviewRefs.get(field.id)
  const selection = animationValue(field)
  const variant = field.target === 'page.transition' ? 'forward.enter' : 'main'
  const run = plugins.startAnimation(field.target, element, { selection, variant })
  if (run || selection) {
    if (!run && selection) notify(lang.value === 'en' ? 'The selected animation could not be previewed.' : '所选动画暂时无法预览。', 'warning')
    return
  }
  if (element?.animate) {
    element.animate([
      { opacity: .45, transform: 'scale(.72) rotate(-10deg)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'scale(1.14) rotate(4deg)', filter: 'none', offset: .65 },
      { opacity: 1, transform: 'scale(1) rotate(0)', filter: 'none' }
    ], { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)' })
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  Object.keys(values).forEach(key => delete values[key])
  try {
    const saved = await plugins.requestPlugin(props.pluginId, 'storage.read', { key: props.model.storageKey })
    Object.assign(values, defaults(), saved || {})
    const durationField = allFields().find(field => field.path === 'durationScale')
    if (durationField) await plugins.setAnimationDurationScale(props.pluginId, Number(values.durationScale ?? durationField.default ?? 1))
  } catch (error) {
    loadError.value = error.message || String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => [props.pluginId, props.model.storageKey], load)
</script>

<style scoped>
.plugin-settings-panel { flex: 1; min-height: 0; }
/* 圆角裁剪必须用 overflow:clip：卡片比视口高，overflow:hidden 会让它变成不可滚动的滚动容器，
   指针永远落在卡片上，滚轮事件被吞掉，外层 .plugin-page-view 再也收不到滚动 */
.settings-card { max-width: 980px; margin: 0 auto; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-card); box-shadow: var(--shadow-2); overflow: clip; }
.settings-intro { display: flex; align-items: center; gap: 14px; padding: 22px 24px; border-bottom: 1px solid var(--border-subtle); background: linear-gradient(135deg, var(--accent-50), transparent 68%); }
.settings-icon { width: 46px; height: 46px; border-radius: var(--radius-md); display: grid; place-items: center; color: var(--accent); background: var(--bg-card-solid); border: 1px solid var(--border-default); box-shadow: var(--shadow-2); }
.settings-intro h2 { margin: 0; color: var(--text-primary); font-size: 18px; }
.settings-intro p { margin: 5px 0 0; color: var(--text-secondary); font-size: 13px; }
.section-copy { padding: 16px 24px 0; }
.section-copy h3 { margin: 0; color: var(--text-primary); font-size: 14px; }
.section-copy p { margin: 4px 0 0; color: var(--text-muted); font-size: 12px; }
.settings-list { padding: 4px 24px; }
.setting-row { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--border-subtle); }
.setting-row:last-child { border-bottom: 0; }
.setting-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.setting-copy strong { color: var(--text-primary); font-size: 14px; font-weight: 600; }
.setting-copy span { color: var(--text-muted); font-size: 12px; line-height: 1.45; }
.setting-copy .file-name { color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 520px; }
.range-control { min-width: 360px; display: flex; align-items: center; gap: 14px; }
.range-control input { flex: 1; accent-color: var(--accent); cursor: pointer; }
.range-control output { width: 42px; color: var(--text-primary); text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }
.audio-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
.animation-actions { min-width: 420px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
.animation-preview { width: 36px; height: 36px; display: grid; place-items: center; flex: 0 0 auto; color: var(--accent); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: radial-gradient(circle at 35% 28%, var(--accent-50), var(--bg-card-solid) 70%); box-shadow: var(--shadow-2); }
.storage-note { display: flex; align-items: center; gap: 7px; padding: 12px 24px; color: var(--text-muted); background: var(--bg-hover); border-top: 1px solid var(--border-subtle); font-size: 11px; }
.page-status { flex: 1; min-height: 240px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--text-muted); }
.page-status.error { color: var(--danger); }
@media (max-width: 760px) { .setting-row { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px 0; } .range-control { width: 100%; min-width: 0; } .audio-actions, .animation-actions { width: 100%; min-width: 0; justify-content: flex-start; flex-wrap: wrap; } }
</style>
