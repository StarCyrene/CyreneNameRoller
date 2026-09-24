const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const component = fs.readFileSync(path.join(root, 'src', 'components', 'SecondarySidebarMenu.vue'), 'utf8')
const router = fs.readFileSync(path.join(root, 'src', 'router', 'index.js'), 'utf8')
const settingsLayout = fs.readFileSync(path.join(root, 'src', 'views', 'SettingsLayoutView.vue'), 'utf8')
const settingsView = fs.readFileSync(path.join(root, 'src', 'views', 'SettingsView.vue'), 'utf8')
const appLayout = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'AppLayout.vue'), 'utf8')
const navigationDock = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'NavigationDock.vue'), 'utf8')

test('secondary menu exposes route-aware overlay navigation with a GSAP slide', () => {
  assert.match(component, /navigateOnOpen:/)
  assert.match(component, /itemForRoute\(\) \|\| initialItem\(\)/)
  assert.match(component, /router\.push\(target\.to\)/)
  assert.match(component, /defineEmits\(\['back'\]\)/)
  assert.match(component, /gsap\.to\(panel, \{/)
  assert.match(component, /gsap\.set\(panel, \{ x: 0, xPercent: open \? 0 : 100 \}\)/)
  assert.match(component, /gsap\.set\(menuRef\.value, \{ x: 0, xPercent: props\.open \? 0 : 100 \}\)/)
  assert.match(component, /gsap\.to\(panel, \{\s*x: 0,\s*xPercent: open \? 0 : 100/)
  assert.match(component, /xPercent: open \? 0 : 100/)
  assert.match(component, /duration: 0\.26/)
  assert.match(component, /panelAnimationToken/)
  assert.match(component, /animationToken === panelAnimationToken && !props\.open/)
  assert.ok(
    component.indexOf('animatePanel(true)') < component.indexOf('await router.push(target.to)'),
    'the secondary panel must begin opening before route navigation can delay it'
  )
  assert.doesNotMatch(component, /transform:\s*translateX\(100%\)/)
  assert.doesNotMatch(component, /transition:\s*transform/)
})

test('settings routes expose four nested pages and legacy redirects', () => {
  assert.match(router, /path: '\/settings'[\s\S]*?children:/)
  assert.match(router, /path: ''\s*,\s*redirect: '\/settings\/general'/)
  for (const route of ['general', 'appearance', 'features', 'data']) {
    assert.match(router, new RegExp(`path: '${route}'`))
  }
  assert.match(router, /path: 'performance'\s*,\s*redirect: '\/settings\/appearance'/)
  assert.match(router, /path: 'balance'\s*,\s*redirect: '\/settings\/features'/)
  assert.match(router, /path: 'changelog'\s*,\s*redirect: '\/settings\/data'/)
  assert.match(settingsLayout, /<router-view\s*\/>/)
  assert.doesNotMatch(settingsLayout, /<Transition/)
  // 不要给布局容器加 overflow:hidden（会裁掉设置内容，导致 .app-content 滚不动）
  assert.doesNotMatch(settingsLayout, /\.settings-layout-view\s*\{[^}]*overflow:\s*hidden/)
})

test('settings sections retain the modern mainline implementations', () => {
  assert.equal((settingsView.match(/v-if="section === 'general'"/g) || []).length, 1)
  assert.equal((settingsView.match(/v-if="section === 'appearance'"/g) || []).length, 2)
  assert.equal((settingsView.match(/v-if="section === 'features'"/g) || []).length, 2)
  assert.equal((settingsView.match(/v-if="section === 'data'"/g) || []).length, 2)
  assert.match(settingsView, /tauriAPI\.setAutoStart\(value, mode, mode\)/)
  assert.match(settingsView, /restartElevatedForAutoStart/)
  assert.match(settingsView, /settings\.uriSchemeEnabled/)
  assert.match(settingsView, /dataBridge\.importData\(\)/)
})

test('settings child navigation stays under the host-owned GSAP route stage', () => {
  assert.match(appLayout, /class="route-page-stage"/)
  assert.match(appLayout, /route\.matched\[0\]\?\.path \|\| route\.path/)
  assert.match(appLayout, /runDefaultGsapPageTransition/)
  assert.match(navigationDock, /<SecondarySidebarMenu/)
  assert.match(navigationDock, /:collapsed="dockCollapsed"/)
})
