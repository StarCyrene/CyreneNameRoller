import { decodePluginFile, MAX_PLUGIN_ANIMATION_ACTIVE_MS, normalizeAnimationPack } from './package'
import { gsap } from 'gsap'

const VALUE_SEPARATOR = '::'

function selectionValue(pluginId, packId, presetId) {
  return [pluginId, packId, presetId].join(VALUE_SEPARATOR)
}

function parseSelection(value) {
  const [pluginId = '', packId = '', presetId = ''] = String(value || '').split(VALUE_SEPARATOR)
  return { pluginId, packId, presetId }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function animationEnabled() {
  if (typeof document !== 'undefined' && document.querySelector('.app-layout')?.classList.contains('perf-no-anim')) return false
  return true
}

function gsapSeconds(milliseconds) {
  return Math.max(0, Number(milliseconds || 0) / 1000)
}

function animationDurationMs(definition) {
  if (definition?.engine === 'gsap') {
    const options = definition.options || {}
    return Math.ceil((options.delay || 0) + (options.duration || 0) * ((options.repeat || 0) + 1))
  }
  return Math.ceil((definition.options.delay || 0) + (definition.options.duration || 0) * (definition.options.iterations || 1))
}

function animationTimeoutMs(definition) {
  return Math.min(MAX_PLUGIN_ANIMATION_ACTIVE_MS, animationDurationMs(definition) + 500)
}

function scaledDefinition(definition, scale) {
  const normalizedScale = Math.min(2, Math.max(0.5, Number(scale) || 1))
  if (normalizedScale === 1) return definition
  const result = clone(definition)
  if (result?.options && Number.isFinite(Number(result.options.duration))) {
    result.options.duration = Math.max(1, Math.round(Number(result.options.duration) * normalizedScale))
  }
  return result
}

function createAnimationRunner(targetElement, definition) {
  if (definition.engine === 'gsap') {
    let settled = false
    let settleRunner
    let context
    let tween
    const runnerFinished = new Promise(resolve => { settleRunner = resolve })
    const settle = () => {
      if (settled) return
      settled = true
      try { context?.revert() } catch {}
      settleRunner()
    }
    const options = definition.options || {}
    context = gsap.context(() => {
      tween = gsap.fromTo(targetElement, clone(definition.gsap.from), {
        ...clone(definition.gsap.to),
        duration: gsapSeconds(options.duration),
        delay: gsapSeconds(options.delay),
        repeat: Number(options.repeat || 0),
        yoyo: options.yoyo === true,
        ease: options.ease || 'power3.out',
        overwrite: 'auto',
        onComplete: settle,
        onInterrupt: settle
      })
    })
    return {
      animation: tween,
      finished: runnerFinished,
      totalDurationMs: animationDurationMs(definition),
      cancel() { try { tween.kill() } finally { settle() } }
    }
  }
  if (typeof targetElement.animate !== 'function') throw new Error('WAAPI is unavailable for this animation target')
  const animation = targetElement.animate(clone(definition.keyframes), clone(definition.options))
  const finished = Promise.resolve(animation.finished).catch(() => undefined).finally(() => {
    try { animation.cancel() } catch {}
  })
  return {
    animation,
    finished,
    totalDurationMs: animationDurationMs(definition),
    cancel() { try { animation.cancel() } catch {} }
  }
}

export class PluginAnimationRegistry {
  constructor() {
    this.packs = new Map()
    this.surfaces = new Map()
    this.running = new Map()
    this.elementAnimations = new WeakMap()
    this.durationScales = new Map()
  }

  setDurationScale(pluginId, value) {
    const normalized = Math.min(2, Math.max(0.5, Number(value) || 1))
    this.durationScales.set(String(pluginId), normalized)
    return normalized
  }

  durationScale(pluginId) {
    return this.durationScales.get(String(pluginId)) ?? 1
  }

  registerPlugin(plugin, selections = {}) {
    this.unregisterPlugin(plugin.manifest.id)
    const parsedPacks = plugin.animationPacks?.length
      ? plugin.animationPacks
      : (plugin.manifest.contributes?.animationPacks || []).map(declaration => {
          const raw = JSON.parse(decodePluginFile(plugin, declaration.source))
          return normalizeAnimationPack(raw, declaration)
        })
    for (const pack of parsedPacks) {
      const key = `${plugin.manifest.id}:${pack.id}`
      this.packs.set(key, { pluginId: plugin.manifest.id, pluginName: plugin.manifest.name, ...clone(pack) })
      for (const preset of pack.presets) {
        if (preset.default && !Object.hasOwn(selections, preset.target)) {
          selections[preset.target] = selectionValue(plugin.manifest.id, pack.id, preset.id)
        }
      }
    }
    return selections
  }

  unregisterPlugin(pluginId) {
    for (const [key, pack] of this.packs) if (pack.pluginId === pluginId) this.packs.delete(key)
    const active = this.running.get(pluginId)
    if (active) {
      for (const animation of active) {
        try { animation.cancel() } catch {}
      }
      this.running.delete(pluginId)
    }
  }

  removeSelectionsForPlugin(pluginId, selections = {}) {
    for (const [target, value] of Object.entries(selections)) {
      if (parseSelection(value).pluginId === pluginId) delete selections[target]
    }
  }

  registerSurface(target, element) {
    if (element) this.surfaces.set(target, element)
  }

  unregisterSurface(target, element) {
    if (!element || this.surfaces.get(target) === element) this.surfaces.delete(target)
    if (element) {
      for (const animation of this.elementAnimations.get(element)?.values() || []) {
        try { animation.cancel() } catch {}
      }
      this.elementAnimations.delete(element)
    }
  }

  optionsFor(target, { pluginId = '', packId = '', includeDefault = true, language = 'zh' } = {}) {
    const options = includeDefault
      ? [{ value: '', label: language === 'en' ? 'Application default' : '程序默认动画' }]
      : []
    for (const pack of this.packs.values()) {
      if (pluginId && pack.pluginId !== pluginId) continue
      if (packId && pack.id !== packId) continue
      for (const preset of pack.presets) {
        if (preset.target !== target) continue
        options.push({
          value: selectionValue(pack.pluginId, pack.id, preset.id),
          label: preset.label,
          description: preset.description,
          pluginId: pack.pluginId,
          packId: pack.id,
          presetId: preset.id,
          tags: preset.tags || []
        })
      }
    }
    return options
  }

  resolve(target, selections = {}, explicitValue = undefined) {
    const value = explicitValue === undefined ? selections[target] : explicitValue
    if (!value) return null
    const { pluginId, packId, presetId } = parseSelection(value)
    const pack = this.packs.get(`${pluginId}:${packId}`)
    const preset = pack?.presets.find(item => item.id === presetId && item.target === target)
    return pack && preset ? { value, pack, preset } : null
  }

  has(target, selections = {}) {
    return !!this.resolve(target, selections)
  }

  start(target, element, selections = {}, { variant = 'main', selection = undefined } = {}) {
    if (!animationEnabled() || typeof Element === 'undefined') return null
    const resolved = this.resolve(target, selections, selection)
    const targetElement = element || this.surfaces.get(target)
    if (!resolved || !(targetElement instanceof Element)) return null
    const rawDefinition = resolved.preset.variants?.[variant] || resolved.preset.animation
    const definition = scaledDefinition(rawDefinition, this.durationScale(resolved.pack.pluginId))
    if (!definition) return null
    let active
    try {
      const current = this.elementAnimations.get(targetElement)?.get(target)
      current?.cancel()
      active = createAnimationRunner(targetElement, definition)
    } catch (error) {
      console.warn('[plugins] animation failed to start', error)
      return null
    }
    const pluginId = resolved.pack.pluginId
    if (!this.running.has(pluginId)) this.running.set(pluginId, new Set())
    this.running.get(pluginId).add(active)
    if (!this.elementAnimations.has(targetElement)) this.elementAnimations.set(targetElement, new Map())
    this.elementAnimations.get(targetElement).set(target, active)
    const timeoutMs = animationTimeoutMs(definition)
    let timeoutId
    let settled = false
    const finished = new Promise(resolve => {
      const settle = () => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        resolve()
      }
      Promise.resolve(active.finished).catch(() => undefined).then(settle)
      timeoutId = setTimeout(() => {
        if (settled) return
        try { active.cancel() } catch {}
        settle()
      }, timeoutMs)
    }).finally(() => {
      this.running.get(pluginId)?.delete(active)
      if (this.elementAnimations.get(targetElement)?.get(target) === active) this.elementAnimations.get(targetElement).delete(target)
    })
    return {
      pluginId,
      packId: resolved.pack.id,
      presetId: resolved.preset.id,
      animation: active.animation,
      totalDurationMs: active.totalDurationMs,
      finished,
      cancel() { try { active.cancel() } catch {} }
    }
  }
}

export { parseSelection as parseAnimationSelection, selectionValue as createAnimationSelection }
