<template>
  <div class="plugins-view">
    <div class="page-header">
      <div>
        <h1 class="page-title"><FluentIcon icon="fluent:plug-connected-24-regular" :width="28" />{{ lang === 'en' ? 'Plugins' : '插件' }}</h1>
        <p class="page-subtitle">{{ lang === 'en' ? 'Extend CyreneNameRoller with optional, permissioned modules.' : '安装可选功能模块，插件始终通过权限化接口访问程序能力。' }}</p>
      </div>
      <div class="header-actions">
        <FluentSelect :model-value="plugins.source" :options="sourceOptions" width="170px" :disabled="plugins.safeModeStatus.enabled" @update:model-value="changeSource" />
        <FluentButton variant="secondary" size="sm" :disabled="plugins.safeModeStatus.enabled" @click="importLocal"><FluentIcon icon="arrow-upload-16-regular" :width="14" />{{ lang === 'en' ? 'Import .cnrp' : '导入 .cnrp' }}</FluentButton>
        <FluentButton variant="primary" size="sm" @click="refreshList" :disabled="loading || plugins.safeModeStatus.enabled"><FluentIcon icon="arrow-sync-16-regular" :width="14" />{{ lang === 'en' ? 'Refresh' : '刷新列表' }}</FluentButton>
      </div>
    </div>

    <div v-if="plugins.recovering" class="recovery-banner"><FluentIcon icon="shield-error-24-regular" :width="20" /><span>{{ lang === 'en' ? 'Plugins were disabled after an unsafe startup. Review and enable them one by one.' : '上次启动插件未能安全完成，已进入纯净模式并禁用插件。请逐个检查后再启用。' }}</span></div>
    <div v-if="plugins.lastError" class="error-banner"><FluentIcon icon="warning-16-regular" :width="16" /><span>{{ plugins.lastError }}</span></div>
    <div v-if="plugins.safeModeStatus.enabled" class="recovery-banner"><FluentIcon icon="shield-error-24-regular" :width="20" /><span>{{ lang === 'en' ? 'Safe mode is active. Plugins, styles and overrides stay disabled until safemode.json is changed and the app restarts.' : '安全模式已启用。修改 safemode.json 并重启前，插件、样式和覆盖包都不会加载。' }}</span></div>

    <section class="plugin-section">
      <div class="section-heading"><h2>{{ lang === 'en' ? 'Installed' : '已安装' }}</h2><span>{{ installedPlugins.length }}</span></div>
      <div v-if="installedPlugins.length" class="plugin-grid">
        <article v-for="plugin in installedPlugins" :key="plugin.manifest.id" class="plugin-card installed-card">
          <div class="plugin-card-header">
            <div class="plugin-icon"><img v-if="pluginIcon(plugin)" :src="pluginIcon(plugin)" alt="" /><FluentIcon v-else icon="plug-connected-24-regular" :width="24" /></div>
            <div class="plugin-heading"><h3>{{ plugin.manifest.name }}</h3><small>{{ plugin.manifest.id }} · v{{ plugin.manifest.version }}</small></div>
            <FluentToggle :model-value="plugin.enabled" :disabled="plugins.safeModeStatus.enabled" @update:model-value="togglePlugin(plugin, $event)" />
          </div>
          <p class="plugin-description">{{ plugin.manifest.description || (lang === 'en' ? 'No description.' : '暂无说明。') }}</p>
          <div v-if="!pluginCompatibility(plugin).compatible" class="compatibility-warning"><FluentIcon icon="warning-16-regular" :width="14" /><span>{{ pluginCompatibility(plugin).reason }}</span></div>
          <div v-else-if="pluginCompatibility(plugin).degraded" class="compatibility-warning limited"><FluentIcon icon="info-16-regular" :width="14" /><span>{{ pluginCompatibility(plugin).reason }}</span></div>
          <div class="plugin-meta"><span>{{ lang === 'en' ? 'By' : '开发者' }} {{ plugin.manifest.author }}</span><span>{{ pluginProvenance(plugin) }}</span></div>
          <div v-if="pagesFor(plugin).length" class="plugin-pages"><span>{{ lang === 'en' ? 'Extension pages' : '扩展页面' }}</span><div class="plugin-page-links"><FluentButton v-for="page in pagesFor(plugin)" :key="`${plugin.manifest.id}:${page.id}`" variant="primary" size="sm" @click="openPluginPage(page)"><FluentIcon icon="settings-16-regular" :width="14" />{{ lang === 'en' ? 'Plugin settings' : '插件设置' }}</FluentButton></div></div>
          <div class="plugin-actions"><FluentButton variant="subtle" size="sm" @click="openDetails(plugin)">{{ lang === 'en' ? 'Details' : '详情' }}</FluentButton><FluentButton variant="danger" size="sm" @click="removePlugin(plugin)">{{ lang === 'en' ? 'Uninstall' : '卸载' }}</FluentButton></div>
        </article>
      </div>
      <div v-else class="empty-state"><FluentIcon icon="plug-disconnected-24-regular" :width="28" /><span>{{ lang === 'en' ? 'No plugins installed.' : '尚未安装插件。' }}</span></div>
    </section>

    <section v-if="styleTargets.length" class="plugin-section component-style-section">
      <div class="section-heading"><h2>{{ lang === 'en' ? 'Component styles' : '组件样式' }}</h2><span>{{ styleTargets.length }}</span></div>
      <div class="style-pack-list">
        <article v-for="target in styleTargets" :key="target" class="style-pack-row">
          <div class="style-pack-copy"><strong>{{ target }}</strong><small>{{ lang === 'en' ? 'Global fallback selector' : '全局兜底选择器' }}</small></div>
          <div class="style-pack-controls">
            <FluentSelect :model-value="plugins.componentStyleSelections[target] || ''" :options="[{ value: '', label: lang === 'en' ? `Default: ${target}` : `默认：${target}` }, ...plugins.componentStyleOptions(target, lang)]" width="280px" @update:model-value="value => chooseStyle(target, value)" />
            <div v-if="target === 'roller.result'" class="style-pack-preview" :style="plugins.componentStyleStyle(target)">Aa</div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="overrideTargets.length" class="plugin-section">
      <div class="section-heading"><h2>{{ lang === 'en' ? 'Component overrides' : '组件覆盖' }}</h2><FluentButton variant="subtle" size="sm" @click="resetOverrides">{{ lang === 'en' ? 'Restore defaults' : '恢复默认界面' }}</FluentButton></div>
      <div class="style-pack-list">
        <article v-for="target in overrideTargets" :key="target" class="style-pack-row">
          <div class="style-pack-copy"><strong>{{ target }}</strong><small>{{ lang === 'en' ? 'Global fallback selector' : '全局兜底选择器' }}</small></div>
          <div class="style-pack-controls">
            <FluentSelect :model-value="plugins.componentOverrideSelections[target] || ''" :options="[{ value: '', label: lang === 'en' ? `Default: ${target}` : `默认：${target}` }, ...plugins.componentOverrideOptions(target, lang)]" width="280px" @update:model-value="value => chooseOverride(target, value)" />
          </div>
        </article>
      </div>
    </section>

    <section v-if="resultPresentations.length && !nativeSelectorTargets.has('result-presentation-select:roller.result')" class="plugin-section">
      <div class="section-heading"><h2>{{ lang === 'en' ? 'Verified result presentation' : '权威结果呈现' }}</h2><span>{{ resultPresentations.length }}</span></div>
      <div class="style-pack-controls">
        <FluentSelect
          :model-value="plugins.resultPresentationSelections['roller.result'] || ''"
          :options="[{ value: '', label: lang === 'en' ? 'Default Roller result' : '默认点名结果' }, ...plugins.resultPresentationOptions('roller.result', lang)]"
          width="280px"
          @update:model-value="chooseResultPresentation"
        />
      </div>
    </section>

    <section class="plugin-section">
      <div class="section-heading"><h2>{{ lang === 'en' ? 'Plugin catalog' : '插件列表' }}</h2><span v-if="listUpdated">{{ listUpdated }}</span></div>
      <div v-if="plugins.list.length" class="plugin-grid">
        <article v-for="item in plugins.list" :key="item.id" class="plugin-card catalog-card">
          <div class="plugin-card-header"><div class="plugin-icon"><img v-if="item.icon" :src="item.icon" alt="" /><FluentIcon v-else icon="plug-connected-24-regular" :width="24" /></div><div class="plugin-heading"><h3>{{ item.name }}</h3><small>{{ item.id }} · {{ item.version ? `v${item.version}` : (lang === 'en' ? 'Release unavailable' : '版本获取失败') }}</small></div></div>
          <p class="plugin-description">{{ item.description || (lang === 'en' ? 'No description.' : '暂无说明。') }}</p>
          <div v-if="item.releaseError" class="compatibility-warning"><FluentIcon icon="warning-16-regular" :width="14" /><span>{{ item.releaseError }}</span></div>
          <div class="plugin-meta"><span>{{ lang === 'en' ? 'By' : '开发者' }} {{ item.author || '—' }}</span><span v-if="installedVersion(item.id)">{{ catalogAction(item) }}</span></div>
          <div class="plugin-actions"><FluentButton variant="subtle" size="sm" @click="openCatalogDetails(item)">{{ lang === 'en' ? 'README / Dependencies' : 'README / 依赖' }}</FluentButton><FluentButton variant="primary" size="sm" :disabled="catalogInstallDisabled(item)" @click="installCatalogItem(item)"><FluentIcon icon="arrow-download-16-regular" :width="14" />{{ catalogButtonLabel(item) }}</FluentButton></div>
        </article>
      </div>
      <div v-else class="empty-state"><FluentIcon icon="cloud-off-24-regular" :width="28" /><span>{{ loading ? (lang === 'en' ? 'Loading catalog...' : '正在获取插件列表…') : (lang === 'en' ? 'Catalog unavailable. You can still import a local .cnrp.' : '暂时无法获取插件列表，也可以导入本地 .cnrp。') }}</span></div>
    </section>

    <FluentModal v-model="showDetails" :title="detailsTitle" max-width="720px">
      <div class="details-body"><div class="readme" v-html="detailsReadmeHtml"></div><div v-if="detailsCapabilities.length" class="dependency-block"><h3>{{ lang === 'en' ? 'Platform capabilities' : '平台能力' }}</h3><div v-for="capability in detailsCapabilities" :key="capability.id" class="dependency-item capability-item"><strong>{{ capability.label }}</strong><span>{{ capability.required ? (lang === 'en' ? 'Required' : '必需') : (lang === 'en' ? 'Optional' : '可选') }}</span><small :class="{ unavailable: !capability.available }">{{ capability.available ? (lang === 'en' ? 'Available here' : '当前可用') : (lang === 'en' ? 'Unavailable here; safely skipped' : '当前不可用，将安全跳过') }}</small></div></div><div v-if="detailsOperations.length" class="dependency-block"><h3>{{ lang === 'en' ? 'Declared system operations' : '声明的系统操作' }}</h3><div v-for="operation in detailsOperations" :key="operation.id" class="operation-item"><strong>{{ operation.label }}</strong><code>{{ operation.command.program }} {{ (operation.command.args || []).join(' ') }}</code><small>{{ (operation.platforms || []).join(' / ') }}</small></div></div><div v-if="detailsPermissions.length" class="dependency-block"><h3>{{ lang === 'en' ? 'Permissions' : '权限' }}</h3><div v-for="permission in detailsPermissions" :key="permission" class="dependency-item"><strong>{{ permission }}</strong></div></div><div v-if="detailsDependencies.length" class="dependency-block"><h3>{{ lang === 'en' ? 'Dependencies' : '依赖插件' }}</h3><div v-for="dependency in detailsDependencies" :key="dependency.id" class="dependency-item"><strong>{{ dependency.id }}</strong><span>{{ dependency.range || dependency.version || '*' }}</span><small v-if="dependency.dataAccess">{{ lang === 'en' ? 'May access shared data' : '可能访问前置插件共享数据' }}</small></div></div></div>
    </FluentModal>
    <FluentModal v-model="confirmVisible" :title="confirmTitle" max-width="560px" persistent @close="resolveConfirmation(false)">
      <div class="confirm-body" v-if="confirmMode === 'install' && confirmManifest">
        <p>{{ lang === 'en' ? `Install ${confirmManifest.name} v${confirmManifest.version}?` : `确定安装「${confirmManifest.name}」v${confirmManifest.version}？` }}</p>
        <div class="confirm-summary">
          <div><span>{{ lang === 'en' ? 'Platform' : '运行平台' }}</span><strong>{{ plugins.platform.runtime }} / {{ plugins.platform.os }}</strong></div>
          <div><span>{{ lang === 'en' ? 'Compatibility' : '兼容性' }}</span><strong :class="{ danger: !confirmCompatibility.compatible, limited: confirmCompatibility.degraded }">{{ confirmCompatibility.compatible ? (confirmCompatibility.degraded ? (lang === 'en' ? 'Compatibility mode' : '兼容性模式') : (lang === 'en' ? 'Compatible' : '兼容')) : confirmCompatibility.reason }}</strong></div>
        </div>
        <div v-if="confirmManifest.permissions?.length" class="confirm-list"><h3>{{ lang === 'en' ? 'Permissions' : '所需权限' }}</h3><ul><li v-for="permission in confirmManifest.permissions" :key="permission"><span><strong>{{ permissionInfo(permission).label }}</strong><small>{{ permission }}</small></span><em :class="`risk-${permissionInfo(permission).risk}`">{{ permissionInfo(permission).riskLabel }}</em></li></ul></div>
        <div v-if="confirmManifest.dependencies?.length" class="confirm-list"><h3>{{ lang === 'en' ? 'Dependencies' : '依赖插件' }}</h3><ul><li v-for="dependency in confirmManifest.dependencies" :key="dependency.id">{{ dependency.id }} {{ dependency.range || dependency.version || '*' }}</li></ul></div>
        <p v-if="!confirmCompatibility.compatible || confirmCompatibility.degraded" class="confirm-warning" :class="{ limited: confirmCompatibility.degraded }">{{ confirmCompatibility.reason }}</p>
      </div>
      <div class="confirm-body" v-else-if="confirmPlugin">
        <p>{{ lang === 'en' ? `Uninstall ${confirmPlugin.manifest.name}? Its settings and plugin data will be removed.` : `确定卸载「${confirmPlugin.manifest.name}」？插件设置和插件数据将一并移除。` }}</p>
      </div>
      <template #footer>
        <FluentButton variant="subtle" @click="resolveConfirmation(false)">{{ lang === 'en' ? 'Cancel' : '取消' }}</FluentButton>
        <FluentButton :variant="confirmMode === 'uninstall' ? 'danger' : 'primary'" @click="resolveConfirmation(true)">{{ confirmMode === 'uninstall' ? (lang === 'en' ? 'Uninstall' : '卸载') : (lang === 'en' ? 'Install' : '安装') }}</FluentButton>
      </template>
    </FluentModal>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { PLUGIN_DOWNLOAD_SOURCES } from '../plugins/constants'

const settingsStore = useSettingsStore()
const router = useRouter()
const plugins = usePluginsStore()
const showBanner = inject('banner')
const lang = computed(() => settingsStore.settings.language)
const sourceOptions = PLUGIN_DOWNLOAD_SOURCES
const loading = ref(false)
const downloading = ref('')
const listUpdated = ref('')
const showDetails = ref(false)
const detailsTitle = ref('')
const detailsReadmeHtml = ref('')
const detailsDependencies = ref([])
const detailsPermissions = ref([])
const detailsCapabilities = ref([])
const detailsOperations = ref([])
const confirmVisible = ref(false)
const confirmMode = ref('install')
const confirmManifest = ref(null)
const confirmPlugin = ref(null)
let confirmResolver = null
const installedPlugins = computed(() => Object.values(plugins.installed))
const contributedPages = computed(() => plugins.contributedPages)
const nativeSelectorTargets = computed(() => new Set(contributedPages.value.flatMap(page =>
  (page.native?.controls || [])
    .filter(control => ['component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'].includes(control.type))
    .map(control => `${control.type}:${control.target}`)
)))
const stylePacks = computed(() => plugins.contributedComponentStylePacks)
const styleTargets = computed(() => [...new Set(stylePacks.value.flatMap(pack => Object.keys(pack.targets || {})))]
  .filter(target => !nativeSelectorTargets.value.has(`component-style-select:${target}`))
  .sort())
const overridePacks = computed(() => plugins.contributedComponentOverridePacks)
const overrideTargets = computed(() => [...new Set(overridePacks.value.flatMap(pack => Object.keys(pack.targets || {})))]
  .filter(target => !nativeSelectorTargets.value.has(`component-override-select:${target}`))
  .sort())
const resultPresentations = computed(() => plugins.contributedResultPresentations)
const permissionDescriptions = {
  'draw:execute': { zh: '通过宿主 CAF 公平事务追加抽取结果', en: 'Run host-controlled CAF draws and append records', risk: 'elevated' },
  'ui:animations': { zh: '为宿主提供受控动画方案', en: 'Provide controlled host animations', risk: 'normal' },
  'ui:visual-surfaces': { zh: '在核心内容后方绘制 Canvas / WebGL 特效', en: 'Draw Canvas / WebGL effects behind core content', risk: 'elevated' },
  'ui:appearance': { zh: '提供受校验的全局语义外观 Token', en: 'Provide validated global semantic appearance tokens', risk: 'normal' },
  'events:lifecycle': { zh: '接收路由、主题和窗口生命周期事件', en: 'Receive route, theme and window lifecycle events', risk: 'normal' },
  'system:execute': { zh: '执行已声明的本地系统命令', en: 'Run declared local system commands', risk: 'high' },
  'records:read': { zh: '读取不可变的抽取记录快照', en: 'Read immutable record snapshots', risk: 'normal' },
  'statistics:read': { zh: '读取不可变的统计快照', en: 'Read immutable statistics snapshots', risk: 'normal' },
  'balance:read': { zh: '读取公平算法状态', en: 'Read fairness state', risk: 'normal' }
}
function permissionInfo(permission) {
  const item = permissionDescriptions[permission] || { zh: permission, en: permission, risk: permission.startsWith('system:') ? 'high' : 'normal' }
  return {
    label: lang.value === 'en' ? item.en : item.zh,
    risk: item.risk,
    riskLabel: item.risk === 'high'
      ? (lang.value === 'en' ? 'High risk' : '高风险')
      : item.risk === 'elevated'
        ? (lang.value === 'en' ? 'Sensitive' : '敏感能力')
        : (lang.value === 'en' ? 'Standard' : '常规')
  }
}

function installedVersion(id) { return plugins.installed[id]?.manifest?.version || '' }
async function chooseStyle(target, value) {
  try {
    await plugins.setComponentStyleSelection(target, value)
  } catch (error) {
    showBanner?.({ message: error.message || String(error), icon: 'warning-16-regular', type: 'warning', duration: 6000 })
  }
}
async function chooseOverride(target, value) {
  try {
    await plugins.setComponentOverrideSelection(target, value)
  } catch (error) {
    showBanner?.({ message: error.message || String(error), icon: 'warning-16-regular', type: 'warning', duration: 6000 })
  }
}
async function chooseResultPresentation(value) {
  try {
    await plugins.setResultPresentationSelection('roller.result', value)
  } catch (error) {
    showBanner?.({ message: error.message || String(error), icon: 'warning-16-regular', type: 'warning', duration: 6000 })
  }
}
async function resetOverrides() {
  await plugins.resetComponentOverrides()
}
function compareVersion(left, right) {
  const a = String(left || '0').split('.').map(value => Number(value) || 0)
  const b = String(right || '0').split('.').map(value => Number(value) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}
function catalogAction(item) {
  const installed = installedVersion(item.id)
  if (!installed) return ''
  return compareVersion(item.version, installed) > 0 ? `${lang.value === 'en' ? 'Update available' : '可更新'} · v${installed}` : `v${installed}`
}
function catalogInstallDisabled(item) { return plugins.safeModeStatus.enabled || downloading.value === item.id || !item.version || !!item.releaseError || (!!installedVersion(item.id) && compareVersion(item.version, installedVersion(item.id)) <= 0) }
function catalogButtonLabel(item) {
  if (downloading.value === item.id) return '...'
  if (!item.version || item.releaseError) return lang.value === 'en' ? 'Unavailable' : '暂不可用'
  const installed = installedVersion(item.id)
  if (!installed) return lang.value === 'en' ? 'Install' : '安装'
  if (compareVersion(item.version, installed) > 0) return lang.value === 'en' ? 'Update' : '更新'
  return lang.value === 'en' ? 'Installed' : '已安装'
}
function pagesFor(plugin) { return contributedPages.value.filter(page => page.pluginId === plugin.manifest.id && page.location === 'plugins') }
function pluginIcon(plugin) { return plugins.pluginAssetUrl(plugin) || plugin.manifest.iconDataUrl || '' }
function pluginCompatibility(plugin) { return plugins.compatibilityFor(plugin) }
function pluginProvenance(plugin) {
  if (plugin.origin === 'catalog') {
    return plugin.trusted
      ? (lang.value === 'en' ? 'Catalog / verified' : '插件列表 / 已验证')
      : (lang.value === 'en' ? 'Installed from catalog' : '插件列表安装')
  }
  if (plugin.signed) return lang.value === 'en' ? 'Local / signed' : '本地 / 签名有效'
  return lang.value === 'en' ? 'Local / unverified' : '本地 / 未验证'
}
function capabilityDetails(manifest = {}) {
  return Object.entries(manifest.capabilities || {}).map(([id, declaration]) => ({
    id,
    label: plugins.platformCapabilities[id]?.label || id,
    required: !!declaration.required,
    available: plugins.platformCapabilities[id]?.available === true
  }))
}
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])) }
function markdownToHtml(markdown) { return escapeHtml(markdown).replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n- (.+)/g, '<br>• $1').replace(/\n/g, '<br>') }
async function refreshList() { loading.value = true; try { await plugins.fetchList(); listUpdated.value = new Date().toLocaleTimeString() } catch (error) { showBanner({ message: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) } finally { loading.value = false } }
async function changeSource(value) { await plugins.setSource(value); await refreshList() }
async function togglePlugin(plugin, enabled) { try { await plugins.setEnabled(plugin.manifest.id, enabled) } catch (error) { showBanner({ message: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }); plugin.enabled = false } }
const confirmTitle = computed(() => confirmMode.value === 'uninstall' ? (lang.value === 'en' ? 'Confirm uninstall' : '确认卸载') : (lang.value === 'en' ? 'Confirm installation' : '确认安装'))
const confirmCompatibility = computed(() => confirmManifest.value ? plugins.compatibilityFor(confirmManifest.value) : { compatible: true, reason: '' })
function resolveConfirmation(value) {
  if (!confirmResolver) return
  const resolver = confirmResolver
  confirmResolver = null
  confirmVisible.value = false
  confirmManifest.value = null
  confirmPlugin.value = null
  resolver(value)
}
function confirmPluginInstall(manifest) {
  confirmMode.value = 'install'
  confirmManifest.value = manifest
  confirmPlugin.value = null
  confirmVisible.value = true
  return new Promise(resolve => { confirmResolver = resolve })
}
function confirmPluginUninstall(plugin) {
  confirmMode.value = 'uninstall'
  confirmPlugin.value = plugin
  confirmManifest.value = null
  confirmVisible.value = true
  return new Promise(resolve => { confirmResolver = resolve })
}
async function removePlugin(plugin) { if (!await confirmPluginUninstall(plugin)) return; try { await plugins.uninstall(plugin.manifest.id) } catch (error) { showBanner({ message: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) } }
async function installCatalogItem(item) { downloading.value = item.id; try { await plugins.downloadPlugin(item, [], confirmPluginInstall); showBanner({ message: `${lang.value === 'en' ? 'Installed' : '已安装'}：${item.name}`, icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 }) } catch (error) { if (!/取消|cancel/i.test(error.message)) showBanner({ message: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) } finally { downloading.value = '' } }
async function importLocal() { const input = document.createElement('input'); input.type = 'file'; input.accept = '.cnrp,application/octet-stream'; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try { const bytes = new Uint8Array(await file.arrayBuffer()); const inspected = await plugins.inspectPackage(bytes); if (!await confirmPluginInstall(inspected.manifest)) return; const installed = await plugins.installPackage(bytes, { origin: 'local' }); showBanner({ message: `${lang.value === 'en' ? 'Installed' : '已安装'}：${installed.manifest.name}`, icon: 'checkmark-circle-16-regular', type: 'success', duration: 5000 }) } catch (error) { showBanner({ message: error.message, icon: 'warning-16-regular', type: 'warning', duration: 8000 }) } }; input.click() }
function openDetails(plugin) { detailsTitle.value = `${plugin.manifest.name} v${plugin.manifest.version}`; detailsReadmeHtml.value = markdownToHtml(plugin.readme); detailsDependencies.value = plugin.manifest.dependencies || []; detailsPermissions.value = plugin.manifest.permissions || []; detailsCapabilities.value = capabilityDetails(plugin.manifest); detailsOperations.value = plugin.manifest.systemOperations || []; showDetails.value = true }
async function openCatalogDetails(item) { detailsTitle.value = item.name; detailsReadmeHtml.value = markdownToHtml(lang.value === 'en' ? 'Loading README…' : '正在获取 README…'); detailsDependencies.value = item.dependencies || []; detailsPermissions.value = item.permissions || []; detailsCapabilities.value = capabilityDetails(item); detailsOperations.value = item.systemOperations || []; showDetails.value = true; try { const details = await plugins.loadCatalogDetails(item); Object.assign(item, details); detailsTitle.value = `${details.name || item.name} v${details.version || item.version}`; detailsReadmeHtml.value = markdownToHtml(details.readme || details.readmeContent || (lang.value === 'en' ? 'README is not available.' : 'README 暂未提供。')); detailsDependencies.value = details.dependencies || []; detailsPermissions.value = details.permissions || []; detailsCapabilities.value = capabilityDetails(details); detailsOperations.value = details.systemOperations || [] } catch (error) { detailsReadmeHtml.value = markdownToHtml(error.message || String(error)) } }
function openPluginPage(page) { router.push(`/plugin/${encodeURIComponent(page.pluginId)}/${encodeURIComponent(page.id)}`) }
onMounted(async () => { await plugins.initialize(); plugins.setBannerHandler(showBanner); await refreshList() })
</script>

<style scoped>
.plugins-view { padding: 32px; max-width: 1180px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 26px; }
.page-title { margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 26px; }
.page-subtitle { margin: 8px 0 0; color: var(--text-muted); font-size: 13px; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.recovery-banner, .error-banner { display: flex; align-items: center; gap: 9px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border-default)); background: var(--accent-50); color: var(--text-primary); border-radius: var(--radius-md); padding: 12px 14px; margin-bottom: 12px; font-size: 13px; }
.error-banner { border-color: color-mix(in srgb, var(--danger) 45%, var(--border-default)); color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, var(--bg-card)); }
.plugin-section { margin-top: 24px; }
.section-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.section-heading h2 { margin: 0; font-size: 17px; color: var(--text-primary); }
.section-heading span { color: var(--text-muted); font-size: 12px; }
.plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.plugin-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-card); box-shadow: var(--shadow-2); }
.plugin-card-header { display: flex; align-items: center; gap: 10px; }
.plugin-icon { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 10px; display: grid; place-items: center; color: var(--accent); background: var(--accent-50); overflow: hidden; }
.plugin-icon img { width: 100%; height: 100%; object-fit: cover; }
.plugin-heading { min-width: 0; flex: 1; }
.plugin-heading h3 { margin: 0; color: var(--text-primary); font-size: 15px; }
.plugin-heading small { display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 11px; font-family: Consolas, monospace; }
.plugin-description { min-height: 38px; margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.compatibility-warning { display: flex; align-items: flex-start; gap: 7px; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border-default)); border-radius: var(--radius-sm); color: var(--warning); background: color-mix(in srgb, var(--warning) 8%, var(--bg-card)); font-size: 11px; line-height: 1.45; }
.compatibility-warning.limited { border-color: color-mix(in srgb, var(--accent) 30%, var(--border-default)); color: var(--text-secondary); background: color-mix(in srgb, var(--accent) 6%, var(--bg-card)); }
.plugin-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--text-muted); font-size: 11px; }
.plugin-pages { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 -4px; padding: 10px 4px 0; border-top: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border-subtle)); color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.plugin-page-links { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.plugin-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; }
.style-pack-list { display: grid; gap: 10px; }
.style-pack-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-card); }
.style-pack-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.style-pack-copy strong { color: var(--text-primary); font-size: 13px; }
.style-pack-copy small, .style-pack-copy span { color: var(--text-muted); font-size: 11px; }
.style-pack-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.style-pack-preview { width: 42px; height: 32px; display: grid; place-items: center; border: 1px solid var(--border-default); border-radius: var(--radius-sm); color: var(--plugin-component-roller-result-foreground, var(--text-primary)); background: var(--plugin-component-roller-result-background, var(--bg-hover)); font-family: var(--plugin-component-roller-result-font-family, var(--font-display)); }
.empty-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 120px; color: var(--text-muted); border: 1px dashed var(--border-default); border-radius: var(--radius-md); }
.details-body { max-height: 62vh; overflow-y: auto; color: var(--text-secondary); line-height: 1.65; font-size: 13px; }
.readme :deep(h1), .readme :deep(h2), .readme :deep(h3) { color: var(--text-primary); margin: 10px 0 6px; }
.readme :deep(code) { padding: 2px 4px; border-radius: 4px; background: var(--bg-hover); font-family: Consolas, monospace; }
.dependency-block { border-top: 1px solid var(--border-default); margin-top: 16px; padding-top: 12px; }
.dependency-block h3 { margin: 0 0 8px; color: var(--text-primary); }
.dependency-item { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border-subtle); }
.dependency-item span, .dependency-item small { color: var(--text-muted); }
.dependency-item small { margin-left: auto; }
.dependency-item small.unavailable { color: var(--warning); }
.operation-item { display: grid; grid-template-columns: minmax(120px, .7fr) minmax(0, 1.6fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); }
.operation-item code { min-width: 0; overflow-wrap: anywhere; color: var(--text-secondary); font: 11px/1.5 Consolas, monospace; }
.operation-item small { color: var(--text-muted); }
.confirm-body { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.confirm-body > p { margin: 0 0 14px; }
.confirm-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.confirm-summary > div { display: flex; flex-direction: column; gap: 4px; padding: 11px 12px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-hover); }
.confirm-summary span { color: var(--text-muted); font-size: 11px; }
.confirm-summary strong { color: var(--text-primary); overflow-wrap: anywhere; }
.confirm-summary strong.danger, .confirm-warning { color: var(--danger); }
.confirm-summary strong.limited { color: var(--warning); }
.confirm-list { padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.confirm-list h3 { margin: 0 0 6px; color: var(--text-primary); font-size: 13px; }
.confirm-list ul { margin: 0 0 12px; padding: 0; color: var(--text-secondary); font-size: 12px; list-style: none; }
.confirm-list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 0; }
.confirm-list li > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.confirm-list li small { color: var(--text-muted); font: 10px/1.4 Consolas, monospace; }
.confirm-list li em { flex: 0 0 auto; padding: 2px 7px; border-radius: var(--radius-full); font-size: 10px; font-style: normal; }
.confirm-list li .risk-normal { color: var(--text-secondary); background: var(--bg-hover); }
.confirm-list li .risk-elevated { color: var(--warning); background: color-mix(in srgb, var(--warning) 11%, transparent); }
.confirm-list li .risk-high { color: var(--danger); background: color-mix(in srgb, var(--danger) 11%, transparent); }
.confirm-warning { padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border-default)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--danger) 7%, var(--bg-card)); }
.confirm-warning.limited { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 35%, var(--border-default)); background: color-mix(in srgb, var(--warning) 7%, var(--bg-card)); }
@media (max-width: 760px) { .page-header { flex-direction: column; } .header-actions { justify-content: flex-start; } .plugins-view { padding: 20px 14px; } .style-pack-row { align-items: flex-start; flex-direction: column; } .style-pack-controls { justify-content: flex-start; } }
</style>
