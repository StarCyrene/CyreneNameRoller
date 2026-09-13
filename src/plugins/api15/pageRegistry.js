const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const LOCATIONS = new Set(['main', 'settings'])

function flatten(page, parent = null) {
  return [{ ...page, parentId: parent }, ...(page.children || []).flatMap(child => flatten(child, page.id))]
}

export class PageRegistry {
  constructor() {
    this.native = []
    this.plugins = []
  }

  registerNative(page) {
    if (!page?.id || !LOCATIONS.has(page.location)) throw new Error('invalid native page')
    this.native.push({ ...page, native: true })
  }

  registerPlugin(plugin, loadOrder = this.plugins.length) {
    const pages = plugin?.manifest?.pages
    if (!Array.isArray(pages)) throw new Error('pages must be declared in the manifest')
    const ids = new Set()
    const entries = []
    for (const page of pages) {
      for (const item of flatten(page)) {
        if (!ID.test(item.id) || ids.has(item.id)) throw new Error(`duplicate page id: ${item.id}`)
        if (!LOCATIONS.has(item.location || page.location)) throw new Error(`manifest page location is invalid: ${item.id}`)
        const native = item.native || null
        if (!native && (typeof item.entry !== 'string' || !item.entry || item.entry.includes('://') || item.entry.startsWith('/') || item.entry.includes('..'))) {
          throw new Error(`manifest page entry is invalid: ${item.id}`)
        }
        ids.add(item.id)
        entries.push({ ...item, location: item.location || page.location, pluginId: plugin.manifest.id, native: !!native, loadOrder })
      }
    }
    this.plugins.push({ pluginId: plugin.manifest.id, loadOrder, entries })
    this.plugins.sort((a, b) => a.loadOrder - b.loadOrder)
  }

  navigation() { return [...this.native, ...this.plugins.flatMap(item => item.entries)] }

  routeFor(pluginId, pageId) {
    const page = this.navigation().find(item => item.pluginId === pluginId && item.id === pageId)
    if (!page) return null
    const prefix = page.location === 'settings' ? '/settings' : ''
    return { ...page, path: `${prefix}/plugin/${encodeURIComponent(pluginId)}/${encodeURIComponent(pageId)}` }
  }

  unregister(pluginId) { this.plugins = this.plugins.filter(item => item.pluginId !== pluginId) }
}
