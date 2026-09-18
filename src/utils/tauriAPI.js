export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

const coreGrantTokens = new Map()

export const tauriAPI = {
  async invoke(cmd, args) {
    if (!isTauri()) return null
    try {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args)
    } catch (e) {
      console.warn(`[tauri] invoke "${cmd}" failed:`, e)
      return null
    }
  },
  async invokeStrict(cmd, args) {
    if (!isTauri()) throw new Error('Tauri API 不可用')
    return window.__TAURI_INTERNALS__.invoke(cmd, args)
  },
  async storageGet(key) { return this.invoke('storage_get', { key }) },
  async storageSet(key, value) { return this.invoke('storage_set', { key, value }) },
  async storageDelete(key) { return this.invoke('storage_delete', { key }) },
  async storageClear() { return this.invoke('storage_clear', {}) },
  async coreGrantToken(principal) { return this.invokeStrict('core_grant_token', { principal }) },
  async coreGrantTokenFor(principal) {
    if (!coreGrantTokens.has(principal)) coreGrantTokens.set(principal, await this.coreGrantToken(principal))
    return coreGrantTokens.get(principal)
  },
  async coreRevokePrincipal(principal) {
    coreGrantTokens.delete(principal)
    return this.invokeStrict('core_revoke_principal', { principal })
  },
  async coreStateSet(key, value) {
    const principal = 'core-ui'
    return this.invokeStrict('core_state_set', { request: { grantToken: await this.coreGrantTokenFor(principal), principal, key, value } })
  },
  async coreDrawExecute(request) { return this.invokeStrict('core_draw_execute', { request }) },
  async coreCardCommit(request) { return this.invokeStrict('core_card_commit', { request }) },
  async coreMaintenanceExecute(action, fields = {}) {
    const principal = 'core-ui'
    return this.invokeStrict('core_maintenance_execute', { request: { grantToken: await this.coreGrantTokenFor(principal), principal, action, ...fields } })
  },
  async exportEncryptedData() { return this.invoke('export_encrypted_data', {}) },
  async importEncryptedData(encodedData) { return this.invokeStrict('import_encrypted_data', { encodedData }) },
  async loadNames() { return this.invoke('load_names', {}) },
  async loadChangelog() { return this.invoke('load_changelog', {}) },
  async openExternal(url) { return this.invoke('open_external', { url }) },
  async pluginSelectFile(extensions = []) { return this.invokeStrict('plugin_select_file', { extensions }) },
  async pluginSelectDirectory() { return this.invokeStrict('plugin_select_directory', {}) },
  async pluginExecuteOperation(program, args = [], timeoutMs = 10000) { return this.invokeStrict('plugin_execute_operation', { program, args, timeoutMs }) },
  async showDataLocation() { return this.invoke('show_data_location', {}) },
  async setAutoStart(enabled, mode = 'scheduled', previousMode = mode) { return this.invoke('set_auto_start', { enabled, mode, previousMode }) },
  async restartElevatedForAutoStart(enabled, mode = 'scheduled', previousMode = mode) { return this.invoke('restart_elevated_for_auto_start', { enabled, mode, previousMode }) },
  async isProcessElevated() { return this.invoke('is_process_elevated', {}) },
  async isAutoStartLaunch() { return this.invoke('is_autostart_launch', {}) },
  async setUriSchemeEnabled(enabled) { return this.invoke('set_uri_scheme_enabled', { enabled }) },
  async isUriSchemeEnabled() { return this.invoke('is_uri_scheme_enabled', {}) },
  async systemAccent() { return this.invoke('system_accent', {}) },
  async safeModeStatus() { return this.invokeStrict('safe_mode_status', {}) },
  async portableModeStatus() { return this.invokeStrict('portable_mode_status', {}) },
  async setPortableMode(enabled) { return this.invokeStrict('set_portable_mode', { enabled }) },
  async saveTextFile(content, defaultName, extension = 'json') { return this.invoke('save_text_file', { content, defaultName, extension }) },
  async openTextFile(extension = 'json') { return this.invoke('open_text_file', { extension }) },
  async readDroppedFile(path) { return this.invokeStrict('read_dropped_file', { path }) },
  async revealFile(path) { return this.invoke('reveal_file', { path }) },
  async exportDataFile() { return this.invoke('export_data_file', {}) },
  async importDataFile() { return this.invoke('import_data_file', {}) },
  async checkUpdate() { return this.invoke('check_update', {}) },
  async fetchAnnouncements() { return this.invoke('fetch_announcements', {}) },
  async showMainWindow() { return this.invoke('show_main_window', {}) },
  async mainWindowReady() { return this.invoke('main_window_ready', {}) },
  async saveFloatingWindowPosition() { return this.invoke('save_floating_window_position', {}) },
  async resetFloatingWindowPosition() {
    if (!isTauri()) return { success: false, error: 'Tauri is unavailable' }
    try {
      await window.__TAURI_INTERNALS__.invoke('reset_floating_window_position', {})
      return { success: true }
    } catch (error) {
      console.warn('[tauri] reset floating window position failed:', error)
      return { success: false, error: String(error) }
    }
  },
  async setFloatingWindowStyle(
    style,
    customImage = '',
    radius = null,
    text = '点名',
    backgroundColor = '#ea5ec1',
    textColor = '#ffffff',
    textSize = null,
    opacity = 100
  ) {
    return this.invoke('set_floating_window_style', { style, customImage, radius, text, backgroundColor, textColor, textSize, opacity })
  },
  async setFloatingWindowSize(size) {
    if (!isTauri()) return { success: false, error: 'Tauri is unavailable' }
    try {
      const normalizedSize = await window.__TAURI_INTERNALS__.invoke('set_floating_window_size', { size })
      return { success: true, size: normalizedSize }
    } catch (error) {
      console.warn('[tauri] set floating window size failed:', error)
      return { success: false, error: String(error) }
    }
  },
  async downloadAndLaunchUpdate(url, fileName, expectedSize, source) {
    if (!isTauri()) return null
    return window.__TAURI_INTERNALS__.invoke('download_and_launch_update', {
      url,
      fileName,
      expectedSize,
      source
    })
  }
}
