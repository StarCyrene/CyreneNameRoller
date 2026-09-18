const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const navigationDock = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'NavigationDock.vue'), 'utf8')
const router = fs.readFileSync(path.join(root, 'src', 'router', 'index.js'), 'utf8')

function routeOrder(routePath) {
  const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = router.match(new RegExp(`path: '${escapedPath}'[^\\n]*meta: \\{ order: (\\d+) \\}`))
  assert.ok(match, `${routePath} order is missing`)
  return Number(match[1])
}

test('primary navigation follows the approved secondary-menu order', () => {
  const match = navigationDock.match(/const mainItems = \[([\s\S]*?)\n\]/)
  assert.ok(match, 'mainItems block is missing')
  assert.deepEqual(
    [...match[1].matchAll(/id: '([^']+)'/g)].map(item => item[1]),
    ['roller', 'card', 'lottery', 'statistics', 'records', 'lists']
  )
})

test('overlay menus own the approved child routes', () => {
  assert.match(navigationDock, /lottery:\s*\{[\s\S]*?to: '\/lottery\/draw'[\s\S]*?to: '\/lottery\/assign'/)
  assert.match(navigationDock, /records:\s*\{[\s\S]*?to: '\/records'[\s\S]*?to: '\/lottery\/records'/)
  assert.match(navigationDock, /lists:\s*\{[\s\S]*?to: '\/lists'[\s\S]*?to: '\/group-manage'[\s\S]*?to: '\/lottery\/prizes'/)
  assert.match(navigationDock, /settings:\s*\{[\s\S]*?items:\s*settingsMenuItems\.value/)
})

test('installed plugins can still contribute independent dock pages', () => {
  assert.match(navigationDock, /usePluginsStore\(\)/)
  assert.match(navigationDock, /page\.location === 'dock'/)
  assert.match(navigationDock, /\(left\.order \?\? 500\) - \(right\.order \?\? 500\)/)
  assert.match(navigationDock, /v-for="pluginItem in pluginDockItems"/)
  assert.match(navigationDock, /:to="pluginItem\.path"/)
  assert.match(navigationDock, /class="dock-item plugin-dock-item"/)
  assert.match(navigationDock, /route\.path === pluginItem\.path/)
})

test('plugin management remains one real route and is separate from plugin dock pages', () => {
  assert.equal((navigationDock.match(/to="\/plugins"/g) || []).length, 1)
  assert.match(navigationDock, /:class="\{ active: pluginManagerActive \}"/)
  assert.match(navigationDock, /pageById\(route\.params\.pluginId, route\.params\.pageId\)\?\.location !== 'dock'/)
})

test('route animation order follows the visible navigation', () => {
  assert.equal(routeOrder('/lottery/records'), 510)
  assert.equal(routeOrder('/lottery/prizes'), 620)
  assert.equal(routeOrder('/lottery/prizes/manage'), 621)
  assert.match(navigationDock, /\.dock-items\s*\{[\s\S]*?overflow-y:\s*auto/)
})
