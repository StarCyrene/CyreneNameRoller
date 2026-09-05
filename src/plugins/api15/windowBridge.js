function id(prefix) { return `host-${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}` }

export class StyleBridge {
  constructor(owner, { maxBytes = 128 * 1024, maxStyles = 8, document = globalThis.document } = {}) {
    this.owner = owner
    this.maxBytes = maxBytes
    this.maxStyles = maxStyles
    this.items = new Map()
    this.document = document
  }

  setDocument(document) { this.document = document }

  add(surface, css) {
    if (!['style:main', 'style:settings'].includes(surface) || typeof css !== 'string' || css.length > this.maxBytes || this.items.size >= this.maxStyles) throw new Error('style limit exceeded')
    const handle = id('style')
    const element = this.document?.createElement?.('style')
    if (element) {
      element.dataset.pluginStyle = handle
      element.dataset.pluginSurface = surface
      element.textContent = css
      const target = this.document.querySelector?.(`[data-plugin-style-surface="${surface.slice(6)}"]`) || this.document.head
      target?.appendChild(element)
    }
    this.items.set(handle, { surface, css, owner: this.owner, element })
    return handle
  }

  async inject(surface, css, { signal } = {}) {
    if (signal?.aborted) throw Object.assign(new Error('style injection cancelled'), { name: 'AbortError' })
    await Promise.resolve()
    if (signal?.aborted) throw Object.assign(new Error('style injection cancelled'), { name: 'AbortError' })
    return this.add(surface, css)
  }

  remove(handle, owner) {
    if (owner !== this.owner) return false
    const item = this.items.get(handle)
    if (!item) return false
    item.element?.remove?.()
    this.items.delete(handle)
    return true
  }
  cleanup() { for (const handle of this.items.keys()) this.remove(handle, this.owner) }
}

export class WindowBridge {
  constructor({ pluginId, maxWindows = 4, document } = {}) {
    this.pluginId = pluginId
    this.maxWindows = maxWindows
    this.windows = new Map()
    this.styleBridge = new StyleBridge(pluginId, { document })
  }

  create(options = {}) {
    if (this.windows.size >= this.maxWindows) throw new Error('window limit exceeded')
    const handle = id('window')
    this.windows.set(handle, { ...options, owner: this.pluginId })
    return handle
  }

  close(handle, owner) { return owner === this.pluginId && !!this.windows.delete(handle) }
  owns(handle, owner = this.pluginId) { return owner === this.pluginId && this.windows.has(handle) }
  styles() { return this.styleBridge }
  cleanup() { this.windows.clear(); this.styleBridge.cleanup() }
}
