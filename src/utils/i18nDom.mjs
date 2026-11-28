import { exactUiTranslation } from './i18nGlossary.mjs'

export const UI_ATTRIBUTES = ['title', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'alt']
const PRIVATE = [
  '[translate="no"]', '.notranslate', '[data-i18n-private]', '[contenteditable]:not([contenteditable="false"])',
  '.locale-select', '[data-i18n-data-select] .select-value', '.verified-result', '.name-display', '.name-text',
  '.card-front', '.history-chip', '.wheel-label', '.wheel-winner', '.seat-name', '.relay-trail',
  '.flybys', '.arrivals', '.recipient', '.team-member', '.person-cn', '.person-en', '.person-id',
  '.person-list-name', '.prize-list-name', '.export-list-name', '.group-name', '.group-en', '.stat-name',
  '.allocation-row', '.prize-table-name', '.prize-row-name', '.prize-modal-name',
  '.contributor-name', '.contributor-alias', '.ball-text', '.paste-preview', '[data-plugin-visual-surface]',
  'script', 'style', 'noscript', 'code', 'pre', 'canvas', 'svg', 'iframe'
].join(',')

// App-authored UI is written in simplified Chinese or English. Choose the
// source from the fragment rather than the target or browser language. In
// particular, shared Han characters do not imply an already translated label.
export function uiFragmentSource(text) {
  if (/\p{Script=Han}/u.test(text)) return 'chinese_simplified'
  if (/\p{Script=Latin}/u.test(text) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}]/u.test(text)) return 'english'
  return null
}

function elementFor(node) {
  return node?.nodeType === 2 ? node.ownerElement : node?.nodeType === 1 ? node : node?.parentElement
}

// The same guard is applied in the library crawler and at its queue boundary.
// Never register editable value attributes; only presentation strings.
export function isPrivateUiNode(node, attribute = '') {
  const element = elementFor(node)
  if (!element || element.closest(PRIVATE)) return true
  const name = attribute || (node.nodeType === 2 ? node.name : '')
  const privateAttributes = element.getAttribute('data-i18n-private-attrs')?.split(/[\s,]+/)
  if (name && privateAttributes?.includes(name)) return true
  if (element.matches('input, textarea, select') && (!name || name === 'value')) return true
  return !!name && !UI_ATTRIBUTES.includes(name)
}

export function installDomTranslation(translate) {
  if (translate.__cyreneDomCoverage) return
  const vendorIgnore = translate.ignore.isIgnore
  translate.ignore.isIgnore = function (node, context) {
    return isPrivateUiNode(context?.node || node, context?.attribute) || vendorIgnore.call(this, node, context)
  }
  const add = translate.addNodeToQueue
  translate.addNodeToQueue = function (id, node, text, attribute) {
    if (isPrivateUiNode(node, attribute)) return
    const dataNode = attribute ? elementFor(node)?.getAttributeNode(attribute) : node
    const tracked = dataNode && translate.node.get(dataNode)
    if (tracked && text !== tracked.resultText && text !== tracked.originalText) translate.node.delete(dataNode)
    const exact = exactUiTranslation(translate.to, text)
    if (dataNode && exact && !translate.node.get(dataNode)) {
      translate.node.set(dataNode, { originalText: text, resultText: exact, attribute: '', whole: true, translateTexts: {}, lastTranslateRenderTime: Date.now() })
      dataNode.nodeValue = exact
      return
    }
    return add.call(this, id, node, text, attribute)
  }
  const analyze = translate.addNodeToQueueAnalysis
  translate.addNodeToQueueAnalysis = function (id, node, text, attribute) {
    if (isPrivateUiNode(node, attribute)) return []
    const source = uiFragmentSource(text)
    if (!source) return analyze.call(this, id, node, text, attribute)
    if (source === translate.to) return []
    // This translates one already-checked text/attribute at a time. Vendor
    // whole-context mode joins adjacent nodes and is deliberately left off.
    const item = translate.addNodeQueueItem(id, node, text, attribute, source, '', '')
    return item == null ? [] : [item]
  }
  // The bundled crawler handles title by default but needs per-tag attribute
  // registration for ARIA and parent elements with children.
  if (translate.element.iframe) translate.element.iframe.isUse = false
  translate.__cyreneDomCoverage = true
}

const presentationAttributes = { attribute: UI_ATTRIBUTES.filter(name => name !== 'title'), condition: () => true }

export function registerUiAttributes(translate, root) {
  const selector = UI_ATTRIBUTES.map(attr => '[' + attr + ']').join(',')
  const elements = root?.matches?.(selector) ? [root] : []
  if (root?.querySelectorAll) elements.push(...root.querySelectorAll(selector))
  for (const element of elements) {
    const tag = element.localName
    if (tag) translate.element.tagAttribute[tag] = presentationAttributes
  }
}

export function resetDomTranslation(translate) {
  // Vue may have replaced a source value while a language request was pending.
  // Never restore old source text over markup owned by the new render.
  for (const [node, state] of translate.node.data) {
    if (isPrivateUiNode(node, state.attribute) || (node.nodeValue !== state.originalText && node.nodeValue !== state.resultText)) {
      translate.node.delete(node)
    }
  }
  translate.reset({ selectLanguageRefreshRender: false, notTranslateTip: false })
}
