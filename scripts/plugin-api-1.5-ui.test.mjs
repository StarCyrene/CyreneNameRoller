import assert from 'node:assert/strict'
import test from 'node:test'

import { PageRegistry } from '../src/plugins/api15/pageRegistry.js'
import { WindowBridge } from '../src/plugins/api15/windowBridge.js'
import { PageStateBridge } from '../src/plugins/api15/pageState.js'
import { DomBridge, createPluginPageSource } from '../src/plugins/api15/domBridge.js'

const plugin = (id, pages) => ({ manifest: { id, name: id, pages } })

test('registers manifest-only pages in native, load, and declaration order', () => {
  const registry = new PageRegistry()
  registry.registerNative({ id: 'native', title: 'Native', location: 'main' })
  registry.registerPlugin(plugin('z.plugin', [{ id: 'z', title: 'Z', location: 'main', entry: 'z.html' }]), 2)
  registry.registerPlugin(plugin('a.plugin', [{
    id: 'settings', title: 'Settings', location: 'settings', entry: 'settings.html',
    children: [{ id: 'child', title: 'Child', entry: 'child.html' }]
  }, { id: 'main', title: 'Main', location: 'main', entry: 'main.html' }]), 1)

  assert.deepEqual(registry.navigation().map(page => page.id), ['native', 'settings', 'child', 'main', 'z'])
  assert.equal(registry.routeFor('a.plugin', 'child').path, '/settings/plugin/a.plugin/child')
  assert.throws(() => registry.registerPlugin(plugin('bad', [{ id: 'x', title: 'x', location: 'main', entry: 'x.html' }, { id: 'x', title: 'x', location: 'main', entry: 'x.html' }])), /duplicate/i)
  assert.throws(() => registry.registerPlugin(plugin('raw', [{ id: 'x', title: 'x', location: 'main', entry: 'https://evil/x.html' }])), /manifest|entry|URL/i)
})

test('keeps host window/page/style handles opaque and plugin-owned', async () => {
  const bridge = new WindowBridge({ pluginId: 'p', maxWindows: 1 })
  const windowId = bridge.create({ title: 'Plugin' })
  assert.match(windowId, /^host-window-/)
  assert.equal(bridge.close(windowId, 'p'), true)
  assert.equal(bridge.close(windowId, 'other'), false)
  assert.throws(() => bridge.create({ title: 'one' }) && bridge.create({ title: 'two' }), /limit/i)

  const styles = bridge.styles()
  const styleId = styles.add('style:main', '.safe { color: red; }')
  assert.match(styleId, /^host-style-/)
  assert.equal(styles.remove(styleId, 'other'), false)
  assert.equal(styles.remove(styleId, 'p'), true)
  const controller = new AbortController()
  const cancelled = styles.inject('style:settings', '.x{}', { signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled, error => error.name === 'AbortError')
  styles.cleanup()
})

test('allows ordinary page state but requires permission and confirmation for sensitive writes', async () => {
  const values = { language: 'en', theme: 'peach', clearHistory: false }
  const bridge = new PageStateBridge({ pluginId: 'p', state: values })
  assert.equal(bridge.read('language'), 'en')
  await bridge.write('language', 'zh')
  assert.equal(values.language, 'zh')
  await assert.rejects(() => bridge.write('clearHistory', true), error => error.code === 'PLUGIN_PERMISSION_DENIED')
  const sensitive = new PageStateBridge({ pluginId: 'p', state: values, permissions: ['page:write-sensitive'], confirm: async id => id === 'clear-history' })
  await sensitive.write('clearHistory', true, { confirmationId: 'clear-history' })
  assert.equal(values.clearHistory, true)
  await assert.rejects(() => sensitive.write('clearHistory', false, { confirmationId: 'wrong' }), /confirmation/i)
})

test('uses controlled structured DOM operations and rejects executable or raw content', () => {
  class Node {}
  class Element extends Node {
    constructor(tagName) { super(); this.tagName = tagName.toUpperCase(); this.children = []; this.className = ''; this.textContent = '' }
    appendChild(node) { this.children.push(node); return node }
    removeChild(node) { this.children.splice(this.children.indexOf(node), 1); return node }
  }
  const document = { createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Node(), { textContent: text }) }
  const root = Object.assign(new Element('main'), { id: 'host-main', className: 'surface', textContent: 'Hello' })
  const dom = new DomBridge({ pluginId: 'p', permission: 'dom:main', root, document, maxNodes: 4 })
  assert.equal(dom.query({ selector: '.surface' }).length, 1)
  assert.equal(dom.read({ selector: '.surface', fields: ['textContent'] })[0].textContent, 'Hello')
  dom.write({ selector: '.surface', fields: { textContent: 'Changed' } })
  dom.insert({ selector: '.surface', node: { type: 'element', tag: 'span', text: 'Child' } })
  assert.equal(root.textContent, 'Changed')
  assert.equal(root.children[0].tagName, 'SPAN')
  assert.ok(root.children[0] instanceof Node)
  dom.remove({ selector: '.surface' })
  assert.equal(root.children.length, 0)
  assert.throws(() => dom.insert({ selector: '.surface', node: { type: 'html', value: '<script>x</script>' } }), /structured|HTML/i)
  assert.throws(() => dom.write({ selector: '.surface', fields: { onclick: 'alert(1)' } }), /field|handler/i)
  assert.throws(() => dom.execute(), /unsupported|execute/i)
})

test('DOM insertion uses document-created Node instances for non-array collections', () => {
  class Node {}
  class Element extends Node {
    constructor(tagName) { super(); this.tagName = tagName.toUpperCase(); this.children = { length: 0 }; this.className = '' }
    appendChild(node) { this.children[this.children.length++] = node; return node }
    removeChild(node) { delete this.children[Array.from(this.children).indexOf(node)]; return node }
  }
  const created = []
  const document = {
    createElement: tag => { const node = new Element(tag); created.push(node); return node },
    createTextNode: text => { const node = Object.assign(new Node(), { textContent: text }); created.push(node); return node }
  }
  const root = new Element('main')
  const dom = new DomBridge({ pluginId: 'p', permission: 'dom:main', root, document })
  dom.insert({ node: { type: 'element', tag: 'span', text: 'Child' } })
  assert.ok(root.children[0] instanceof Node)
  assert.ok(root.children[0].children[0] instanceof Node)
  assert.equal(created.length, 2)
})

test('creates restrictive plugin WebView source without Tauri globals or raw URLs', () => {
  const source = createPluginPageSource('<html><body><script>window.__x=1</script></body></html>')
  assert.match(source, /Content-Security-Policy/)
  assert.match(source, /default-src 'none'/)
  assert.match(source, /allow-scripts|sandbox/)
  assert.doesNotMatch(source, /__TAURI__|__TAURI_INTERNALS__|tauri:|https?:\/\//i)
  assert.doesNotMatch(source, /<[^>]+\bon\w+\s*=/i)
  assert.throws(() => createPluginPageSource('<script src="https://evil/x.js"></script>'), /URL|script/i)
})

test('attaches style handles to host DOM and removes them on cleanup or cancellation', async () => {
  const appended = []
  const hostDocument = {
    createElement: () => ({ dataset: {}, textContent: '', remove() { this.removed = true } }),
    querySelector: selector => selector.includes('settings') ? hostDocument.settings : hostDocument.main,
    main: { appendChild(node) { appended.push(['main', node]) } },
    settings: { appendChild(node) { appended.push(['settings', node]) } },
    head: { appendChild(node) { appended.push(node) } }
  }
  const bridge = new WindowBridge({ pluginId: 'p', document: hostDocument })
  const handle = bridge.styles().add('style:main', '.host { color: red; }')
  assert.equal(appended.length, 1)
  assert.equal(appended[0][0], 'main')
  assert.equal(appended[0][1].textContent, '.host { color: red; }')
  assert.equal(bridge.styles().remove(handle, 'p'), true)
  assert.equal(appended[0][1].removed, true)
  const controller = new AbortController()
  const pending = bridge.styles().inject('style:settings', '.cancelled{}', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
  bridge.cleanup()
})
