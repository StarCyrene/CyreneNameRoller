import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dataBridge } from '../utils/dataBridge'
import { useNamesStore } from '../stores/names'
import { useRecordsStore } from '../stores/records'
import { useStatisticsStore } from '../stores/statistics'
import { ALGORITHM_NAME, ALGORITHM_VERSION, DEFAULT_CYRENE_BALANCE_SETTINGS, TARGET_GAP, normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { getCoreClient } from '../core/client'
import { emitPluginEvent } from './eventBus'
import {
  parsePluginPackage,
  satisfiesPluginVersion
} from './package'
import {
  PLUGIN_DOWNLOAD_SOURCES,
  pluginListCandidates,
  pluginSourceCandidates
} from './constants'
import { PluginRuntime } from './runtime'
import { PluginAnimationRegistry } from './animationRegistry'
import { PluginPlatformBridge } from './platform'
import { repositorySlug, resolveCatalogRelease, fetchRepositoryOwner } from './catalog'
import { validateCoreDrawArgs } from './coreDraw'
import { getComponentTarget } from './ui/componentRegistry'
import { styleVarsForTarget } from './ui/stylePolicy'
import { PluginFontRegistry } from './ui/fontRegistry'
import { overrideStateForTarget } from './ui/overridePolicy'

const STATE_KEY = 'pluginState'
const PLUGIN_DATA_KEY = 'pluginData'
const SESSION_MARKER_KEY = 'cyrene-plugin-session-pending'
const SESSION_MARKER_VALUE = 'activation-v2'
const MAX_AUDIO_FILE_SIZE = 16 * 1024 * 1024
const MAX_PLUGIN_DATA_SIZE = 96 * 1024 * 1024
const APPEARANCE_VALUE_PREFIX = 'plugin-appearance::'
const COMPONENT_STYLE_VALUE_PREFIX = 'plugin-component-style::'

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

async function fetchFirstSuccessful(urls, options = {}, label = '插件资源') {
  const failures = []
  for (const url of urls) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response
      failures.push(`${url} → HTTP ${response.status}`)
    } catch (error) {
      failures.push(`${url} → ${error?.message || String(error)}`)
    }
  }
  throw new Error(`${label}获取失败：${failures.join('；') || '没有可用地址'}`)
}

function mimeFor(path) {
  const extension = String(path || '').split('.').pop()?.toLowerCase()
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg'
  }[extension] || 'application/octet-stream'
}

function decodeBase64Utf8(value) {
  const bytes = Uint8Array.from(atob(String(value || '').replace(/\s/g, '')), character => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export const usePluginsStore = defineStore('plugins', () => {
  const installed = ref({})
  const list = ref([])
  const source = ref('cyrene')
  const initialized = ref(false)
  const recovering = ref(false)
  const lastError = ref('')
  const pagesRevision = ref(0)
  const animationSelections = ref({})
  const animationDurationScales = ref({})
  const componentStyleSelections = ref({})
  const componentOverrideSelections = ref({})
  const resultPresentationSelections = ref({})
  const safeModeStatus = ref(Object.freeze({ enabled: false, source: 'default', stale: false, errorCode: '', diagnostic: '', path: '' }))
  const fontRegistry = new PluginFontRegistry()
  const animationRegistry = new PluginAnimationRegistry()
  const platformBridge = new PluginPlatformBridge()
  const coreClient = getCoreClient()

  const runtime = new PluginRuntime({
    getPlugin: pluginId => installed.value[pluginId],
    savePluginData,
    loadPluginData,
    showBanner: null,
    getCoreSnapshot: async kind => {
      const namesStore = useNamesStore()
      if (kind === 'names') return clone({ currentListId: namesStore.currentListId, lists: namesStore.nameLists })
      if (kind === 'records') return clone(useRecordsStore().records)
      if (kind === 'statistics') {
        const statisticsStore = useStatisticsStore()
        return clone({ counts: statisticsStore.counts, totalCount: statisticsStore.totalCount })
      }
      if (kind === 'balance') {
        const balance = normalizeCyreneBalanceSettings(await dataBridge.load('balance'))
        return clone({
          enabled: balance.enabled,
          algorithm: ALGORITHM_NAME,
          version: ALGORITHM_VERSION,
          targetGap: TARGET_GAP,
          defaults: DEFAULT_CYRENE_BALANCE_SETTINGS
        })
      }
      return null
    },
    executeCoreDraw,
    selectFile,
    playAudio,
    platformBridge,
    onFault: handleRuntimeFault
  })

  const enabledPlugins = computed(() => safeModeStatus.value.enabled ? [] : Object.values(installed.value).filter(plugin => plugin.enabled))
  const contributedPages = computed(() => {
    pagesRevision.value
    return runtime.getContributedPages()
  })
  const contributedCommands = computed(() => {
    pagesRevision.value
    return runtime.getContributedCommands()
  })
  const contributedVisualSurfaces = computed(() => {
    pagesRevision.value
    return runtime.getContributedVisualSurfaces()
  })
  const contributedAppearancePacks = computed(() => enabledPlugins.value.flatMap(plugin =>
    (plugin.manifest.contributes?.appearancePacks || []).map(pack => ({
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      value: `${APPEARANCE_VALUE_PREFIX}${plugin.manifest.id}::${pack.id}`,
      ...clone(pack)
    }))
  ))
  const contributedComponentStylePacks = computed(() => enabledPlugins.value.flatMap(plugin =>
    (plugin.manifest.contributes?.componentStylePacks || []).map(pack => ({
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      value: `${COMPONENT_STYLE_VALUE_PREFIX}${plugin.manifest.id}::${pack.id}`,
      ...clone(pack)
    }))
  ))
  const contributedComponentOverridePacks = computed(() => enabledPlugins.value.flatMap(plugin =>
    (plugin.manifest.contributes?.componentOverridePacks || []).map(pack => ({
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      value: `plugin-component-override::${plugin.manifest.id}::${pack.id}`,
      ...clone(pack)
    }))
  ))
  const contributedNativeViews = computed(() => enabledPlugins.value.flatMap(plugin =>
    (plugin.nativeViews || []).map(view => ({ ...clone(view), pluginId: plugin.manifest.id, pluginName: plugin.manifest.name, sourceLabel: '由插件提供' }))
  ).sort((left, right) => (left.order || 500) - (right.order || 500)))
  const contributedResultPresentations = computed(() => enabledPlugins.value.flatMap(plugin =>
    (plugin.manifest.contributes?.resultPresentations || []).map(presentation => ({
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      value: `plugin-result-presentation::${plugin.manifest.id}::${presentation.id}`,
      ...clone(presentation)
    }))
  ))

  function refreshPages() { pagesRevision.value += 1 }

  async function deactivatePluginRuntime(pluginId) {
    await runtime.deactivate(pluginId)
    await coreClient.revokePlugin(pluginId).catch(() => {})
  }

  async function executeCoreDraw(plugin, rawArgs = {}) {
    validateCoreDrawArgs(rawArgs)
    const receipt = await coreClient.executeDraw({ caller: { kind: 'plugin', pluginId: plugin.manifest.id }, input: rawArgs })
    for (let index = 0; index < receipt.results.length; index += 1) {
      await runtime.dispatch('draw:item-result', { ...receipt, index, result: receipt.results[index], results: undefined })
    }
    await runtime.dispatch('draw:result', receipt)
    return receipt
  }

  function executeRollerDraw(rawArgs = {}) {
    const { operationId, countStatistics, ...drawArgs } = rawArgs || {}
    validateCoreDrawArgs(drawArgs)
    return coreClient.executeDraw({ caller: { kind: 'core-ui', pluginId: 'core', operationId, countStatistics }, input: drawArgs })
  }
  function markActivationPending() {
    localStorage.setItem(SESSION_MARKER_KEY, SESSION_MARKER_VALUE)
  }

  function clearActivationMarker() {
    localStorage.removeItem(SESSION_MARKER_KEY)
  }

  async function initialize() {
    if (initialized.value) return
    if (safeModeStatus.value.enabled) {
      installed.value = {}
      animationSelections.value = {}
      animationDurationScales.value = {}
      componentStyleSelections.value = {}
      componentOverrideSelections.value = {}
      resultPresentationSelections.value = {}
      initialized.value = true
      return
    }
    const saved = await dataBridge.load(STATE_KEY)
    if (saved && typeof saved === 'object') {
      installed.value = saved.installed || {}
      animationSelections.value = saved.animationSelections && typeof saved.animationSelections === 'object' ? saved.animationSelections : {}
      animationDurationScales.value = saved.animationDurationScales && typeof saved.animationDurationScales === 'object' ? saved.animationDurationScales : {}
      componentStyleSelections.value = saved.componentStyleSelections && typeof saved.componentStyleSelections === 'object' ? saved.componentStyleSelections : {}
      componentOverrideSelections.value = saved.componentOverrideSelections && typeof saved.componentOverrideSelections === 'object' ? saved.componentOverrideSelections : {}
      resultPresentationSelections.value = saved.resultPresentationSelections && typeof saved.resultPresentationSelections === 'object' ? saved.resultPresentationSelections : {}
      source.value = PLUGIN_DOWNLOAD_SOURCES.some(item => item.value === saved.source) ? saved.source : 'cyrene'
      const sessionMarker = localStorage.getItem(SESSION_MARKER_KEY)
      const crashedSession = sessionMarker === SESSION_MARKER_VALUE
      if (sessionMarker && !crashedSession) clearActivationMarker()
      if (saved.pendingStartup || crashedSession) {
        recovering.value = true
        lastError.value = '上次启动未能完成插件激活，已自动禁用全部插件。'
        for (const plugin of Object.values(installed.value)) {
          plugin.enabled = false
          plugin.recoveryDisabled = true
        }
        await dataBridge.save(STATE_KEY, {
          ...saved,
          installed: installed.value,
          source: source.value,
          pendingStartup: false
        })
        clearActivationMarker()
      }
    }
    initialized.value = true
  }

  function setBannerHandler(handler) { runtime.showBanner = handler }

  function configureSafeMode(status) {
    safeModeStatus.value = Object.freeze({ ...status })
    if (safeModeStatus.value.enabled) refreshPages()
    return safeModeStatus.value
  }

  async function saveState(pendingStartup = undefined) {
    const current = await dataBridge.load(STATE_KEY) || {}
    await dataBridge.save(STATE_KEY, {
      ...current,
        installed: installed.value,
        source: source.value,
        animationSelections: animationSelections.value,
        animationDurationScales: animationDurationScales.value,
        componentStyleSelections: componentStyleSelections.value,
        componentOverrideSelections: componentOverrideSelections.value,
        resultPresentationSelections: resultPresentationSelections.value,
        pendingStartup: pendingStartup === undefined ? !!current.pendingStartup : !!pendingStartup
    })
  }

  function dependenciesFor(plugin) {
    return Array.isArray(plugin?.manifest?.dependencies) ? plugin.manifest.dependencies : []
  }

  function assertDependencies(plugin) {
    for (const dependency of dependenciesFor(plugin)) {
      const target = installed.value[dependency.id]
      if (!target) throw new Error(`${plugin.manifest.name} 依赖尚未安装的插件 ${dependency.id}`)
      const range = dependency.range || dependency.version || '*'
      if (!satisfiesPluginVersion(target.manifest.version, range)) {
        throw new Error(`${plugin.manifest.name} 需要 ${dependency.id} ${range}，当前为 ${target.manifest.version}`)
      }
      if (!target.enabled) throw new Error(`${plugin.manifest.name} 依赖已禁用的插件 ${dependency.id}`)
    }
  }

  function compatibilityFor(pluginOrManifest) {
    return platformBridge.compatibility(pluginOrManifest?.manifest || pluginOrManifest)
  }

  function assertPlatformCompatibility(plugin) {
    const compatibility = compatibilityFor(plugin)
    if (!compatibility.compatible) throw new Error(compatibility.reason)
    return compatibility
  }

  function activationOrder(plugins) {
    const targets = new Map(plugins.map(plugin => [plugin.manifest.id, plugin]))
    const visiting = new Set()
    const visited = new Set()
    const result = []
    const visit = plugin => {
      const id = plugin.manifest.id
      if (visited.has(id)) return
      if (visiting.has(id)) throw new Error(`检测到插件依赖环：${[...visiting, id].join(' → ')}`)
      visiting.add(id)
      for (const dependency of dependenciesFor(plugin)) {
        const target = installed.value[dependency.id]
        if (!target || !target.enabled) throw new Error(`${plugin.manifest.name} 依赖 ${dependency.id}`)
        const range = dependency.range || dependency.version || '*'
        if (!satisfiesPluginVersion(target.manifest.version, range)) {
          throw new Error(`${plugin.manifest.name} 需要 ${dependency.id} ${range}`)
        }
        if (targets.has(dependency.id)) visit(target)
      }
      visiting.delete(id)
      visited.add(id)
      result.push(plugin)
    }
    plugins.forEach(visit)
    return result
  }

  async function activateEnabled() {
    if (safeModeStatus.value.enabled) return false
    const plugins = []
    for (const plugin of Object.values(installed.value).filter(item => item.enabled)) {
      const compatibility = compatibilityFor(plugin)
      plugin.platformCompatibility = compatibility
      if (!compatibility.compatible) {
        plugin.enabled = false
        plugin.runtimeError = compatibility.reason
        continue
      }
      plugins.push(plugin)
    }
    if (!plugins.length) {
      clearActivationMarker()
      await saveState(false)
      return
    }
    await saveState(true)
    const activated = []
    try {
      for (const plugin of activationOrder(plugins)) {
        await runtime.activate(plugin)
        animationRegistry.registerPlugin(plugin, animationSelections.value)
        animationRegistry.setDurationScale(plugin.manifest.id, animationDurationScales.value[plugin.manifest.id] ?? 1)
        activated.push(plugin.manifest.id)
      }
      refreshPages()
      await refreshPluginFonts()
      await saveState(false)
      clearActivationMarker()
      lastError.value = ''
    } catch (error) {
      lastError.value = error.message || String(error)
      for (const pluginId of activated.reverse()) {
        animationRegistry.unregisterPlugin(pluginId)
        await deactivatePluginRuntime(pluginId)
      }
      for (const plugin of plugins) {
        plugin.enabled = false
        plugin.runtimeError = lastError.value
        plugin.recoveryDisabled = true
      }
      refreshPages()
      recovering.value = true
      clearActivationMarker()
      await saveState(false)
      throw error
    }
  }

  async function installPackage(input, {
    enable = true,
    origin = 'local',
    expectedPublisherKey = '',
    expectedPackageHash = ''
  } = {}) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，插件包不会被加载'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    const parsed = await parsePluginPackage(input, { expectedPublisherKey })
    if (expectedPackageHash && parsed.packageHash !== String(expectedPackageHash).toLowerCase()) {
      throw new Error('插件包哈希与目录登记不一致')
    }
    const pluginId = parsed.manifest.id
    const existing = installed.value[pluginId]
    if (existing && existing.manifest.version === parsed.manifest.version && existing.packageHash === parsed.packageHash) return existing

    const wasEnabled = !!existing?.enabled
    if (existing) {
      animationRegistry.unregisterPlugin(pluginId)
      await deactivatePluginRuntime(pluginId)
    }
    const candidate = {
      ...parsed,
      enabled: !!enable,
      origin,
      trusted: !!(parsed.publisherVerified && expectedPublisherKey),
      signed: !!parsed.publisherVerified,
      installedAt: existing?.installedAt || Date.now(),
      updatedAt: Date.now(),
      runtimeError: '',
      recoveryDisabled: false
    }
    const compatibility = compatibilityFor(candidate)
    candidate.platformCompatibility = compatibility
    if (!compatibility.compatible) {
      candidate.enabled = false
      candidate.runtimeError = compatibility.reason
    }
    installed.value[pluginId] = candidate
    try {
      if (candidate.enabled) {
        markActivationPending()
        assertPlatformCompatibility(candidate)
        assertDependencies(candidate)
        await runtime.activate(candidate)
        animationRegistry.registerPlugin(candidate, animationSelections.value)
        animationRegistry.setDurationScale(pluginId, animationDurationScales.value[pluginId] ?? 1)
      }
      refreshPages()
      await refreshPluginFonts()
      clearActivationMarker()
      recovering.value = false
      await saveState(false)
      return candidate
    } catch (error) {
      await deactivatePluginRuntime(pluginId)
      animationRegistry.unregisterPlugin(pluginId)
      if (existing) {
        installed.value[pluginId] = existing
        existing.enabled = wasEnabled
        if (wasEnabled) await runtime.activate(existing).then(() => {
          animationRegistry.registerPlugin(existing, animationSelections.value)
          animationRegistry.setDurationScale(pluginId, animationDurationScales.value[pluginId] ?? 1)
        }).catch(() => { existing.enabled = false })
      } else {
        delete installed.value[pluginId]
      }
      refreshPages()
      clearActivationMarker()
      await saveState(false)
      throw error
    }
  }

  function enabledDependents(pluginId) {
    return Object.values(installed.value).filter(plugin => plugin.enabled && dependenciesFor(plugin).some(dep => dep.id === pluginId))
  }

  async function uninstall(pluginId) {
    const dependents = enabledDependents(pluginId)
    if (dependents.length) throw new Error(`请先禁用依赖此插件的项目：${dependents.map(item => item.manifest.name).join('、')}`)
    await deactivatePluginRuntime(pluginId)
    animationRegistry.unregisterPlugin(pluginId)
    animationRegistry.removeSelectionsForPlugin(pluginId, animationSelections.value)
    removeComponentStyleSelectionsForPlugin(pluginId)
    removeComponentOverrideSelectionsForPlugin(pluginId)
    removeResultPresentationSelectionsForPlugin(pluginId)
    platformBridge.forgetPlugin(pluginId)
    delete installed.value[pluginId]
    await removePluginData(pluginId)
    await refreshPluginFonts()
    refreshPages()
    clearActivationMarker()
    await saveState(false)
  }

  async function setEnabled(pluginId, value) {
    const plugin = installed.value[pluginId]
    if (!plugin) return false
    if (safeModeStatus.value.enabled && value) throw Object.assign(new Error('安全模式已启用，重启前不会加载插件'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    if (!value) {
      const dependents = enabledDependents(pluginId)
      if (dependents.length) throw new Error(`请先禁用：${dependents.map(item => item.manifest.name).join('、')}`)
      await deactivatePluginRuntime(pluginId)
      animationRegistry.unregisterPlugin(pluginId)
      plugin.enabled = false
      removeResultPresentationSelectionsForPlugin(pluginId)
      await refreshPluginFonts()
      refreshPages()
      clearActivationMarker()
      await saveState(false)
      return true
    }
    try {
      assertPlatformCompatibility(plugin)
      assertDependencies(plugin)
      plugin.enabled = true
      plugin.runtimeError = ''
      plugin.recoveryDisabled = false
      markActivationPending()
      await runtime.activate(plugin)
      animationRegistry.registerPlugin(plugin, animationSelections.value)
      animationRegistry.setDurationScale(pluginId, animationDurationScales.value[pluginId] ?? 1)
      await refreshPluginFonts()
      recovering.value = false
      refreshPages()
      clearActivationMarker()
      await saveState(false)
    } catch (error) {
      plugin.enabled = false
      plugin.runtimeError = error.message || String(error)
      await deactivatePluginRuntime(pluginId)
      animationRegistry.unregisterPlugin(pluginId)
      refreshPages()
      clearActivationMarker()
      await saveState(false)
      throw error
    }
    return true
  }

  async function setSource(value) {
    source.value = PLUGIN_DOWNLOAD_SOURCES.some(item => item.value === value) ? value : 'cyrene'
    await saveState(false)
  }

  async function fetchList() {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，在线插件目录不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    const response = await fetchFirstSuccessful(
      pluginListCandidates(source.value),
      { cache: 'no-store', headers: { Accept: 'application/json' } },
      '插件列表'
    )
    const payload = await response.json()
    if (!Array.isArray(payload.plugins)) throw new Error('插件列表格式无效')
    const ids = new Set()
    const entries = payload.plugins.map(item => {
      if (!item?.id || (!item?.version && !item?.release) || ids.has(item.id)) throw new Error(`插件目录条目无效：${item?.id || '未知'}`)
      ids.add(item.id)
      return { ...item, dependencies: Array.isArray(item.dependencies) ? item.dependencies : [] }
    })
    list.value = await Promise.all(entries.map(async item => {
      if (!item.release) return item
      try {
        return await resolveCatalogRelease(item, { source: source.value })
      } catch (error) {
        return { ...item, version: item.version || '', releaseError: error.message || String(error) }
      }
    }))
    for (const item of list.value) {
      if (item.icon && item.author) continue
      Promise.resolve()
        .then(() => fetchRepositoryOwner(item, { source: source.value }))
        .then(owner => {
          if (!owner) return
          if (!item.icon) item.icon = owner.icon
          if (!item.author) item.author = owner.author
        })
        .catch(() => {})
    }
    return list.value
  }

  async function fetchPackage(item) {
    const original = item.downloadUrl || item.packageUrl
    if (!original) throw new Error(`${item.name || item.id} 没有可下载地址`)
    const response = await fetchFirstSuccessful(
      pluginSourceCandidates(original, source.value),
      { cache: 'no-store' },
      `${item.name || item.id} 插件包`
    )
    return new Uint8Array(await response.arrayBuffer())
  }

  async function inspectPackage(input, options = {}) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，插件包不会被解析'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    return parsePluginPackage(input, options)
  }

  async function downloadPlugin(item, trail = [], authorize = null) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，在线插件目录不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    if (trail.includes(item.id)) throw new Error(`检测到插件目录依赖环：${[...trail, item.id].join(' → ')}`)
    if (item.release) {
      const resolved = await resolveCatalogRelease(item, { source: source.value })
      Object.assign(item, resolved, { releaseError: '' })
    }
    const nextTrail = [...trail, item.id]
    const bytes = await fetchPackage(item)
    const expectedPublisherKey = item.publisherKey || ''
    const parsed = await parsePluginPackage(bytes, { expectedPublisherKey })
    if (parsed.manifest.id !== item.id || parsed.manifest.version !== item.version) {
      throw new Error('插件包身份或版本与目录条目不一致')
    }
    const expectedHash = String(item.sha256 || item.packageHash || '').toLowerCase()
    if (expectedHash && parsed.packageHash !== expectedHash) throw new Error('插件包哈希与目录登记不一致')
    if (authorize && await authorize(parsed.manifest, item) === false) throw new Error('用户取消了插件安装')

    for (const dependency of parsed.manifest.dependencies || []) {
      const range = dependency.range || dependency.version || '*'
      const current = installed.value[dependency.id]
      if (current && satisfiesPluginVersion(current.manifest.version, range)) {
        if (!current.enabled) await setEnabled(dependency.id, true)
        continue
      }
      const catalogDependency = list.value.find(candidate => candidate.id === dependency.id)
      if (!catalogDependency) throw new Error(`目录缺少依赖插件：${dependency.id}`)
      await downloadPlugin(catalogDependency, nextTrail, authorize)
      const installedDependency = installed.value[dependency.id]
      if (!installedDependency || !satisfiesPluginVersion(installedDependency.manifest.version, range)) {
        throw new Error(`依赖 ${dependency.id} 的版本不满足 ${range}`)
      }
    }
    return installPackage(bytes, {
      enable: item.defaultEnabled !== false,
      origin: 'catalog',
      expectedPublisherKey,
      expectedPackageHash: expectedHash
    })
  }

  async function loadCatalogDetails(item) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，在线插件目录不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    const details = { ...item }
    if (details.readme || details.readmeContent) return details
    if (details.readmeUrl) {
      const response = await fetchFirstSuccessful(
        pluginSourceCandidates(details.readmeUrl, source.value),
        { cache: 'no-store' },
        `${details.name || details.id} README`
      )
      details.readme = await response.text()
      return details
    }
    const slug = repositorySlug(details.repository)
    if (!slug) return details
    try {
      const repoResponse = await fetchFirstSuccessful(pluginSourceCandidates(`https://api.github.com/repos/${slug}`, source.value), {
        cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }
      }, '插件仓库信息')
      const repository = await repoResponse.json()
      details.author ||= repository.owner?.login || ''
      details.icon ||= repository.owner?.avatar_url || ''
      details.description ||= repository.description || ''
      const readmeResponse = await fetchFirstSuccessful(pluginSourceCandidates(`https://api.github.com/repos/${slug}/readme`, source.value), {
        cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }
      }, '插件 README')
      const readme = await readmeResponse.json()
      if (readme.content) details.readme = decodeBase64Utf8(readme.content)
    } catch (error) {
      console.warn('[plugins] catalog metadata unavailable', error)
    }
    return details
  }

  function pageById(pluginId, pageId) {
    pagesRevision.value
    return runtime.getContributedPages().find(page => page.pluginId === pluginId && page.id === pageId)
  }

  function invokePluginCommand(pluginId, commandId, args = {}) {
    if (safeModeStatus.value.enabled) return Promise.reject(Object.assign(new Error('安全模式已启用，插件命令不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' }))
    return runtime.invokeCommand(pluginId, commandId, args)
  }

  function appearanceByValue(value) {
    const source = String(value || '')
    if (!source.startsWith(APPEARANCE_VALUE_PREFIX)) return null
    return contributedAppearancePacks.value.find(pack => pack.value === source) || null
  }

  function appearanceOptions(language = 'zh') {
    return contributedAppearancePacks.value.map(pack => ({
      value: pack.value,
      label: language === 'en' && pack.titleEn ? pack.titleEn : pack.title,
      description: pack.description,
      icon: 'fluent:paint-brush-16-regular',
      pluginId: pack.pluginId,
      pluginName: pack.pluginName
    }))
  }

  function resolveAppearance(value, dark = false) {
    const pack = appearanceByValue(value)
    if (!pack) return null
    return { ...pack, tokens: clone(dark ? pack.dark : pack.light) }
  }

  function componentStyleByValue(value) {
    const source = String(value || '')
    if (!source.startsWith(COMPONENT_STYLE_VALUE_PREFIX)) return null
    return contributedComponentStylePacks.value.find(pack => pack.value === source) || null
  }

  function componentStyleOptions(targetId, language = 'zh') {
    const target = getComponentTarget(targetId, platformBridge.info().runtime)
    if (!target?.available) return []
    return contributedComponentStylePacks.value.filter(pack => pack.targets?.[targetId]).map(pack => ({
      value: pack.value,
      label: language === 'en' ? (pack.titleEn || pack.title) : pack.title,
      pluginId: pack.pluginId,
      pluginName: pack.pluginName
    }))
  }

  function componentStyleStyle(targetId) {
    const value = componentStyleSelections.value[targetId]
    const pack = componentStyleByValue(value)
    const styles = pack?.targets?.[targetId] || {}
    return styleVarsForTarget(targetId, styles)
  }

  async function setComponentStyleSelection(targetId, value) {
    const target = getComponentTarget(targetId, platformBridge.info().runtime)
    if (!target?.available) throw new Error('组件目标当前平台不可用')
    const normalized = String(value || '')
    if (normalized && !componentStyleByValue(normalized)?.targets?.[targetId]) throw new Error('所选组件样式不存在或未启用')
    componentStyleSelections.value = { ...componentStyleSelections.value, [targetId]: normalized }
    await saveState(false)
    return true
  }

  function removeComponentStyleSelectionsForPlugin(pluginId) {
    const next = { ...componentStyleSelections.value }
    for (const [targetId, value] of Object.entries(next)) if (String(value).startsWith(`${COMPONENT_STYLE_VALUE_PREFIX}${pluginId}::`)) delete next[targetId]
    componentStyleSelections.value = next
  }

  function removeComponentOverrideSelectionsForPlugin(pluginId) {
    const next = { ...componentOverrideSelections.value }
    for (const [targetId, value] of Object.entries(next)) if (String(value).startsWith(`plugin-component-override::${pluginId}::`)) delete next[targetId]
    componentOverrideSelections.value = next
  }

  function removeResultPresentationSelectionsForPlugin(pluginId) {
    const next = { ...resultPresentationSelections.value }
    for (const [target, value] of Object.entries(next)) if (String(value).startsWith(`plugin-result-presentation::${pluginId}::`)) delete next[target]
    resultPresentationSelections.value = next
  }

  function componentOverrideByValue(value) {
    return contributedComponentOverridePacks.value.find(pack => pack.value === String(value || '')) || null
  }

  function componentOverrideOptions(targetId, language = 'zh') {
    return contributedComponentOverridePacks.value.filter(pack => pack.targets?.[targetId]).map(pack => ({ value: pack.value, label: language === 'en' ? (pack.titleEn || pack.title) : pack.title, pluginId: pack.pluginId, pluginName: pack.pluginName }))
  }

  function nativeViewsForSlot(slot) {
    if (!String(slot || '').startsWith('slot:')) return []
    return contributedNativeViews.value.filter(view => view.slot === slot)
  }

  function resultPresentationByValue(value) {
    return contributedResultPresentations.value.find(presentation => presentation.value === String(value || '')) || null
  }

  function resultPresentationOptions(target = 'roller.result', language = 'zh') {
    return contributedResultPresentations.value.filter(presentation => presentation.targets?.includes(target)).map(presentation => ({ value: presentation.value, label: language === 'en' ? (presentation.titleEn || presentation.title) : presentation.title, pluginId: presentation.pluginId, pluginName: presentation.pluginName }))
  }

  function resultPresentationForTarget(target = 'roller.result') {
    const value = resultPresentationSelections.value[target]
    const presentation = resultPresentationByValue(value)
    return presentation?.targets?.includes(target) ? presentation : null
  }

  async function setResultPresentationSelection(target, value) {
    const normalized = String(value || '')
    if (normalized && !resultPresentationByValue(normalized)?.targets?.includes(target)) throw new Error('所选结果呈现不存在或未启用')
    resultPresentationSelections.value = { ...resultPresentationSelections.value, [target]: normalized }
    await saveState(false)
    return true
  }

  function componentOverrideState(targetId) {
    return overrideStateForTarget(targetId, contributedComponentOverridePacks.value, componentOverrideSelections.value[targetId])
  }

  async function setComponentOverrideSelection(targetId, value) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，覆盖包不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    const normalized = String(value || '')
    if (normalized && !componentOverrideByValue(normalized)?.targets?.[targetId]) throw new Error('所选覆盖包不存在或未启用')
    componentOverrideSelections.value = { ...componentOverrideSelections.value, [targetId]: normalized }
    await saveState(false)
    return true
  }

  async function resetComponentOverrides() {
    componentOverrideSelections.value = {}
    await saveState(false)
  }

  async function refreshPluginFonts() {
    fontRegistry.clear()
    for (const plugin of enabledPlugins.value) await fontRegistry.register(plugin, plugin.manifest.contributes?.fonts || [])
  }

  function pluginById(pluginId) { return installed.value[pluginId] }

  function pluginAssetUrl(pluginOrId, path = '') {
    const plugin = typeof pluginOrId === 'string' ? pluginById(pluginOrId) : pluginOrId
    const assetPath = path || plugin?.manifest?.icon
    const encoded = plugin?.files?.[assetPath]
    return encoded ? `data:${mimeFor(assetPath)};base64,${encoded}` : ''
  }

  function pluginPageSource(pluginId, pageId) {
    if (safeModeStatus.value.enabled) return ''
    const plugin = pluginById(pluginId)
    const page = pageById(pluginId, pageId)
    return plugin && page ? runtime.frameSource(plugin, page) : ''
  }

  async function requestPlugin(pluginId, method, args = {}) {
    if (safeModeStatus.value.enabled) throw Object.assign(new Error('安全模式已启用，插件请求不可用'), { code: 'SAFE_MODE_PLUGIN_BLOCKED' })
    return runtime.handleRpc(pluginId, method, args)
  }

  function animationOptions(target, options = {}) {
    return animationRegistry.optionsFor(target, options)
  }

  function animationSelectionValue(target) {
    return animationSelections.value[target] || ''
  }

  async function setAnimationSelection(target, value) {
    const normalized = String(value || '')
    if (normalized && !animationRegistry.resolve(target, animationSelections.value, normalized)) throw new Error('所选插件动画不存在或尚未启用')
    animationSelections.value = { ...animationSelections.value, [target]: normalized }
    await saveState(false)
    return true
  }

  function hasAnimation(target) {
    return animationRegistry.has(target, animationSelections.value)
  }

  function animationDurationScale(pluginId) {
    return animationDurationScales.value[String(pluginId)] ?? 1
  }

  async function setAnimationDurationScale(pluginId, value) {
    const id = String(pluginId || '')
    if (!id) return 1
    const normalized = animationRegistry.setDurationScale(id, value)
    animationDurationScales.value = { ...animationDurationScales.value, [id]: normalized }
    await saveState(false)
    return normalized
  }

  function startAnimation(target, element = null, options = {}) {
    return animationRegistry.start(target, element, animationSelections.value, options)
  }

  function registerAnimationSurface(target, element) { animationRegistry.registerSurface(target, element) }
  function unregisterAnimationSurface(target, element) { animationRegistry.unregisterSurface(target, element) }

  function mountPageFrame(frame, pluginId, pageId) { runtime.mountFrame(frame, pluginId, pageId) }
  function unmountPageFrame(pluginId, pageId) { runtime.unmountFrame(pluginId, pageId) }
  function connectPageFrame(frame, pluginId, pageId) { return runtime.connectFrame(frame, pluginId, pageId) }
  function mountVisualSurface(canvas, pluginId, surfaceId, viewport) { return runtime.mountVisualSurface(canvas, pluginId, surfaceId, viewport) }
  function resizeVisualSurface(pluginId, surfaceId, viewport) { runtime.resizeVisualSurface(pluginId, surfaceId, viewport) }
  function unmountVisualSurface(pluginId, surfaceId) { runtime.unmountVisualSurface(pluginId, surfaceId) }

  async function dispatchEvent(event, payload) {
    emitPluginEvent(event, payload)
    if (safeModeStatus.value.enabled) return
    await runtime.dispatch(event, clone(payload))
  }

  async function handlePluginMessage(event) {
    if (safeModeStatus.value.enabled) return
    const message = event.data || {}
    if (!message.pluginId || message.type !== 'rpc-request') return
    if (!runtime.ownsFrameSource(event.source, message.pluginId)) return
    try {
      const result = await runtime.handleRpc(message.pluginId, message.method, message.args)
      event.source?.postMessage({ type: 'rpc-response', id: message.id, result: clone(result) }, '*')
    } catch (error) {
      event.source?.postMessage({ type: 'rpc-response', id: message.id, code: error.code, error: error.message || String(error) }, '*')
    }
  }

  async function handleRuntimeFault(pluginId, error) {
    const plugin = installed.value[pluginId]
    if (!plugin) return
    plugin.enabled = false
    plugin.runtimeError = error.message || String(error)
    lastError.value = `${plugin.manifest.name} 已因运行异常被禁用：${plugin.runtimeError}`
    await deactivatePluginRuntime(pluginId)
    animationRegistry.unregisterPlugin(pluginId)
    removeComponentOverrideSelectionsForPlugin(pluginId)
    removeResultPresentationSelectionsForPlugin(pluginId)
    await refreshPluginFonts()
    refreshPages()
    clearActivationMarker()
    await saveState(false)
    runtime.showBanner?.({ message: lastError.value, icon: 'shield-error-24-regular', type: 'warning', duration: 0, dismissible: true })
  }

  function markCleanShutdown() {
    clearActivationMarker()
  }

  return {
    installed, list, source, initialized, recovering, lastError, enabledPlugins, contributedPages, contributedCommands, contributedVisualSurfaces, contributedAppearancePacks, contributedComponentStylePacks, contributedComponentOverridePacks, contributedNativeViews, contributedResultPresentations, animationSelections, animationDurationScales, componentStyleSelections, componentOverrideSelections, resultPresentationSelections, safeModeStatus,
    initialize, configureSafeMode, setBannerHandler, saveState, activateEnabled, inspectPackage, installPackage, uninstall, setEnabled,
    setSource, fetchList, downloadPlugin, loadCatalogDetails, pageById, appearanceByValue, appearanceOptions, resolveAppearance, componentStyleByValue, componentStyleOptions, componentStyleStyle, setComponentStyleSelection, componentOverrideByValue, componentOverrideOptions, nativeViewsForSlot, resultPresentationByValue, resultPresentationOptions, resultPresentationForTarget, setResultPresentationSelection, componentOverrideState, setComponentOverrideSelection, resetComponentOverrides, pluginById, pluginAssetUrl,
    pluginPageSource, requestPlugin, invokePluginCommand, executeRollerDraw, mountPageFrame, connectPageFrame, unmountPageFrame, mountVisualSurface, resizeVisualSurface, unmountVisualSurface,
    animationOptions, animationSelectionValue, setAnimationSelection, hasAnimation, startAnimation, animationDurationScale, setAnimationDurationScale, registerAnimationSurface, unregisterAnimationSurface,
    dispatchEvent, handlePluginMessage, markCleanShutdown,
    compatibilityFor, platform: platformBridge.info(), platformCapabilities: platformBridge.capabilities()
  }
})

async function loadPluginData(pluginId, key) {
  const all = await dataBridge.load(PLUGIN_DATA_KEY) || {}
  return clone(all?.[pluginId]?.[key])
}

async function savePluginData(pluginId, key, value) {
  const all = await dataBridge.load(PLUGIN_DATA_KEY) || {}
  if (!all[pluginId]) all[pluginId] = {}
  all[pluginId][key] = clone(value)
  const serialized = JSON.stringify(all[pluginId])
  if (new TextEncoder().encode(serialized).byteLength > MAX_PLUGIN_DATA_SIZE) throw new Error('插件数据超过 96 MB 配额')
  await dataBridge.save(PLUGIN_DATA_KEY, all)
  return true
}

async function removePluginData(pluginId) {
  const all = await dataBridge.load(PLUGIN_DATA_KEY) || {}
  delete all[pluginId]
  await dataBridge.save(PLUGIN_DATA_KEY, all)
}

function selectFile(accept = 'audio/*') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      if (file.size > MAX_AUDIO_FILE_SIZE) return reject(new Error('音频文件不能超过 16 MB'))
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
      const type = file.type || mimeFor(file.name)
      resolve({ name: file.name, type, size: file.size, dataUrl: `data:${type};base64,${btoa(binary)}` })
    }
    input.click()
  })
}

const playingAudio = new Set()
function playAudio(source, volume = 1) {
  if (!source) return false
  const audio = new Audio(source)
  audio.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
  playingAudio.add(audio)
  const release = () => playingAudio.delete(audio)
  audio.onended = release
  audio.onerror = release
  return audio.play().then(() => true).catch(() => { release(); return false })
}
