import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export const pointerEffectsKey = Symbol('pointer-effects')
const EDITABLE = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [role="textbox"]'
const isEditing = element => !!(element?.isContentEditable || element?.closest?.(EDITABLE))
const canDrawPage = route => !!route?.name && route.meta.swarmCursors !== false
const changesPage = (to, from) => to.path !== from.path
const PALETTE = {
  '--cnr-pointer-accent': '--accent',
  '--cnr-pointer-accent-dark': '--accent-dark',
  '--cnr-pointer-surface': '--bg-base'
}

// Keep the library's navigation lifecycle (including its pre-navigation cover
// and persistent Dock) while deciding eligibility from current app settings.
function routeAdapter(router, options, playInitial) {
  const views = new WeakMap()
  const skipped = new WeakSet()
  function view(route, initial = false) {
    if (!route) return route
    let result = views.get(route)
    if (!result) {
      result = { ...route, meta: { ...route.meta } }
      views.set(route, result)
    }
    result.meta.swarmCursors = skipped.has(route) || (initial && !playInitial) ? false : options(route)
    return result
  }
  return {
    currentRoute: { get value() { return view(router.currentRoute.value, true) } },
    beforeEach: handler => router.beforeEach((to, from) => {
      if (!changesPage(to, from)) skipped.add(to)
      const next = view(to)
      if (next.meta.swarmCursors === false) skipped.add(to)
      return handler(next, from)
    }),
    afterEach: handler => router.afterEach((to, from, failure) => handler(view(to), from, failure)),
    onError: handler => router.onError((error, to) => handler(error, view(to))),
    isReady: () => router.isReady()
  }
}

const accent = 'var(--cnr-pointer-accent)'
const pointerTheme = {
  accent,
  accentDark: 'var(--cnr-pointer-accent-dark)',
  colors: [accent],
  coverColor: 'var(--cnr-pointer-surface)',
  coverColorDark: 'var(--cnr-pointer-surface)'
}

export function usePointerEffects({ router, settings, layout, theme, dark }) {
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)')
  const coarse = window.matchMedia('(pointer: coarse), (hover: none) and (any-pointer: coarse)')
  const mediaAllowed = ref(!noMotion.matches && !coarse.matches)
  const touch = ref(false)
  const enabled = computed(() => settings.value.pointerEffects === true && settings.value.perfAnimations !== false &&
    mediaAllowed.value && !touch.value)
  const playing = ref(false)
  const ready = ref(false)
  const available = computed(() => ready.value && enabled.value && canDrawPage(router.currentRoute.value))
  const drawingPath = ref(null)
  const drawingCurrentRoute = computed(() => enabled.value && drawingPath.value === router.currentRoute.value.path)
  let replacement = null
  let core = null
  let getEngine
  let removeState
  let token = 0
  let stopRefreshing
  let mounted = false

  function cancel() {
    core?.stop(false)
    playing.value = false
  }

  function destroyDrawing() {
    removeState?.()
    removeState = null
    core?.destroy()
    core = null
    ready.value = false
    playing.value = false
    drawingPath.value = null
  }

  function destroy() {
    replacement?.destroy()
    replacement = null
    destroyDrawing()
  }

  function routeOptions(route) {
    if (!enabled.value || !canDrawPage(route) || isEditing(document.activeElement)) return false
    return { sound: settings.value.pointerDrawingSound === true }
  }

  function prepareRoute(to, from) {
    // The lazy import can finish after navigation and draw that destination.
    // Reserve its transition even if the drawing engine is not ready yet.
    const willDraw = changesPage(to, from) && !!routeOptions(to)
    drawingPath.value = willDraw ? to.path : null
    return willDraw
  }

  function syncTheme() {
    const palette = enabled.value && layout.value ? getComputedStyle(layout.value) : null
    for (const [key, source] of Object.entries(PALETTE)) {
      const color = palette?.getPropertyValue(source).trim()
      if (color) document.documentElement.style.setProperty(key, color)
      else document.documentElement.style.removeProperty(key)
    }
  }

  async function refresh(initial = false) {
    const request = ++token
    if (!enabled.value || !layout.value) {
      destroy()
      syncTheme()
      return
    }
    destroyDrawing()
    syncTheme()
    const firstPath = router.currentRoute.value.path
    try {
      getEngine ??= import('swarm-cursors-vue').catch(error => { getEngine = null; throw error })
      const { createSwarmCursors } = await getEngine
      if (!mounted || request !== token || !enabled.value || !layout.value) return
      // The native replacement is independent of the drawing router. It
      // begins immediately and never requests the engine or a page cover.
      replacement ??= createSwarmCursors({
        accent,
        colors: [accent],
        auto: false,
        autoOnRoute: false,
        preload: false,
        button: false,
        cover: false,
        hud: false,
        companion: true,
        companionMode: 'replace',
        sound: false
      })
      // If the optional import finishes after a navigation, draw its current
      // destination. An in-place settings change still never starts a replay.
      const playInitial = initial || firstPath !== router.currentRoute.value.path
      core = createSwarmCursors({
        ...pointerTheme,
        router: routeAdapter(router, routeOptions, playInitial),
        auto: true,
        autoOnRoute: true,
        autoDelay: 90,
        routeDelay: 100,
        captureDelay: 160,
        autoReveal: true,
        autoRevealDelay: 380,
        button: false,
        hud: false,
        companion: false,
        sound: settings.value.pointerDrawingSound === true
      })
      removeState = core.on('state', state => { playing.value = state.running || state.loading })
      ready.value = true
    } catch (error) {
      // A missing optional chunk must not block a launch or interfere with navigation.
      if (request === token) console.warn('[pointer effects] Could not load the animation', error)
    }
  }

  async function replay() {
    if (!available.value || isEditing(document.activeElement) || !core) return
    if (playing.value) { cancel(); return }
    core.setPageEnabled(true)
    await core.start().catch(() => {})
  }

  function syncMedia() {
    mediaAllowed.value = !noMotion.matches && !coarse.matches
    if (!mediaAllowed.value) cancel()
  }
  function trackPointer(event) {
    if (event.pointerType === 'touch' && !touch.value) { touch.value = true; cancel() }
    else if (event.pointerType === 'mouse') touch.value = false
  }
  function protectEdit(event) {
    if (isEditing(event.target)) cancel()
  }
  function allowAppKey(event) {
    // 1.3 also installs shortcuts without its HUD. Retire the overlay first so
    // it cannot stop Escape or act on the app's own modified keys.
    if (event.key === 'Escape' || (event.ctrlKey && event.shiftKey)) cancel()
  }

  onMounted(async () => {
    mounted = true
    noMotion.addEventListener('change', syncMedia)
    coarse.addEventListener('change', syncMedia)
    window.addEventListener('pointerdown', trackPointer, { capture: true, passive: true })
    window.addEventListener('pointermove', trackPointer, { capture: true, passive: true })
    window.addEventListener('focusin', protectEdit, true)
    window.addEventListener('keydown', allowAppKey, true)
    await router.isReady()
    if (!mounted) return
    // On reconfiguration, do not replay a page that was already visible.
    stopRefreshing = watch([enabled, () => settings.value.pointerDrawingSound], () => refresh(), { flush: 'post' })
    refresh(true)
  })
  onBeforeUnmount(() => {
    mounted = false
    token++
    stopRefreshing?.()
    noMotion.removeEventListener('change', syncMedia)
    coarse.removeEventListener('change', syncMedia)
    window.removeEventListener('pointerdown', trackPointer, true)
    window.removeEventListener('pointermove', trackPointer, true)
    window.removeEventListener('focusin', protectEdit, true)
    window.removeEventListener('keydown', allowAppKey, true)
    destroy()
    for (const key of Object.keys(PALETTE)) document.documentElement.style.removeProperty(key)
  })
  watch([theme, dark], syncTheme, { flush: 'post' })

  return { available, playing, replay, prepareRoute, drawingCurrentRoute }
}
