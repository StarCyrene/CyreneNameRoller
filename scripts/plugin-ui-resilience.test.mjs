import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFile(path.join(root, file), 'utf8')

test('startup decides the splash before mounting plugin-owning layout', async () => {
  const app = await read('src/App.vue')
  assert.match(app, /const initialSplash = !isFloatingRoute\.value && settingsStore\.settings\.disableSplash !== true/)
  assert.match(app, /const showSplash = ref\(initialSplash\)/)
  assert.match(app, /const splashPlayed = ref\(initialSplash\)/)
  assert.doesNotMatch(app, /const showSplash = ref\(false\)/)
})

test('settings controls collapse within narrow scaled layouts', async () => {
  const settings = await read('src/views/SettingsView.vue')
  assert.match(settings, /@media \(max-width: 720px\) \{[\s\S]*?\.setting-row \{[^}]*flex-direction: column;/)
  assert.match(settings, /\.setting-row:has\(> \.fluent-toggle\) \{[^}]*flex-direction: row;/)
  assert.match(settings, /\.setting-row :deep\(\.fluent-select\) \{[^}]*width: 100% !important;[^}]*min-width: 0 !important;/)
  assert.match(settings, /\.scale-input-wrap, \.hex-color-input \{[^}]*max-width: 100%;/)
})

test('roller balance status clears the title on narrow layouts', async () => {
  const roller = await read('src/views/RollerView.vue')
  assert.match(roller, /@media \(max-width: 720px\) \{[\s\S]*?\.balance-status \{[^}]*top: 84px;[^}]*left: 50%;[^}]*transform: translateX\(-50%\);/)
  assert.match(roller, /@media \(max-width: 720px\) \{[\s\S]*?\.display-container \{[^}]*top: 128px;/)
})

test('Web overlays keep their own fixed positions and Toasts stack from the top', async () => {
  const [layout, fullscreen, widgetCss] = await Promise.all([
    read('src/components/layout/AppLayout.vue'),
    read('src/components/FullscreenToggle.vue'),
    read('node_modules/vue-fluent-widgets/dist/vue-fluent-widgets.css')
  ])
  assert.doesNotMatch(layout, /\.app-layout\s*>[^{]+\{\s*position:\s*relative/)
  assert.match(layout, /\.app-foreground-layer\s*\{\s*position:\s*relative;\s*z-index:\s*1;/)
  assert.match(layout, /\.version-badge\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0px;[\s\S]*?right:\s*24px;/)
  assert.match(layout, /\.file-drop-overlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*999998;/)
  assert.match(layout, /\.banner-container\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*0;[\s\S]*?left:\s*var\(--dock-width\);/)
  assert.match(fullscreen, /<Teleport to="body">/)
  assert.match(fullscreen, /position:\s*fixed;[\s\S]*?top:\s*8px;[\s\S]*?right:\s*8px;/)
  assert.match(widgetCss, /\.fluent-toast-container(?:\[data-v-[a-f0-9]+\])?\s*\{[\s\S]*?top:\s*24px;[\s\S]*?flex-direction:\s*column;/)
})

test('page animations never control Vue route lifecycle and use a host-owned visual stage', async () => {
  const [layout, pluginPage] = await Promise.all([
    read('src/components/layout/AppLayout.vue'),
    read('src/views/PluginPageView.vue')
  ])
  assert.match(layout, /<main ref="appContentRef" class="app-content">/)
  assert.match(layout, /<div ref="routeStageRef" class="route-page-stage"/)
  assert.match(layout, /\.app-body\s*\{[\s\S]*?min-height:\s*0;/)
  assert.match(layout, /\.app-content\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/)
  assert.match(layout, /\.route-page-stage\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*100%;/)
  assert.doesNotMatch(layout, /<Transition[^>]+mode="out-in"/)
  assert.doesNotMatch(layout, /:css="false"/)
  assert.doesNotMatch(layout, /@enter="onPageEnter"|@leave="onPageLeave"|\bdone\(\)/)
  assert.match(layout, /function createRouteGhost\(direction\)/)
  assert.match(layout, /source\.cloneNode\(true\)/)
  assert.match(layout, /function startPageVisual\(element, phase, direction\)/)
  assert.match(layout, /pluginsStore\.startAnimation\('page\.transition'/)
  assert.match(layout, /function settleVisualRun\(run, phase, cleanup\)/)
  assert.match(layout, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => startRouteEnter\(cycle\)\)\)/)
  assert.match(layout, /totalDurationMs/)
  assert.match(layout, /function isUsablePageTransitionRun\(run\)/)
  assert.match(layout, /settingsStore\.settings\.perfAnimations !== false/)
  assert.match(layout, /\.route-page-ghost\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*none;/)
  assert.match(pluginPage, /let mountGeneration = 0/)
  assert.match(pluginPage, /if \(generation !== mountGeneration\) return/)
  assert.match(pluginPage, /onBeforeUnmount\(\(\) => \{[\s\S]*?mountGeneration \+= 1/)
})

test('Web deployment recovers from stale chunks without precaching missing assets', async () => {
  const [html, serviceWorker, main] = await Promise.all([
    read('index.html'),
    read('public/sw.js'),
    read('src/main.js')
  ])
  assert.doesNotMatch(html, /serviceWorker\.register/)
  assert.doesNotMatch(serviceWorker, /names\.json/)
  assert.match(serviceWorker, /cyrene-v\d+\.\d+\.\d+-shell-\d+/)
  assert.match(main, /vite:preloadError/)
  assert.match(main, /window\.location\.reload\(\)/)
  assert.match(main, /import\.meta\.env\.DEV/)
  assert.match(main, /getRegistrations\(\)/)
  assert.match(main, /registration\.scope\.startsWith\(appScope\)/)
  assert.match(main, /navigator\.serviceWorker\.controller/)
  assert.match(main, /cyrene:dev-sw-detach-reload/)
  assert.match(main, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/)
})
