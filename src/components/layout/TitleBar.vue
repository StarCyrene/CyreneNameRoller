<template>
  <div v-if="isDesktopApp" class="titlebar" data-plugin-component="app.title-bar" :style="pluginsStore.componentStyleStyle('app.title-bar')">
    <button class="titlebar-hamburger" @click="$emit('toggle-dock')" :aria-expanded="!dockCollapsed" :title="dockCollapsed ? '展开' : '收起'">
      <Icon icon="fluent:line-horizontal-3-20-regular" :width="18" />
    </button>
    <img src="/icon.png" class="titlebar-logo" alt="" draggable="false" @mousedown="startNativeDrag" />
    <span class="titlebar-app-title" @mousedown="startNativeDrag">Cyreneの随机点名器</span>
    <div v-if="notice.message" class="titlebar-notice" :title="notice.message">
      <div ref="noticeViewport" class="titlebar-notice-viewport"><span ref="noticeText">{{ notice.message }}</span></div>
      <button v-if="notice.path" @click="openDataLocation"><Icon icon="fluent:folder-open-16-regular" :width="14" />打开位置</button>
    </div>
    <div class="titlebar-drag" @mousedown="startNativeDrag">
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-btn minimize-btn" @click="minimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor"/>
        </svg>
      </button>
      <button class="titlebar-btn maximize-btn" @click="maximize" :title="isMaximized ? '还原' : '最大化'">
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="3.5" y="1" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none"/>
          <rect x="1.5" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none" class="restore-back"/>
        </svg>
      </button>
      <button class="titlebar-btn close-btn" @click="hideToTray" title="最小化到托盘">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" class="close-icon">
          <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { isTauri } from '../../utils/tauriAPI'
import { usePluginsStore } from '../../plugins/store'
import { revealFile } from '../../utils/desktopFiles'

defineProps({ dockCollapsed: Boolean })
defineEmits(['toggle-dock'])
const pluginsStore = usePluginsStore()
const isMaximized = ref(false)
const notice = ref({ message: '', path: '' })
const noticeViewport = ref(null)
const noticeText = ref(null)
let noticeTimer
let noticeAnimation

const isDesktopApp = computed(() => isTauri())

function minimize() {
  if (isTauri()) import('@tauri-apps/api/window').then(w => w.getCurrentWindow().minimize())
}

function hideToTray() {
  if (isTauri()) import('@tauri-apps/api/core').then(m => m.invoke('hide_to_tray'))
}

async function startNativeDrag(e) {
  if (!isTauri() || e.button !== 0) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch {}
}
async function startNoticeAnimation() {
  await nextTick()
  noticeAnimation?.cancel()
  const viewport = noticeViewport.value
  const text = noticeText.value
  if (!viewport || !text) return
  const distance = Math.ceil(text.scrollWidth - viewport.clientWidth)
  if (distance <= 0) {
    noticeTimer = setTimeout(() => { notice.value = { message: '', path: '' } }, 8000)
    return
  }
  const pause = 3000
  const travel = Math.max(1600, distance / 48 * 1000)
  const duration = pause + travel
  noticeAnimation = text.animate([
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: pause / duration },
    { transform: `translateX(-${distance}px)`, offset: 1 }
  ], { duration, iterations: 1, easing: 'linear', fill: 'forwards' })
  noticeAnimation.onfinish = () => { notice.value = { message: '', path: '' } }
}
function onDataSaved(event) {
  notice.value = {
    message: event.detail?.message || `已保存：${event.detail?.location || ''}`,
    path: event.detail?.path || event.detail?.location || ''
  }
  clearTimeout(noticeTimer)
  startNoticeAnimation()
}
function openDataLocation() {
  if (notice.value.path) revealFile(notice.value.path)
  else if (isTauri()) import('@tauri-apps/api/core').then(m => m.invoke('show_data_location'))
}

async function maximize() {
  if (isTauri()) {
    const w = await import('@tauri-apps/api/window')
    const win = w.getCurrentWindow()
    const maxed = await win.isMaximized()
    maxed ? await win.unmaximize() : await win.maximize()
    isMaximized.value = await win.isMaximized()
  }
}

onMounted(async () => {
  window.addEventListener('cyrene:data-saved', onDataSaved)
  if (isTauri()) {
    const w = await import('@tauri-apps/api/window')
    isMaximized.value = await w.getCurrentWindow().isMaximized()
  }
})
onBeforeUnmount(() => { window.removeEventListener('cyrene:data-saved', onDataSaved); clearTimeout(noticeTimer); noticeAnimation?.cancel() })
</script>

<style scoped>
.titlebar {
  height: var(--plugin-component-app-title-bar-density, 40px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--plugin-component-app-title-bar-background, var(--bg-acrylic));
  color: var(--plugin-component-app-title-bar-foreground, var(--text-primary));
  font-family: var(--plugin-component-app-title-bar-font-family, var(--font-ui));
  font-size: var(--plugin-component-app-title-bar-font-size, inherit);
  font-weight: var(--plugin-component-app-title-bar-font-weight, inherit);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  user-select: none;
}

.titlebar-hamburger {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  outline: none;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.titlebar-hamburger:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}

.dark .titlebar-hamburger:hover {
  background: rgba(255, 255, 255, 0.08);
  gap: 10px;
  padding-left: 14px;
  height: 100%;
}

.titlebar-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  -webkit-app-region: drag;
  margin-right: 5px;
}

.titlebar-app-title {
  font-size: var(--plugin-component-app-title-bar-font-size, 14px);
  font-weight: var(--plugin-component-app-title-bar-font-weight, 600);
  color: var(--plugin-component-app-title-bar-foreground, var(--text-secondary));
  -webkit-app-region: drag;
  white-space: nowrap;
  margin-right: 8px;
}

.titlebar-drag {
  -webkit-app-region: drag;
  flex: 1;
  height: 100%;
}
.titlebar-notice { min-width: 0; width: min(420px, 38vw); display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-size:12px; -webkit-app-region:no-drag; }
.titlebar-notice-viewport { min-width: 0; flex: 1; overflow: hidden; }
.titlebar-notice span { display: inline-block; white-space: nowrap; }
.titlebar-notice button { display:inline-flex; align-items:center; gap:4px; border:0; background:transparent; color:var(--accent); font:inherit; cursor:pointer; white-space:nowrap; }

.titlebar-controls {
  display: flex;
  -webkit-app-region: no-drag;
  height: 100%;
}

.titlebar-btn {
  width: 50px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  outline: none;
}

.titlebar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}

.dark .titlebar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.close-btn:hover {
  background: #c42b1c !important;
  color: #ffffff !important;
}

.close-icon {
  transition: transform 0.4s cubic-bezier(0.1, 0.9, 0.2, 1);
}

.close-btn:hover .close-icon {
  transform: rotate(90deg);
}

.close-btn:not(:hover) .close-icon {
  transform: rotate(0deg);
  transition: transform 0.4s cubic-bezier(0.1, 0.9, 0.2, 1);
}

.restore-back {
  fill: var(--bg-acrylic);
}
</style>
