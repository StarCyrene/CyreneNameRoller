import { onPluginEvent } from '../../plugins/eventBus.js'
import { useSettingsStore } from '../../stores/settings.js'
import { buildAnnouncementText } from './catalog.js'
import { ttsService } from './service.js'

let installed = false

/** 把点名结果接到语音播报上。只装一次，重复调用无副作用。 */
export function installTtsAnnouncer() {
  if (installed) return
  installed = true
  const settingsStore = useSettingsStore()

  onPluginEvent('roller:start', () => {
    if (settingsStore.settings.ttsEnabled) ttsService.stop()
  })

  onPluginEvent('roller:result', event => {
    const settings = settingsStore.settings
    if (!settings.ttsEnabled) return
    const results = event?.payload?.results
    if (!Array.isArray(results) || !results.length) return
    const names = results.map(item => item?.name ?? item?.cn).filter(Boolean)
    if (!names.length) return
    const text = buildAnnouncementText(settings.ttsTemplate, names)
    if (!text) return
    ttsService.speak(text, settings)
  })
}
