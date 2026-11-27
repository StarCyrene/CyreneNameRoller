import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryHistory, createRouter } from 'vue-router'
import { rollerRoutes } from '../src/router/rollerTools.js'
import { parseCyreneUri, parseWebHash } from '../src/utils/uriNavigation.js'

test('desktop start URI only reveals the current page', () => {
  assert.deepEqual(parseCyreneUri('cyrenenr://start'), {
    source: 'desktop-uri',
    route: null,
    roller: null,
    autoStart: false
  })
})

test('desktop page URI maps aliases and parses Roller parameters', () => {
  assert.deepEqual(
    parseCyreneUri('cyrenenr://page/roller?isEN=0&isGroupMode=0&sex=female&multiMode=1&count=6&noDuplication=0'),
    {
      source: 'desktop-uri',
      route: '/roller',
      autoStart: true,
      roller: {
        englishMode: false,
        groupMode: false,
        sex: 'female',
        multiMode: true,
        count: 6,
        noDuplication: false
      }
    }
  )
  assert.equal(parseCyreneUri('cyrenenr://page/cards').route, '/roller/card')
})

test('non-Roller pages ignore query parameters', () => {
  assert.deepEqual(parseCyreneUri('cyrenenr://page/settings?count=99'), {
    source: 'desktop-uri',
    route: '/settings',
    roller: null,
    autoStart: false
  })
})

test('tool links and legacy Card shortcuts open the selected tool without starting a draw', () => {
  for (const tool of ['card', 'wheel', 'tunnel', 'seats', 'relay', 'riddle', 'teams']) {
    const route = '/roller/' + tool
    for (const navigation of [parseCyreneUri('cyrenenr://page' + route + '?count=6'), parseWebHash('#' + route + '?count=6#intro')]) {
      assert.equal(navigation.route, route)
      assert.equal(navigation.autoStart, false)
      assert.equal(navigation.roller, null)
    }
  }
  assert.equal(parseCyreneUri('cyrenenr://page/card?count=6').route, '/roller/card')
  assert.equal(parseWebHash('#/card?count=6#deck').route, '/roller/card')
  assert.equal(parseWebHash('#/card#deck').route, '/roller/card')
})

test('the router keeps old Card bookmarks intact and named tool links share the workspace', async () => {
  // Resolve the real route records without loading Vue SFCs in the Node runtime.
  const noView = record => ({
    ...record,
    ...(record.component ? { component: {} } : {}),
    ...(record.children ? { children: record.children.map(noView) } : {})
  })
  const router = createRouter({ history: createMemoryHistory(), routes: rollerRoutes.map(noView) })
  await router.push('/card?list=A&list=B#deck')
  assert.equal(router.currentRoute.value.fullPath, '/roller/card?list=A&list=B#deck')
  assert.equal(router.currentRoute.value.name, 'Card')
  const expected = { Roller: '/roller', Card: '/roller/card', RollerWheel: '/roller/wheel', RollerTunnel: '/roller/tunnel', RollerSeats: '/roller/seats', RollerRelay: '/roller/relay', RollerRiddle: '/roller/riddle', RollerTeams: '/roller/teams' }
  for (const [name, path] of Object.entries(expected)) {
    const resolved = router.resolve({ name })
    assert.equal(resolved.path, path)
    assert.equal(resolved.matched[0].path, '/roller')
    assert.equal(resolved.meta.rollerWorkspace, true)
  }
})

test('Web hash uses the same Roller parameter contract', () => {
  assert.deepEqual(parseWebHash('#/roller?isGroupMode=1&multiMode=1&count=12&noDuplication=1'), {
    source: 'web-hash',
    route: '/roller',
    autoStart: true,
    roller: {
      groupMode: true,
      multiMode: true,
      count: 12,
      noDuplication: true
    }
  })
})

test('invalid schemes, pages and parameter values are rejected safely', () => {
  assert.equal(parseCyreneUri('https://page/roller'), null)
  assert.equal(parseCyreneUri('cyrenenr://page/unknown'), null)
  assert.deepEqual(parseCyreneUri('cyrenenr://page/roller?sex=other&count=-4').roller, { count: 1 })
  assert.equal(parseCyreneUri('cyrenenr://page/roller?unknown=1').autoStart, false)
})
