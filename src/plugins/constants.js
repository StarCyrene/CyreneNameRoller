export const PLUGIN_API_VERSION = '1.5.0'
export const PLUGIN_LIST_REPOSITORY = 'StarCyrene/CyreneNameRoller'
export const PLUGIN_LIST_PATH = 'plugins/list.json'

export const PLUGIN_DOWNLOAD_SOURCES = [
  { value: 'cyrene', label: 'gh.昔涟.cn' },
  { value: 'ghproxy', label: 'gh-proxy.com' },
  { value: 'github', label: 'GitHub' }
]

export const PLUGIN_PERMISSIONS = new Set([
  'files:app:read',
  'files:app:write',
  'files:app:execute',
  'files:external:read',
  'files:external:write',
  'files:external:execute',
  'net:internet',
  'page:read',
  'page:write',
  'page:write-sensitive',
  'dom:main',
  'dom:settings',
  'style:host',
  'window:create',
  'window:main:control',
  'window:floating:control',
  'window:always-on-top',
  'core:names:read',
  'core:records:read',
  'core:statistics:read',
  'core:fairness:read',
  'core:before-operation',
  'system:execute',
  // API 1.4 identifiers remain known for migration display only.
  'storage:read',
  'storage:write',
  'events:draw',
  'notifications:show',
  'audio:select',
  'audio:play',
  'names:read',
  'records:read',
  'statistics:read',
  'balance:read',
  'events:lifecycle',
  'draw:execute',
  'ui:animations',
  'ui:visual-surfaces',
  'ui:appearance',
  'ui:component-styles',
  'ui:component-overrides',
  'ui:native-views',
  'ui:result-presentations',
  'ui:fonts',
  'system:open-url',
  'system:select-file',
  'system:select-directory',
  'system:clipboard-read',
  'system:clipboard-write',
  'system:reveal-file',
  'system:execute'
])

export const PLUGIN_ANIMATION_TARGETS = new Set([
  'page.transition',
  'roller.finish',
  'card.deal',
  'card.flip',
  'lottery.finish',
  'global.transition'
])

export const PLUGIN_LIFECYCLE_EVENTS = new Set([
  'app:ready',
  'app:route-changed',
  'app:theme-changed',
  'app:resize',
  'plugin:storage-changed'
])

export const PLUGIN_PLATFORM_CAPABILITIES = new Set([
  'notifications:show',
  'audio:select',
  'audio:play',
  'system:open-url',
  'system:select-file',
  'system:select-directory',
  'system:clipboard-read',
  'system:clipboard-write',
  'system:reveal-file',
  'system:execute'
])

export const PLUGIN_PLATFORM_IDS = new Set([
  'web', 'tauri', 'windows', 'macos', 'linux', 'android', 'ios'
])

// Contribution kinds describe product-owned extension surfaces rather than
// individual feature targets.  New host UI can discover these at runtime and
// plugins do not need a bespoke permission for a command that only runs inside
// their own worker.
export const PLUGIN_COMMAND_LOCATIONS = new Set([
  'command-palette', 'page-header', 'context-menu'
])

export const PLUGIN_API15_PERMISSIONS = new Set([
  'files:app:read', 'files:app:write', 'files:app:execute',
  'files:external:read', 'files:external:write', 'files:external:execute',
  'net:internet', 'page:read', 'page:write', 'page:write-sensitive',
  'dom:main', 'dom:settings', 'style:host', 'window:create',
  'window:main:control', 'window:floating:control', 'window:always-on-top',
  'core:names:read', 'core:records:read', 'core:statistics:read',
  'core:fairness:read', 'core:before-operation', 'system:execute',
  // API 1.5 declarative capability model also covers the legacy product capabilities
  // so existing plugins can migrate without losing features (audio, events, storage, UI packs).
  'storage:read', 'storage:write',
  'events:draw', 'events:lifecycle',
  'notifications:show',
  'audio:select', 'audio:play',
  'ui:animations', 'ui:visual-surfaces',
  'names:read', 'records:read', 'statistics:read', 'balance:read',
  'draw:execute'
])

function githubRawAlternative(url) {
  const match = String(url || '').match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i)
  return match ? `https://github.com/${match[1]}/${match[2]}/raw/${match[3]}/${match[4]}` : ''
}

export function pluginSourceCandidates(originalUrl, source = 'cyrene') {
  const original = String(originalUrl || '').trim()
  if (!original) return []

  const candidates = []
  const add = value => {
    if (value && !candidates.includes(value)) candidates.push(value)
  }
  if (source === 'github') {
    add(original)
    return candidates
  }

  const proxy = source === 'ghproxy' ? 'https://v4.gh-proxy.com/' : 'https://gh.昔涟.cn/'
  add(`${proxy}${original}`)
  const rawAlternative = githubRawAlternative(original)
  if (rawAlternative) add(`${proxy}${rawAlternative}`)

  // A selected mirror is a preference, not a single point of failure. Direct
  // GitHub remains the final fallback so Web users can still load the catalog.
  add(original)
  return candidates
}

export function pluginSourceUrl(originalUrl, source = 'cyrene') {
  return pluginSourceCandidates(originalUrl, source)[0] || ''
}

export function pluginListUrl(source = 'cyrene') {
  const raw = `https://raw.githubusercontent.com/${PLUGIN_LIST_REPOSITORY}/master/${PLUGIN_LIST_PATH}`
  return pluginSourceUrl(raw, source)
}

export function pluginListCandidates(source = 'cyrene') {
  const raw = `https://raw.githubusercontent.com/${PLUGIN_LIST_REPOSITORY}/master/${PLUGIN_LIST_PATH}`
  return pluginSourceCandidates(raw, source)
}
