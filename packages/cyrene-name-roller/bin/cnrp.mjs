#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { build } from 'esbuild'
import JavaScriptObfuscator from 'javascript-obfuscator'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const MAGIC = Buffer.from('CNRP1\n', 'utf8')
const API_VERSION = '1.4.0'
const MANIFEST_JSON_FILE = 'manifest.json'
const MANIFEST_YAML_FILE = 'manifest.yml'
const CONTRIBUTIONS_FILE = 'contributions.json'
const YAML_FORBIDDEN_KEYS = ['contributes', 'settings', 'pages', 'api']
const CONTRIBUTIONS_IDENTITY_KEYS = new Set([
  'schemaVersion', 'id', 'name', 'version', 'author', 'description', 'engine', 'entry', 'icon', 'readme',
  'permissions', 'platformEntries', 'supportedPlatforms', 'dependencies', 'capabilities', 'systemOperations', 'integrity'
])
const SETTINGS_FIELD_TYPES = new Set([
  'toggle', 'checkbox', 'select', 'slider', 'range', 'audio',
  'animation-select', 'component-style-select', 'component-override-select',
  'component-override-toggle', 'result-presentation-select'
])
const HOST_SELECT_FIELD_TYPES = new Set([
  'animation-select', 'component-style-select', 'component-override-select',
  'component-override-toggle', 'result-presentation-select'
])
const MAX_SETTINGS_SECTIONS = 16
const MAX_SETTINGS_FIELDS = 64
const YAML_MANIFEST_ORDER = ['schemaVersion', 'id', 'name', 'version', 'author', 'description', 'engine', 'entry', 'icon', 'readme']
const YAML_OPTIONAL_ORDER = ['platformEntries', 'supportedPlatforms', 'dependencies', 'capabilities', 'systemOperations']
const MAX_FILE_COUNT = 256
const MAX_PACKAGE_SIZE = 32 * 1024 * 1024
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/
const PLATFORM_IDS = new Set(['web', 'tauri', 'windows', 'macos', 'linux', 'android', 'ios'])
const PLATFORM_CAPABILITIES = new Set([
  'notifications:show', 'audio:select', 'audio:play', 'system:open-url', 'system:select-file',
  'system:select-directory', 'system:clipboard-read', 'system:clipboard-write', 'system:reveal-file', 'system:execute'
])
const CONTRIBUTION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/
const COMMAND_LOCATIONS = new Set(['command-palette', 'page-header', 'context-menu'])
const SETTING_PATH_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/i
const ANIMATION_TARGETS = new Set(['page.transition', 'roller.finish', 'card.deal', 'card.flip', 'lottery.finish', 'global.transition'])
const COMPONENT_TARGETS = new Set(['app.title-bar', 'app.version-badge', 'navigation.dock', 'navigation.settings-entry', 'roller.current-list', 'roller.filters', 'roller.filter.english-mode', 'roller.filter.draw-target', 'roller.filter.gender', 'roller.filter.draw-count', 'roller.filter.duplicates', 'roller.filter.count', 'roller.primary-action', 'roller.result', 'card.controls', 'card.deck', 'card.item', 'lottery.result', 'statistics.summary'])
const ANIMATION_FRAME_PROPERTIES = new Set(['opacity', 'transform', 'filter', 'clipPath', 'borderRadius', 'boxShadow', 'textShadow', 'color', 'background', 'backgroundColor', 'letterSpacing', 'offset', 'easing', 'composite'])
const GSAP_ANIMATION_PROPERTIES = new Set(['opacity', 'autoAlpha', 'x', 'y', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY', 'rotation', 'rotate', 'rotationX', 'rotationY', 'rotateX', 'rotateY', 'skewX', 'skewY', 'filter', 'clipPath', 'borderRadius', 'boxShadow', 'textShadow', 'color', 'background', 'backgroundColor', 'letterSpacing', 'transformOrigin'])
const UNSAFE_VISUAL_VALUE_PATTERN = /url\s*\(|image-set\s*\(|cross-fade\s*\(|paint\s*\(|(?:https?:|data:|blob:|\/\/)/i
const APPEARANCE_COLOR_TOKENS = new Set(['--accent', '--accent-light', '--accent-dark', '--accent-hover', '--accent-200', '--accent-50', '--text-on-accent', '--bg-base', '--bg-card', '--bg-card-solid', '--bg-hover', '--bg-acrylic', '--bg-mica', '--text-primary', '--text-secondary', '--text-muted', '--border-default', '--border-subtle', '--border-strong'])
const APPEARANCE_SHADOW_TOKENS = new Set(['--shadow-2', '--shadow-4', '--shadow-8', '--shadow-16'])
const APPEARANCE_TOKENS = new Set([...APPEARANCE_COLOR_TOKENS, ...APPEARANCE_SHADOW_TOKENS])
const ANIMATION_DIRECTIONS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse'])
const VISUAL_SURFACE_EVENTS = new Set([
  'app:ready', 'app:route-changed', 'app:theme-changed', 'app:resize', 'plugin:storage-changed',
  'draw:item-result', 'draw:result', 'roller:start', 'roller:item-result', 'roller:result',
  'card:item-result', 'card:result', 'lottery:item-result', 'lottery:result', 'lottery:assign-result'
])

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const subtle = crypto.webcrypto.subtle

function fail(message) {
  throw new Error(message)
}

function parseArgs(argv) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (!value.startsWith('--')) {
      positional.push(value)
      continue
    }
    const key = value.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      options[key] = next
      i += 1
    } else {
      options[key] = true
    }
  }
  return { positional, options }
}

function compareVersions(left, right) {
  const a = String(left || '0').split('.').map(value => Number(value) || 0)
  const b = String(right || '0').split('.').map(value => Number(value) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}


function normalizePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('/..')) {
    fail(`unsafe plugin path: ${value}`)
  }
  return normalized
}

const API15_PERMISSIONS = new Set([
  'files:app:read', 'files:app:write', 'files:app:execute', 'files:external:read', 'files:external:write', 'files:external:execute',
  'net:internet', 'page:read', 'page:write', 'page:write-sensitive', 'dom:main', 'dom:settings', 'style:host', 'window:create',
  'window:main:control', 'window:floating:control', 'window:always-on-top', 'core:names:read', 'core:records:read',
  'core:statistics:read', 'core:fairness:read', 'core:before-operation', 'system:execute'
])
const API15_FIELDS = new Set(['api', 'schemaVersion', 'id', 'name', 'version', 'author', 'description', 'engine', 'entry', 'platforms', 'permissions', 'files', 'network', 'windows', 'pages', 'hooks', 'signature', 'integrity'])
const API15_OPERATIONS = new Set(['name-draw', 'card-flip', 'lottery-draw', 'prize-assignment'])
const API15_FILE_SCOPES = new Set(['read', 'write', 'execute'])

function normalizeProcessEntry15(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['runtime', 'script', 'args'].includes(key)) || value.runtime !== 'cnrp-runner') fail('entry is invalid')
  const script = normalizePath(value.script)
  const args = value.args === undefined ? [] : value.args
  if (!Array.isArray(args) || args.length > 32 || args.some(arg => typeof arg !== 'string' || arg.length > 2048 || arg.includes('\0'))) fail('entry.args is invalid')
  return { runtime: 'cnrp-runner', script, args: [...args] }
}

function normalizeFileScopes15(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['app', 'external'].includes(key))) fail('files is invalid')
  const scope = (raw, label, external = false) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${label} is invalid`)
    const allowed = external ? ['path', 'scopes'] : ['scopes']
    if (Object.keys(raw).some(key => !allowed.includes(key))) fail(`${label} contains unknown field`)
    if (!Array.isArray(raw.scopes) || raw.scopes.length > 3 || raw.scopes.some(item => typeof item !== 'string' || !API15_FILE_SCOPES.has(item)) || new Set(raw.scopes).size !== raw.scopes.length) fail(`${label}.scopes is invalid`)
    if (external) normalizePath(raw.path)
    return { ...(external ? { path: normalizePath(raw.path) } : {}), scopes: [...raw.scopes] }
  }
  const result = {}
  if (value.app !== undefined) result.app = scope(value.app, 'files.app')
  if (value.external !== undefined) {
    if (!Array.isArray(value.external) || value.external.length > 16) fail('files.external is invalid')
    result.external = value.external.map((raw, index) => scope(raw, `files.external[${index}]`, true))
  }
  return result
}

function normalizeManifest15(raw) {
  if (Object.keys(raw).some(key => !API15_FIELDS.has(key)) || raw.api !== '1.5' || (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)) fail('API 1.5 manifest is required')
  if (!ID_PATTERN.test(raw.id || '') || typeof raw.name !== 'string' || !raw.name || raw.name.length > 120 || typeof raw.version !== 'string' || !raw.version || raw.version.length > 64 || typeof raw.author !== 'string' || !raw.author || raw.author.length > 120) fail('manifest identity is invalid')
  if (!Array.isArray(raw.permissions) || raw.permissions.length > 64 || raw.permissions.some(permission => !permission || typeof permission !== 'object' || Array.isArray(permission) || Object.keys(permission).some(key => !['id', 'required', 'platforms'].includes(key)) || typeof permission.id !== 'string' || !API15_PERMISSIONS.has(permission.id) || typeof permission.required !== 'boolean' || !Array.isArray(permission.platforms) || permission.platforms.some(platform => !PLATFORM_IDS.has(platform)))) fail('permission declaration is invalid')
  if (raw.platforms !== undefined && (!Array.isArray(raw.platforms) || raw.platforms.some(platform => !PLATFORM_IDS.has(platform)))) fail('platforms is invalid')
  const pages = raw.pages === undefined ? [] : raw.pages
  if (!Array.isArray(pages) || pages.length > 32) fail('pages is invalid')
  const pageIds = new Set()
  const normalizedPages = pages.map((page, index) => {
    if (!page || typeof page !== 'object' || Array.isArray(page) || Object.keys(page).some(key => !['id', 'title', 'titleEn', 'description', 'location', 'entry', 'children'].includes(key)) || !/^[a-z][a-z0-9._-]{0,63}$/.test(page.id || '') || pageIds.has(page.id) || typeof page.title !== 'string' || !page.title.trim() || page.title.length > 120 || (page.titleEn !== undefined && typeof page.titleEn !== 'string') || (page.description !== undefined && typeof page.description !== 'string') || !['main', 'settings'].includes(page.location)) fail(`pages[${index}] is invalid or duplicate`)
    pageIds.add(page.id)
    const children = page.children === undefined ? [] : page.children
    if (!Array.isArray(children) || children.length > 32) fail(`pages[${index}].children is invalid`)
    const childIds = new Set()
    const normalizedChildren = children.map(child => {
      if (!child || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).some(key => !['id', 'title', 'titleEn', 'description', 'entry'].includes(key)) || !/^[a-z][a-z0-9._-]{0,63}$/.test(child.id || '') || childIds.has(child.id) || typeof child.title !== 'string' || !child.title.trim() || child.title.length > 120 || (child.titleEn !== undefined && typeof child.titleEn !== 'string') || (child.description !== undefined && typeof child.description !== 'string')) fail(`pages[${index}].children is invalid or duplicate`)
      childIds.add(child.id)
      return { id: child.id, title: child.title, titleEn: String(child.titleEn || ''), description: String(child.description || ''), entry: normalizePath(child.entry), children: [] }
    })
    return { id: page.id, title: page.title, titleEn: String(page.titleEn || ''), description: String(page.description || ''), location: page.location, entry: normalizePath(page.entry), children: normalizedChildren }
  })
  const hooks = raw.hooks === undefined ? [] : raw.hooks
  if (!Array.isArray(hooks) || hooks.length > 16) fail('hooks is invalid')
  const hookIds = new Set()
  const normalizedHooks = hooks.map(hook => {
    if (!hook || typeof hook !== 'object' || !API15_OPERATIONS.has(hook.operation) || hookIds.has(hook.operation) || typeof hook.timeoutMs !== 'number' || !Number.isInteger(hook.timeoutMs) || hook.timeoutMs < 1 || hook.timeoutMs > 1000) fail('hook declaration is invalid')
    hookIds.add(hook.operation)
    return { operation: hook.operation, timeoutMs: hook.timeoutMs }
  })
  const windows = raw.windows === undefined ? {} : raw.windows
  if (!windows || typeof windows !== 'object' || Array.isArray(windows) || Object.keys(windows).some(key => !['create', 'main', 'floating'].includes(key))) fail('windows is invalid')
  if (windows.main !== undefined && (!windows.main || typeof windows.main !== 'object' || Object.keys(windows.main).some(key => key !== 'control') || typeof windows.main.control !== 'boolean')) fail('windows.main is invalid')
  if (windows.floating !== undefined && (!windows.floating || typeof windows.floating !== 'object' || Object.keys(windows.floating).some(key => !['control', 'alwaysOnTop'].includes(key)))) fail('windows.floating is invalid')
  if (raw.network !== undefined && (!raw.network || typeof raw.network !== 'object' || Array.isArray(raw.network) || Object.keys(raw.network).some(key => key !== 'internet') || typeof raw.network.internet !== 'boolean')) fail('network is invalid')
  if (raw.signature !== undefined && raw.signature !== null && (!raw.signature || raw.signature.algorithm !== 'Ed25519' || typeof raw.signature.publisher !== 'string' || raw.signature.publisher.length > 512 || Object.keys(raw.signature).some(key => !['algorithm', 'publisher', 'value'].includes(key)))) fail('signature is invalid')
  const permissions = raw.permissions.map(permission => ({ id: permission.id, required: permission.required, platforms: [...new Set(permission.platforms)] }))
  return { api: '1.5', ...(raw.schemaVersion === undefined ? {} : { schemaVersion: 1 }), id: raw.id, name: raw.name, version: raw.version, author: raw.author, description: String(raw.description || '').slice(0, 500), engine: raw.engine === undefined ? null : raw.engine, entry: normalizeProcessEntry15(raw.entry), platforms: raw.platforms === undefined ? [] : [...new Set(raw.platforms)], permissions, files: normalizeFileScopes15(raw.files || {}), network: raw.network || { internet: false }, windows: { create: windows.create === true, main: { control: windows.main?.control === true }, floating: { control: windows.floating?.control === true, alwaysOnTop: windows.floating?.alwaysOnTop === true } }, pages: normalizedPages, hooks: normalizedHooks, signature: raw.signature || null }
}

function normalizePlatforms(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  const platforms = [...new Set(value.map(item => String(item).toLowerCase()))]
  const unknown = platforms.find(item => !PLATFORM_IDS.has(item))
  if (unknown) fail(`${label} contains unknown platform: ${unknown}`)
  return platforms
}

function normalizePlatformEntries(value, label) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const result = {}
  for (const [platform, entry] of Object.entries(value)) {
    if (!PLATFORM_IDS.has(platform)) fail(`${label} contains unknown platform: ${platform}`)
    result[platform] = normalizePath(entry)
  }
  return result
}

function normalizeCapabilities(value, permissions) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('capabilities must be an object')
  const result = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!PLATFORM_CAPABILITIES.has(id)) fail(`unknown platform capability: ${id}`)
    const declaration = raw === true ? { required: true } : raw === false ? { required: false } : raw
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) fail(`invalid capability declaration: ${id}`)
    if (!permissions.includes(id)) fail(`capability ${id} must also appear in permissions`)
    result[id] = { required: !!declaration.required, platforms: normalizePlatforms(declaration.platforms, `${id}.platforms`) }
  }
  const undeclared = permissions.find(permission => permission.startsWith('system:') && !result[permission])
  if (undeclared) fail(`system permission ${undeclared} must be declared in capabilities`)
  return result
}

function normalizeSystemOperations(value, permissions) {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return []
  if (!permissions.includes('system:execute')) fail('systemOperations requires system:execute permission')
  if (!Array.isArray(value)) fail('systemOperations must be an array')
  const ids = new Set()
  return value.map(operation => {
    if (!operation || typeof operation !== 'object' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(operation.id || '') || ids.has(operation.id)) fail(`invalid or duplicate system operation id: ${operation?.id || 'unknown'}`)
    ids.add(operation.id)
    if (!operation.label || String(operation.label).length > 100) fail(`system operation ${operation.id} needs a short label`)
    const platforms = normalizePlatforms(operation.platforms, `${operation.id}.platforms`)
    if (!platforms.length || platforms.includes('web')) fail(`system operation ${operation.id} must target a non-Web platform`)
    const command = operation.command
    if (!command || typeof command !== 'object') fail(`system operation ${operation.id} needs a fixed command`)
    const program = String(command.program || '')
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(program)) fail(`invalid program for system operation ${operation.id}`)
    const args = Array.isArray(command.args) ? command.args.map(String) : []
    if (args.length > 32 || args.some(argument => argument.includes('\0') || argument.length > 2048)) fail(`invalid fixed arguments for system operation ${operation.id}`)
    return { id: operation.id, label: String(operation.label), platforms, command: { program, args }, timeoutMs: Math.max(1000, Math.min(30000, Number(operation.timeoutMs) || 10000)) }
  })
}

function normalizeAnimationOptions(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}.options must be an object`)
  const duration = Number(value.duration)
  const delay = Number(value.delay || 0)
  const iterations = Number(value.iterations || 1)
  const easing = String(value.easing || 'ease')
  const direction = String(value.direction || 'normal')
  if (!Number.isFinite(duration) || duration < 80 || duration > 5000) fail(`${label}.options.duration must be 80-5000ms`)
  if (!Number.isFinite(delay) || delay < 0 || delay > 1500) fail(`${label}.options.delay must be 0-1500ms`)
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 3) fail(`${label}.options.iterations must be 1-3`)
  if (!/^[a-z0-9().,%\s+\-*/]+$/i.test(easing) || easing.length > 160) fail(`${label}.options.easing is invalid`)
  if (!ANIMATION_DIRECTIONS.has(direction)) fail(`${label}.options.direction is invalid`)
  return { duration, delay, iterations, easing, direction, fill: 'both' }
}

function normalizeSafeAnimationValue(raw, label) {
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') fail(label + ' is invalid')
  if (typeof raw === 'boolean') return raw
  const serialized = String(raw)
  if (serialized.length > 600 || /[{};<>\\]/.test(serialized) || UNSAFE_VISUAL_VALUE_PATTERN.test(serialized)) fail(label + ' is invalid')
  return raw
}

function normalizeGsapVars(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object')
  const normalized = {}
  for (const [property, raw] of Object.entries(value)) {
    if (!GSAP_ANIMATION_PROPERTIES.has(property)) fail(label + ' disallows property ' + property)
    normalized[property] = normalizeSafeAnimationValue(raw, label + '.' + property)
  }
  if (!Object.keys(normalized).length) fail(label + ' needs at least one animatable property')
  return normalized
}

function normalizeGsapOptions(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + '.options must be an object')
  const duration = Number(value.duration)
  const delay = Number(value.delay || 0)
  const repeat = Number(value.repeat || 0)
  const ease = String(value.ease || value.easing || 'power3.out')
  if (!Number.isFinite(duration) || duration < 80 || duration > 5000) fail(label + '.options.duration must be 80-5000ms')
  if (!Number.isFinite(delay) || delay < 0 || delay > 1500) fail(label + '.options.delay must be 0-1500ms')
  if (!Number.isInteger(repeat) || repeat < 0 || repeat > 2) fail(label + '.options.repeat must be 0-2')
  if (!/^[a-z0-9().,%\s+\-*/]+$/i.test(ease) || ease.length > 160) fail(label + '.options.ease is invalid')
  return { duration, delay, repeat, ease, yoyo: value.yoyo === true }
}

function normalizeAnimationDefinition(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  if (value.gsap !== undefined) {
    if (!value.gsap || typeof value.gsap !== 'object' || Array.isArray(value.gsap)) fail(label + '.gsap must be an object')
    return {
      engine: 'gsap',
      gsap: {
        from: normalizeGsapVars(value.gsap.from, label + '.gsap.from'),
        to: normalizeGsapVars(value.gsap.to, label + '.gsap.to')
      },
      options: normalizeGsapOptions(value.gsap.options || value.options || {}, label)
    }
  }
  if (!Array.isArray(value.keyframes) || value.keyframes.length < 2 || value.keyframes.length > 32) fail(`${label}.keyframes must contain 2-32 frames`)
  let previousOffset = -1
  const keyframes = value.keyframes.map((frame, index) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) fail(`${label}.keyframes[${index}] is invalid`)
    const normalized = {}
    for (const [property, raw] of Object.entries(frame)) {
      if (!ANIMATION_FRAME_PROPERTIES.has(property)) fail(`${label}.keyframes[${index}] disallows property ${property}`)
      if (property === 'offset') {
        const offset = Number(raw)
        if (!Number.isFinite(offset) || offset < 0 || offset > 1 || offset < previousOffset) fail(`${label}.keyframes[${index}].offset is invalid`)
        previousOffset = offset
        normalized.offset = offset
      } else if (property === 'composite') {
        if (!['replace', 'add', 'accumulate'].includes(raw)) fail(`${label}.keyframes[${index}].composite is invalid`)
        normalized.composite = raw
      } else {
        const serialized = String(raw)
        if ((typeof raw !== 'string' && typeof raw !== 'number') || serialized.length > 600 || /[{};<>\\]/.test(serialized) || UNSAFE_VISUAL_VALUE_PATTERN.test(serialized)) {
          fail(`${label}.keyframes[${index}].${property} is invalid`)
        }
        normalized[property] = raw
      }
    }
    if (!Object.keys(normalized).some(property => !['offset', 'easing', 'composite'].includes(property))) fail(`${label}.keyframes[${index}] has no animatable property`)
    return normalized
  })
  return { engine: 'waapi', keyframes, options: normalizeAnimationOptions(value.options || {}, label) }
}

function normalizeAnimationPack(value, declaration) {
  const label = `animation pack ${declaration.id}`
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) fail(`${label} schemaVersion must be 1`)
  if (!Array.isArray(value.presets) || !value.presets.length || value.presets.length > 128) fail(`${label}.presets must contain 1-128 items`)
  const ids = new Set()
  const defaults = new Set()
  const presets = value.presets.map((preset, index) => {
    if (!preset || typeof preset !== 'object' || !CONTRIBUTION_ID_PATTERN.test(preset.id || '') || ids.has(preset.id)) fail(`${label}.presets[${index}] has an invalid or duplicate id`)
    ids.add(preset.id)
    if (!ANIMATION_TARGETS.has(preset.target)) fail(`${label}.presets[${index}] has unknown target ${preset.target}`)
    if (!preset.label || String(preset.label).length > 120) fail(`${label}.presets[${index}] needs label`)
    const variants = {}
    for (const [variant, definition] of Object.entries(preset.variants || {})) {
      if (!CONTRIBUTION_ID_PATTERN.test(variant)) fail(`${label}.${preset.id} has invalid variant ${variant}`)
      variants[variant] = normalizeAnimationDefinition(definition, `${label}.${preset.id}.${variant}`)
    }
    const animation = preset.animation ? normalizeAnimationDefinition(preset.animation, `${label}.${preset.id}.animation`) : null
    if (!animation && !Object.keys(variants).length) fail(`${label}.${preset.id} needs animation or variants`)
    if (preset.default && defaults.has(preset.target)) fail(`${label} has multiple defaults for ${preset.target}`)
    if (preset.default) defaults.add(preset.target)
    return { ...structuredClone(preset), animation, variants }
  })
  return { ...structuredClone(value), presets }
}

function normalizeAnimationPacks(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:animations')) fail('animationPacks requires ui:animations permission')
  if (!Array.isArray(value) || value.length > 16) fail('animationPacks must be an array with at most 16 items')
  const ids = new Set()
  return value.map((pack, index) => {
    if (!pack || typeof pack !== 'object' || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id)) fail(`animationPacks[${index}] has an invalid or duplicate id`)
    ids.add(pack.id)
    if (!pack.title || String(pack.title).length > 120) fail(`animationPacks[${index}] needs a title of at most 120 characters`)
    return {
      id: String(pack.id), title: String(pack.title), description: String(pack.description || '').slice(0, 300),
      source: normalizePath(pack.source)
    }
  })
}

function normalizeAppearanceColor(value, label) {
  const source = String(value || '').trim()
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(source)) return source.toLowerCase()
  const rgb = source.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i)
  if (!rgb || rgb.slice(1, 4).some(channel => Number(channel) > 255)) fail(`${label} must be a hex or rgb/rgba color`)
  if (source.toLowerCase().startsWith('rgba') && rgb[4] === undefined) fail(`${label} rgba color needs alpha`)
  return source.replace(/\s+/g, ' ')
}

function normalizeAppearanceShadow(value, label) {
  const source = String(value || '').trim()
  if (source === 'none') return source
  if (!source || source.length > 320 || UNSAFE_VISUAL_VALUE_PATTERN.test(source) || /[{};<>\\]/.test(source) || !/^[#(),.%\sa-z0-9+\-]+$/i.test(source)) fail(`${label} is an invalid shadow`)
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
  const convert = value => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = color => color.map(convert).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function normalizeAppearanceTokens(value, label) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a token object`)
  const normalized = {}
  for (const [token, raw] of Object.entries(value)) {
    if (!APPEARANCE_TOKENS.has(token)) fail(`${label} disallows token ${token}`)
    normalized[token] = APPEARANCE_SHADOW_TOKENS.has(token) ? normalizeAppearanceShadow(raw, `${label}.${token}`) : normalizeAppearanceColor(raw, `${label}.${token}`)
  }
  for (const [foregroundToken, backgroundToken] of [['--text-primary', '--bg-base'], ['--text-on-accent', '--accent']]) {
    const foreground = opaqueRgb(normalized[foregroundToken])
    const background = opaqueRgb(normalized[backgroundToken])
    if (foreground && background && contrastRatio(foreground, background) < 4.5) fail(`${label} ${foregroundToken}/${backgroundToken} contrast must be at least 4.5:1`)
  }
  return normalized
}

function normalizeAppearancePacks(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:appearance')) fail('appearancePacks requires ui:appearance permission')
  if (!Array.isArray(value) || value.length > 16) fail('appearancePacks must be an array with at most 16 items')
  const ids = new Set()
  return value.map((pack, index) => {
    if (!pack || typeof pack !== 'object' || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id)) fail(`appearancePacks[${index}] has an invalid or duplicate id`)
    ids.add(pack.id)
    const title = String(pack.title || '').trim()
    if (!title || title.length > 120) fail(`appearancePacks[${index}] needs a title of at most 120 characters`)
    const titleEn = String(pack.titleEn || '').trim()
    if (titleEn.length > 120) fail(`appearancePacks[${index}].titleEn is too long`)
    const light = normalizeAppearanceTokens(pack.light, `appearancePacks[${index}].light`)
    const dark = normalizeAppearanceTokens(pack.dark, `appearancePacks[${index}].dark`)
    if (!Object.keys(light).length && !Object.keys(dark).length) fail(`appearancePacks[${index}] needs light or dark tokens`)
    return { id: String(pack.id), title, titleEn, description: String(pack.description || '').slice(0, 300), base: pack.base === 'fluent' ? 'fluent' : 'peach', light, dark }
  })
}

function normalizeVisualSurfaces(value, permissions) {
  if (value === undefined) return []
  if (!permissions.includes('ui:visual-surfaces')) fail('visualSurfaces requires ui:visual-surfaces permission')
  if (!Array.isArray(value) || value.length > 8) fail('visualSurfaces must be an array with at most 8 items')
  const ids = new Set()
  return value.map((surface, index) => {
    if (!surface || typeof surface !== 'object' || !CONTRIBUTION_ID_PATTERN.test(surface.id || '') || ids.has(surface.id)) fail(`visualSurfaces[${index}] has an invalid or duplicate id`)
    ids.add(surface.id)
    const entry = surface.entry ? normalizePath(surface.entry) : ''
    const platformEntries = normalizePlatformEntries(surface.platformEntries, `visualSurfaces[${index}].platformEntries`)
    if (!entry && !Object.keys(platformEntries).length) fail(`visualSurfaces[${index}] needs entry`)
    if (surface.placement && surface.placement !== 'background') fail(`visualSurfaces[${index}].placement must be background`)
    const events = [...new Set(Array.isArray(surface.events) ? surface.events.map(String) : [])]
    const unknownEvent = events.find(event => !VISUAL_SURFACE_EVENTS.has(event))
    if (unknownEvent) fail(`visualSurfaces[${index}] contains unknown event ${unknownEvent}`)
    return {
      id: String(surface.id), title: String(surface.title || surface.id), entry, platformEntries,
      placement: 'background', events, defaultEnabled: surface.defaultEnabled !== false
    }
  })
}

function normalizeDependencies(value, pluginId) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail('dependencies must be an array')
  const ids = new Set()
  return value.map((dependency, index) => {
    if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) fail(`dependencies[${index}] is invalid`)
    const id = String(dependency.id || '')
    if (!ID_PATTERN.test(id) || id === pluginId || ids.has(id)) fail(`dependencies[${index}] has an invalid or duplicate id`)
    ids.add(id)
    const range = String(dependency.range || dependency.version || '*')
    if (!range || range.length > 80 || /[{};<>]/.test(range)) fail(`dependencies[${index}].range is invalid`)
    return { id, range, dataAccess: dependency.dataAccess === true }
  })
}

function normalizeNativePage(value, label) {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  if (value.type !== 'settings') fail(`${label}.type must be settings`)
  if (!Array.isArray(value.controls) || value.controls.length > 64) fail(`${label}.controls must be an array with at most 64 items`)
  const ids = new Set()
  const controls = value.controls.map((control, index) => {
    if (!control || typeof control !== 'object' || !CONTRIBUTION_ID_PATTERN.test(control.id || '') || ids.has(control.id)) fail(`${label}.controls[${index}] has an invalid or duplicate id`)
    ids.add(control.id)
    const type = String(control.type || '')
    const hostSelect = ['animation-select', 'component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'].includes(type)
    if (!['toggle', 'range', 'select', 'audio', 'animation-select', 'component-style-select', 'component-override-select', 'component-override-toggle', 'result-presentation-select'].includes(type)) fail(`${label}.controls[${index}] has an unsupported type`)
    if (!control.label || String(control.label).length > 120 || (!hostSelect && !SETTING_PATH_PATTERN.test(control.path || ''))) fail(`${label}.controls[${index}] needs a valid label and path`)
    if (type === 'animation-select' && !ANIMATION_TARGETS.has(control.target)) fail(`${label}.controls[${index}] has an invalid animation target`)
    if (['component-style-select', 'component-override-select', 'component-override-toggle'].includes(type) && !COMPONENT_TARGETS.has(control.target)) fail(`${label}.controls[${index}] has an invalid component target`)
    if (type === 'result-presentation-select' && control.target !== 'roller.result') fail(`${label}.controls[${index}] has an invalid result presentation target`)
    if (type === 'animation-select' && control.packId && !CONTRIBUTION_ID_PATTERN.test(control.packId)) fail(`${label}.controls[${index}] has an invalid animation pack id`)
    if (type === 'component-override-toggle' && !CONTRIBUTION_ID_PATTERN.test(control.packId || '')) fail(`${label}.controls[${index}] has an invalid component override pack id`)
    if (type === 'select' && (!Array.isArray(control.options) || !control.options.length || control.options.length > 32)) fail(`${label}.controls[${index}] needs options`)
    if (type === 'range' && (!Number.isFinite(Number(control.min)) || !Number.isFinite(Number(control.max)) || Number(control.min) >= Number(control.max))) fail(`${label}.controls[${index}] has an invalid range`)
    return {
      id: String(control.id), type, label: String(control.label), description: String(control.description || ''),
      path: hostSelect ? '' : String(control.path),
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
  if (!SETTING_PATH_PATTERN.test(settingsKey)) fail(`${label}.settingsKey is invalid`)
  return { type: 'settings', settingsKey, controls }
}

function normalizePluginSettings(value, label = 'contributes.settings') {
  if (value === undefined || value === null) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const title = String(value.title || '').trim()
  if (title.length > 120) fail(`${label}.title is too long`)
  const description = String(value.description || '')
  if (description.length > 300) fail(`${label}.description is too long`)
  const storageKey = String(value.storageKey || 'settings')
  if (!SETTING_PATH_PATTERN.test(storageKey)) fail(`${label}.storageKey is invalid`)
  if (!Array.isArray(value.sections) || !value.sections.length || value.sections.length > MAX_SETTINGS_SECTIONS) fail(`${label}.sections must hold 1-${MAX_SETTINGS_SECTIONS} items`)
  const sectionIds = new Set()
  const sections = value.sections.map((rawSection, sectionIndex) => {
    const sectionLabel = `${label}.sections[${sectionIndex}]`
    if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) fail(`${sectionLabel} must be an object`)
    const id = String(rawSection.id || '')
    if (!CONTRIBUTION_ID_PATTERN.test(id) || sectionIds.has(id)) fail(`${sectionLabel} has an invalid or duplicate id`)
    sectionIds.add(id)
    const sectionTitle = String(rawSection.title || '').trim()
    if (!sectionTitle || sectionTitle.length > 120) fail(`${sectionLabel} needs a title`)
    const sectionDescription = String(rawSection.description || '')
    if (sectionDescription.length > 300) fail(`${sectionLabel}.description is too long`)
    if (!Array.isArray(rawSection.fields) || !rawSection.fields.length || rawSection.fields.length > MAX_SETTINGS_FIELDS) fail(`${sectionLabel}.fields must hold 1-${MAX_SETTINGS_FIELDS} items`)
    const fieldIds = new Set()
    const fields = rawSection.fields.map((rawField, fieldIndex) => {
      const fieldLabel = `${sectionLabel}.fields[${fieldIndex}]`
      if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField)) fail(`${fieldLabel} must be an object`)
      const id = String(rawField.id || '')
      if (!CONTRIBUTION_ID_PATTERN.test(id) || fieldIds.has(id)) fail(`${fieldLabel} has an invalid or duplicate id`)
      fieldIds.add(id)
      const type = rawField.type === 'range' ? 'slider' : String(rawField.type || '')
      if (!SETTINGS_FIELD_TYPES.has(type)) fail(`${fieldLabel} has an unsupported type`)
      const fieldTitle = String(rawField.label || '').trim()
      if (!fieldTitle || fieldTitle.length > 120) fail(`${fieldLabel} needs a valid label`)
      const fieldDescription = String(rawField.description || '')
      if (fieldDescription.length > 300) fail(`${fieldLabel}.description is too long`)
      const hostSelect = HOST_SELECT_FIELD_TYPES.has(type)
      const fieldPath = hostSelect ? '' : String(rawField.path || id)
      if (!hostSelect && !SETTING_PATH_PATTERN.test(fieldPath)) fail(`${fieldLabel} has an invalid path`)
      if (hostSelect && String(rawField.path || '') !== '') fail(`${fieldLabel} must not declare a path`)
      if (type === 'animation-select' && !ANIMATION_TARGETS.has(rawField.target)) fail(`${fieldLabel} has an invalid animation target`)
      if (['component-style-select', 'component-override-select', 'component-override-toggle'].includes(type) && !COMPONENT_TARGETS.has(rawField.target)) fail(`${fieldLabel} has an invalid component target`)
      if (type === 'result-presentation-select' && rawField.target !== 'roller.result') fail(`${fieldLabel} has an invalid result presentation target`)
      if (type === 'animation-select' && rawField.packId && !CONTRIBUTION_ID_PATTERN.test(rawField.packId)) fail(`${fieldLabel} has an invalid animation pack id`)
      if (type === 'component-override-toggle' && !CONTRIBUTION_ID_PATTERN.test(rawField.packId || '')) fail(`${fieldLabel} has an invalid component override pack id`)
      if (type === 'select' && (!Array.isArray(rawField.options) || !rawField.options.length || rawField.options.length > 32)) fail(`${fieldLabel} needs options`)
      if (type === 'select' && rawField.options.some(option => !option || typeof option !== 'object' || option.value === undefined || !option.label)) fail(`${fieldLabel} needs options`)
      if (type === 'slider' && (!Number.isFinite(Number(rawField.min)) || !Number.isFinite(Number(rawField.max)) || Number(rawField.min) >= Number(rawField.max))) fail(`${fieldLabel} has an invalid range`)
      return {
        id, type, label: fieldTitle, description: fieldDescription, path: fieldPath,
        target: hostSelect ? String(rawField.target) : undefined,
        packId: ['animation-select', 'component-override-toggle'].includes(type) ? String(rawField.packId || '') : undefined,
        accept: type === 'audio' ? String(rawField.accept || 'audio/*') : undefined,
        min: type === 'slider' ? Number(rawField.min) : undefined,
        max: type === 'slider' ? Number(rawField.max) : undefined,
        step: type === 'slider' ? Number(rawField.step || 0.01) : undefined,
        options: type === 'select' ? rawField.options.map(option => ({ value: String(option.value), label: option.label })) : undefined,
        default: rawField.default
      }
    })
    return { id, title: sectionTitle, description: sectionDescription, fields }
  })
  return { title, description, storageKey, sections }
}

function normalizePages(value, { allowNative = true } = {}) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 32) fail('pages must be an array with at most 32 items')
  const ids = new Set()
  return value.map((rawPage, index) => {
    if (!rawPage || typeof rawPage !== 'object' || Array.isArray(rawPage)) fail(`pages[${index}] is invalid`)
    const id = String(rawPage.id || '')
    if (!CONTRIBUTION_ID_PATTERN.test(id) || ids.has(id)) fail(`pages[${index}] has an invalid or duplicate id`)
    ids.add(id)
    const title = String(rawPage.title || '').trim()
    if (!title || title.length > 120) fail(`pages[${index}] needs a title of at most 120 characters`)
    if (rawPage.location !== undefined && !['plugins', 'dock'].includes(rawPage.location)) fail(`pages[${index}].location is invalid`)
    const platformEntries = normalizePlatformEntries(rawPage.platformEntries, `pages[${index}].platformEntries`)
    const entry = rawPage.entry ? normalizePath(rawPage.entry) : ''
    if (!allowNative && rawPage.native !== undefined && rawPage.native !== null) fail(`pages[${index}].native is unavailable in the split format; declare settings in ${CONTRIBUTIONS_FILE}`)
    const native = allowNative ? normalizeNativePage(rawPage.native, `pages[${index}].native`) : null
    if (!entry && !Object.keys(platformEntries).length && !native) fail(`pages[${index}] needs an entry or native schema`)
    const order = rawPage.order === undefined ? 500 : Number(rawPage.order)
    if (!Number.isInteger(order) || order < 0 || order > 999) fail(`pages[${index}].order must be an integer from 0 to 999`)
    const icon = String(rawPage.icon || 'apps-24-regular')
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/i.test(icon)) fail(`pages[${index}].icon is invalid`)
    const titleEn = String(rawPage.titleEn || '').trim()
    if (titleEn.length > 120) fail(`pages[${index}].titleEn is too long`)
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
  if (!Array.isArray(value) || value.length > 64) fail('commands must be an array with at most 64 items')
  const ids = new Set()
  return value.map((rawCommand, index) => {
    if (!rawCommand || typeof rawCommand !== 'object' || Array.isArray(rawCommand)) fail(`commands[${index}] is invalid`)
    const id = String(rawCommand.id || '')
    if (!CONTRIBUTION_ID_PATTERN.test(id) || ids.has(id)) fail(`commands[${index}] has an invalid or duplicate id`)
    ids.add(id)
    const title = String(rawCommand.title || '').trim()
    if (!title || title.length > 120) fail(`commands[${index}] needs a title of at most 120 characters`)
    const titleEn = String(rawCommand.titleEn || '').trim()
    if (titleEn.length > 120) fail(`commands[${index}].titleEn is too long`)
    const locations = [...new Set(Array.isArray(rawCommand.locations) ? rawCommand.locations.map(String) : ['command-palette'])]
    const unknownLocation = locations.find(location => !COMMAND_LOCATIONS.has(location))
    if (unknownLocation) fail(`commands[${index}] contains unknown location ${unknownLocation}`)
    const icon = String(rawCommand.icon || 'apps-24-regular')
    if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/i.test(icon)) fail(`commands[${index}].icon is invalid`)
    const order = rawCommand.order === undefined ? 500 : Number(rawCommand.order)
    if (!Number.isInteger(order) || order < 0 || order > 999) fail(`commands[${index}].order must be an integer from 0 to 999`)
    return { id, title, titleEn, description: String(rawCommand.description || '').slice(0, 300), icon, locations, order }
  })
}

function normalizeManifest(raw, { fromYml = false } = {}) {
  if (!raw || typeof raw !== 'object') fail('manifest.json must be an object')
  if (!fromYml && raw.api === undefined && (!raw.name || !raw.version || !raw.author || !raw.schemaVersion || !raw.engine)) return { ...structuredClone(raw), activatable: false, displayOnly: true, migrationRequired: true, api: null, id: String(raw.id || ''), version: String(raw.version || ''), name: String(raw.name || '') }
  if (raw.api === '1.5' || (raw.api !== undefined && raw.api !== null)) return normalizeManifest15(raw)
  const manifest = structuredClone(raw)
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1')
  if (!ID_PATTERN.test(manifest.id || '')) fail('manifest.id must use reverse-domain style')
  if (!manifest.name || !manifest.version || !manifest.author) fail('manifest.name, version and author are required')
  if (!manifest.engine || compareVersions(API_VERSION, manifest.engine.min || '0') < 0) fail(`plugin requires API ${manifest.engine?.min || 'unknown'}`)
  manifest.permissions = [...new Set(manifest.permissions || [])]
  const permissions = new Set(['storage:read', 'storage:write', 'events:draw', 'events:lifecycle', 'draw:execute', 'ui:animations', 'ui:visual-surfaces', 'ui:appearance', 'ui:component-styles', 'ui:component-overrides', 'ui:native-views', 'ui:result-presentations', 'ui:fonts', 'notifications:show', 'audio:select', 'audio:play', 'names:read', 'records:read', 'statistics:read', 'balance:read'])
  for (const permission of ['system:open-url', 'system:select-file', 'system:select-directory', 'system:clipboard-read', 'system:clipboard-write', 'system:reveal-file', 'system:execute']) permissions.add(permission)
  const unknown = manifest.permissions.find(permission => !permissions.has(permission))
  if (unknown) fail(`unknown permission: ${unknown}`)
  manifest.supportedPlatforms = normalizePlatforms(manifest.supportedPlatforms, 'supportedPlatforms')
  manifest.platformEntries = normalizePlatformEntries(manifest.platformEntries, 'platformEntries')
  manifest.capabilities = normalizeCapabilities(manifest.capabilities, manifest.permissions)
  manifest.systemOperations = normalizeSystemOperations(manifest.systemOperations, manifest.permissions)
  manifest.dependencies = normalizeDependencies(manifest.dependencies, manifest.id)
  manifest.contributes = manifest.contributes && typeof manifest.contributes === 'object' ? manifest.contributes : {}
  manifest.contributes.pages = normalizePages(manifest.contributes.pages, { allowNative: !fromYml })
  const settings = normalizePluginSettings(manifest.contributes.settings)
  if (settings) manifest.contributes.settings = settings
  else delete manifest.contributes.settings
  manifest.contributes.commands = normalizeCommands(manifest.contributes.commands)
  manifest.contributes.animationPacks = normalizeAnimationPacks(manifest.contributes.animationPacks, manifest.permissions)
  manifest.contributes.visualSurfaces = normalizeVisualSurfaces(manifest.contributes.visualSurfaces, manifest.permissions)
  manifest.contributes.appearancePacks = normalizeAppearancePacks(manifest.contributes.appearancePacks, manifest.permissions)
  const stylePacks = manifest.contributes.componentStylePacks
  if (stylePacks !== undefined) {
    if (!manifest.permissions.includes('ui:component-styles') || !Array.isArray(stylePacks) || stylePacks.length > 16) fail('componentStylePacks requires ui:component-styles and at most 16 items')
    const ids = new Set()
    for (const [index, pack] of stylePacks.entries()) {
      if (!pack || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id) || !pack.targets || typeof pack.targets !== 'object') fail(`componentStylePacks[${index}] is invalid`)
      ids.add(pack.id)
      for (const [target, styles] of Object.entries(pack.targets)) {
        if (!/^[a-z][a-z0-9.-]{1,63}$/.test(target) || !styles || typeof styles !== 'object') fail(`componentStylePacks[${index}] target is invalid`)
        for (const [property, value] of Object.entries(styles)) {
          if (['selector', 'css', 'cssFile', 'display', 'visibility', 'content', 'position', 'zIndex', 'pointerEvents', 'overflow', 'transform', 'opacity'].includes(property) || /url\s*\(|var\s*\(|calc\s*\(|env\s*\(/i.test(String(value))) fail(`componentStylePacks[${index}] contains a forbidden style`)
        }
      }
    }
  }
  const fonts = manifest.contributes.fonts
  if (fonts !== undefined) {
    if (!manifest.permissions.includes('ui:fonts') || !Array.isArray(fonts) || fonts.length > 8) fail('fonts requires ui:fonts and at most 8 items')
    const ids = new Set()
    for (const [index, font] of fonts.entries()) {
      if (!font || !/^[a-z][a-z0-9._-]{0,63}$/.test(font.id || '') || ids.has(font.id) || !String(font.source || '').toLowerCase().endsWith('.woff2')) fail(`fonts[${index}] must reference a unique .woff2 file`)
      ids.add(font.id)
    }
  }
  const overrides = manifest.contributes.componentOverridePacks
  if (overrides !== undefined) {
    if (!manifest.permissions.includes('ui:component-overrides') || !Array.isArray(overrides) || overrides.length > 16) fail('componentOverridePacks requires ui:component-overrides and at most 16 items')
    const ids = new Set()
    for (const [index, pack] of overrides.entries()) {
      if (!pack || !CONTRIBUTION_ID_PATTERN.test(pack.id || '') || ids.has(pack.id) || !pack.targets || typeof pack.targets !== 'object') fail(`componentOverridePacks[${index}] is invalid`)
      ids.add(pack.id)
      for (const [target, state] of Object.entries(pack.targets)) {
        if (!state || !['visible', 'hidden', 'replaced'].includes(state.visibility || 'visible')) fail(`componentOverridePacks[${index}] visibility is invalid`)
        if (state.layout && !['collapse', 'reserve', 'compact'].includes(state.layout)) fail(`componentOverridePacks[${index}] layout is invalid`)
        if (state.visibility === 'replaced') fail(`componentOverridePacks[${index}] replacement is unavailable`)
        if (['navigation.settings-entry', 'roller.current-list', 'roller.primary-action', 'roller.result', 'navigation.dock', 'app.title-bar', 'card.deck', 'card.item', 'lottery.result'].includes(target)) fail(`componentOverridePacks[${index}] cannot hide protected or required target ${target}`)
      }
    }
  }
  const nativeViews = manifest.contributes.nativeViews
  if (nativeViews !== undefined) {
    if (!manifest.permissions.includes('ui:native-views') || !Array.isArray(nativeViews) || nativeViews.length > 16) fail('nativeViews requires ui:native-views and at most 16 items')
    const ids = new Set()
    for (const [index, view] of nativeViews.entries()) {
      if (!view || !CONTRIBUTION_ID_PATTERN.test(view.id || '') || ids.has(view.id) || !String(view.source || '').toLowerCase().endsWith('.json')) fail(`nativeViews[${index}] is invalid`)
      ids.add(view.id)
      if (!['slot:roller.side-panel', 'slot:roller.below-result', 'slot:records.toolbar'].includes(view.slot)) fail(`nativeViews[${index}] slot is unavailable`)
    }
  }
  const resultPresentations = manifest.contributes.resultPresentations
  if (resultPresentations !== undefined) {
    if (!manifest.permissions.includes('ui:result-presentations') || !Array.isArray(resultPresentations) || resultPresentations.length > 16) fail('resultPresentations requires ui:result-presentations and at most 16 items')
    const ids = new Set()
    for (const [index, presentation] of resultPresentations.entries()) {
      if (!presentation || !CONTRIBUTION_ID_PATTERN.test(presentation.id || '') || ids.has(presentation.id)) fail(`resultPresentations[${index}] is invalid`)
      ids.add(presentation.id)
      if (!Array.isArray(presentation.targets) || !presentation.targets.length || presentation.targets.some(target => target !== 'roller.result')) fail(`resultPresentations[${index}] target is unavailable`)
      if (presentation.layout && !['single', 'list', 'grid', 'spotlight'].includes(presentation.layout)) fail(`resultPresentations[${index}] layout is invalid`)
      const style = presentation.style
      if (style !== undefined) {
        if (!style || typeof style !== 'object' || Array.isArray(style)) fail(`resultPresentations[${index}] style is invalid`)
        for (const key of Object.keys(style)) if (!['size', 'alignment', 'showAlgorithm', 'showOperationId', 'showEnglishName'].includes(key)) fail(`resultPresentations[${index}] style contains an unknown property`)
        if (style.size && !['small', 'medium', 'large'].includes(style.size)) fail(`resultPresentations[${index}] style.size is invalid`)
        if (style.alignment && !['start', 'center', 'end'].includes(style.alignment)) fail(`resultPresentations[${index}] style.alignment is invalid`)
        for (const key of ['showAlgorithm', 'showOperationId', 'showEnglishName']) if (style[key] !== undefined && typeof style[key] !== 'boolean') fail(`resultPresentations[${index}] ${key} must be boolean`)
      }
    }
  }
  // Keep optional contribution keys absent when unused. The host validates a present
  // array as an explicit contribution and therefore expects its matching permission.
  if (!manifest.contributes.animationPacks.length) delete manifest.contributes.animationPacks
  if (!manifest.contributes.commands.length) delete manifest.contributes.commands
  if (!manifest.contributes.visualSurfaces.length) delete manifest.contributes.visualSurfaces
  if (!manifest.contributes.appearancePacks.length) delete manifest.contributes.appearancePacks
  if (!manifest.contributes.componentStylePacks?.length) delete manifest.contributes.componentStylePacks
  if (!manifest.contributes.fonts?.length) delete manifest.contributes.fonts
  if (!manifest.contributes.componentOverridePacks?.length) delete manifest.contributes.componentOverridePacks
  if (!manifest.contributes.nativeViews?.length) delete manifest.contributes.nativeViews
  if (!manifest.contributes.resultPresentations?.length) delete manifest.contributes.resultPresentations
  if (manifest.entry) manifest.entry = normalizePath(manifest.entry)
  if ((manifest.contributes.commands || []).length && !manifest.entry && !Object.keys(manifest.platformEntries).length) fail('commands require a Worker entry')
  if (!manifest.entry && !Object.keys(manifest.platformEntries).length && !(manifest.contributes.pages || []).length && !(manifest.contributes.commands || []).length && !(manifest.contributes.visualSurfaces || []).length && !(manifest.contributes.appearancePacks || []).length && !(manifest.contributes.componentStylePacks || []).length && !(manifest.contributes.componentOverridePacks || []).length && !(manifest.contributes.nativeViews || []).length && !(manifest.contributes.resultPresentations || []).length && !(manifest.contributes.fonts || []).length && !(manifest.contributes.settings?.sections || []).length) {
    fail('plugin needs at least one Worker, page, visual surface or appearance pack entry (or a command contribution with a Worker)')
  }
  if (manifest.icon) manifest.icon = normalizePath(manifest.icon)
  if (manifest.readme) manifest.readme = normalizePath(manifest.readme)
  return raw.api === null
    ? { ...manifest, activatable: false, displayOnly: true, migrationRequired: true, api: null }
    : manifest
}

function toBase64(bytes) { return Buffer.from(bytes).toString('base64') }
function fromBase64(value) { return Buffer.from(value, 'base64') }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }

async function bundleWorker(sourcePath) {
  const sdkPath = path.resolve(packageRoot, 'src/plugin-sdk.mjs')
  const result = await build({
    entryPoints: [sourcePath],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    alias: {
      '@starcyrene/cyrene-name-roller/plugin-sdk': sdkPath,
      '@starcyrene/cyrene-name-roller': sdkPath,
      // Keep plugins written before the organization transfer buildable.
      '@cyrene2008/cyrene-name-roller/plugin-sdk': sdkPath,
      '@cyrene2008/cyrene-name-roller': sdkPath
    }
  })
  const source = result.outputFiles[0].text
  const obfuscated = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.55,
    deadCodeInjection: false,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.7,
    unicodeEscapeSequence: false
  })
  return `${obfuscated.getObfuscatedCode()}\n`
}

async function collectFiles(root, current = root, result = []) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.DS_Store') continue
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) await collectFiles(root, full, result)
    else result.push(path.relative(root, full).replaceAll('\\', '/'))
  }
  return result
}

async function readOptionalText(directory, name) {
  try {
    return await fs.readFile(path.join(directory, name), 'utf8')
  } catch {
    return undefined
  }
}

function parseManifestYaml(text) {
  let value
  try {
    value = parseYaml(text, { uniqueKeys: true })
  } catch (error) {
    fail(`${MANIFEST_YAML_FILE} cannot be parsed: ${error.message || error}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${MANIFEST_YAML_FILE} must be a mapping`)
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(`${MANIFEST_YAML_FILE} must be a plain mapping`)
  const forbidden = YAML_FORBIDDEN_KEYS.find(key => Object.hasOwn(value, key))
  if (forbidden) fail(`${MANIFEST_YAML_FILE} must not declare ${forbidden}; keep contributions in ${CONTRIBUTIONS_FILE}`)
  return { ...value }
}

function parseContributionsJson(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    fail(`${CONTRIBUTIONS_FILE} cannot be parsed: ${error.message || error}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${CONTRIBUTIONS_FILE} must be an object`)
  if (Object.hasOwn(value, 'contributes')) fail(`${CONTRIBUTIONS_FILE} must be a flat contribution object without a contributes wrapper`)
  const leaked = Object.keys(value).find(key => CONTRIBUTIONS_IDENTITY_KEYS.has(key))
  if (leaked) fail(`${CONTRIBUTIONS_FILE} must not declare identity field ${leaked}`)
  return value
}

function isPresentValue(value) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function serializeManifestYaml(manifest, integrity) {
  const ordered = {}
  for (const key of YAML_MANIFEST_ORDER) if (isPresentValue(manifest[key])) ordered[key] = manifest[key]
  if (Array.isArray(manifest.permissions) && manifest.permissions.length) ordered.permissions = [...manifest.permissions].sort()
  for (const key of YAML_OPTIONAL_ORDER) if (isPresentValue(manifest[key])) ordered[key] = manifest[key]
  ordered.integrity = integrity
  return stringifyYaml(ordered, { indent: 2, lineWidth: 0 })
}

async function readManifestSource(directory) {
  const yamlText = await readOptionalText(directory, MANIFEST_YAML_FILE)
  const jsonText = await readOptionalText(directory, MANIFEST_JSON_FILE)
  if (yamlText === undefined && jsonText === undefined) fail(`plugin is missing ${MANIFEST_YAML_FILE} or ${MANIFEST_JSON_FILE}`)
  if (yamlText !== undefined && jsonText !== undefined) fail(`${MANIFEST_YAML_FILE} and ${MANIFEST_JSON_FILE} cannot coexist`)
  if (yamlText !== undefined) {
    const contributionsText = await readOptionalText(directory, CONTRIBUTIONS_FILE)
    const yamlValue = parseManifestYaml(yamlText)
    const contributions = contributionsText === undefined ? {} : parseContributionsJson(contributionsText)
    const merged = {}
    for (const [key, value] of Object.entries(contributions)) {
      if (CONTRIBUTIONS_IDENTITY_KEYS.has(key)) continue
      merged[key] = value
    }
    return { raw: { ...yamlValue, contributes: merged }, fromYml: true, contributionsText }
  }
  let raw
  try {
    raw = JSON.parse(jsonText)
  } catch (error) {
    fail(`${MANIFEST_JSON_FILE} cannot be parsed: ${error.message || error}`)
  }
  return { raw, fromYml: false, contributionsText: undefined }
}

function declarationFilesFor(fromYml) {
  return fromYml ? [MANIFEST_YAML_FILE, CONTRIBUTIONS_FILE] : [MANIFEST_JSON_FILE]
}

async function validateDirectory(directory) {
  const source = await readManifestSource(directory)
  const manifest = normalizeManifest(source.raw, { fromYml: source.fromYml })
  if (manifest.displayOnly) return { manifest, animationPacks: [], files: [], source }
  const files = new Set(await collectFiles(directory))
  if (files.size > MAX_FILE_COUNT) fail(`plugin has more than ${MAX_FILE_COUNT} files`)
  const declarationFiles = declarationFilesFor(source.fromYml)
  const payloadFiles = [...files].filter(file => !declarationFiles.includes(file))
  if (manifest.api === '1.5') {
    const pageFiles = pages => pages.flatMap(page => [page.entry, ...pages.flatMap(() => page.children || []).map(child => child.entry)])
    const requiredFiles = [manifest.entry.script, ...pageFiles(manifest.pages)].filter(Boolean)
    for (const required of requiredFiles) if (!files.has(required)) fail(`manifest references missing file: ${required}`)
    return { manifest, animationPacks: [], files: payloadFiles, source }
  }
  const requiredFiles = [
    manifest.entry?.script || manifest.entry,
    ...Object.values(manifest.platformEntries || {}),
    manifest.icon,
    manifest.readme,
    ...(manifest.contributes.pages || []).flatMap(page => [page.entry, ...Object.values(page.platformEntries || {})]),
    ...(manifest.contributes.animationPacks || []).map(pack => pack.source),
    ...(manifest.contributes.fonts || []).map(font => font.source),
    ...(manifest.contributes.nativeViews || []).map(view => view.source),
    ...(manifest.contributes.visualSurfaces || []).flatMap(surface => [surface.entry, ...Object.values(surface.platformEntries || {})])
  ].filter(Boolean)
  for (const required of requiredFiles) {
    if (!files.has(required)) fail(`manifest references missing file: ${required}`)
  }
  let fontTotal = 0
  for (const font of manifest.contributes.fonts || []) {
    const bytes = await fs.readFile(path.join(directory, font.source))
    if (bytes.byteLength > 2 * 1024 * 1024) fail(`font exceeds 2 MiB: ${font.source}`)
    if (bytes.length < 4 || bytes[0] !== 0x77 || bytes[1] !== 0x4f || bytes[2] !== 0x46 || bytes[3] !== 0x32) fail(`font is not a WOFF2 file: ${font.source}`)
    fontTotal += bytes.byteLength
  }
  if (fontTotal > 8 * 1024 * 1024) fail('fonts exceed 8 MiB in total')
  const animationPacks = []
  for (const declaration of manifest.contributes.animationPacks || []) {
    let raw
    try { raw = JSON.parse(await fs.readFile(path.join(directory, declaration.source), 'utf8')) }
    catch (error) { fail(`cannot parse animation pack ${declaration.id}: ${error.message || error}`) }
    animationPacks.push(normalizeAnimationPack(raw, declaration))
  }
  return { manifest, animationPacks, files: payloadFiles, source }
}

async function encryptEnvelope(zipBytes, manifest, options = {}) {
  const hash = sha256(zipBytes)
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const material = await subtle.importKey('raw', textEncoder.encode(`${manifest.id}@${manifest.version}:CyreneNameRollerPlugin-v1`), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const additionalData = textEncoder.encode(`${manifest.id}\0${manifest.version}\0${hash}`)
  const encrypted = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, zipBytes))
  const envelope = {
    v: 1,
    id: manifest.id,
    version: manifest.version,
    salt: toBase64(salt),
    iv: toBase64(iv),
    hash,
    data: toBase64(encrypted),
    signatureAlgorithm: '',
    signature: '',
    publisherKey: ''
  }
  if (options.privateKey) {
    const privateKey = crypto.createPrivateKey(await fs.readFile(options.privateKey, 'utf8'))
    const signed = Buffer.from(`${manifest.id}\0${manifest.version}\0${hash}`, 'utf8')
    const signature = crypto.sign(null, signed, privateKey)
    const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
    envelope.signatureAlgorithm = 'Ed25519'
    envelope.signature = toBase64(signature)
    envelope.publisherKey = toBase64(publicKey)
  }
  const output = Buffer.concat([MAGIC, Buffer.from(JSON.stringify(envelope), 'utf8')])
  if (output.byteLength > MAX_PACKAGE_SIZE) fail(`output package exceeds ${MAX_PACKAGE_SIZE} bytes`)
  return { output, envelope }
}

async function packDirectory(directory, outFile, options = {}) {
  const { manifest, source } = await validateDirectory(directory)
  const workerEntries = new Set([
    manifest.entry?.script || manifest.entry,
    ...(manifest.api === '1.5' ? [] : [
      ...Object.values(manifest.platformEntries || {}),
      ...(manifest.contributes.visualSurfaces || []).flatMap(surface => [surface.entry, ...Object.values(surface.platformEntries || {})])
    ])
  ].filter(Boolean))
  const bundledWorkers = new Map()
  for (const entry of workerEntries) bundledWorkers.set(entry, Buffer.from(await bundleWorker(path.resolve(directory, entry)), 'utf8'))
  const finalFiles = await collectFiles(directory)
  const declarationFile = source.fromYml ? MANIFEST_YAML_FILE : MANIFEST_JSON_FILE
  const integrity = {}
  const archive = new JSZip()
  for (const file of finalFiles) {
    const bytes = bundledWorkers.get(file) || await fs.readFile(path.join(directory, file))
    if (file !== declarationFile) integrity[file] = sha256(bytes)
    archive.file(file, bytes)
  }
  const packageManifest = { ...manifest, integrity }
  archive.file(declarationFile, source.fromYml
    ? serializeManifestYaml(manifest, integrity)
    : JSON.stringify(packageManifest, null, 2))
  const zipBytes = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  const { output, envelope } = await encryptEnvelope(zipBytes, packageManifest, options)
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, output)
  return { manifest: packageManifest, output, envelope, packageHash: sha256(output), outFile }
}

async function templateDeclarationPath(directory) {
  for (const name of [MANIFEST_YAML_FILE, MANIFEST_JSON_FILE]) {
    try {
      await fs.access(path.join(directory, name))
      return name
    } catch {}
  }
  fail(`template is missing ${MANIFEST_YAML_FILE} or ${MANIFEST_JSON_FILE}`)
}

async function createTemplate(directory, kind = 'basic') {
  if (kind === 'api15') {
    const target = path.join(packageRoot, 'templates', 'api15')
    await templateDeclarationPath(target)
    await fs.mkdir(directory, { recursive: true })
    if ((await fs.readdir(directory)).length) fail(`target directory is not empty: ${directory}`)
    await fs.cp(target, directory, { recursive: true })
    return
  }
  const templateName = ['sound', 'sound-effects'].includes(kind)
    ? 'sound-effects'
    : ['ui', 'ui-customization'].includes(kind) ? 'ui-customization' : 'basic'
  const templateDirectory = path.join(packageRoot, 'templates', templateName)
  await templateDeclarationPath(templateDirectory)
  await fs.mkdir(directory, { recursive: true })
  const existing = await fs.readdir(directory)
  if (existing.length) fail(`target directory is not empty: ${directory}`)
  await fs.cp(templateDirectory, directory, { recursive: true })
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2))
  const command = positional[0] || 'help'
  if (command === 'help' || options.help) {
    console.log('cnrp create <dir> [--template api15|basic|sound-effects|ui-customization]')
    console.log('cnrp validate <dir>')
    console.log('cnrp pack <dir> --out <file.cnrp> [--private-key key.pem]')
    return
  }
  if (command === 'create') {
    const directory = path.resolve(positional[1] || 'my-cyrene-plugin')
    await createTemplate(directory, options.template || 'basic')
    console.log(`Created plugin template at ${directory}`)
    return
  }
  if (command === 'validate') {
    const directory = path.resolve(positional[1] || '.')
    const result = await validateDirectory(directory)
    console.log(`Valid: ${result.manifest.id} v${result.manifest.version} (${result.files.length} files)`)
    return
  }
  if (command === 'pack') {
    const directory = path.resolve(positional[1] || '.')
    const outFile = path.resolve(options.out || path.join(directory, 'dist', `${path.basename(directory)}.cnrp`))
    const result = await packDirectory(directory, outFile, { privateKey: options['private-key'] })
    console.log(`Packed ${result.manifest.id} v${result.manifest.version}`)
    console.log(`Output: ${result.outFile}`)
    console.log(`SHA-256: ${result.packageHash}`)
    console.log(`Publisher signature: ${result.envelope.signature ? 'Ed25519' : 'none (local/unverified)'}`)
    return
  }
  fail(`unknown command: ${command}`)
}

async function isMainModule() {
  if (!process.argv[1]) return false
  try {
    return await fs.realpath(path.resolve(process.argv[1])) === await fs.realpath(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (await isMainModule()) {
  main().catch(error => {
    console.error(`cnrp: ${error.message || error}`)
    process.exitCode = 1
  })
}

export { packDirectory, validateDirectory, createTemplate, readManifestSource }
