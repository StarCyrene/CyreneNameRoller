<template>
  <div class="plugin-page-view">
    <div v-if="plugin && (page || settingsModel)" class="plugin-page-shell">
      <div class="plugin-page-header">
        <div>
          <h1>{{ pageTitle }}</h1>
          <p>{{ plugin.manifest.name }} · v{{ plugin.manifest.version }}</p>
        </div>
        <div class="plugin-page-actions">
          <FluentButton
            v-for="command in pageCommands"
            :key="command.pluginId + ':' + command.id"
            variant="subtle"
            size="sm"
            @click="invokeCommand(command)"
          >
            <FluentIcon :icon="command.icon" :width="14" />
            {{ lang === 'en' && command.titleEn ? command.titleEn : command.title }}
          </FluentButton>
          <FluentButton variant="subtle" size="sm" @click="router.push('/plugins')">
            <FluentIcon icon="arrow-left-16-regular" :width="14" />
            {{ lang === 'en' ? 'Back' : '返回插件管理' }}
          </FluentButton>
        </div>
      </div>

      <PluginSettingsPanel
        v-if="settingsModel"
        :plugin-id="String(route.params.pluginId || '')"
        :model="settingsModel"
        :icon="settingsIcon"
        :heading="settingsHeading"
        :fallback-description="plugin.manifest.description || ''"
      />

      <div v-else class="plugin-frame-shell">
        <div v-if="loading" class="page-status"><FluentIcon icon="spinner-ios-20-regular" :width="20" />{{ lang === 'en' ? 'Loading plugin page…' : '正在加载插件页面…' }}</div>
        <div v-else-if="pageError" class="page-status error"><FluentIcon icon="warning-20-regular" :width="20" />{{ pageError }}</div>
        <iframe v-show="!loading && !pageError" ref="frameRef" class="plugin-frame" sandbox="allow-scripts" :srcdoc="source" @load="onFrameLoad"></iframe>
      </div>
    </div>
    <div v-else class="empty-state"><FluentIcon icon="warning-16-regular" :width="18" />{{ lang === 'en' ? 'Plugin page is unavailable.' : '插件页面不可用。' }}</div>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import PluginSettingsPanel from '../components/plugins/PluginSettingsPanel.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const plugins = usePluginsStore()
const showBanner = inject('banner')
const lang = computed(() => settingsStore.settings.language)
const frameRef = ref(null)
const source = ref('')
const loading = ref(true)
const pageError = ref('')
let mountGeneration = 0
let mountedFrameKey = null
const plugin = computed(() => plugins.pluginById(route.params.pluginId))
const isSettingsRoute = computed(() => route.name === 'PluginSettings' || route.name === 'SettingsPluginSettings')
const page = computed(() => (isSettingsRoute.value ? undefined : plugins.pageById(route.params.pluginId, route.params.pageId)))
const pageCommands = computed(() => (plugins.contributedCommands || []).filter(command => command.pluginId === route.params.pluginId && command.locations?.includes('page-header')).sort((left, right) => left.order - right.order))
const settingsModel = computed(() => {
  if (isSettingsRoute.value) {
    const settings = plugins.settingsFor(route.params.pluginId)
    return settings ? { title: settings.title, description: settings.description, storageKey: settings.storageKey, sections: settings.sections } : null
  }
  const native = page.value?.native
  if (native?.type !== 'settings') return null
  return {
    title: '',
    description: '',
    storageKey: native.settingsKey,
    sections: [{
      id: 'controls',
      title: '',
      description: '',
      fields: native.controls.map(control => (control.type === 'range' ? { ...control, type: 'slider' } : control))
    }]
  }
})
const settingsIcon = computed(() => (isSettingsRoute.value ? 'settings-24-regular' : page.value?.icon || 'settings-24-regular'))
const settingsHeading = computed(() => (lang.value === 'en' ? 'Plugin settings' : '插件设置'))
const pageTitle = computed(() => {
  if (isSettingsRoute.value || (settingsModel.value && !page.value)) return settingsHeading.value
  return page.value?.title || plugin.value?.manifest?.name || ''
})

function notify(message, type = 'info') {
  showBanner?.({
    message,
    type,
    icon: type === 'success' ? 'checkmark-circle-16-regular' : type === 'warning' ? 'warning-16-regular' : 'info-16-regular',
    duration: 4500,
    dismissible: true
  })
}
async function invokeCommand(command) {
  try {
    const result = await plugins.invokePluginCommand(command.pluginId, command.id, {})
    const summary = result && typeof result === 'object' && result.message ? String(result.message) : (lang.value === 'en' ? 'Command completed.' : '命令已完成。')
    notify(summary, 'success')
  } catch (error) {
    notify(error.message || String(error), 'warning')
  }
}

async function mountPluginPage() {
  const generation = ++mountGeneration
  const pluginId = String(route.params.pluginId || '')
  const pageId = String(route.params.pageId || '')
  const currentPlugin = plugins.pluginById(pluginId)
  const currentPage = isSettingsRoute.value ? undefined : plugins.pageById(pluginId, pageId)
  const hostsSettings = isSettingsRoute.value
    ? !!plugins.settingsFor(pluginId)
    : currentPage?.native?.type === 'settings'
  await nextTick()
  if (generation !== mountGeneration) return
  if (mountedFrameKey) {
    plugins.unmountPageFrame(mountedFrameKey.pluginId, mountedFrameKey.pageId)
    mountedFrameKey = null
  }
  loading.value = true
  pageError.value = ''
  source.value = ''
  if (!currentPlugin || (!currentPage && !hostsSettings)) { loading.value = false; return }
  if (hostsSettings) { loading.value = false; return }
  try {
    if (!frameRef.value) throw new Error(lang.value === 'en' ? 'Plugin frame is unavailable.' : '插件页面容器不可用。')
    plugins.mountPageFrame(frameRef.value, pluginId, pageId)
    if (currentPlugin.manifest.api === '1.5') plugins.setPageSurface(frameRef.value, pluginId, pageId)
    mountedFrameKey = { pluginId, pageId }
    source.value = plugins.pluginPageSource(pluginId, pageId)
    if (!source.value) throw new Error(lang.value === 'en' ? 'The plugin page has no compatible entry.' : '插件页面没有适用于当前平台的入口。')
  } catch (error) {
    if (mountedFrameKey?.pluginId === pluginId && mountedFrameKey?.pageId === pageId) {
      plugins.unmountPageFrame(pluginId, pageId)
      mountedFrameKey = null
    }
    if (generation !== mountGeneration) return
    loading.value = false
    pageError.value = error.message || String(error)
  }
}
function onFrameLoad() {
  try {
    if (plugin.value?.manifest.api === '1.5') plugins.setPageSurface(frameRef.value, String(route.params.pluginId || ''), String(route.params.pageId || ''))
    plugins.connectPageFrame(frameRef.value, String(route.params.pluginId || ''), String(route.params.pageId || ''))
  } catch (error) { pageError.value = error.message || String(error) }
  loading.value = false
}
watch(() => [route.params.pluginId, route.params.pageId, route.name], mountPluginPage, { flush: 'post' })
onMounted(async () => { await plugins.initialize(); await mountPluginPage() })
onBeforeUnmount(() => {
  mountGeneration += 1
  if (mountedFrameKey) plugins.unmountPageFrame(mountedFrameKey.pluginId, mountedFrameKey.pageId)
  mountedFrameKey = null
})
</script>

<style scoped>
.plugin-page-view { height: 100%; padding: 28px 32px 32px; overflow: auto; }
.plugin-page-shell { min-height: 100%; display: flex; flex-direction: column; gap: 22px; }
.plugin-page-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.plugin-page-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.plugin-page-header h1 { margin: 0; color: var(--text-primary); font-size: 26px; }
.plugin-page-header p { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; }
.plugin-frame-shell { flex: 1; min-height: 420px; display: flex; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-card-solid); overflow: hidden; }
.plugin-frame { flex: 1; width: 100%; min-height: 0; border: 0; background: var(--bg-card-solid); }
.page-status, .empty-state { flex: 1; min-height: 240px; display: flex; align-items: center; justify-content: center; gap: 9px; color: var(--text-muted); }
.page-status.error { color: var(--danger); }
@media (max-width: 760px) { .plugin-page-view { padding: 20px 14px; } .plugin-page-header { align-items: flex-start; flex-direction: column; } .plugin-page-actions { width: 100%; justify-content: flex-start; } }
</style>
