<template>
  <nav ref="dockRef" class="dock" data-plugin-component="navigation.dock" :class="{ collapsed: dockCollapsed, 'secondary-open': Boolean(activeSecondaryMenu) }" :style="pluginsStore.componentStyleStyle('navigation.dock')">
    <div
      v-show="indicatorVisible"
      ref="indicatorRef"
      class="dock-shared-indicator"
      aria-hidden="true"
    />

    <div ref="dockPrimaryRef" class="dock-primary">
      <div v-if="!isDesktopApp" class="dock-top">
        <button class="dock-toggle" @click="toggleDock" :title="dockCollapsed ? '展开' : '收起'">
          <Icon icon="fluent:line-horizontal-3-20-regular" :width="18" />
        </button>
        <template v-if="!dockCollapsed">
          <img src="/icon.png" class="dock-logo-img" alt="" />
          <span class="dock-logo-text">Cyreneの随机点名器</span>
        </template>
      </div>

      <div class="dock-items">
        <template v-for="item in mainItems" :key="item.id">
          <router-link
            v-if="item.to"
            :to="item.to"
            class="dock-item"
            :class="{ active: isPrimaryItemActive(item) }"
            draggable="false"
            :title="item.label[lang]"
            @click="closeSecondaryMenu"
          >
            <Icon :icon="item.icon" :width="20" class="dock-item-icon" />
            <span v-if="!dockCollapsed" class="dock-item-label">{{ item.label[lang] }}</span>
          </router-link>

          <button
            v-else
            type="button"
            class="dock-item dock-parent"
            :class="{ active: isPrimaryItemActive(item) }"
            :title="item.label[lang]"
            :aria-expanded="activeSecondaryMenu === item.menu"
            @click="openSecondaryMenu(item.menu)"
          >
            <Icon :icon="item.icon" :width="20" class="dock-item-icon" />
            <span v-if="!dockCollapsed" class="dock-item-label">{{ item.label[lang] }}</span>
            <Icon icon="fluent:chevron-right-16-regular" :width="14" class="dock-chevron" />
          </button>

          <template v-if="item.id === 'records'">
            <router-link
              v-for="pluginItem in pluginDockItems"
              :key="pluginItem.path"
              :to="pluginItem.path"
              class="dock-item plugin-dock-item"
              :class="{ active: route.path === pluginItem.path }"
              draggable="false"
              :title="pluginItem.label"
              @click="closeSecondaryMenu"
            >
              <Icon :icon="pluginItem.icon" :width="20" class="dock-item-icon" />
              <span v-if="!dockCollapsed" class="dock-item-label">{{ pluginItem.label }}</span>
            </router-link>
          </template>
        </template>
      </div>

      <div class="dock-bottom">
        <router-link
          to="/announcement"
          class="dock-item"
          :class="{ active: route.path === '/announcement' }"
          draggable="false"
          :title="lang === 'en' ? 'Announcements' : '公告'"
          @click="closeSecondaryMenu"
        >
          <Icon icon="fluent:megaphone-24-regular" :width="20" class="dock-item-icon" />
          <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'Announcements' : '公告' }}</span>
        </router-link>

        <template v-if="!isDesktopApp">
          <router-link
            to="/download"
            class="dock-item"
            :class="{ active: route.path === '/download' }"
            draggable="false"
            :title="lang === 'en' ? 'Download Client' : '下载客户端'"
            @click="closeSecondaryMenu"
          >
            <Icon icon="fluent:arrow-download-24-regular" :width="20" class="dock-item-icon" />
            <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'Download' : '下载客户端' }}</span>
          </router-link>
          <a
            target="_blank"
            class="dock-item dock-docs"
            draggable="false"
            :title="lang === 'en' ? 'Documentation' : '查看文档'"
          >
            <Icon icon="fluent:book-24-regular" :width="20" class="dock-item-icon" />
            <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'Docs' : '查看文档' }}</span>
          </a>
        </template>

        <router-link
          to="/plugins"
          class="dock-item dock-plugin"
          :class="{ active: pluginManagerActive }"
          draggable="false"
          :title="lang === 'en' ? 'Plugins' : '插件'"
          @click="closeSecondaryMenu"
        >
          <Icon icon="fluent:plug-connected-24-regular" :width="20" class="dock-item-icon" />
          <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'Plugins' : '插件' }}</span>
        </router-link>

        <button
          type="button"
          class="dock-item dock-parent"
          data-plugin-component="navigation.settings-entry"
          :class="{ active: route.path.startsWith('/settings') }"
          :title="lang === 'en' ? 'Settings' : '设置'"
          :aria-expanded="activeSecondaryMenu === 'settings'"
          @click="openSecondaryMenu('settings')"
        >
          <Icon icon="fluent:settings-24-regular" :width="20" class="dock-item-icon" />
          <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'Settings' : '设置' }}</span>
          <Icon icon="fluent:chevron-right-16-regular" :width="14" class="dock-chevron" />
        </button>

        <router-link
          to="/about"
          class="dock-item"
          :class="{ active: route.path.startsWith('/about') }"
          draggable="false"
          :title="lang === 'en' ? 'About' : '关于'"
          @click="closeSecondaryMenu"
        >
          <Icon icon="fluent:info-24-regular" :width="20" class="dock-item-icon" />
          <span v-if="!dockCollapsed" class="dock-item-label">{{ lang === 'en' ? 'About' : '关于' }}</span>
        </router-link>
      </div>
    </div>

    <SecondarySidebarMenu
      :open="Boolean(activeSecondaryMenu)"
      :collapsed="dockCollapsed"
      :items="activeSecondaryConfig.items"
      :navigate-on-open="activeSecondaryConfig.navigateOnOpen"
      :back-label="lang === 'en' ? 'Back' : '返回'"
      @back="closeSecondaryMenu({ restoreFocus: true })"
    />
  </nav>
</template>

<script setup>
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import SecondarySidebarMenu from '../SecondarySidebarMenu.vue'
import { usePluginsStore } from '../../plugins/store'
import { useSettingsStore } from '../../stores/settings'
import { t } from '../../utils/i18n'
import { getIndicatorDirection, getIndicatorGeometry, getIndicatorTransition } from '../../utils/navigationIndicator.mjs'
import { isTauri } from '../../utils/tauriAPI'

const route = useRoute()
const settingsStore = useSettingsStore()
const pluginsStore = usePluginsStore()
const lang = computed(() => settingsStore.settings.language)
const dockCollapsed = computed(() => settingsStore.settings.dockCollapsed || false)
const isDesktopApp = computed(() => isTauri())

const pluginDockItems = computed(() => pluginsStore.contributedPages
  .filter(page => page.location === 'dock')
  .sort((left, right) => (left.order ?? 500) - (right.order ?? 500))
  .map(page => ({
    path: `/plugin/${encodeURIComponent(page.pluginId)}/${encodeURIComponent(page.id)}`,
    icon: String(page.icon || '').includes(':') ? page.icon : `fluent:${page.icon || 'apps-24-regular'}`,
    label: lang.value === 'en' && page.titleEn ? page.titleEn : page.title
  })))

const pluginManagerActive = computed(() => {
  if (route.path === '/plugins') return true
  if (route.name !== 'PluginPage') return false
  return pluginsStore.pageById(route.params.pluginId, route.params.pageId)?.location !== 'dock'
})

function secondaryMenuForRoute(path) {
  if (path.startsWith('/settings')) return 'settings'
  if (path === '/lottery/draw' || path === '/lottery/assign') return 'lottery'
  if (path === '/records' || path === '/lottery/records') return 'records'
  if (path === '/lists' || path.startsWith('/lists/') || path === '/group-manage' || path.startsWith('/lottery/prizes')) return 'lists'
  return null
}

const activeSecondaryMenu = ref(secondaryMenuForRoute(route.path))
const dockRef = ref(null)
const dockPrimaryRef = ref(null)
const indicatorRef = ref(null)
const indicatorVisible = ref(false)
let indicatorGeometry = null
let indicatorResizeObserver = null
let indicatorMotionQuery = null
let layoutSyncFrame = null
let layoutSyncAnimate = false

function motionDisabled() {
  return indicatorMotionQuery?.matches || Boolean(document.querySelector('.perf-no-anim'))
}

function activeIndicatorTarget() {
  if (activeSecondaryMenu.value || !dockRef.value) return null
  return dockRef.value.querySelector('.dock-primary .dock-item.active')
}

function applyIndicatorGeometry(geometry) {
  if (!indicatorRef.value) return
  gsap.set(indicatorRef.value, {
    left: geometry.left,
    top: geometry.top,
    height: geometry.height
  })
}

function syncIndicator({ animate = false } = {}) {
  const target = activeIndicatorTarget()
  const indicator = indicatorRef.value
  if (!target || !dockRef.value || !indicator) {
    indicatorVisible.value = false
    indicatorGeometry = null
    return
  }

  const dockRect = dockRef.value.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const scaleX = dockRect.width / dockRef.value.offsetWidth || 1
  const scaleY = dockRect.height / dockRef.value.offsetHeight || 1
  const targetGeometry = {
    ...getIndicatorGeometry(targetRect, dockRect, 20, scaleY),
    left: (targetRect.left - dockRect.left) / scaleX
  }
  const previousGeometry = indicatorGeometry
  const shouldAnimate = animate
    && previousGeometry
    && !motionDisabled()
    && getIndicatorDirection(previousGeometry, targetGeometry) !== 'none'

  indicatorVisible.value = true
  gsap.killTweensOf(indicator)
  if (!shouldAnimate) {
    applyIndicatorGeometry(targetGeometry)
    indicatorGeometry = targetGeometry
    return
  }

  const transition = getIndicatorTransition(previousGeometry, targetGeometry, 20)
  gsap.set(indicator, {
    left: previousGeometry.left,
    top: transition.fromTop,
    height: previousGeometry.height
  })
  gsap.timeline({ defaults: { overwrite: 'auto' } })
    .to(indicator, {
      left: targetGeometry.left,
      top: transition.stretchTop,
      height: transition.stretchHeight,
      duration: 0.13,
      ease: 'power2.out'
    })
    .to(indicator, {
      left: targetGeometry.left,
      top: transition.toTop,
      height: targetGeometry.height,
      duration: 0.12,
      ease: 'power2.inOut'
    })
  indicatorGeometry = targetGeometry
}

async function syncIndicatorAfterLayout(animate = false) {
  await nextTick()
  layoutSyncAnimate = layoutSyncAnimate || animate
  if (layoutSyncFrame) return
  layoutSyncFrame = window.requestAnimationFrame(() => {
    const shouldAnimate = layoutSyncAnimate
    layoutSyncAnimate = false
    layoutSyncFrame = null
    syncIndicator({ animate: shouldAnimate })
  })
}

function animatePrimaryPanel(open) {
  const panel = dockPrimaryRef.value
  if (!panel) return
  gsap.killTweensOf(panel)
  if (motionDisabled()) {
    gsap.set(panel, { xPercent: open ? -100 : 0 })
    return
  }
  gsap.to(panel, {
    xPercent: open ? -100 : 0,
    duration: 0.26,
    ease: 'power2.inOut',
    overwrite: 'auto'
  })
}

watch(() => route.path, path => {
  activeSecondaryMenu.value = secondaryMenuForRoute(path)
  syncIndicatorAfterLayout(true)
})

watch(activeSecondaryMenu, menu => {
  nextTick(() => animatePrimaryPanel(Boolean(menu)))
  syncIndicatorAfterLayout(false)
}, { flush: 'post' })

watch([dockCollapsed, lang, pluginDockItems], () => syncIndicatorAfterLayout(false))

function openSecondaryMenu(menu) {
  activeSecondaryMenu.value = menu
}

async function closeSecondaryMenu({ restoreFocus = false } = {}) {
  activeSecondaryMenu.value = null
  if (restoreFocus) {
    await nextTick()
    dockRef.value?.querySelector('.dock-primary .dock-item.active')?.focus()
  }
}

function isPrimaryItemActive(item) {
  if (item.menu) return secondaryMenuForRoute(route.path) === item.menu
  return route.path === item.to
}

function toggleDock() {
  settingsStore.update('dockCollapsed', !dockCollapsed.value)
  syncIndicatorAfterLayout(false)
}

const mainItems = [
  { id: 'roller', to: '/roller', icon: 'fluent:flash-24-regular', label: { zh: '随机点名', en: 'Roller' } },
  { id: 'card', to: '/card', icon: 'fluent:card-ui-portrait-flip-24-regular', label: { zh: '翻牌点名', en: 'Card Mode' } },
  { id: 'lottery', menu: 'lottery', icon: 'fluent:gift-24-regular', label: { zh: '抽奖模式', en: 'Lottery' } },
  { id: 'statistics', to: '/statistics', icon: 'fluent:chart-multiple-24-regular', label: { zh: '统计', en: 'Statistics' } },
  { id: 'records', menu: 'records', icon: 'fluent:history-24-regular', label: { zh: '抽取记录', en: 'Records' } },
  { id: 'lists', menu: 'lists', icon: 'fluent:people-list-24-regular', label: { zh: '名单管理', en: 'List Management' } }
]

const settingsMenuItems = computed(() => [
  { id: 'general', label: lang.value === 'en' ? 'General' : '基本', icon: 'options-20-regular', to: '/settings/general' },
  { id: 'appearance', label: lang.value === 'en' ? 'Appearance' : '外观', icon: 'color-20-regular', to: '/settings/appearance' },
  { id: 'features', label: lang.value === 'en' ? 'Features' : '功能', icon: 'play-20-regular', to: '/settings/features' },
  { id: 'data', label: lang.value === 'en' ? 'Data' : '数据', icon: 'database-20-regular', to: '/settings/data' }
])

const secondaryMenus = computed(() => ({
  lottery: {
    navigateOnOpen: true,
    items: [
      { id: 'draw', label: lang.value === 'en' ? 'Prize draw' : '奖品抽取', icon: 'gift-20-regular', to: '/lottery/draw' },
      { id: 'assign', label: lang.value === 'en' ? 'Assign prizes' : '人员奖品分配', icon: 'people-team-20-regular', to: '/lottery/assign' }
    ]
  },
  records: {
    navigateOnOpen: true,
    items: [
      { id: 'roll-records', label: lang.value === 'en' ? 'Name records' : '点名记录', icon: 'history-20-regular', to: '/records' },
      { id: 'lottery-records', label: lang.value === 'en' ? 'Lottery records' : '抽奖记录', icon: 'gift-20-regular', to: '/lottery/records' }
    ]
  },
  lists: {
    navigateOnOpen: true,
    items: [
      { id: 'people', label: t('personnelList', lang.value), icon: 'person-20-regular', to: '/lists' },
      { id: 'groups', label: lang.value === 'en' ? 'Groups' : '小组名单', icon: 'people-team-20-regular', to: '/group-manage' },
      { id: 'prizes', label: lang.value === 'en' ? 'Prizes' : '奖品管理', icon: 'clipboard-bullet-list-20-regular', to: '/lottery/prizes' }
    ]
  },
  settings: {
    navigateOnOpen: true,
    items: settingsMenuItems.value
  }
}))

const activeSecondaryConfig = computed(() => secondaryMenus.value[activeSecondaryMenu.value] || {
  navigateOnOpen: false,
  items: []
})

onMounted(() => {
  indicatorMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  gsap.set(dockPrimaryRef.value, { xPercent: activeSecondaryMenu.value ? -100 : 0 })
  syncIndicatorAfterLayout(false)
  indicatorResizeObserver = new ResizeObserver(() => syncIndicatorAfterLayout(false))
  if (dockRef.value) indicatorResizeObserver.observe(dockRef.value)
})

onBeforeUnmount(() => {
  if (layoutSyncFrame) cancelAnimationFrame(layoutSyncFrame)
  if (dockPrimaryRef.value) gsap.killTweensOf(dockPrimaryRef.value)
  if (indicatorRef.value) gsap.killTweensOf(indicatorRef.value)
  indicatorResizeObserver?.disconnect()
})
</script>

<style scoped>
.dock {
  position: relative;
  z-index: 50;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: var(--plugin-component-navigation-dock-size, var(--dock-width));
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--border-subtle);
  background: var(--plugin-component-navigation-dock-background, var(--bg-acrylic));
  color: var(--plugin-component-navigation-dock-foreground, var(--text-secondary));
  font-family: var(--plugin-component-navigation-dock-font-family, var(--font-ui));
  font-size: var(--plugin-component-navigation-dock-font-size, inherit);
  font-weight: var(--plugin-component-navigation-dock-font-weight, inherit);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: width var(--duration-normal) var(--ease-standard);
}

.dock.collapsed { width: 48px; }

.dock-primary {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  will-change: transform;
}

.dock.secondary-open .dock-primary { pointer-events: none; }

.dock-shared-indicator {
  position: absolute;
  z-index: 4;
  left: 0;
  top: 0;
  width: 3px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--accent);
  pointer-events: none;
}

.dock-top {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  overflow: hidden;
  border-bottom: 1px solid var(--border-subtle);
}

.dock-toggle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-standard), color var(--duration-normal) var(--ease-standard), transform var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard);
}

.dock-toggle:hover { background: var(--bg-hover); }
.dock-logo-img { flex-shrink: 0; width: 24px; height: 24px; border-radius: 5px; object-fit: cover; }
.dock-logo-text { min-width: 0; overflow: hidden; color: var(--text-primary); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

.dock-items {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: var(--plugin-component-navigation-dock-density, 8px) 6px;
  overflow-x: hidden;
  overflow-y: auto;
}

.dock-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 9px 10px;
  overflow: hidden;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--plugin-component-navigation-dock-foreground, var(--text-secondary));
  font-family: var(--plugin-component-navigation-dock-font-family, var(--font-ui));
  font-size: var(--plugin-component-navigation-dock-font-size, 13px);
  font-weight: var(--plugin-component-navigation-dock-font-weight, inherit);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--duration-fast) ease, color var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.dock.collapsed .dock-item { justify-content: flex-start; padding: 9px 10px; }
.dock-item:hover { background: var(--bg-hover); color: var(--text-primary); transform: translateX(1px); }
.dock-item.active { background: var(--bg-hover); color: var(--accent); transform: translateX(1px); }
.dark .dock-item.active { background: var(--bg-hover); }
.dock-item-icon { flex-shrink: 0; transition: transform var(--duration-normal) var(--ease-standard); }
.dock-item.active .dock-item-icon { transform: scale(1.08); }
.dock-item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plugin-dock-item { flex-shrink: 0; }

.dock-parent { user-select: none; }
.dock-chevron { flex-shrink: 0; margin-left: auto; color: var(--text-muted); }
.dock-parent.active { background: var(--bg-hover); color: var(--accent); }

.dock-bottom {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 2px;
  padding: var(--plugin-component-navigation-dock-density, 8px) 6px;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
}

@media (max-width: 768px) {
  .dock {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 100;
    width: 48px;
    box-shadow: var(--shadow-8);
  }

  .dock:not(.collapsed) { width: var(--dock-width); }
  .dock.collapsed { width: 48px; }
}

@media (prefers-reduced-motion: reduce) {
  .dock-item { transition-duration: 0ms; }
}
</style>
