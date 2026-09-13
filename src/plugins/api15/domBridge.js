const SAFE_FIELDS = new Set(['textContent', 'value', 'checked', 'disabled', 'className', 'hidden'])
const TAG = /^[A-Za-z][A-Za-z0-9-]{0,31}$/

function nodes(root) {
  return [root, ...Array.from(root?.children || []).flatMap(child => nodes(child))]
}

function matches(node, selector) {
  if (selector === '*' || selector === node?.tagName?.toLowerCase()) return true
  if (selector?.startsWith('#')) return node?.id === selector.slice(1)
  if (selector?.startsWith('.')) return String(node?.className || '').split(/\s+/).includes(selector.slice(1))
  return false
}

function structuredNode(raw, document) {
  if (!raw || raw.type !== 'element' || !TAG.test(raw.tag) || raw.html !== undefined || raw.url !== undefined || raw.onClick !== undefined || typeof raw.text !== 'string' && raw.text !== undefined) throw new Error('structured node required')
  const element = document?.createElement?.(raw.tag)
  if (!element) throw new Error('DOM host insertion unavailable')
  if (raw.className !== undefined) element.className = String(raw.className)
  if (raw.text !== undefined) element.appendChild(document.createTextNode(String(raw.text)))
  return element
}

export class DomBridge {
  constructor({ pluginId = '', permission, root, document = globalThis.document, maxNodes = 128, maxBytes = 256 * 1024 } = {}) {
    this.pluginId = pluginId; this.permission = permission; this.root = root; this.document = document; this.maxNodes = maxNodes; this.maxBytes = maxBytes; this.handles = new Map()
    if (!['dom:main', 'dom:settings'].includes(permission)) throw new Error('DOM permission denied')
  }
  find(selector) { const result = nodes(this.root).filter(node => matches(node, selector)); if (result.length > this.maxNodes) throw new Error('DOM node limit exceeded'); return result }
  target({ selector, nodeId } = {}) {
    if (nodeId !== undefined) {
      const node = this.handles.get(nodeId)
      if (!node) throw new Error('DOM node handle is not owned')
      return [node]
    }
    return this.find(selector || '*')
  }
  query({ selector = '*' } = {}) { return this.find(selector).map(node => { const nodeId = idFor(this.pluginId); this.handles.set(nodeId, node); return { nodeId, tagName: node.tagName, id: node.id || '', className: node.className || '', childCount: Array.from(node.children || []).length } }) }
  read({ selector, nodeId, fields = ['textContent'] } = {}) { return this.target({ selector, nodeId }).map(node => Object.fromEntries(fields.filter(field => SAFE_FIELDS.has(field)).map(field => [field, node[field]]))) }
  write({ selector, nodeId, fields = {} } = {}) { for (const node of this.target({ selector, nodeId })) for (const [field, value] of Object.entries(fields)) { if (!SAFE_FIELDS.has(field) || typeof value === 'function' || /^on/i.test(field)) throw new Error('DOM field or handler denied'); node[field] = value } return true }
  insert({ selector, nodeId, node } = {}) { const parent = this.target({ selector, nodeId })[0]; if (!parent) throw new Error('DOM target not found'); if (JSON.stringify(node).length > this.maxBytes) throw new Error('DOM payload limit exceeded'); const child = structuredNode(node, this.document); if (typeof parent.appendChild !== 'function') throw new Error('DOM host insertion unavailable'); parent.appendChild(child); return true }
  remove({ selector, nodeId } = {}) { const parent = this.target({ selector, nodeId })[0]; if (!parent) throw new Error('DOM target not found'); const children = Array.from(parent.children || []); for (const child of children) parent.removeChild?.(child); return true }
  execute() { throw new Error('dom.execute is unsupported') }
}

function idFor(pluginId) { return `host-node-${String(pluginId)}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}` }

export function createPluginPageSource(html) {
  const text = String(html || '')
  if (/<script\s+[^>]*\bsrc\s*=|\b(?:https?|tauri):\/\//i.test(text) || /\bon[a-z]+\s*=/i.test(text)) throw new Error('script URLs and inline handlers are denied')
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts">${text.replace(/__TAURI(?:_INTERNALS__)?/gi, '')}`
}
