import JSZip from 'jszip'
import {
  PLUGIN_ANIMATION_TARGETS,
  PLUGIN_API_VERSION,
  PLUGIN_COMMAND_LOCATIONS,
  PLUGIN_LIFECYCLE_EVENTS,
  PLUGIN_PERMISSIONS,
  PLUGIN_PLATFORM_CAPABILITIES,
  PLUGIN_PLATFORM_IDS
} from './constants'
import { normalizeComponentStylePacks } from './ui/stylePolicy'
import { normalizeFonts, validateFontFiles } from './ui/fontRegistry'
import { normalizeComponentOverridePacks } from './ui/overridePolicy'
import { normalizeNativeViews, normalizeNativeViewDocument } from './ui/nativeViewPolicy'
import { normalizeResultPresentations } from './ui/resultPresentationPolicy'
import { getComponentTarget } from './ui/componentRegistry'

const MAX_PLUGIN_SIZE = 32 * 1024 * 1024
const MAX_FILE_COUNT = 256
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/
const CONTRIBUTION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/
const SETTING_PATH_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/i
const MAX_ANIMATION_DURATION_MS = 5000
const MAX_ANIMATION_DELAY_MS = 1500
const MAX_ANIMATION_ITERATIONS = 3
const ANIMATION_TIMEOUT_GRACE_MS = 500
export const MAX_PLUGIN_ANIMATION_ACTIVE_MS = MAX_ANIMATION_DELAY_MS + (MAX_ANIMATION_DURATION_MS * MAX_ANIMATION_ITERATIONS) + ANIMATION_TIMEOUT_GRACE_MS
const ANIMATION_FRAME_PROPERTIES = new Set([
  'opacity', 'transform', 'filter', 'clipPath', 'borderRadius', 'boxShadow', 'textShadow',
  'color', 'background', 'backgroundColor', 'letterSpacing', 'offset', 'easing', 'composite'
])
const GSAP_ANIMATION_PROPERTIES = new Set([
  'opacity', 'autoAlpha', 'x', 'y', 'xPercent', 'yPercent',
  'scale', 'scaleX', 'scaleY', 'rotation', 'rotate', 'rotationX', 'rotationY', 'rotateX', 'rotateY',
  'skewX', 'skewY', 'filter', 'clipPath', 'borderRadius', 'boxShadow', 'textShadow',
  'color', 'background', 'backgroundColor', 'letterSpacing', 'transformOrigin'
])
const UNSAFE_VISUAL_VALUE_PATTERN = /url\s*\(|image-set\s*\(|cross-fade\s*\(|paint\s*\(|(?:https?:|data:|blob:|\/\/)/i
const APPEARANCE_COLOR_TOKENS = new Set([
  '--accent', '--accent-light', '--accent-dark', '--accent-hover', '--accent-200', '--accent-50', '--text-on-accent',
  '--bg-base', '--bg-card', '--bg-card-solid', '--bg-hover', '--bg-acrylic', '--bg-mica',
  '--text-primary', '--text-secondary', '--text-muted',
  '--border-default', '--border-subtle', '--border-strong'
])
const APPEARANCE_SHADOW_TOKENS = new Set(['--shadow-2', '--shadow-4', '--shadow-8', '--shadow-16'])
const APPEARANCE_TOKENS = new Set([...APPEARANCE_COLOR_TOKENS, ...APPEARANCE_SHADOW_TOKENS])
const ANIMATION_DIRECTIONS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse'])
const VISUAL_SURFACE_EVENTS = new Set([
  ...PLUGIN_LIFECYCLE_EVENTS,
  'draw:item-result', 'draw:result',
  'roller:start', 'roller:item-result', 'roller:result',
  'card:item-result', 'card:result',
  'lottery:item-result', 'lottery:result', 'lottery:assign-result'
])
export const CNRP_MAGIC = 'CNRP1\n'

export function comparePluginVersions(left, right) {
  const a = String(left || '0').split('.').map(value => Number(value) || 0)
  const b = String(right || '0').split('.').map(value => Number(value) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}


export function satisfiesPluginVersion(version, range = '*') {
  const wanted = String(range || '*').trim()
  if (!wanted || wanted === '*') return true
  if (wanted.startsWith('^')) {
    const base = wanted.slice(1)
    const major = Number(base.split('.')[0]) || 0
    return comparePluginVersions(version, base) >= 0 && Number(String(version).split('.')[0]) === major
  }
  if (wanted.startsWith('~')) {
    const base = wanted.slice(1)
    const [major = 0, minor = 0] = base.split('.').map(Number)
    const [actualMajor = 0, actualMinor = 0] = String(version).split('.').map(Number)
    return comparePluginVersions(version, base) >= 0 && actualMajor === major && actualMinor === minor
  }
  if (wanted.startsWith('>=')) return comparePluginVersions(version, wanted.slice(2).trim()) >= 0
  if (wanted.startsWith('>')) return comparePluginVersions(version, wanted.slice(1).trim()) > 0
  if (wanted.startsWith('<=')) return comparePluginVersions(version, wanted.slice(2).trim()) <= 0
  if (wanted.startsWith('<')) return comparePluginVersions(version, wanted.slice(1).trim()) < 0
  return comparePluginVersions(version, wanted) === 0
}

function validatePath(path) {
  const normalized = String(path || '').replace(/\\/g, '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('/..')) {
    throw new Error(`插件包含不安全路径：${path}`)
  }
  return normalized
}

function normalizePlatforms(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${label}必须是平台数组`)
  const platforms = [...new Set(value.map(item => String(item).toLowerCase()))]
  const unknown = platforms.find(item => !PLUGIN_PLATFORM_IDS.has(item))
  if (unknown) throw new Error(`${label}包含未知平台：${unknown}`)
  return platforms
}

function normalizePlatformEntries(value, label) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}无效`)
  const result = {}
  for (const [platform, path] of Object.entries(value)) {
    if (!PLUGIN_PLATFORM_IDS.has(platform)) throw new Error(`${label}包含未知平台：${platform}`)
    result[platform] = validatePath(path)
  }
  return result
}

function normalizeCapabilities(value, permissions) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('capabilities 必须是对象')
  const result = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!PLUGIN_PLATFORM_CAPABILITIES.has(id)) throw new Error(`未知平台能力：${id}`)
    const declaration = raw === true ? { required: true } : raw === false ? { required: false } : raw
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) throw new Error(`平台能力声明无效：${id}`)
    if (!permissions.includes(id)) throw new Error(`平台能力 ${id} 必须同时加入 permissions`)
    result[id] = {
      required: !!declaration.required,
      platforms: normalizePlatforms(declaration.platforms, `${id}.platforms`)
    }
  }
  const undeclared = permissions.find(permission => permission.startsWith('system:') && !result[permission])
  if (undeclared) throw new Error(`系统权限 ${undeclared} 必须在 capabilities 中声明是否为必需能力`)
  return result
}

function normalizeSystemOperations(value, permissions) {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return []
  if (!permissions.includes('system:execute')) throw new Error('systemOperations 需要 system:execute 权限')
  if (!Array.isArray(value)) throw new Error('systemOperations 必须是数组')
  const ids = new Set()
  return value.map(operation => {
    if (!operation || typeof operation !== 'object' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(operation.id || '') || ids.has(operation.id)) {
      throw new Error(`系统操作 ID 无效或重复：${operation?.id || '未知'}`)
    }
    ids.add(operation.id)
    if (!operation.label || String(operation.label).length > 100) throw new Error(`系统操作 ${operation.id} 缺少简短说明`)
    const platforms = normalizePlatforms(operation.platforms, `${operation.id}.platforms`)
    if (!platforms.length || platforms.includes('web')) throw new Error(`系统操作 ${operation.id} 必须声明非 Web 平台`)
    const command = operation.command
    if (!command || typeof command !== 'object') throw new Error(`系统操作 ${operation.id} 缺少固定命令`)
    const program = String(command.program || '')
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(program)) throw new Error(`系统操作 ${operation.id} 的程序名无效`)
    const args = Array.isArray(command.args) ? command.args.map(String) : []
    if (args.length > 32 || args.some(argument => argument.includes('\0') || argument.length > 2048)) {
      throw new Error(`系统操作 ${operation.id} 的固定参数无效`)
    }
    return {
      id: operation.id,
      label: String(operation.label),
      platforms,
      command: { program, args },
      timeoutMs: Math.max(1000, Math.min(30000, Number(operation.timeoutMs) || 10000))
    }
  })
}

function normalizeAnimationOptions(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}.options 无效`)
  const duration = Number(value.duration)
  const delay = Number(value.delay || 0)
  const iterations = Number(value.iterations || 1)
  const easing = String(value.easing || 'ease')
  const direction = String(value.direction || 'normal')
  if (!Number.isFinite(duration) || duration < 80 || duration > MAX_ANIMATION_DURATION_MS) throw new Error(`${label}.options.duration 必须在 80-${MAX_ANIMATION_DURATION_MS}ms`)
  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_ANIMATION_DELAY_MS) throw new Error(`${label}.options.delay 必须在 0-${MAX_ANIMATION_DELAY_MS}ms`)
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > MAX_ANIMATION_ITERATIONS) throw new Error(`${label}.options.iterations 必须在 1-${MAX_ANIMATION_ITERATIONS}`)
  if (!/^[a-z0-9().,%\s+\-*/]+$/i.test(easing) || easing.length > 160) throw new Error(`${label}.options.easing 无效`)
  if (!ANIMATION_DIRECTIONS.has(direction)) throw new Error(`${label}.options.direction 无效`)
  return { duration, delay, iterations, easing, direction, fill: 'both' }
}

function normalizeSafeAnimationValue(raw, label) {
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') throw new Error(label + ' 无效')
  if (typeof raw === 'boolean') return raw
  const serialized = String(raw)
  if (serialized.length > 600 || /[{};<>\\]/.test(serialized) || UNSAFE_VISUAL_VALUE_PATTERN.test(serialized)) {
    throw new Error(label + ' 过长或包含不安全内容')
  }
  return raw
}

function normalizeGsapVars(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' 无效')
  const normalized = {}
  for (const [property, raw] of Object.entries(value)) {
    if (!GSAP_ANIMATION_PROPERTIES.has(property)) throw new Error(label + ' 不允许属性 ' + property)
    normalized[property] = normalizeSafeAnimationValue(raw, label + '.' + property)
  }
  if (!Object.keys(normalized).length) throw new Error(label + ' 至少需要一个动画属性')
  return normalized
}

function normalizeGsapOptions(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + '.options 无效')
  const duration = Number(value.duration)
  const delay = Number(value.delay || 0)
  const repeat = Number(value.repeat || 0)
  const ease = String(value.ease || value.easing || 'power3.out')
  if (!Number.isFinite(duration) || duration < 80 || duration > MAX_ANIMATION_DURATION_MS) throw new Error(label + '.options.duration 必须在 80-' + MAX_ANIMATION_DURATION_MS + 'ms')
  if (!Number.isFinite(delay) || delay < 0 || delay > MAX_ANIMATION_DELAY_MS) throw new Error(label + '.options.delay 必须在 0-' + MAX_ANIMATION_DELAY_MS + 'ms')
  if (!Number.isInteger(repeat) || repeat < 0 || repeat >= MAX_ANIMATION_ITERATIONS) throw new Error(label + '.options.repeat 必须在 0-' + (MAX_ANIMATION_ITERATIONS - 1))
  if (!/^[a-z0-9().,%\s+\-*/]+$/i.test(ease) || ease.length > 160) throw new Error(label + '.options.ease 无效')
  return { duration, delay, repeat, ease, yoyo: value.yoyo === true }
}

function normalizeAnimationKeyframes(value, label) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 32) throw new Error(`${label}.keyframes 必须包含 2-32 帧`)
  let previousOffset = -1
  return value.map((frame, index) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error(`${label}.keyframes[${index}] 无效`)
    const normalized = {}
    for (const [property, raw] of Object.entries(frame)) {
      if (!ANIMATION_FRAME_PROPERTIES.has(property)) throw new Error(`${label}.keyframes[${index}] 不允许属性 ${property}`)
      if (property === 'offset') {
        const offset = Number(raw)
        if (!Number.isFinite(offset) || offset < 0 || offset > 1 || offset < previousOffset) throw new Error(`${label}.keyframes[${index}].offset 无效`)
        previousOffset = offset
        normalized.offset = offset
        continue
      }
      if (property === 'composite') {
        if (!['replace', 'add', 'accumulate'].includes(raw)) throw new Error(`${label}.keyframes[${index}].composite 无效`)
        normalized.composite = raw
        continue
      }
      if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`${label}.keyframes[${index}].${property} 无效`)
      const serialized = String(raw)
      if (serialized.length > 600 || /[{};<>\\]/.test(serialized) || UNSAFE_VISUAL_VALUE_PATTERN.test(serialized)) {
        throw new Error(`${label}.keyframes[${index}].${property} 过长或包含不安全内容`)
      }
      normalized[property] = raw
    }
    if (!Object.keys(normalized).some(property => !['offset', 'easing', 'composite'].includes(property))) {
      throw new Error(`${label}.keyframes[${index}] 没有可动画属性`)
    }
    return normalized
  })
}

function normalizeAnimationDefinition(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 无效`)
  if (value.gsap !== undefined) {
    if (!value.gsap || typeof value.gsap !== 'object' || Array.isArray(value.gsap)) throw new Error(`${label}.gsap 无效`)
    return {
      engine: 'gsap',
      gsap: {
        from: normalizeGsapVars(value.gsap.from, `${label}.gsap.from`),
        to: normalizeGsapVars(value.gsap.to, `${label}.gsap.to`)
      },
      options: normalizeGsapOptions(value.gsap.options || value.options || {}, label)
    }
  }
  return {
    engine: 'waapi',
    keyframes: normalizeAnimationKeyframes(value.keyframes, label),
    options: normalizeAnimationOptions(value.options || {}, label)
  }
}

export function normalizeAnimationPack(value, declaration = {}) {
  const label = `动画包 ${declaration.id || 'unknown'}`
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) throw new Error(`${label} schemaVersion 必须为 1`)
  if (!Array.isArray(value.presets) || !value.presets.length || value.presets.length > 128) throw new Error(`${label}.presets 必须包含 1-128 项`)
  const ids = new Set()
  const defaults = new Set()
  const presets = value.presets.map((preset, index) => {
    if (!preset || typeof preset !== 'object' || !CONTRIBUTION_ID_PATTERN.test(preset.id || '') || ids.has(preset.id)) {
      throw new Error(`${label}.presets[${index}] ID 无效或重复`)
    }
    ids.add(preset.id)
    if (!PLUGIN_ANIMATION_TARGETS.has(preset.target)) throw new Error(`${label}.presets[${index}] target 无效：${preset.target}`)
    if (!preset.label || String(preset.label).length > 120) throw new Error(`${label}.presets[${index}] 缺少 label`)
    const variants = {}
    for (const [variant, definition] of Object.entries(preset.variants || {})) {
      if (!CONTRIBUTION_ID_PATTERN.test(variant)) throw new Error(`${label}.presets[${index}] variant 无效：${variant}`)
      variants[variant] = normalizeAnimationDefinition(definition, `${label}.${preset.id}.${variant}`)
    }
    const animation = preset.animation ? normalizeAnimationDefinition(preset.animation, `${label}.${preset.id}.animation`) : null
    if (!animation && !Object.keys(variants).length) throw new Error(`${label}.presets[${index}] 缺少 animation 或 variants`)
    const isDefault = !!preset.default
    if (isDefault && defaults.has(preset.target)) throw new Error(`${label} 中 ${preset.target} 只能有一个默认动画`)
    if (isDefault) defaults.add(preset.target)
    return {
      id: String(preset.id), target: preset.target, label: String(preset.label),
      description: String(preset.description || '').slice(0, 300), tags: Array.isArray(preset.tags) ? preset.tags.map(String).slice(0, 12) : [],
      default: isDefault, animation, variants
    }
  })
  return {
    id: String(declaration.id || value.id || ''),
    title: String(declaration.title || value.title || declaration.id || ''),
    description: String(declaration.description || value.description || '').slice(0, 500),
    source: String(declaration.source || ''), schemaVersion: 1, presets
  }
}

function normalizeAnimationPacks(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:animations')) throw new Error('animationPacks 需要 ui:animations 权限')
  if (!Array.isArray(value) || value.length > 16) throw new Error('animationPacks 必须是最多 16 项的数组')
  const ids = new Set()
  return value.map((pack, index) => {
    if (!pack || typeof pack !== 'object' || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id)) throw new Error(`animationPacks[${index}] ID 无效或重复`)
    ids.add(pack.id)
    if (!pack.title || String(pack.title).length > 120) throw new Error(`animationPacks[${index}] 缺少 title`)
    return { id: String(pack.id), title: String(pack.title), description: String(pack.description || '').slice(0, 300), source: validatePath(pack.source) }
  })
}

function normalizeAppearanceColor(value, label) {
  const source = String(value || '').trim()
  const hex = source.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hex) return source.toLowerCase()
  const rgb = source.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i)
  if (!rgb || rgb.slice(1, 4).some(channel => Number(channel) > 255)) throw new Error(`${label} 必须是十六进制或 rgb/rgba 颜色`)
  if (source.toLowerCase().startsWith('rgba') && rgb[4] === undefined) throw new Error(`${label} 的 rgba 缺少透明度`)
  return source.replace(/\s+/g, ' ')
}

export { normalizeAppearanceColor, normalizeAppearanceShadow, opaqueRgb, contrastRatio }

function normalizeAppearanceShadow(value, label) {
  const source = String(value || '').trim()
  if (source === 'none') return source
  if (!source || source.length > 320 || UNSAFE_VISUAL_VALUE_PATTERN.test(source) || /[{};<>\\]/.test(source) || !/^[#(),.%\sa-z0-9+\-]+$/i.test(source)) {
    throw new Error(`${label} 阴影值无效`)
  }
  return source.replace(/\s+/g, ' ')
}

function opaqueRgb(value) {
  const source = String(value || '').trim()
  const hex = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map(character => character + character).join('') : hex[1]
    return [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16))
  }
  const rgb = source.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  return rgb ? rgb.slice(1).map(Number) : null
}

function contrastRatio(foreground, background) {
  const channel = value => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = color => color.map(channel).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function normalizeAppearanceTokens(value, label) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是 Token 对象`)
  const normalized = {}
  for (const [token, raw] of Object.entries(value)) {
    if (!APPEARANCE_TOKENS.has(token)) throw new Error(`${label} 不允许 Token ${token}`)
    normalized[token] = APPEARANCE_SHADOW_TOKENS.has(token)
      ? normalizeAppearanceShadow(raw, `${label}.${token}`)
      : normalizeAppearanceColor(raw, `${label}.${token}`)
  }
  const pairs = [['--text-primary', '--bg-base'], ['--text-on-accent', '--accent']]
  for (const [foregroundToken, backgroundToken] of pairs) {
    const foreground = opaqueRgb(normalized[foregroundToken])
    const background = opaqueRgb(normalized[backgroundToken])
    if (foreground && background && contrastRatio(foreground, background) < 4.5) {
      throw new Error(`${label} 的 ${foregroundToken} 与 ${backgroundToken} 对比度低于 4.5:1`)
    }
  }
  return normalized
}

function normalizeAppearancePacks(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:appearance')) throw new Error('appearancePacks 需要 ui:appearance 权限')
  if (!Array.isArray(value) || value.length > 16) throw new Error('appearancePacks 必须是最多 16 项的数组')
  const ids = new Set()
  return value.map((pack, index) => {
    if (!pack || typeof pack !== 'object' || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id)) {
      throw new Error(`appearancePacks[${index}] ID 无效或重复`)
    }
    ids.add(pack.id)
    const title = String(pack.title || '').trim()
    if (!title || title.length > 120) throw new Error(`appearancePacks[${index}] 缺少 title 或过长`)
    const titleEn = String(pack.titleEn || '').trim()
    if (titleEn.length > 120) throw new Error(`appearancePacks[${index}].titleEn 过长`)
    const light = normalizeAppearanceTokens(pack.light, `appearancePacks[${index}].light`)
    const dark = normalizeAppearanceTokens(pack.dark, `appearancePacks[${index}].dark`)
    if (!Object.keys(light).length && !Object.keys(dark).length) throw new Error(`appearancePacks[${index}] 至少需要一个浅色或深色 Token`)
    return {
      id: String(pack.id), title, titleEn,
      description: String(pack.description || '').slice(0, 300),
      base: pack.base === 'fluent' ? 'fluent' : 'peach',
      light,
      dark
    }
  })
}

function normalizeVisualSurfaces(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:visual-surfaces')) throw new Error('visualSurfaces 需要 ui:visual-surfaces 权限')
  if (!Array.isArray(value) || value.length > 8) throw new Error('visualSurfaces 必须是最多 8 项的数组')
  const ids = new Set()
  return value.map((surface, index) => {
    if (!surface || typeof surface !== 'object' || !CONTRIBUTION_ID_PATTERN.test(surface.id || '') || ids.has(surface.id)) throw new Error(`visualSurfaces[${index}] ID 无效或重复`)
    ids.add(surface.id)
    const platformEntries = normalizePlatformEntries(surface.platformEntries, `visualSurfaces[${index}].platformEntries`)
    const entry = surface.entry ? validatePath(surface.entry) : ''
    if (!entry && !Object.keys(platformEntries).length) throw new Error(`visualSurfaces[${index}] 缺少 entry`)
    if (surface.placement && surface.placement !== 'background') throw new Error(`visualSurfaces[${index}].placement 仅支持 background`)
    const events = [...new Set(Array.isArray(surface.events) ? surface.events.map(String) : [])]
    const unknownEvent = events.find(event => !VISUAL_SURFACE_EVENTS.has(event))
    if (unknownEvent) throw new Error(`visualSurfaces[${index}] 包含未知事件：${unknownEvent}`)
    return {
      id: String(surface.id), title: String(surface.title || surface.id), entry, platformEntries,
      placement: 'background', events, defaultEnabled: surface.defaultEnabled !== false
    }
  })
}

function normalizeDependencies(value, pluginId) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('dependencies 必须是数组')
  const ids = new Set()
  return value.map((dependency, index) => {
    if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) throw new Error(`dependencies[${index}] 无效`)
    const id = String(dependency.id || '')
    if (!ID_PATTERN.test(id) || id === pluginId || ids.has(id)) throw new Error(`dependencies[${index}] ID 无效或重复`)
    ids.add(id)
    const range = String(dependency.range || dependency.version || '*')
    if (!range || range.length > 80 || /[{};<>]/.test(range)) throw new Error(`dependencies[${index}].range 无效`)
    return { id, range, dataAccess: dependency.dataAccess === true }
  })
}

function normalizeNativePage(value, label) {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 无效`)
  if (value.type !== 'settings') throw new Error(`${label}.type 仅支持 settings`)
  if (!Array.isArray(value.controls) || value.controls.length > 64) throw new Error(`${label}.controls 无效`)
  const ids = new Set()
  const controls = value.controls.map((control, index) => {
    if (!control || typeof control !== 'object' || !CONTRIBUTION_ID_PATTERN.test(control.id || '') || ids.has(control.id)) {
      throw new Error(`${label}.controls[${index}] 的 ID 无效或重复`)
    }
    ids.add(control.id)
    const type = String(control.type || '')
    const hostSelect = ['animation-select', 'component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'].includes(type)
    if (!['toggle', 'range', 'select', 'audio', 'animation-select', 'component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'].includes(type)) throw new Error(`${label}.controls[${index}] 类型不受支持`)
    if (!control.label || String(control.label).length > 120) throw new Error(`${label}.controls[${index}] 缺少 label`)
    if (!hostSelect && !SETTING_PATH_PATTERN.test(control.path || '')) throw new Error(`${label}.controls[${index}] path 无效`)
    if (type === 'animation-select' && !PLUGIN_ANIMATION_TARGETS.has(control.target)) throw new Error(`${label}.controls[${index}] target 无效`)
    if (['component-style-select', 'component-override-select', 'component-override-toggle'].includes(type) && !getComponentTarget(control.target)) throw new Error(`${label}.controls[${index}] target 无效`)
    if (type === 'result-presentation-select' && control.target !== 'roller.result') throw new Error(`${label}.controls[${index}] target 无效`)
    if (type === 'animation-select' && control.packId && !CONTRIBUTION_ID_PATTERN.test(control.packId)) throw new Error(`${label}.controls[${index}] packId 无效`)
    if (type === 'component-override-toggle' && !CONTRIBUTION_ID_PATTERN.test(control.packId || '')) throw new Error(`${label}.controls[${index}] packId 无效`)
    if (type === 'select' && (!Array.isArray(control.options) || !control.options.length || control.options.length > 32)) {
      throw new Error(`${label}.controls[${index}] options 无效`)
    }
    if (type === 'range') {
      const min = Number(control.min)
      const max = Number(control.max)
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(`${label}.controls[${index}] 范围无效`)
    }
    return {
      id: String(control.id), type, label: control.label, description: control.description || '', path: hostSelect ? '' : String(control.path),
      target: hostSelect ? String(control.target) : undefined,
      packId: ['animation-select', 'component-override-toggle'].includes(type) ? String(control.packId || '') : undefined,
      accept: type === 'audio' ? String(control.accept || 'audio/*') : undefined,
      min: type === 'range' ? Number(control.min) : undefined,
      max: type === 'range' ? Number(control.max) : undefined,
      step: type === 'range' ? Number(control.step || 0.01) : undefined,
      options: type === 'select' ? control.options.map(option => ({ value: String(option.value), label: option.label })) : undefined,
      default: control.default
    }
  })
  const settingsKey = String(value.settingsKey || 'settings')
  if (!SETTING_PATH_PATTERN.test(settingsKey)) throw new Error(`${label}.settingsKey 无效`)
  return { type: 'settings', settingsKey, controls }
}

function normalizePages(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 32) throw new Error('pages 必须是最多 32 项的数组')
  const ids = new Set()
  return value.map((rawPage, index) => {
    if (!rawPage || typeof rawPage !== 'object' || Array.isArray(rawPage)) throw new Error(`pages[${index}] 无效`)
    const id = String(rawPage.id || '')
    if (!CONTRIBUTION_ID_PATTERN.test(id) || ids.has(id)) throw new Error(`pages[${index}] ID 无效或重复`)
    ids.add(id)
    const title = String(rawPage.title || '').trim()
    if (!title || title.length > 120) throw new Error(`pages[${index}] 缺少 title 或过长`)
    if (rawPage.location !== undefined && !['plugins', 'dock'].includes(rawPage.location)) throw new Error(`pages[${index}].location 无效`)
    const platformEntries = normalizePlatformEntries(rawPage.platformEntries, `pages[${index}].platformEntries`)
    const entry = rawPage.entry ? validatePath(rawPage.entry) : ''
    const native = normalizeNativePage(rawPage.native, `pages[${index}].native`)
    if (!entry && !Object.keys(platformEntries).length && !native) throw new Error(`pages[${index}] 缺少可用的页面入口`)
    const order = rawPage.order === undefined ? 500 : Number(rawPage.order)
    if (!Number.isInteger(order) || order < 0 || order > 999) throw new Error(`pages[${index}].order 必须是 0-999 的整数`)
    const icon = String(rawPage.icon || 'apps-24-regular')
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/i.test(icon)) throw new Error(`pages[${index}].icon 无效`)
    const titleEn = String(rawPage.titleEn || '').trim()
    if (titleEn.length > 120) throw new Error(`pages[${index}].titleEn 过长`)
    return {
      id, title, titleEn, icon, entry, platformEntries, native,
      location: rawPage.location === 'dock' ? 'dock' : 'plugins',
      order,
      description: String(rawPage.description || '').slice(0, 300)
    }
  })
}

function normalizeCommands(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64) throw new Error('commands 必须是最多 64 项的数组')
  const ids = new Set()
  return value.map((rawCommand, index) => {
    if (!rawCommand || typeof rawCommand !== 'object' || Array.isArray(rawCommand)) {
      throw new Error(`commands[${index}] 无效`)
    }
    const id = String(rawCommand.id || '')
    if (!CONTRIBUTION_ID_PATTERN.test(id) || ids.has(id)) throw new Error(`commands[${index}] ID 无效或重复`)
    ids.add(id)
    const title = String(rawCommand.title || '').trim()
    if (!title || title.length > 120) throw new Error(`commands[${index}] 缺少 title 或过长`)
    const titleEn = String(rawCommand.titleEn || '').trim()
    if (titleEn.length > 120) throw new Error(`commands[${index}].titleEn 过长`)
    const locations = [...new Set(Array.isArray(rawCommand.locations) ? rawCommand.locations.map(String) : ['command-palette'])]
    const unknownLocation = locations.find(location => !PLUGIN_COMMAND_LOCATIONS.has(location))
    if (unknownLocation) throw new Error(`commands[${index}] 包含未知 location：${unknownLocation}`)
    const icon = String(rawCommand.icon || 'apps-24-regular')
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/i.test(icon)) throw new Error(`commands[${index}].icon 无效`)
    const order = rawCommand.order === undefined ? 500 : Number(rawCommand.order)
    if (!Number.isInteger(order) || order < 0 || order > 999) throw new Error(`commands[${index}].order 必须是 0-999 的整数`)
    return {
      id,
      title,
      titleEn,
      description: String(rawCommand.description || '').slice(0, 300),
      icon,
      locations,
      order
    }
  })
}

export function normalizePluginManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('manifest.json 无效')
  const manifest = JSON.parse(JSON.stringify(raw))
  if (manifest.schemaVersion !== 1) throw new Error('不支持的插件清单版本')
  if (!ID_PATTERN.test(manifest.id || '')) throw new Error('插件 ID 无效，建议使用反向域名格式')
  if (!manifest.name || !manifest.version || !manifest.author) throw new Error('插件名称、版本或开发者缺失')
  if (!manifest.engine || comparePluginVersions(PLUGIN_API_VERSION, manifest.engine.min || '0') < 0) {
    throw new Error(`插件需要 API ${manifest.engine?.min || '未知'}，当前为 ${PLUGIN_API_VERSION}`)
  }
  manifest.permissions = [...new Set(manifest.permissions || [])]
  const unknownPermission = manifest.permissions.find(permission => !PLUGIN_PERMISSIONS.has(permission))
  if (unknownPermission) throw new Error(`未知插件权限：${unknownPermission}`)
  manifest.contributes = manifest.contributes && typeof manifest.contributes === 'object' ? manifest.contributes : {}
  manifest.contributes.pages = normalizePages(manifest.contributes.pages)
  manifest.contributes.commands = normalizeCommands(manifest.contributes.commands)
  manifest.contributes.animationPacks = normalizeAnimationPacks(manifest.contributes.animationPacks, manifest.permissions)
  manifest.contributes.visualSurfaces = normalizeVisualSurfaces(manifest.contributes.visualSurfaces, manifest.permissions)
  manifest.contributes.appearancePacks = normalizeAppearancePacks(manifest.contributes.appearancePacks, manifest.permissions)
  manifest.contributes.componentStylePacks = normalizeComponentStylePacks(manifest.contributes.componentStylePacks, manifest.permissions, { pluginId: manifest.id })
  manifest.contributes.fonts = normalizeFonts(manifest.contributes.fonts, manifest.permissions, { pluginId: manifest.id })
  manifest.contributes.componentOverridePacks = normalizeComponentOverridePacks(manifest.contributes.componentOverridePacks, manifest.permissions)
  manifest.contributes.nativeViews = normalizeNativeViews(manifest.contributes.nativeViews, manifest.permissions)
  manifest.contributes.resultPresentations = normalizeResultPresentations(manifest.contributes.resultPresentations, manifest.permissions)
  manifest.supportedPlatforms = normalizePlatforms(manifest.supportedPlatforms, 'supportedPlatforms')
  manifest.platformEntries = normalizePlatformEntries(manifest.platformEntries, 'platformEntries')
  manifest.capabilities = normalizeCapabilities(manifest.capabilities, manifest.permissions)
  manifest.systemOperations = normalizeSystemOperations(manifest.systemOperations, manifest.permissions)
  manifest.dependencies = normalizeDependencies(manifest.dependencies, manifest.id)
  if (manifest.entry) manifest.entry = validatePath(manifest.entry)
  if (manifest.contributes.commands.length && !manifest.entry && !Object.keys(manifest.platformEntries).length) {
    throw new Error('commands 需要插件 Worker 入口')
  }
  if (!manifest.entry && !Object.keys(manifest.platformEntries).length && !(manifest.contributes.pages || []).length && !manifest.contributes.commands.length && !manifest.contributes.visualSurfaces.length && !manifest.contributes.appearancePacks.length && !manifest.contributes.componentStylePacks.length && !manifest.contributes.componentOverridePacks.length && !manifest.contributes.nativeViews.length && !manifest.contributes.resultPresentations.length && !manifest.contributes.fonts.length) {
    throw new Error('插件至少需要一个 Worker、页面、视觉层或外观包入口')
  }
  if (manifest.icon) manifest.icon = validatePath(manifest.icon)
  if (manifest.readme) manifest.readme = validatePath(manifest.readme)
  return manifest
}

export async function sha256Hex(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

async function verifyPublisherSignature(envelope, expectedPublisherKey = '') {
  if (!envelope.signature) {
    if (expectedPublisherKey) throw new Error('插件目录要求发布者签名，但插件包未签名')
    return { verified: false, publisherKey: '' }
  }
  if (envelope.signatureAlgorithm !== 'Ed25519' || !envelope.publisherKey) {
    throw new Error('插件发布者签名格式无效')
  }
  if (expectedPublisherKey && envelope.publisherKey !== expectedPublisherKey) {
    throw new Error('插件发布者公钥与目录登记不一致')
  }
  let key
  try {
    key = await crypto.subtle.importKey('spki', fromBase64(envelope.publisherKey), { name: 'Ed25519' }, false, ['verify'])
  } catch {
    throw new Error('插件发布者公钥无效')
  }
  const signed = new TextEncoder().encode(`${envelope.id}\0${envelope.version}\0${envelope.hash}`)
  const valid = await crypto.subtle.verify('Ed25519', key, fromBase64(envelope.signature), signed)
  if (!valid) throw new Error('插件发布者签名验证失败，文件可能已被替换')
  return { verified: true, publisherKey: envelope.publisherKey }
}

async function decryptCnrp(bytes) {
  const header = new TextDecoder().decode(bytes.subarray(0, CNRP_MAGIC.length))
  if (header !== CNRP_MAGIC) throw new Error('不是有效的 .cnrp 插件包')
  let envelope
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes.subarray(CNRP_MAGIC.length)))
  } catch {
    throw new Error('CNRP 封装数据无效')
  }
  if (envelope.v !== 1 || !envelope.id || !envelope.version || !envelope.salt || !envelope.iv || !envelope.data || !envelope.hash) {
    throw new Error('CNRP 加密封装无效')
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${envelope.id}@${envelope.version}:CyreneNameRollerPlugin-v1`),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(envelope.salt), iterations: 120000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const additionalData = new TextEncoder().encode(`${envelope.id}\0${envelope.version}\0${envelope.hash}`)
  let decrypted
  try {
    decrypted = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData },
      key,
      fromBase64(envelope.data)
    ))
  } catch {
    throw new Error('插件包解密或认证失败，文件可能已被篡改')
  }
  if (await sha256Hex(decrypted) !== envelope.hash) throw new Error('插件包整体哈希不匹配')
  return { bytes: decrypted, envelope }
}

export async function parsePluginPackage(input, { expectedPublisherKey = '' } = {}) {
  const packageBytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (packageBytes.byteLength > MAX_PLUGIN_SIZE) throw new Error('插件包超过 32 MB 限制')
  const { bytes, envelope } = await decryptCnrp(packageBytes)
  const publisher = await verifyPublisherSignature(envelope, expectedPublisherKey)
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false })
  const fileNames = Object.keys(archive.files).filter(name => !archive.files[name].dir)
  if (fileNames.length > MAX_FILE_COUNT) throw new Error('插件包文件数量过多')
  fileNames.forEach(validatePath)
  const manifestEntry = archive.file('manifest.json')
  if (!manifestEntry) throw new Error('插件包缺少 manifest.json')
  const manifest = normalizePluginManifest(JSON.parse(await manifestEntry.async('string')))
  if (manifest.id !== envelope.id || manifest.version !== envelope.version) {
    throw new Error('插件清单与 CNRP 封装身份不一致')
  }
  const files = {}
  let totalUncompressedSize = 0
  for (const name of fileNames) {
    const content = await archive.file(name).async('uint8array')
    totalUncompressedSize += content.byteLength
    if (totalUncompressedSize > 64 * 1024 * 1024) throw new Error('插件解压内容超过 64 MB 限制')
    let binary = ''
    for (let index = 0; index < content.length; index += 0x8000) binary += String.fromCharCode(...content.subarray(index, index + 0x8000))
    files[name] = btoa(binary)
  }

  const requiredFiles = [
    manifest.entry,
    ...Object.values(manifest.platformEntries || {}),
    manifest.icon,
    manifest.readme,
    ...(manifest.contributes.pages || []).flatMap(page => [page.entry, ...Object.values(page.platformEntries || {})]),
    ...(manifest.contributes.animationPacks || []).map(pack => pack.source),
    ...(manifest.contributes.fonts || []).map(font => font.source),
    ...(manifest.contributes.nativeViews || []).map(view => view.source),
    ...(manifest.contributes.visualSurfaces || []).flatMap(surface => [surface.entry, ...Object.values(surface.platformEntries || {})])
  ].filter(Boolean)
  for (const name of requiredFiles) if (!files[name]) throw new Error(`插件清单引用的文件不存在：${name}`)
  validateFontFiles(manifest.contributes.fonts || [], files)
  const integrity = manifest.integrity || {}
  for (const name of fileNames) {
    if (name !== 'manifest.json' && !Object.hasOwn(integrity, name)) throw new Error(`完整性清单未覆盖文件：${name}`)
  }
  const nativeViews = (manifest.contributes.nativeViews || []).map(declaration => {
    try {
      return { ...declaration, document: normalizeNativeViewDocument(JSON.parse(decodePluginFile({ files }, declaration.source)), `nativeView ${declaration.id}`) }
    } catch (error) {
      if (error?.code) throw error
      throw new Error(`原生视图 ${declaration.id} 无法解析：${error.message || error}`)
    }
  })
  for (const [name, expected] of Object.entries(integrity)) {
    const encoded = files[validatePath(name)]
    if (!encoded) throw new Error(`完整性清单文件缺失：${name}`)
    const actual = await sha256Hex(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)))
    if (actual !== String(expected).toLowerCase()) throw new Error(`插件文件完整性校验失败：${name}`)
  }
  const packageHash = await sha256Hex(packageBytes)
  const animationPacks = (manifest.contributes.animationPacks || []).map(declaration => {
    let raw
    try {
      raw = JSON.parse(decodePluginFile({ files }, declaration.source))
    } catch (error) {
      throw new Error(`动画包 ${declaration.id} 无法解析：${error.message || error}`)
    }
    return normalizeAnimationPack(raw, declaration)
  })
  return {
    manifest,
    files,
    animationPacks,
    nativeViews,
    packageHash,
    packageSignature: envelope.signature || '',
    publisherKey: publisher.publisherKey,
    publisherVerified: publisher.verified,
    signatureAlgorithm: envelope.signatureAlgorithm || '',
    readme: archive.file(manifest.readme || 'README.md') ? await archive.file(manifest.readme || 'README.md').async('string') : ''
  }
}

export function decodePluginFile(plugin, path, binary = false) {
  const encoded = plugin?.files?.[validatePath(path)]
  if (!encoded) throw new Error(`插件文件不存在：${path}`)
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
  return binary ? bytes : new TextDecoder().decode(bytes)
}
