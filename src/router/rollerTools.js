// The child route names also identify the selected tab for deep links and history.
export const rollerTools = [
  { path: '', name: 'Roller', label: { zh: '滚动点名', en: 'Roller' }, compact: { zh: '滚动', en: 'Roller' }, icon: 'flash-20-regular', component: () => import('../views/RollerView.vue') },
  { path: 'card', name: 'Card', label: { zh: '翻牌点名', en: 'Cards' }, compact: { zh: '翻牌', en: 'Cards' }, icon: 'card-ui-portrait-flip-20-regular', component: () => import('../views/CardView.vue') },
  { path: 'wheel', name: 'RollerWheel', label: { zh: '转盘点名', en: 'Wheel' }, compact: { zh: '转盘', en: 'Wheel' }, icon: 'arrow-rotate-clockwise-20-regular', component: () => import('../views/WheelRollerView.vue') },
  { path: 'tunnel', name: 'RollerTunnel', label: { zh: '光轨穿梭', en: 'Light Tunnel' }, compact: { zh: '光轨穿梭', en: 'Light Tunnel' }, icon: 'rocket-20-regular', component: () => import('../views/LightTunnelView.vue') },
  { path: 'seats', name: 'RollerSeats', label: { zh: '座次寻光', en: 'Seat Spotlight' }, compact: { zh: '座次寻光', en: 'Seat Spotlight' }, icon: 'grid-20-regular', component: () => import('../views/SeatRollerView.vue') },
  { path: 'relay', name: 'RollerRelay', label: { zh: '流萤传灯', en: 'Firefly Relay' }, compact: { zh: '流萤传灯', en: 'Firefly Relay' }, icon: 'lightbulb-filament-20-regular', component: () => import('../views/RelayRollerView.vue') },
  { path: 'riddle', name: 'RollerRiddle', label: { zh: '花笺藏名', en: 'Petal Riddle' }, compact: { zh: '花笺藏名', en: 'Petal Riddle' }, icon: 'leaf-one-20-regular', component: () => import('../views/PetalRiddleView.vue') },
  { path: 'teams', name: 'RollerTeams', label: { zh: '连星成诗', en: 'Constellations' }, compact: { zh: '连星成诗', en: 'Constellations' }, icon: 'sparkle-20-regular', component: () => import('../views/TeamRollerView.vue') }
].map(tool => ({ ...tool, fullPath: tool.path ? '/roller/' + tool.path : '/roller' }))

export const rollerRoutes = [
  {
    path: '/roller',
    component: () => import('../views/RollerWorkspaceView.vue'),
    meta: { order: 100, rollerWorkspace: true },
    children: rollerTools.map(({ path, name, component }) => ({ path, name, component }))
  },
  // Vue Router carries the original query and fragment across a redirect.
  { path: '/card', redirect: { name: 'Card' } }
]
