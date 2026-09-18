import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/roller', meta: { order: 0 } },
  { path: '/roller', name: 'Roller', component: () => import('../views/RollerView.vue'), meta: { order: 100 } },
  { path: '/card', name: 'Card', component: () => import('../views/CardView.vue'), meta: { order: 200 } },
  { path: '/lottery', redirect: '/lottery/draw', meta: { order: 300 } },
  { path: '/lottery/draw', name: 'LotteryDraw', component: () => import('../views/LotteryView.vue'), props: { section: 'draw' }, meta: { order: 300 } },
  { path: '/lottery/assign', name: 'LotteryAssign', component: () => import('../views/LotteryView.vue'), props: { section: 'assign' }, meta: { order: 310 } },
  { path: '/lottery/records', name: 'LotteryRecords', component: () => import('../views/LotteryRecordsView.vue'), meta: { order: 510 } },
  { path: '/lottery/prizes', name: 'LotteryPrizes', component: () => import('../views/LotteryView.vue'), props: { section: 'prizes' }, meta: { order: 620 } },
  { path: '/lottery/prizes/manage', name: 'PrizeListManage', component: () => import('../views/PrizeListManageView.vue'), meta: { order: 621 } },
  { path: '/statistics', name: 'Statistics', component: () => import('../views/StatisticsView.vue'), meta: { order: 400 } },
  { path: '/records', name: 'Records', component: () => import('../views/RecordsView.vue'), meta: { order: 500 } },
  { path: '/lists', name: 'Lists', component: () => import('../views/ListsView.vue'), meta: { order: 600 } },
  { path: '/lists/manage', name: 'ListManage', component: () => import('../views/ListManageView.vue'), meta: { order: 601 } },
  { path: '/group-manage', name: 'GroupManage', component: () => import('../views/GroupManageView.vue'), meta: { order: 610 } },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsLayoutView.vue'),
    meta: { order: 800 },
    children: [
      { path: '', redirect: '/settings/general' },
      { path: 'general', name: 'SettingsGeneral', component: () => import('../views/SettingsView.vue'), props: { section: 'general' }, meta: { order: 800 } },
      { path: 'appearance', name: 'SettingsAppearance', component: () => import('../views/SettingsView.vue'), props: { section: 'appearance' }, meta: { order: 801 } },
      { path: 'features', name: 'SettingsFeatures', component: () => import('../views/SettingsView.vue'), props: { section: 'features' }, meta: { order: 802 } },
      { path: 'data', name: 'SettingsData', component: () => import('../views/SettingsView.vue'), props: { section: 'data' }, meta: { order: 803 } },
      { path: 'performance', redirect: '/settings/appearance' },
      { path: 'draw', redirect: '/settings/features' },
      { path: 'balance', redirect: '/settings/features' },
      { path: 'management', redirect: '/settings/data' },
      { path: 'changelog', redirect: '/settings/data' }
    ]
  },
  { path: '/settings/balance-curve', redirect: '/settings/features', meta: { order: 802 } },
  { path: '/about', name: 'About', component: () => import('../views/AboutView.vue'), meta: { order: 900 } },
  { path: '/about/contributors', name: 'Contributors', component: () => import('../views/ContributorsView.vue'), meta: { order: 901 } },
  { path: '/download', name: 'Download', component: () => import('../views/DownloadView.vue'), meta: { order: 710 } },
  { path: '/announcement', name: 'Announcement', component: () => import('../views/AnnouncementView.vue'), meta: { order: 700 } },
  { path: '/floating', name: 'Floating', component: () => import('../views/FloatingLauncherView.vue'), meta: { order: 50 } },
  { path: '/plugins', name: 'Plugins', component: () => import('../views/PluginManagerView.vue'), meta: { order: 780 } },
  { path: '/plugin/:pluginId/:pageId', name: 'PluginPage', component: () => import('../views/PluginPageView.vue'), props: true, meta: { order: 781 } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
