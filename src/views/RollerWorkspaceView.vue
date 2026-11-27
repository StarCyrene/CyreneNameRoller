<template>
  <div class="roller-workspace">
    <footer class="tool-bar">
      <span class="tool-bar-label" aria-hidden="true">{{ toolLabel }}</span>
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
      </div>
      <div :ref="attachVersionHost" class="tool-version-host" />
    </footer>
    <div ref="panel" id="roller-tool-panel" class="tool-panel" role="tabpanel" tabindex="0" :aria-labelledby="'roller-tab-' + route.name">
      <RouterView />
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
const canScrollBack = ref(false)
const canScrollNext = ref(false)
const panel = ref(null)
const versionHost = inject('rollerVersionHost', null)
function attachVersionHost(element) { if (versionHost) versionHost.value = element }
let resizeObserver

function updateScrollEdges() {
  const strip = pivot.value
  if (!strip || !stripShell.value) return
  // Compare with the full row, even when arrow gutters are visible.
  overflow.value = strip.scrollWidth > stripShell.value.clientWidth + 1
  canScrollBack.value = overflow.value && strip.scrollLeft > 1
  canScrollNext.value = overflow.value && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1
}
function pageTools(direction) {
  const strip = pivot.value
  strip.scrollLeft += direction * Math.max(1, strip.clientWidth - 24)
  updateScrollEdges()
}
function showSelectedTab() {
  updateScrollEdges()
  const strip = pivot.value
  const tab = strip?.querySelector('[aria-selected="true"]')
  if (!tab || strip.scrollWidth <= strip.clientWidth) return
  const edge = strip.getBoundingClientRect()
  const item = tab.getBoundingClientRect()
  const offset = item.left < edge.left ? item.left - edge.left : Math.max(0, item.right - edge.right)
  strip.scrollLeft += offset * strip.offsetWidth / edge.width
  updateScrollEdges()
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
.tool-bar-label {
  flex: none;
  padding-right: 18px;
  border-right: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.tool-strip-shell {
  flex: 1;
  display: grid;
  align-items: center;
  grid-template-columns: 0 minmax(0, 1fr) 0;
  min-width: 0;
}
.tool-strip-shell.has-overflow { grid-template-columns: 25px minmax(0, 1fr) 25px; }
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
  scrollbar-width: thin;
  min-width: 0;
  gap: 3px;
}
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
.tool-version-host { display: flex; align-items: center; justify-content: flex-end; min-width: 0; max-width: 100%; }
.tool-version-host:empty { display: none; }
.compact-label { display: none; }
@container roller-workspace (max-width: 1250px) {
  .tool-bar-label { display: none; }
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
