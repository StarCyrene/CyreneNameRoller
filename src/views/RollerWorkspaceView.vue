<template>
  <div class="roller-workspace">
    <footer class="tool-bar">
      <div ref="stripShell" class="tool-strip-shell" :class="{ 'has-overflow': overflow }">
        <button v-if="canScrollBack" type="button" class="strip-arrow strip-back" tabindex="-1"
          :aria-label="lang === 'en' ? 'Show previous tools' : '查看前面的工具'" aria-controls="roller-tool-picker" @mousedown.prevent @click="pageTools(-1)">
          <FluentIcon icon="chevron-left-16-regular" :width="16" />
        </button>
        <button v-if="canScrollNext" type="button" class="strip-arrow strip-next" tabindex="-1"
          :aria-label="lang === 'en' ? 'Show more tools' : '查看更多工具'" aria-controls="roller-tool-picker" @mousedown.prevent @click="pageTools(1)">
          <FluentIcon icon="chevron-right-16-regular" :width="16" />
        </button>
        <div id="roller-tool-picker" ref="pivot" class="tool-pivot" role="tablist" :aria-label="toolLabel" @keydown="onTabKey" @scroll.passive="updateScrollEdges">
          <RouterLink
            v-for="tool in rollerTools" :key="tool.name" :to="{ name: tool.name }"
            :id="'roller-tab-' + tool.name" role="tab" class="tool-tab"
            :aria-label="tool.label[lang]" :title="tool.label[lang]"
            :aria-selected="route.name === tool.name" aria-controls="roller-tool-panel"
            :tabindex="route.name === tool.name ? 0 : -1"
            @keydown.space.prevent="$event.currentTarget.click()"
          >
            <FluentIcon :icon="tool.icon" :width="17" aria-hidden="true" />
            <span class="full-label">{{ tool.label[lang] }}</span>
            <span class="compact-label">{{ tool.compact[lang] }}</span>
          </RouterLink>
        </div>
        <FluentScrollBar
          v-if="overflow" class="tool-scrollbar" orientation="horizontal"
          :value="stripOffset" :maximum="stripLimit" :viewport-size="stripWidth"
          aria-hidden="true" @update:value="scrollToolsTo"
        />
      </div>
      <div :ref="attachVersionHost" class="tool-version-host" />
    </footer>
    <div ref="panel" id="roller-tool-panel" class="tool-panel" role="tabpanel" tabindex="0" :aria-labelledby="'roller-tab-' + route.name">
      <RouterView v-slot="{ Component }">
        <Transition name="tool-swap" mode="out-in">
          <component :is="Component" :key="route.name" />
        </Transition>
      </RouterView>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { rollerTools } from '../router/rollerTools'

const route = useRoute()
const settings = useSettingsStore()
const lang = computed(() => settings.settings.language === 'en' ? 'en' : 'zh')
const toolLabel = computed(() => lang.value === 'en' ? 'Roll call tools' : '点名工具')
const pivot = ref(null)
const stripShell = ref(null)
const overflow = ref(false)
const stripOffset = ref(0)
const stripLimit = ref(0)
const stripWidth = ref(0)
const canScrollBack = computed(() => overflow.value && stripOffset.value > 1)
const canScrollNext = computed(() => overflow.value && stripOffset.value < stripLimit.value - 1)
const panel = ref(null)
const versionHost = inject('rollerVersionHost', null)
function attachVersionHost(element) { if (versionHost) versionHost.value = element }
let resizeObserver

function updateScrollEdges() {
  const strip = pivot.value
  if (!strip || !stripShell.value) return
  // Compare with the full row, even when arrow gutters are visible.
  overflow.value = strip.scrollWidth > stripShell.value.clientWidth + 1
  stripOffset.value = strip.scrollLeft
  stripWidth.value = strip.clientWidth
  stripLimit.value = Math.max(0, strip.scrollWidth - stripWidth.value)
}
function scrollToolsTo(offset) {
  pivot.value.scrollLeft = offset
  updateScrollEdges()
}
function pageTools(direction) {
  const strip = pivot.value
  scrollToolsTo(strip.scrollLeft + direction * Math.max(1, strip.clientWidth - 24))
}
function showSelectedTab() {
  updateScrollEdges()
  const strip = pivot.value
  const tab = strip?.querySelector('[aria-selected="true"]')
  if (!tab || strip.scrollWidth <= strip.clientWidth) return
  const edge = strip.getBoundingClientRect()
  const item = tab.getBoundingClientRect()
  const offset = item.left < edge.left ? item.left - edge.left : Math.max(0, item.right - edge.right)
  scrollToolsTo(strip.scrollLeft + offset * strip.offsetWidth / edge.width)
}
watch([() => route.name, lang], showSelectedTab, { flush: 'post' })
watch(() => route.name, () => { if (panel.value) panel.value.scrollTop = 0 }, { flush: 'post' })
onMounted(() => {
  resizeObserver = new ResizeObserver(showSelectedTab)
  resizeObserver.observe(pivot.value)
  resizeObserver.observe(stripShell.value)
  for (const tab of pivot.value.children) resizeObserver.observe(tab)
  showSelectedTab()
})
onBeforeUnmount(() => resizeObserver?.disconnect())

function onTabKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
  const index = tabs.indexOf(event.target.closest('[role="tab"]'))
  if (index < 0) return
  let next
  switch (event.key) {
    case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break
    case 'ArrowRight': next = (index + 1) % tabs.length; break
    case 'Home': next = 0; break
    case 'End': next = tabs.length - 1; break
    default: return
  }
  event.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}
</script>

<style scoped>
.roller-workspace {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: 'panel' 'footer';
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  container: roller-workspace / inline-size;
}
.tool-bar {
  grid-area: footer;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 3px max(12px, env(safe-area-inset-right, 0px)) max(3px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
  border-top: 1px solid var(--border-default);
  background: var(--bg-card-solid);
}
.tool-strip-shell {
  flex: 1;
  display: grid;
  align-items: center;
  grid-template-columns: 0 minmax(0, 1fr) 0;
  min-width: 0;
}
.tool-strip-shell.has-overflow { grid-template-columns: 25px minmax(0, 1fr) 25px; }
.tool-strip-shell.has-overflow .tool-tab { padding-bottom: 10px; }
.tool-strip-shell.has-overflow .tool-tab[aria-selected="true"]::after { bottom: 8px; }
.strip-arrow {
  grid-row: 1;
  align-self: stretch;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
}
.strip-arrow:hover { color: var(--accent-dark); }
.strip-back { grid-column: 1; }
.strip-next { grid-column: 3; }
.tool-pivot {
  grid-area: 1 / 2;
  display: flex;
  justify-content: safe center;
  overflow-x: auto;
  scrollbar-width: none;
  min-width: 0;
  gap: 3px;
}
.tool-pivot::-webkit-scrollbar { display: none; }
.fluent-scroll-bar.tool-scrollbar {
  grid-area: 1 / 2;
  align-self: end;
  z-index: 1;
  height: 8px;
  touch-action: none;
}
.tool-scrollbar :deep(.scroll-bar-track:hover) { background: var(--bg-hover); }
.tool-scrollbar :deep(.scroll-bar-thumb) {
  opacity: 1;
  background: color-mix(in srgb, var(--text-secondary) 56%, transparent);
}
.tool-scrollbar :deep(.scroll-bar-thumb:is(:hover, :active)) { background: var(--text-secondary); }
.tool-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 3px 10px 4px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}
.tool-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
.tool-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.tool-tab[aria-selected="true"] { color: var(--text-primary); font-weight: 700; }
.tool-tab[aria-selected="true"]::after {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 23px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--accent);
  content: '';
  transform: translateX(-50%);
}
.tool-panel { grid-area: panel; min-width: 0; min-height: 0; overflow: auto; }
.tool-panel:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tool-swap-enter-active, .tool-swap-leave-active { transition: opacity .17s ease, transform .17s ease; }
.tool-swap-enter-from { opacity: 0; transform: translateY(7px) scale(.997); }
.tool-swap-leave-to { opacity: 0; transform: translateY(-5px) scale(.997); }
@media (prefers-reduced-motion: reduce) { .tool-swap-enter-active, .tool-swap-leave-active { transition: none; } }
:global(.perf-no-anim) .tool-swap-enter-active, :global(.perf-no-anim) .tool-swap-leave-active { transition: none; }
.tool-version-host { display: flex; align-items: center; justify-content: flex-end; min-width: 0; max-width: 100%; }
.tool-version-host:empty { display: none; }
.compact-label { display: none; }
@container roller-workspace (max-width: 1250px) {
  .tool-tab { padding-inline: 8px; }
}
@container roller-workspace (max-width: 970px) {
  .tool-bar { flex-wrap: wrap; gap: 0; }
  .tool-strip-shell { flex: 1 0 100%; }
  .tool-version-host { margin-left: auto; }
  .tool-tab { gap: 4px; }
  .full-label { display: none; }
  .compact-label { display: inline; }
}
</style>
