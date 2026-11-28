import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const VIRTUAL_ID = 'virtual:cyrene-i18n-catalog'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const MAX_STRINGS = 5000
const UI_ATTRIBUTES = new Set(['title', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'alt', 'label'])
const CJK_PATTERN = /[\u3400-\u9fff]/

function collectFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      collectFiles(path, files)
    } else if (/\.(vue|m?js)$/.test(entry.name) && !['i18nGlossary.mjs', 'settingsLocale.mjs'].includes(entry.name)) {
      files.push(path)
    }
  }
  return files
}

function walk(node, visit, ancestors = []) {
  if (node == null || typeof node !== 'object') return
  if (typeof node.type !== 'string' && typeof node.type !== 'number') return
  visit(node, ancestors)
  const nextAncestors = ancestors.concat(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'parent') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && (typeof child.type === 'string' || typeof child.type === 'number')) {
          walk(child, visit, nextAncestors)
        }
      }
    } else if (value && typeof value === 'object' && (typeof value.type === 'string' || typeof value.type === 'number')) {
      walk(value, visit, nextAncestors)
    }
  }
}

function normalize(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function isCandidate(value) {
  const text = normalize(value)
  if (text.length < 2 || text.length > 240) return false
  if (/[\u0000-\u001f]/.test(text)) return false
  if (/^(https?:|mailto:|tel:|data:|blob:)/i.test(text)) return false
  if (/^[\d\s.,:%+\-/]+$/.test(text)) return false
  if (!/[a-zA-Z\u3400-\u9fff]/.test(text)) return false
  if (/(^|\s)(var\(--|rgb\(|rgba\(|hsl\(|calc\(|url\()/.test(text)) return false
  if (/^\d+(\.\d+)?(px|rem|em|%|ms|s|vh|vw)$/.test(text)) return false
  if (/\{\s*\w+\s*\}/.test(text)) return false
  // Lowercase hyphen/underscore tokens are usually keys, classes or icon names.
  if (/^[a-z0-9_:\-./#]+$/.test(text)) return false
  if (/^[A-Z][A-Z0-9_]+$/.test(text)) return false
  // camelCase identifiers (refs, keys) are not interface copy.
  if (/^[a-z][a-zA-Z0-9]{7,}$/.test(text)) return false
  if (/^[A-Za-z][a-z0-9]*(?:[A-Z][a-z0-9]*){2,}$/.test(text)) return false
  // A list of lowercase words with no punctuation is usually a class list.
  if (/^[a-z0-9-]+(\s+[a-z0-9-]+)+$/.test(text) && !/[.!?]/.test(text)) return false
  return true
}

function isUiContext(node, ancestors) {
  const parent = ancestors[ancestors.length - 1]
  if (!parent) return false
  if (parent.type === 'ObjectProperty') {
    const key = parent.key?.name || parent.key?.value
    if (['zh', 'en', 'cn'].includes(key)) return true
  }
  if (parent.type === 'ConditionalExpression' && (parent.consequent === node || parent.alternate === node)) {
    let languageTest = false
    walk(parent.test, item => {
      if (item.type === 'Identifier' && /^(lang|language|en|english)$/i.test(item.name)) languageTest = true
    })
    if (languageTest) return true
  }
  if (parent.type === 'CallExpression') {
    const callee = parent.callee
    const name = callee?.type === 'Identifier' ? callee.name : callee?.property?.name
    if (name === 'tr' || name === 't') return true
  }
  return false
}

function addExpressionStrings(expression, add) {
  if (!expression || typeof expression !== 'string') return
  let ast
  try {
    ast = babelParseExpression(expression)
  } catch {
    return
  }
  walk(ast, (node, ancestors) => {
    // String constants in predicates are model keys, not rendered labels.
    if (ancestors.some((parent, i) => parent.type === 'ConditionalExpression' && parent.test === (ancestors[i + 1] || node))) return
    if (node.type === 'StringLiteral' && isCandidate(node.value)) add(node.value)
  })
}

function collectFromTemplate(templateAst, add) {
  walk(templateAst, (node, ancestors) => {
    const privateElement = element => element.type === 1 && element.props?.some(prop =>
      prop.type === 6 && (prop.name === 'data-i18n-private' || (prop.name === 'translate' && prop.value?.content === 'no'))
    )
    if (privateElement(node) || ancestors.some(privateElement)) return
    if (node.type === 2 && typeof node.content === 'string') {
      // Static attribute values also appear as TEXT nodes; they are handled by
      // the ATTRIBUTE branch below (and only for user-facing attributes).
      if (ancestors.some(item => item.type === 6 || item.type === 7)) return
      if (isCandidate(node.content)) add(node.content)
      return
    }
    if (node.type === 5 && node.content?.content) {
      addExpressionStrings(node.content.content, add)
      return
    }
    if (node.type === 6 && node.value && UI_ATTRIBUTES.has(node.name)) {
      if (isCandidate(node.value.content)) add(node.value.content)
      return
    }
    if (node.type === 7 && node.exp?.content) {
      const argument = node.arg?.content
      if (UI_ATTRIBUTES.has(argument)) addExpressionStrings(node.exp.content, add)
      return
    }
    if (node.type === 8 && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === 'string' && isCandidate(child)) add(child)
      }
    }
  })
}

function collectFromScript(source, add) {
  if (!source || !source.trim()) return
  let ast
  try {
    ast = babelParse(source, {
      sourceType: 'module',
      plugins: ['dynamicImport', 'importMeta', 'topLevelAwait', 'optionalChaining', 'nullishCoalescingOperator']
    })
  } catch {
    return
  }
  walk(ast, (node, ancestors) => {
    if (node.type === 'StringLiteral') {
      if (CJK_PATTERN.test(node.value) || isUiContext(node, ancestors)) {
        if (isCandidate(node.value)) add(node.value)
      }
      return
    }
    if (node.type === 'TemplateElement' && typeof node.value?.cooked === 'string') {
      const parent = ancestors[ancestors.length - 1]
      if (parent?.type === 'TemplateLiteral' && parent.expressions.length === 0 && isCandidate(node.value.cooked)) {
        add(node.value.cooked)
      }
      return
    }
    if (node.type === 'ObjectProperty') {
      const key = node.key?.name || node.key?.value
      if (['zh', 'en', 'cn'].includes(key) && node.value?.type === 'StringLiteral' && isCandidate(node.value.value)) {
        add(node.value.value)
      }
    }
  })
}

let parserPromise
async function loadParser() {
  if (!parserPromise) {
    parserPromise = Promise.all([
      import('@babel/parser'),
      import('@vue/compiler-sfc'),
      import('@vue/compiler-dom')
    ]).then(([babel, sfc, dom]) => ({
      parse: babel.parse,
      parseExpression: babel.parseExpression,
      parseSfc: sfc.parse,
      parseTemplate: dom.parse
    }))
  }
  return parserPromise
}

let babelParse
let babelParseExpression

export async function collectI18nCatalog(projectRoot) {
  const parser = await loadParser()
  babelParse = parser.parse
  babelParseExpression = parser.parseExpression

  const seen = new Set()
  const strings = []
  const add = value => {
    const text = normalize(value)
    if (!isCandidate(text) || seen.has(text)) return
    seen.add(text)
    strings.push(text)
  }

  const files = collectFiles(resolve(projectRoot, 'src'))
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (file.endsWith('.vue')) {
      let descriptor
      try {
        descriptor = parser.parseSfc(source, { filename: file }).descriptor
      } catch {
        continue
      }
      if (descriptor.template?.content) {
        let templateAst
        try {
          templateAst = parser.parseTemplate(descriptor.template.content, { source: file })
        } catch {
          templateAst = null
        }
        if (templateAst) collectFromTemplate(templateAst, add)
      }
      collectFromScript(descriptor.script?.content, add)
      collectFromScript(descriptor.scriptSetup?.content, add)
    } else {
      // i18n.js is a dictionary: every string literal is interface copy.
      if (file.endsWith('utils\\i18n.js') || file.endsWith('utils/i18n.js')) {
        let ast
        try {
          ast = babelParse(source, { sourceType: 'module' })
          walk(ast, node => {
            if (node.type === 'StringLiteral' && isCandidate(node.value)) add(node.value)
          })
        } catch {}
      } else {
        collectFromScript(source, add)
      }
    }
  }

  return strings.slice(0, MAX_STRINGS)
}

export function i18nCatalogPlugin(projectRoot) {
  const root = resolve(projectRoot)
  return {
    name: 'cyrene-i18n-catalog',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    async load(id) {
      if (id !== RESOLVED_ID) return
      const catalog = await collectI18nCatalog(root)
      return `export default ${JSON.stringify(catalog)}`
    }
  }
}
