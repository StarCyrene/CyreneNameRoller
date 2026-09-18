<template>
  <SplashScreen v-if="!isFloatingRoute && showSplash" @done="showSplash = false" />
  <router-view v-else-if="isFloatingRoute" />
  <AppLayout v-else />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from './components/layout/AppLayout.vue'
import SplashScreen from './components/SplashScreen.vue'
import { useSettingsStore } from './stores/settings'
import { isTauri, tauriAPI } from './utils/tauriAPI'
import { dispatchUriNavigation, parseCyreneUri, parseWebHash } from './utils/uriNavigation'

const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()
const isFloatingRoute = computed(() => route.path === '/floating')
const initialSplash = !isFloatingRoute.value && settingsStore.settings.disableSplash !== true
const showSplash = ref(initialSplash)
const splashPlayed = ref(initialSplash)
let unlistenMainShown
let unlistenUriOpen

function playSplashOnce() {
  if (splashPlayed.value || settingsStore.settings.disableSplash === true) return false
  splashPlayed.value = true
  showSplash.value = true
  return true
}

function waitForPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function prepareTauriMainWindowShow() {
  playSplashOnce()
  await nextTick()
  await waitForPaint()
  await tauriAPI.showMainWindow()
}

async function applyNavigation(navigation) {
  if (!navigation) return false
  if (navigation.route && router.currentRoute.value.path !== navigation.route) {
    await router.push(navigation.route)
  }
  dispatchUriNavigation(navigation)
  return true
}

async function handleDesktopUri(uri) {
  const navigation = parseCyreneUri(uri)
  if (!navigation) {
    await prepareTauriMainWindowShow()
    return
  }
  await applyNavigation(navigation)
  await prepareTauriMainWindowShow()
}

async function listenForMainWindowShow() {
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenMainShown = await listen('main-window-show-requested', prepareTauriMainWindowShow)
    unlistenUriOpen = await listen('uri-open-requested', event => handleDesktopUri(event.payload))
    return !!(await tauriAPI.mainWindowReady())
  }
  return false
}

onMounted(async () => {
  await nextTick()
  if (isFloatingRoute.value) return
  if (isTauri()) {
    const initialUriPending = await listenForMainWindowShow()
    if (initialUriPending) return
    const autoStart = await tauriAPI.isAutoStartLaunch()
    if (autoStart && settingsStore.settings.autoStartToTray) {
      return
    }
    await prepareTauriMainWindowShow()
  } else {
    await applyNavigation(parseWebHash())
    playSplashOnce()
  }
})
onBeforeUnmount(() => { unlistenMainShown?.(); unlistenUriOpen?.() })
</script>
