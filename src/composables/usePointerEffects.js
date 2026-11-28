import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSwarmCursors } from 'swarm-cursors-vue'
import { normalizePointerDrawingSpeed } from '../utils/pointerDrawingPreferences.mjs'

export const pointerEffectsKey = Symbol('pointer-effects')
const EDITABLE = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [role="textbox"]'
const isEditing = element => !!(element?.isContentEditable || element?.closest?.(EDITABLE))
const canDrawPage = route => !!route?.name && route.meta.swarmCursors !== false
const changesPage = (to, from) => to.path !== from.path
const HIDE_WORKER_POINTERS = 'data-cnr-hide-worker-pointers'
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
  const coarse = window.matchMedia('(pointer: coarse), (any-pointer: coarse)')
  const fine = window.matchMedia('(pointer: fine), (any-pointer: fine)')
  // A touch-only device keeps the quiet fallback. On a hybrid device the
  // input that activated a route is independent of the drawing preference.
  const allowsEffects = () => !noMotion.matches && (!coarse.matches || fine.matches)
  const mediaAllowed = ref(allowsEffects())
  const enabled = computed(() => settings.value.pointerEffects === true && settings.value.perfAnimations !== false &&
    mediaAllowed.value)
  const playing = ref(false)
  const ready = ref(false)
  const available = computed(() => ready.value && enabled.value && canDrawPage(router.currentRoute.value))
  const drawingPath = ref(null)
  const drawingCurrentRoute = computed(() => enabled.value && drawingPath.value === router.currentRoute.value.path)
  const drawingSpeed = computed(() => normalizePointerDrawingSpeed(settings.value.pointerDrawingSpeed))
  const hideWorkerPointers = computed(() => enabled.value && settings.value.pointerHideWorkerPointers === true)
  const routeDecisions = new WeakMap()
  let replacement = null
  let core = null
  let removeState
  let stopRefreshing

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
    // The route tween and Swarm must make the same decision for this navigation.
    const options = ready.value && changesPage(to, from) && routeOptions(to)
    routeDecisions.set(to, options)
    drawingPath.value = options ? to.path : null
    return !!options
  }

  function syncTheme() {
    const palette = enabled.value && layout.value ? getComputedStyle(layout.value) : null
    for (const [key, source] of Object.entries(PALETTE)) {
      const color = palette?.getPropertyValue(source).trim()
      if (color) document.documentElement.style.setProperty(key, color)
      else document.documentElement.style.removeProperty(key)
    }
  }

  function syncDrawingSpeed() {
    if (!core?.getState().running) return
    // The vendored runtime creates the run before the core emits its running
    // state. Its speed is the same multiplier used by the built-in HUD.
    const run = window.__divPointers?.app
    if (!run?.dead && run?.engine) run.engine.speed = drawingSpeed.value
  }

  function refresh(initial = false) {
    if (!enabled.value || !layout.value) {
      destroy()
      syncTheme()
      return
    }
    destroyDrawing()
    syncTheme()
    try {
      // The native replacement tracks actual mouse input independently and
      // clears its cursor on touch, without stopping a route drawing.
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
      // Install the cover before a destination can paint. Swarm still loads
      // the renderer on demand, behind the cover. AppLayout mounts after Splash.
      core = createSwarmCursors({
        ...pointerTheme,
        router: routeAdapter(router, route => routeDecisions.get(route) ?? routeOptions(route), initial),
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
      removeState = core.on('state', state => {
        playing.value = state.running || state.loading
        if (state.running) syncDrawingSpeed()
      })
      ready.value = true
    } catch (error) {
      destroy()
      console.warn('[pointer effects] Could not initialize the animation', error)
    }
  }

  async function replay() {
    if (!available.value || isEditing(document.activeElement) || !core) return
    if (playing.value) { cancel(); return }
    core.setPageEnabled(true)
    await core.start().catch(() => {})
  }

  function syncMedia() {
    mediaAllowed.value = allowsEffects()
    if (!mediaAllowed.value) cancel()
  }
  function protectEdit(event) {
    if (isEditing(event.target)) cancel()
  }
  function allowAppKey(event) {
    // 1.3 also installs shortcuts without its HUD. Retire the overlay first so
    // it cannot stop Escape or act on the app's own modified keys.
    if (event.key === 'Escape' || (event.ctrlKey && event.shiftKey)) cancel()
  }

  onMounted(() => {
    noMotion.addEventListener('change', syncMedia)
    coarse.addEventListener('change', syncMedia)
    fine.addEventListener('change', syncMedia)
    window.addEventListener('focusin', protectEdit, true)
    window.addEventListener('keydown', allowAppKey, true)
    // On reconfiguration, do not replay a page that was already visible.
    stopRefreshing = watch([enabled, () => settings.value.pointerDrawingSound], () => refresh(), { flush: 'post' })
    refresh(true)
  })
  onBeforeUnmount(() => {
    stopRefreshing?.()
    noMotion.removeEventListener('change', syncMedia)
    coarse.removeEventListener('change', syncMedia)
    fine.removeEventListener('change', syncMedia)
    window.removeEventListener('focusin', protectEdit, true)
    window.removeEventListener('keydown', allowAppKey, true)
    destroy()
    document.documentElement.removeAttribute(HIDE_WORKER_POINTERS)
    for (const key of Object.keys(PALETTE)) document.documentElement.style.removeProperty(key)
  })
  watch(drawingSpeed, syncDrawingSpeed, { flush: 'sync' })
  watch(hideWorkerPointers, hidden => document.documentElement.toggleAttribute(HIDE_WORKER_POINTERS, hidden), { immediate: true, flush: 'sync' })
  watch([theme, dark], syncTheme, { flush: 'post' })

  return { available, playing, replay, prepareRoute, drawingCurrentRoute }
}
