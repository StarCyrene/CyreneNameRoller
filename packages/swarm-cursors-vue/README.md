# swarm-cursors-vue

效果来自 [Joel Califa 的 Swarm](https://github.com/califa/swarm-site)；[Dhvanil Patel](https://github.com/DhvanilPatel/swarm-cursors) 将它改编成可用于任意页面的浏览器扩展。我们直接改造的是 [Nitin Thakur 的 divPointers 版本](https://github.com/nitin7213/SWARM_DIVPOINTERS-)，其中包含录屏等扩展。Nitin 的仓库附有 MIT 文件，但 Dhvanil 的 README 明确写着上游尚未授予通用许可证。我们已[向作者询问再分发条件](https://github.com/DhvanilPatel/swarm-cursors/issues/30)，npm 发布暂缓。

本仓库 [Cyrene2008/swarm-cursors-vue](https://github.com/Cyrene2008/swarm-cursors-vue) 将引擎做成无需安装扩展的 Vue 3 / Nuxt 插件。Vue 封装、粉色主题、favicon 封面、陪伴光标、HUD / 音效开关、路由集成和兼容修复 © 2026 Cyrene2008。安装本仓库或本地包；Cloudflare 构建可使用随站点提交的本地包，分发时保留 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md)。

要让 Agent 把效果接入另一个站点，请从 [Vue / Nuxt 项目接入指南](./AGENT-INTEGRATION.zh-CN.md) 开始：选择安装来源、注册现有路由器、配置按页行为，再用真实导航验收首屏和切页。

- `app.use(SwarmCursors)` → 全局挂载右下角触发胶囊
- `auto: true` → 打开页面就自动播放，不用点击
- `autoOnRoute: true` → 每次 Vue Router 切页后再来一遍
- 默认不显示操作栏、不播放声音；播放完自动淡回真实页面，只留一只陪伴光标
- 路由切换先盖主题遮罩，再在遮罩后捕获、重建，不会先显示完整新页面再擦除
- 引擎作为懒加载 chunk 打包，第一次触发时才下载
- SSR 安全（服务端 no-op，客户端挂载）
- CSP 友好（引擎用 adoptedStyleSheets / CSSOM，不依赖内联 `<style>`）
- 保留各层来源署名和直接来源的 MIT 文件，许可范围见 NOTICE

---

## 安装

### 从 GitHub 安装

```bash
npm install github:Cyrene2008/swarm-cursors-vue
# 或
bun add github:Cyrene2008/swarm-cursors-vue
```

仓库里已包含构建好的 `dist/`，安装后不需要再编译。

### 从本地文件夹安装

```bash
npm install ./vue-package
```

或者直接指定路径：

```bash
npm install "file:C:/path/to/vue-package"
```

安装后就可以 `import SwarmCursors from 'swarm-cursors-vue'`。

### 打包成 tgz 分享 / 发布

```bash
npm install
npm run build
npm pack
```

会得到 `swarm-cursors-vue-1.4.1.tgz`，别人可以：

```bash
npm install ./swarm-cursors-vue-1.4.1.tgz
```

维护者使用 [npm 发布指南](./PUBLISHING.md) 将验证过的 tarball 提交到 npm 待审区，由维护者审核后才公开。正式版本可用后，应用可直接运行 `npm install swarm-cursors-vue@1.4.1`。

### 开发

```bash
bun install
bun run build
bun test
```

`dist/` 会同时生成 ESM、CJS、类型文件和懒加载引擎 chunk。

---

## 快速开始：全局启用

```js
// main.js
import { createApp } from 'vue'
import App from './App.vue'
import SwarmCursors from 'swarm-cursors-vue'

const app = createApp(App)

app.use(SwarmCursors, {
  position: 'bottom-right',
  theme: 'dark',
  label: '看 AI 光标重建本页',
  sublabel: 'Swarm Cursors · 无需安装扩展',
})

app.mount('#app')
```

默认会在右下角挂一个小胶囊。访客点一下，页面就会被擦除，然后由光标重新画出来。

### 打开页面就自动播放

如果不想让访客点：

```js
app.use(SwarmCursors, {
  auto: true,        // 页面加载后自动开始
  autoDelay: 1800,   // 等页面渲染完再开始（毫秒）
  once: true,        // 同一个标签页 + 路径只自动播放一次
})
```

> `once` 存在 `sessionStorage` 里；刷新同一页不会重复自动播放，但点右下角胶囊仍可重播。

### Vue Router：每次切页都自动播放

```js
import { createRouter, createWebHistory } from 'vue-router'
import SwarmCursors from 'swarm-cursors-vue'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

app.use(router)
app.use(SwarmCursors, {
  router,
  auto: true,          // 首屏也自动播放
  autoOnRoute: true,   // 之后每次路由切换都自动播放
  autoDelay: 1800,
  routeDelay: 900,     // 切页后等 DOM 稳定一点
})
```

前一页仍在绘制时，确认新路由会取消旧的重建，并按目标页的配置重新开始。

有侧栏的布局可以从 1.3.1 起给正文容器加 `data-swarm-pageview`，如 `<main data-swarm-pageview><RouterView /></main>`。站内切页时，封面的 Logo、短线和光晕会对准正文区域（PageView）可见部分的中心。首次进站或刷新仍使用视口中心，并在重建时绘制 Dock；没有可见标记时也使用视口中心。手机布局想保留原样，可用 `:data-swarm-pageview="isMobile ? undefined : ''"` 只在桌面添加标记。与它配套的 `data-swarm-persist` 标在 Dock 上，用来让真实导航在切页时保持可见、可点击。

### 按页面配置：某个页面不跑

**不写就是默认跑。** 只给需要关闭的页面加 `meta.swarmCursors`：

```js
// Vue Router
{
  path: '/privacy',
  component: PrivacyPage,
  meta: { swarmCursors: false },
}
```

Nuxt 3：

```vue
<script setup>
// 这个页面不播放；其他页面不写这一项，保持默认。
definePageMeta({ swarmCursors: false })
</script>
```

也支持对象写法：

```js
meta: { swarmCursors: { enabled: false } }
```

被禁用的页面会：

- 停止当前正在播放的重建
- 隐藏右下角胶囊
- 让 `start()` 变成 no-op（即使用自己的按钮也点不出来）

切回启用页面时，如果 `auto` / `autoOnRoute` 开着，会重新自动播放。非 Vue Router 场景也可以直接调用：

```js
const { core } = useSwarmCursors()
core.setPageEnabled(false)
core.setPageEnabled(true)
```

### 默认体验：不要操作栏、不要声音、只留一只光标

从 1.2.0 开始，默认：

- `hud: false`：不显示底部操作栏（Tour / 倍速 / 录制 / Go live）
- `sound: false`：不播放合成音效
- `companion: true`：默认 `companionMode: 'follow'` 在重建结束后显示跟随光标。1.4.0 的 `'replace'` 模式从进入启用页面起，就把普通区域的系统箭头换成主题色的无尾柄箭头；封面、绘制和完成后都保持，不再另画一枚跟随光标。文本选择、链接、控件和调整大小等操作保留原光标。禁用页面、关闭陪伴光标、触摸、减少动态效果或系统强制配色时不替换。
- `autoReveal: true`：播放完成后自动 reveal，不需要手动点 Go live
- `cover: true`：路由切换时先用主题遮罩盖住新页面，引擎在遮罩后捕获，再开始画。这样不会“先看到完整的新页面，再被清空”，也不会让新页面内容消失

某个页面想要操作栏，在页面源码里开：

```js
// Vue Router
meta: { swarmCursors: { hud: true, sound: true } }
```

```vue
<!-- Nuxt -->
definePageMeta({ swarmCursors: { hud: true, sound: true } })
```

- `hud: true` 时，`autoReveal` 默认变成 `false`，操作栏会留在页面上
- 也可以单独设置 `companion: false` 不显示陪伴光标
- `captureDelay` 可以按页面覆盖，给动态内容更多加载时间：
  `meta: { swarmCursors: { captureDelay: 3000 } }`

### 粉色主题 / 自定义光标颜色

```js
app.use(SwarmCursors, {
  theme: 'pink',
  accent: '#ff6ad9',
  accentDark: '#e055c0',
  danger: '#cc44b0',
  colors: [
    '#ff6ad9', '#e055c0', '#cc44b0', '#ff4fc4',
    '#d94aa8', '#c93a9f', '#ff77d9', '#e86ac8',
    '#f25cbe', '#b8328f', '#ff5fc8', '#a82d80',
  ],
})
```

- `theme: 'pink'`：右下角胶囊变成粉色渐变。
- `colors`：光标颜色（HUD 里的 agent 小圆点也一起变）。
- `accent`：测量线、选中框、hover 高亮。
- `danger`：红色提示、尺寸标签、标尺线；粉色主题下换成深粉。
- `accentDark`：粉色胶囊渐变的深色端。

---

## 三种触发方式

### 1. 全局胶囊（默认）

什么都不用写，`app.use` 之后右下角就有。

想关掉胶囊、只保留 API：

```js
app.use(SwarmCursors, { button: false })
```

### 2. 组合式 API

```vue
<script setup>
import { useSwarmCursors } from 'swarm-cursors-vue'

const { start, stop, toggle, running, loading, loaded, error } = useSwarmCursors()
</script>

<template>
  <button :disabled="running" @click="start">
    {{ running ? '正在重建…' : '播放重建动画' }}
  </button>
</template>
```

`running` / `loading` / `loaded` / `error` 是 ref，模板里会自动解包。

### 3. Renderless 组件

```vue
<SwarmCursorsTrigger v-slot="{ start, running }">
  <button class="my-own-button" :disabled="running" @click="start">
    播放重建
  </button>
</SwarmCursorsTrigger>
```

`SwarmCursorsTrigger` 不渲染任何东西，只把 `start / stop / toggle / running / loading` 交给你的插槽，样式完全由你控制。

另外还有一个开箱即用的小按钮：

```vue
<SwarmCursorsButton label="播放重建动画" />
```

> 严格 CSP（`style-src 'self'`）下，`SwarmCursorsButton` 的默认内联样式可能会被浏览器拦掉；此时用 `SwarmCursorsTrigger` + 自己的 class 最稳。

---

## 选项

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `button` | boolean | `true` | 是否自动挂载右下角胶囊 |
| `auto` | boolean | `false` | 安装后自动播放一次 |
| `autoDelay` | number | `1800` | 自动播放延迟（ms） |
| `autoOnRoute` | boolean | `false` | 每次路由切换后自动播放 |
| `routeDelay` | number | `900` | 路由切换后的延迟（ms） |
| `once` | boolean | `false` | 自动播放每个标签页 + 路径只一次 |
| `preload` | boolean | `false` | 安装后预下载引擎，但不播放 |
| `position` | string | `'bottom-right'` | `bottom-right` / `bottom-left` / `top-right` / `top-left` / `bottom-center` |
| `theme` | string | `'dark'` | `dark` / `light` / `pink` |
| `accent` | string | `'#A259FF'` | 强调色（胶囊 hover / 测量线 / 选中框） |
| `accentDark` | string | `'#D9408F'` | 粉色胶囊渐变的深色端 |
| `danger` | string | `'#F24822'` | 尺寸标签 / 警示线颜色 |
| `colors` | string[] | `null` | 光标调色板，不传用原版 12 色 |
| `hud` | boolean | `false` | 显示底部操作栏（Tour / 倍速 / 录制 / Go live） |
| `sound` | boolean | `false` | 合成音效 |
| `companion` | boolean | `true` | 启用陪伴光标，由模式决定显示时机 |
| `companionMode` | `'follow' \| 'replace'` | `'follow'` | 在鼠标旁边跟随，或用主题箭头替换网页普通区域的系统箭头 |
| `autoReveal` | boolean | `true` | 播放完成后自动淡回真实页面；`hud: true` 时默认 false |
| `autoRevealDelay` | number | `1600` | 自动 reveal 延迟（ms） |
| `captureDelay` | number | `0` | 遮罩后等待动态内容加载再捕获（ms） |
| `cover` | boolean | `true` | 路由切换时显示主题遮罩，避免先显示完整新页面 |
| `coverColor` | string | `'#fef7fb'` | 浅色遮罩背景 |
| `coverColorDark` | string | `'#1a0f16'` | 深色遮罩背景 |
| `zIndex` | number \| string | `2147483000` | 胶囊层级 |
| `router` | Vue Router | `null` | 传入后自动接 `afterEach` |
| `label` | string | 中/英自动 | 胶囊主文案 |
| `sublabel` | string | 中/英自动 | 胶囊副文案 |
| `loadingLabel` | string | 中/英自动 | 加载中主文案 |
| `loadingSublabel` | string | 中/英自动 | 加载中副文案 |
| `errorLabel` | string | 中/英自动 | 加载失败主文案 |
| `errorSublabel` | string | 中/英自动 | 加载失败副文案 |
| `replayLabel` | string | 中/英自动 | 播放过一次后的主文案 |
| `replaySublabel` | string | 中/英自动 | 播放过一次后的副文案 |

陪伴光标采用 `colors[0]`，未提供调色板时采用 `accent`。若应用已有主题色，设置 `accent: 'var(--app-accent)'` 和 `colors: ['var(--app-accent)']`，并把该变量定义在 `:root` 上；运行时换肤后，正在绘制的光标和已替换的箭头都会更新，无须重新安装插件。

也可以把文案集中写在 `labels` 里：

```js
app.use(SwarmCursors, {
  labels: {
    label: 'Watch the swarm',
    sublabel: 'No extension required',
    replay: 'Watch again',
  },
})
```

扁平选项（`label`、`sublabel` 等）优先级高于 `labels`。

---

## 事件与状态

```js
const core = app.config.globalProperties.$swarmCursors

core.on('start', () => console.log('开始重建'))
core.on('end', () => console.log('回到真实页面'))
core.on('error', (err) => console.warn('加载失败', err))
core.on('state', (state) => console.log(state))
```

`state` 结构：

```js
{
  running: boolean,
  loading: boolean,
  loaded: boolean,
  played: boolean,
  pageEnabled: boolean,
  pageHud: boolean,
  error: string | null,
}
```

也可以直接调用：

```js
core.start()
core.stop(true)   // true = 淡出回真实页面
core.toggle()
core.setPageEnabled(false) // 当前页面不跑，并停止播放
core.destroy()    // 移除胶囊、停止播放、解绑路由
```

---

## Nuxt

推荐用普通（universal）插件，包在服务端会自动 no-op：

```js
// plugins/swarm-cursors.js
import SwarmCursors from 'swarm-cursors-vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(SwarmCursors, {
    router: nuxtApp.$router,
    auto: true,
    autoOnRoute: true,
    autoDelay: 2500,
    routeDelay: 1200,
    position: 'bottom-right',
  })
})
```

然后在需要关闭的页面里：

```vue
<script setup>
definePageMeta({ swarmCursors: false })
</script>
```

如果只想在客户端启用，也可以命名为 `plugins/swarm-cursors.client.js`；`useSwarmCursors()` 在服务端渲染时会拿到一个 no-op core，不会报错。

---

## SSR 与 CSP

- 服务端：`createSwarmCursors()` 返回 no-op core；不会访问 `window` / `document`，也不会加载引擎。
- 客户端：首次 `start()` 时动态 `import()` 引擎 chunk；不播放就永远不下载那 100 KB。
- 引擎使用 `adoptedStyleSheets` 和 CSSOM 写样式，严格 `style-src 'self'` 的站点也能正常播放。
- 没有 `eval` / `new Function` / 远程脚本；`script-src 'self'` 下动态 chunk 同源可加载。
- 可选组件 `SwarmCursorsButton` 用了内联 style；严格 CSP 下请改用 `SwarmCursorsTrigger` 或自己的 class。

---

## 构建

```bash
cd vue-package
npm install
npm run build
```

产物：

```
dist/
├─ index.js                 # ESM 入口
├─ index.cjs                # CJS 入口
├─ index.d.ts               # TypeScript 类型
└─ chunks/
   └─ engine-entry-*.js     # 懒加载的 divPointers 引擎
```

`package.json` 里已配置 `exports`、`types`、`peerDependencies`（Vue 3）。`dist` 是预构建好的，直接 `npm install` 这个文件夹就能用，不需要在安装时编译。

---

## 文件结构

```
swarm-cursors-vue/
├─ src/
│  ├─ index.js          # Vue 插件入口
│  ├─ core.js           # 与框架无关的启动/停止状态机、自动播放、路由钩子
│  ├─ pill.js           # Shadow DOM 胶囊
│  ├─ companion.js      # 播放结束后保留的陪伴光标
│  ├─ cover.js          # 路由切换时的主题遮罩
│  ├─ persist.js        # 站内切页时为标记的常驻导航留出可交互区域
│  ├─ composable.js     # useSwarmCursors
│  ├─ components.js     # SwarmCursorsTrigger / SwarmCursorsButton
│  ├─ engine-entry.js   # 引擎的懒加载入口
│  └─ engine-runtime.js # divPointers 引擎（去掉自动启动，补 CSP / 主题 / 圆角媒体）
├─ types/index.d.ts
├─ test/smoke.mjs
├─ build.mjs
├─ CHANGELOG.md
├─ AGENT-INTEGRATION.zh-CN.md
├─ NOTICE.md
└─ package.json
```

---

## License

Vue 封装与本项目修改采用 MIT；不能据此将随包引擎整体视为 MIT。完整来源、已知许可和待确认部分见 [NOTICE.md](./NOTICE.md)，MIT 原文见 [LICENSE](./LICENSE)。


