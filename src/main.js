import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { addCollection } from '@iconify/vue'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import VueFluentWidgets from 'vue-fluent-widgets'
import 'vue-fluent-widgets/style.css'
import './assets/variables.css'
import './assets/global.css'
import { isTauri, tauriAPI } from './utils/tauriAPI'
import { loadSafeModeStatus } from './plugins/safeMode'
import { getCoreClient } from './core/client'

import fluentIcons from 'virtual:fluent-icons'
addCollection(fluentIcons)

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault()
    const reloadKey = 'cyrene:stale-chunk-reload'
    const lastReload = Number(sessionStorage.getItem(reloadKey) || 0)
    if (Date.now() - lastReload < 30000) return
    sessionStorage.setItem(reloadKey, String(Date.now()))
    window.location.reload()
  })
}

async function configureServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || window.__TAURI_INTERNALS__) return
  if (import.meta.env.DEV) {
    const reloadKey = 'cyrene:dev-sw-detach-reload'
    const hadController = !!navigator.serviceWorker.controller
    const appScope = new URL(import.meta.env.BASE_URL || './', window.location.href).href
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.filter(registration => registration.scope.startsWith(appScope)).map(registration => registration.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key.startsWith('cyrene-')).map(key => caches.delete(key)))
    }
    if (hadController && sessionStorage.getItem(reloadKey) !== '1') {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
      return new Promise(() => {})
    }
    sessionStorage.removeItem(reloadKey)
    return
  }
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true })
}

async function bootstrap() {
  await configureServiceWorker().catch(() => {})
  const safeModeStatus = await loadSafeModeStatus({
    platform: isTauri() ? 'tauri' : 'web',
    baseUrl: import.meta.env.BASE_URL,
    tauriStatus: isTauri() ? () => tauriAPI.safeModeStatus() : null
  })
  if (typeof window !== 'undefined') window.__CYRENE_SAFE_MODE__ = safeModeStatus
  const pinia = createPinia()
  const settingsStore = useSettingsStore(pinia)
  await settingsStore.initialize()

  // Web：提前拉起 Core Worker，避免首抽停止时才冷启动卡住约 1 秒
  if (!isTauri()) getCoreClient().prewarm()

  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.use(VueFluentWidgets)
  app.mount('#app')
}

bootstrap()
