const CACHE_NAME = 'cyrene-v26.3.1-shell-2'
const ASSETS = [
  '/',
  '/index.html',
  '/updatelogs/up.json',
  '/cyrene.png',
  '/icon.png',
  '/favicon.ico'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.pathname.endsWith('/safemode.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => Response.error()))
    return
  }
  const isNavigation = event.request.mode === 'navigate'
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && (!isNavigation || response.type === 'basic')) {
      const clone = response.clone()
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)))
    }
    return response
  }).catch(async () => {
    const cached = await caches.match(event.request)
    if (cached) return cached
    if (isNavigation) return caches.match('/index.html')
    return Response.error()
  }))
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
