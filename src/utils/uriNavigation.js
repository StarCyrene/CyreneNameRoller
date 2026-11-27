import { rollerTools } from '../router/rollerTools.js'

const PAGE_ALIASES = Object.freeze({
  ...Object.fromEntries(rollerTools.map(tool => [tool.fullPath.slice(1), tool.fullPath])),
  card: '/roller/card',
  cards: '/roller/card',
  lottery: '/lottery/draw',
  'lottery-draw': '/lottery/draw',
  'lottery-assign': '/lottery/assign',
  'lottery-records': '/lottery/records',
  prizes: '/lottery/prizes',
  'lottery-prizes': '/lottery/prizes',
  'prizes-manage': '/lottery/prizes/manage',
  statistics: '/statistics',
  records: '/records',
  lists: '/lists',
  'lists-manage': '/lists/manage',
  groups: '/group-manage',
  'group-manage': '/group-manage',
  announcement: '/announcement',
  download: '/download',
  plugins: '/plugins',
  settings: '/settings',
  about: '/about',
  contributors: '/about/contributors'
})

let pendingUriNavigation = null

function parseBoolean(value) {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

function normalizeSex(value) {
  return ['all', 'male', 'female'].includes(value) ? value : undefined
}

function parseRollerQuery(searchParams) {
  const roller = {}
  const englishMode = parseBoolean(searchParams.get('isEN'))
  const groupMode = parseBoolean(searchParams.get('isGroupMode'))
  const multiMode = parseBoolean(searchParams.get('multiMode'))
  const noDuplication = parseBoolean(searchParams.get('noDuplication'))
  const sex = normalizeSex(searchParams.get('sex'))
  const rawCount = Number.parseInt(searchParams.get('count'), 10)

  if (englishMode !== undefined) roller.englishMode = englishMode
  if (groupMode !== undefined) roller.groupMode = groupMode
  if (multiMode !== undefined) roller.multiMode = multiMode
  if (noDuplication !== undefined) roller.noDuplication = noDuplication
  if (sex !== undefined) roller.sex = sex
  if (Number.isFinite(rawCount)) roller.count = Math.min(9999, Math.max(1, rawCount))
  return roller
}

function createNavigation(path, searchParams, source) {
  const route = PAGE_ALIASES[path]
  if (!route) return null
  const roller = route === '/roller' ? parseRollerQuery(searchParams) : null
  return {
    source,
    route,
    roller,
    autoStart: route === '/roller' && Object.keys(roller).length > 0
  }
}

export function parseCyreneUri(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol.toLowerCase() !== 'cyrenenr:') return null
  const host = url.hostname.toLowerCase()
  if (host === 'start' && (!url.pathname || url.pathname === '/')) {
    return { source: 'desktop-uri', route: null, roller: null, autoStart: false }
  }
  if (host !== 'page') return null
  try {
    const page = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase()
    return createNavigation(page, url.searchParams, 'desktop-uri')
  } catch {
    return null
  }
}

export function parseWebHash(hash = globalThis.location?.hash || '') {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash
  if (!normalized.startsWith('/')) return null
  const [path, query = ''] = normalized.split('#', 1)[0].split('?', 2)
  const page = path === '/card' ? 'card' : Object.entries(PAGE_ALIASES).find(([, route]) => route === path)?.[0]
  if (!page) return null
  return createNavigation(page, new URLSearchParams(query), 'web-hash')
}

export function dispatchUriNavigation(navigation) {
  if (!navigation) return false
  if (navigation.route === '/roller') pendingUriNavigation = navigation
  globalThis.dispatchEvent?.(new CustomEvent('cyrene-uri-navigation', { detail: navigation }))
  return true
}

export function consumePendingUriNavigation(route) {
  const navigation = pendingUriNavigation
  if (!navigation || navigation.route !== route) return null
  pendingUriNavigation = null
  return navigation
}

export { PAGE_ALIASES }
