# 让光标重建你的 Vue 站点

这份指南供接手现有项目的开发者和 Agent 使用。接入后，访客点击站内链接，会先看到网站图标封面，再看到光标逐步画出新页面，最后可以继续操作真实页面。整个站点只需注册一次插件。先找出项目的 Vue 入口或 Nuxt 插件目录、已有的包管理器与路由器，再选择下面相应的示例。

## 1. 固定安装来源

上游 [nitin7213/SWARM_DIVPOINTERS-](https://github.com/nitin7213/SWARM_DIVPOINTERS-) 是 MIT 许可的 Chrome Manifest V3 扩展，原始引擎 © 2026 Nitin Thakur；上游没有 Vue 插件、ESM 库或 npm 包入口。下列安装命令针对 [Cyrene2008/swarm-cursors-vue](https://github.com/Cyrene2008/swarm-cursors-vue)。这个包的 Vue 封装、粉色主题、favicon 封面、陪伴光标、HUD / 音效开关、路由集成和兼容修复 © 2026 Cyrene2008。随项目分发时保留 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md)。

宿主项目需要 Vue 3。Vue Router 示例使用宿主已有的 Vue Router 4；Nuxt 使用自带的 router。包内已包含引擎和类型，从根入口 `swarm-cursors-vue` 导入即可。

- **从 GitHub 安装。** 把下面的 `<commit-sha>` 换成此次验证过的完整提交 SHA，按项目已有的包管理器选一条。提交宿主的 `package.json` 和对应锁文件；CI 使用 `npm ci` 或 `bun install --frozen-lockfile`。
- **随宿主仓库分发。** StarCyreneHomePage 的 Cloudflare 构建采用这种方式：把 Vue 包指定提交的内容放进宿主的 `packages/swarm-cursors-vue/` 并提交，部署无需再从 GitHub 拉取该依赖。保留 `package.json`、完整的 `dist/`（含 `chunks/` 和类型）、README、接入指南、LICENSE、NOTICE.md；如需维护源码，同时保留 `src/`、`types/` 和构建脚本。在宿主的 `dependencies` 中写 `"swarm-cursors-vue": "file:packages/swarm-cursors-vue"`，再运行项目已有的安装命令并提交锁文件。本地包的内容由宿主提交固定；记录独立 Vue 包的 SHA，升级时整包同步，避免旧入口引用新目录里不存在的 chunk。

```sh
npm install "github:Cyrene2008/swarm-cursors-vue#<commit-sha>"
# 或
bun add "github:Cyrene2008/swarm-cursors-vue#<commit-sha>"
```

## 2. 只在一个入口注册

以下两种入口二选一，都使用这份配置。在 Vue 项目把它放在 `src/swarm-options.ts`；在 Nuxt 放在 `~/swarm-options.ts`（`~` 指向项目的源码目录）。

```ts
import type { SwarmCursorsOptions } from 'swarm-cursors-vue'

export const swarmOptions = {
  auto: true,         // 启用页首屏自动播放
  autoOnRoute: true,  // 站内导航也播放
  once: false,        // 允许返回已访问页面时再次播放
  autoDelay: 150,
  routeDelay: 150,
  captureDelay: 600, // 给异步内容额外的渲染时间，单位毫秒
  cover: true,
  button: false,     // 隐藏触发胶囊；不影响自动播放
  hud: false,
  sound: false,
  autoReveal: true,  // 完成后恢复真实页面
  companion: true,   // 开启陪伴光标
} satisfies SwarmCursorsOptions
```

要让普通位置的系统箭头直接使用应用的主题，选择 `companionMode: 'replace'`；默认 `'follow'` 保留系统箭头，在旁边显示陪伴光标。将 `accent` 和 `colors[0]` 都指向应用根元素上已有的同一个 CSS 变量（例如 `accent: 'var(--app-accent)', colors: ['var(--app-accent)']`）。如果主题只存在于 Vue 状态或组件内部，在已有的换肤逻辑里执行 `document.documentElement.style.setProperty('--app-accent', 当前主题色值)`。这样即使鼠标不动，绘制光标和页面内的主题箭头也会随换肤更新。保留 `sound: false`，除非该应用明确开启音效。

替换从进入已启用的页面开始，在封面、重建和恢复真实页面时持续生效，采用主题色、浅描边和没有尾柄的箭头。只作用于支持精细鼠标的网页普通区域。文字、表单、链接、拖拽/调整大小、自定义光标和第三方 iframe 保留浏览器或应用自己的反馈；`core.setPageEnabled(false)`、`swarmCursors: false`、页面设置 `companion: false` 或离开网页时即恢复原光标。触摸、减少动态效果及系统强制配色不替换。系统窗口和浏览器外部不受影响。

**Vue 3 + Vue Router 4**：把插件加入现有应用入口，传入模板里 `<RouterLink>` 使用的同一个 router 实例。下例先解析首个路由，使插件安装时就能读到首屏的禁用配置，然后挂载应用。

```ts
// src/main.ts
import { createApp } from 'vue'
import SwarmCursors from 'swarm-cursors-vue'
import App from './App.vue'
import router from './router'
import { swarmOptions } from './swarm-options'

async function bootstrap() {
  const app = createApp(App)
  app.use(router)
  await router.isReady()
  app.use(SwarmCursors, { ...swarmOptions, router })
  app.mount('#app')
}
void bootstrap()
```

**Nuxt**：创建客户端插件。在 Nuxt 3 的默认目录是 `plugins/swarm-cursors.client.ts`；采用 `app/` 目录的项目则放在 `app/plugins/`。保留现有的 `<NuxtLink>` 和 `<NuxtPage>`。

```ts
import SwarmCursors from 'swarm-cursors-vue'
import { swarmOptions } from '~/swarm-options'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(SwarmCursors, { ...swarmOptions, router: useRouter() })
})
```

切页时，插件会用不透明的主题底色立即盖住目标正文，准备好后再开始绘制。**冷启动有一道不同的边界**：浏览器可能先绘制服务器返回的 HTML，才下载并执行客户端插件。纯 SPA 也要等首个 JS 入口运行后才有插件封面。如果产品要求刷新页面的第一帧也必须带遮罩，应在宿主 HTML 或 SSR 布局提供初始封面，并为禁用页、减少动态效果、JS 未执行和加载失败留出访问正文的路径。把 JS 关掉刷新一次即可验证这个边界。

## 3. 决定哪些页面播放

普通页面继承全局设置。隐私页之类可以显式禁用；演示页可以单独打开控制栏与声音。使用宿主的路由元信息，保留其余字段。

```ts
// Vue Router 的 routes 数组中的两个示例
{ path: '/privacy', component: PrivacyPage, meta: { swarmCursors: false } },
{ path: '/demo', component: DemoPage, meta: { swarmCursors: { hud: true, sound: true } } },
```

```vue
<!-- Nuxt：放入需要禁用的页面，例如 pages/privacy.vue -->
<script setup lang="ts">
definePageMeta({ swarmCursors: false })
</script>
```

在 Nuxt 演示页面中，对应写法是 `definePageMeta({ swarmCursors: { hud: true, sound: true } })`。对象还支持 `enabled`、`companion`、`autoReveal`、`captureDelay`。打开 HUD 后通常会保留控制栏；希望完成后仍自动退出，就在**该页**显式加 `autoReveal: true`。浏览器可能要求用户先交互才能播放声音。

如果 TypeScript 需要推断路由配置，在宿主 `tsconfig` 包含的声明文件中扩展现有接口：

```ts
import type { SwarmCursorsRouteMeta } from 'swarm-cursors-vue'

declare module 'vue-router' {
  interface RouteMeta extends SwarmCursorsRouteMeta {}
}
```

需要自己的触发按钮时，在 Vue 组件的 `setup` 里取 `useSwarmCursors()`。例如全局把 `auto`、`autoOnRoute` 和 `button` 都设为 `false`，由下面的按钮在启用页手动切换；禁用页会忽略 `start()`。只需停播并恢复真实页面时调用 `stop(true)`。在 Nuxt 的服务端渲染期间，组合函数会返回空操作实现；如果按钮像本例一样依赖客户端的 `pageEnabled` 决定是否渲染，可用 `<ClientOnly>` 包住按钮组件，避免服务端和客户端的初始结构不一致。

```vue
<script setup lang="ts">
import { useSwarmCursors } from 'swarm-cursors-vue'
const { toggle, running, loading, pageEnabled } = useSwarmCursors()
</script>

<template>
  <button v-if="pageEnabled" type="button" :disabled="loading" @click="toggle">
    {{ running ? '返回页面' : '重播本页' }}
  </button>
</template>
```

## 4. 切页时保留可以点击的 Dock

从 1.3.0 开始，如果 Dock 或顶栏属于所有页面共用的布局，把 `data-swarm-persist` 放在它实际渲染的 DOM 根节点，并让它留在路由出口外。下面是 Vue 的 `App.vue`；Nuxt 可在共享布局中用同样的 `<nav>`，把链接换成 `<NuxtLink>`、路由出口换成 `<slot />`。如果导航封装在自己的组件里，直接标记组件模板里的 `<nav>`。

```vue
<template>
  <nav data-swarm-persist aria-label="主导航">
    <RouterLink to="/">首页</RouterLink>
    <RouterLink to="/gallery">作品</RouterLink>
  </nav>
  <main><RouterView /></main>
</template>
```

插件在站内导航时为标记区域保留其可见矩形，真实的链接仍可点击，整个导航子树被排除在这次绘制任务之外。首次进入和手动重播仍会绘制导航。Dock 和顶栏分处两地时可各标一个节点；标记紧贴可见控件的容器，避免标在满屏布局、透明占位层或包含正文的父节点上，否则正文也可能露出来或被跳过。如果旧项目加了标记仍重画，先确认已安装的 Git 提交或本地 `dist/` 包含这一版实现。

### 可选：让切页封面对准正文

从 1.3.1 开始，可以把 `data-swarm-pageview` 放在包住路由出口的真实 DOM 元素上。侧栏占去一部分宽度时，站内导航的封面 Logo、短线和光晕会以这块正文区域（PageView）**可见部分的中心**为基准。这个标记只调整封面装饰的位置，正文照常重建；保留 Dock 仍使用 `data-swarm-persist`。

如果手机布局希望保留视口居中，可以沿用项目已有的 `isMobile` 判断。StarCyreneHomePage 就按下面的方式只在桌面设置标记（普通 Vue 项目把 `<NuxtPage />` 换成 `<RouterView />`）：

```vue
<main :data-swarm-pageview="isMobile ? undefined : ''">
  <NuxtPage />
</main>
```

所有宽度都需要按正文居中时，直接写 `<main data-swarm-pageview>`。没有标记、或标记元素被隐藏时，切页封面仍以视口为中心。首次进入和刷新也使用视口中心，并在首次重建中绘制 Dock。

## 5. 在真实页面验收

1. 用宿主原有命令构建并启动预览，确认浏览器没有引擎 chunk 404 或水合错误。直接打开一个启用页和一个禁用页，再分别刷新。站点应声明可访问的 `<link rel="icon" href="…">`；未声明时插件会尝试同源 `/favicon.ico`，图片加载失败时显示爱心。
2. 在正常动态效果设置下，用 `<RouterLink>` 或 `<NuxtLink>` 从一个启用页进入另一个启用页，再按浏览器后退。录下从点击到出现第一批绘制的过程：封面或开场应连续覆盖页面，不能先闪现完整新正文再擦掉；随后应能看到多个绘制阶段。等待完成，点一次真实链接，确认内容恢复交互。
3. 选一个会请求数据的页面，慢速网络下观察有代表性的标题、列表项或版本号是否被画出。插件会等待跟踪到的 fetch/XHR 短暂空闲，等待有上限；更晚触发的请求、定时器和长期流式数据不能靠延时保证。若页面仍只有骨架，先确认内容何时进入 DOM，再调整该页的 `captureDelay` 或在宿主中提前取数。
4. 从启用页进入禁用页，确保正文可直接交互，没有重建或胶囊；再返回启用页验证恢复。最后在系统或浏览器中启用“减少动态效果”，确认自动播放跳过，正文仍可访问。验收报告注明路由、构建命令和浏览器观察到的顺序；时间随设备与网络变化，不用固定秒数判断通过。
5. 如果标了 Dock：首次进入时观察导航参与绘制；完成后点击 A → B，在封面或正文还在绘制时点击另一个 Dock 链接 B → C。真实 URL、激活项和最终正文都应切到 C，且切页中没有第二套光标重画导航。手动重播 C 时，导航应再次参与绘制。
6. 如果标了 PageView：用带侧栏的桌面布局刷新，Logo 应在整个视口中央；再点击 Dock 切页，Logo 和短线应落在正文的中轴线上，光晕随之移动。缩到手机宽度并移除标记，或隐藏标记元素，再切页确认回到视口中心。
