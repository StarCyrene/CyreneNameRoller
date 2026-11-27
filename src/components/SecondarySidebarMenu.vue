<template>
  <aside
    ref="menuRef"
    class="secondary-sidebar-menu"
    :class="{
      'is-visible': panelVisible,
      'is-interactive': open,
      'is-collapsed': collapsed
    }"
    :aria-hidden="!open"
    @keydown.esc="goBack"
  >
    <div
      v-show="indicatorVisible"
      ref="indicatorRef"
      class="secondary-sidebar-menu__shared-indicator"
      aria-hidden="true"
    />

    <header class="secondary-sidebar-menu__header">
      <button type="button" class="secondary-sidebar-menu__back" :aria-label="backLabel" @click="goBack">
        <FluentIcon icon="arrow-left-20-regular" :width="18" />
        <span class="secondary-sidebar-menu__back-label">{{ backLabel }}</span>
      </button>
    </header>

    <nav class="secondary-sidebar-menu__list" @scroll="syncIndicatorAfterLayout(false)">
      <router-link
        v-for="item in items"
        :key="item.id"
        :to="item.to"
        class="secondary-sidebar-menu__item"
        :aria-label="item.label" :title="item.label"
        :class="{ active: isItemActive(item) }"
      >
        <FluentIcon v-if="item.icon" :icon="item.icon" :width="18" />
        <span class="secondary-sidebar-menu__item-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>

<script setup>
import { gsap } from 'gsap'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getIndicatorDirection, getIndicatorGeometry, getIndicatorTransition } from '../utils/navigationIndicator.mjs'

const props = defineProps({
  open: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  items: { type: Array, required: true },
  initialRoute: { type: [String, Object], default: null },
  navigateOnOpen: { type: Boolean, default: true },
  backLabel: { type: String, default: 'Back' }
})

const emit = defineEmits(['back'])
const route = useRoute()
const router = useRouter()
const menuRef = ref(null)
const indicatorRef = ref(null)
const indicatorVisible = ref(false)
const panelVisible = ref(props.open)
let panelAnimationToken = 0
let indicatorGeometry = null
let indicatorResizeObserver = null
let indicatorMotionQuery = null
let layoutSyncFrame = null
let layoutSyncAnimate = false

function routePath(target) {
  if (!target) return ''
  return router.resolve(target).path
}

function itemForRoute(path = route.path) {
  return props.items.find(item => {
    const itemPath = routePath(item.to)
    return path === itemPath || path.startsWith(`${itemPath}/`)
  })
}

function initialItem() {
  const requested = routePath(props.initialRoute)
  return props.items.find(item => item.id === props.initialRoute || routePath(item.to) === requested)
    || props.items[0]
}

function isItemActive(item) {
  return itemForRoute()?.id === item.id
}

function motionDisabled() {
  return indicatorMotionQuery?.matches || Boolean(document.querySelector('.perf-no-anim'))
}

function goBack() {
  emit('back')
}

function animatePanel(open) {
  const panel = menuRef.value
  if (!panel) return
  const animationToken = ++panelAnimationToken
  gsap.killTweensOf(panel)
  if (open) panelVisible.value = true
  if (motionDisabled()) {
    gsap.set(panel, { x: 0, xPercent: open ? 0 : 100 })
    if (!open && animationToken === panelAnimationToken && !props.open) panelVisible.value = false
    return
  }
  gsap.to(panel, {
    x: 0,
    xPercent: open ? 0 : 100,
    duration: 0.26,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onComplete: () => {
      if (!open && animationToken === panelAnimationToken && !props.open) panelVisible.value = false
    }
  })
}

function activeIndicatorTarget() {
  return menuRef.value?.querySelector('.secondary-sidebar-menu__item.active') || null
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
  if (!props.open || !target || !menuRef.value || !indicator) {
    indicatorVisible.value = false
    indicatorGeometry = null
    return
  }

  const menuRect = menuRef.value.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const scaleX = menuRect.width / menuRef.value.offsetWidth || 1
  const scaleY = menuRect.height / menuRef.value.offsetHeight || 1
  const targetGeometry = {
    ...getIndicatorGeometry(targetRect, menuRect, 20, scaleY),
    left: (targetRect.left - menuRect.left) / scaleX
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

watch(() => props.open, async open => {
  if (open) {
    panelVisible.value = true
    await nextTick()
    animatePanel(true)
    syncIndicatorAfterLayout(false)
    const target = itemForRoute() || initialItem()
    if (props.navigateOnOpen && target && routePath(target.to) !== route.path) await router.push(target.to)
    return
  }
  await nextTick()
  animatePanel(false)
  syncIndicatorAfterLayout(false)
}, { immediate: true, flush: 'post' })

watch(() => route.path, () => syncIndicatorAfterLayout(true))
watch(() => props.items, () => syncIndicatorAfterLayout(false), { deep: true })
watch(() => props.collapsed, () => syncIndicatorAfterLayout(false))

onMounted(() => {
  indicatorMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  gsap.set(menuRef.value, { x: 0, xPercent: props.open ? 0 : 100 })
  syncIndicatorAfterLayout(false)
  indicatorResizeObserver = new ResizeObserver(() => syncIndicatorAfterLayout(false))
  if (menuRef.value) indicatorResizeObserver.observe(menuRef.value)
})

onBeforeUnmount(() => {
  if (layoutSyncFrame) cancelAnimationFrame(layoutSyncFrame)
  if (menuRef.value) gsap.killTweensOf(menuRef.value)
  if (indicatorRef.value) gsap.killTweensOf(indicatorRef.value)
  indicatorResizeObserver?.disconnect()
})
</script>

<style scoped>
.secondary-sidebar-menu {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 12px 6px;
  overflow: hidden;
  background: var(--bg-acrylic);
  visibility: hidden;
  pointer-events: none;
}

.secondary-sidebar-menu.is-visible { visibility: visible; }
.secondary-sidebar-menu.is-interactive { pointer-events: auto; }

.secondary-sidebar-menu__shared-indicator {
  position: absolute;
  z-index: 3;
  left: 0;
  top: 0;
  width: 3px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--accent);
  pointer-events: none;
}

.secondary-sidebar-menu__header {
  flex: 0 0 auto;
  padding: 0 4px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.secondary-sidebar-menu__back {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.secondary-sidebar-menu__back:hover { background: var(--bg-hover); color: var(--text-primary); }
.secondary-sidebar-menu__back-label { white-space: nowrap; }

.secondary-sidebar-menu__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding: 10px 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.secondary-sidebar-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--duration-fast) ease, color var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.secondary-sidebar-menu__item:hover,
.secondary-sidebar-menu__item.active {
  background: var(--bg-hover);
  color: var(--accent);
  transform: translateX(2px);
}

.secondary-sidebar-menu__item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.secondary-sidebar-menu.is-collapsed .secondary-sidebar-menu__back-label,
.secondary-sidebar-menu.is-collapsed .secondary-sidebar-menu__item-label { display: none; }

@media (prefers-reduced-motion: reduce) {
  .secondary-sidebar-menu__item { transition-duration: 0ms; }
}
</style>
