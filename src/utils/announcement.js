const ANNOUNCEMENT_URL = 'https://v4.gh-proxy.com/raw.githubusercontent.com/StarCyrene/CyreneNameRoller/refs/heads/master-cyrene2008/.announcement/latest.json'
const ANNOUNCEMENT_NAMEAPI = 'https://nameapi.cyrene.hi.cn/announcement/latest.json'
const ANNOUNCEMENT_FALLBACK = 'https://raw.githubusercontent.com/StarCyrene/CyreneNameRoller/master-cyrene2008/.announcement/latest.json'
const ANNOUNCEMENT_LOCAL = '/announcements.json'

import { isTauri, tauriAPI } from './tauriAPI'

async function fetchAnnouncementsNative() {
  try {
    if (isTauri()) {
      const r = await tauriAPI.fetchAnnouncements()
      if (r) return r
    }
  } catch (e) {
    console.warn('[announcement] native fetch failed, fallback to webview:', e)
  }
  return null
}

export async function fetchAnnouncements({ noCache = false } = {}) {
  const native = await fetchAnnouncementsNative()
  if (native != null) {
    return Array.isArray(native) ? native : []
  }

  const urls = [ANNOUNCEMENT_URL, ANNOUNCEMENT_NAMEAPI, ANNOUNCEMENT_FALLBACK, ANNOUNCEMENT_LOCAL]
  const opts = {}
  if (noCache) {
    opts.cache = 'no-store'
  }
  const stamp = noCache ? `?t=${Date.now()}` : ''
  for (const url of urls) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const resp = await fetch(url + stamp, { ...opts, signal: ctrl.signal })
      clearTimeout(timer)
      if (resp.ok) {
        const data = await resp.json()
        return Array.isArray(data) ? data : []
      }
    } catch {}
  }
  return []
}

export function sortAnnouncements(list) {
  return [...list].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    if (a.important && !b.important) return -1
    if (!a.important && b.important) return 1
    return 0
  })
}
