import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dataBridge } from '../utils/dataBridge'
import { normalizeFloatingWindowOpacity, normalizeFloatingWindowStyle } from '../utils/floatingWindowStyle'
import { normalizeFloatingWindowSize, normalizeFloatingWindowTextSize } from '../utils/floatingWindowSize'
import {
  DEFAULT_FLOATING_WINDOW_BACKGROUND_COLOR,
  DEFAULT_FLOATING_WINDOW_TEXT,
  DEFAULT_FLOATING_WINDOW_TEXT_COLOR,
  normalizeFloatingWindowBackgroundColor,
  normalizeFloatingWindowText,
  normalizeFloatingWindowTextColor
} from '../utils/floatingWindowText'
import { normalizeAutoStopDuration } from '../utils/autoStop.mjs'

const DEFAULT_SETTINGS = {
  recordCounts: true,
  rainbowNames: true,
  englishMode: false,
  language: 'zh',
  groupMode: false,
  multiMode: false,
  peopleCount: 2,
  allowDuplicates: false,
  forbidDuplicates: false,
  multiStepStop: true,
  autoStop: false,
  autoStopDuration: 3,
  finishAnimation: 'spotlight',
  stepStopInterval: 0.15,
  theme: 'default',
  colorTheme: 'peach',
  customThemeColor: '#0078d4',
  downloadSource: 'ghproxy',
  particles: true,
  blur: true,
  animSpeed: 1,
  uiScale: 100,
  uiScaleVersion: 2,
  nameFontSize: 1.0,
  fontFamily: 'MiSans',
  darkMode: false,
  nameColorMode: 'gradient',
  customNameColorLight: '#d04a9d',
  customNameColorDark: '#f09bd7',
  perfBlur: true,
  perfShadows: true,
  perfAnimations: true,
  dockCollapsed: false,
  disableSplash: false,
  floatingWindowEnabled: false,
  floatingWindowStyle: 'text',
  floatingWindowOpacity: 100,
  floatingWindowCustomImage: '',
  floatingWindowText: DEFAULT_FLOATING_WINDOW_TEXT,
  floatingWindowBackgroundColor: DEFAULT_FLOATING_WINDOW_BACKGROUND_COLOR,
  floatingWindowTextColor: DEFAULT_FLOATING_WINDOW_TEXT_COLOR,
  floatingWindowTextSize: null,
  floatingWindowRadius: null,
  floatingWindowSize: 64,
  floatingCompassHintDismissed: false,
  autoStart: false,
  autoStartMode: 'registry',
  autoStartToTray: false,
  uriSchemeEnabled: false,
  newMemberCountMode: 'midpoint'
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({ ...DEFAULT_SETTINGS })
  const isLoaded = ref(false)
  const darkMode = ref(false)

  async function initialize() {
    try {
      const saved = await dataBridge.load('settings')
      if (saved && typeof saved === 'object') {
        settings.value = { ...DEFAULT_SETTINGS, ...saved }
        settings.value.newMemberCountMode = settings.value.newMemberCountMode === 'zero' ? 'zero' : 'midpoint'
        settings.value.floatingWindowStyle = normalizeFloatingWindowStyle(settings.value.floatingWindowStyle)
        settings.value.floatingWindowOpacity = normalizeFloatingWindowOpacity(settings.value.floatingWindowOpacity)
        settings.value.floatingWindowSize = normalizeFloatingWindowSize(settings.value.floatingWindowSize)
        settings.value.floatingWindowText = normalizeFloatingWindowText(settings.value.floatingWindowText)
        settings.value.floatingWindowBackgroundColor = normalizeFloatingWindowBackgroundColor(settings.value.floatingWindowBackgroundColor)
        settings.value.floatingWindowTextColor = normalizeFloatingWindowTextColor(settings.value.floatingWindowTextColor)
        settings.value.floatingWindowTextSize = normalizeFloatingWindowTextSize(settings.value.floatingWindowTextSize)
        settings.value.autoStopDuration = normalizeAutoStopDuration(settings.value.autoStopDuration)
        darkMode.value = !!saved.darkMode

        if (!saved.uiScaleVersion || saved.uiScaleVersion < 2) {
          settings.value.uiScale = Math.round((saved.uiScale || 100) * 0.8)
          save()
          settings.value.uiScaleVersion = 2
        }
      }
    } catch (e) {
      console.error('[settings] initialize failed:', e)
    }
    isLoaded.value = true
    applyUIScale()
    applyNameFontSize()
    applyDarkMode()
  }

  async function save() {
    settings.value.darkMode = darkMode.value
    await dataBridge.save('settings', settings.value)
  }

  function update(key, value) {
    settings.value[key] = value
    const saving = save()
    if (key === 'uiScale') applyUIScale()
    if (key === 'nameFontSize') applyNameFontSize()
    return saving
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
    settings.value.darkMode = darkMode.value
    save()
    applyDarkMode()
  }

  function applyDarkMode() {
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root) return
    root.classList.toggle('light', !darkMode.value)
    root.classList.toggle('dark', darkMode.value)
  }

  function applyUIScale() {
    const scale = (settings.value.uiScale || 100) / 100 * 1.25
    document.documentElement.style.setProperty('--ui-scale', scale)
  }

  function applyNameFontSize() {
    const factor = settings.value.nameFontSize || 1.0
    document.documentElement.style.setProperty('--name-font-factor', factor)
  }

  return {
    settings,
    isLoaded,
    darkMode,
    initialize,
    save,
    update,
    toggleDarkMode
  }
})
