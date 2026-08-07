# Cyreneの随机点名器

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=for-the-badge&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/Cyrene2008/CyreneNameRoller) 在Zread查看本项目的详细分析文档
## <p><a href="https://aiwb.smart-teach.cn/project/3efc8fec6410"><img width="32" height="32" alt="image" src="https://github.com/user-attachments/assets/e0faf9bb-55e5-4e27-bea5-a4f5a4061b2e" />Awesome IWB收录项目</a></p>


基于 Vue 3 + Tauri 的随机点名桌面应用，采用 Windows 11 Fluent Design 设计语言。

> [!CAUTION]
> 自 v26.1 起仅提供 Web 与 Tauri 版本更新及 Tauri Release
> 本项目使用了 [Vue Fluent Widgets](https://fluent.cyrene.hk) 作为Fluent组件库，这是一个MIT协议的组件库，Copyright (C) Cyrene2008


在线使用→ [立即使用](https://xn--web-t33et1i480d.xn--8hvv1o.cn/)

## 开发计划

- [x] 核心功能转移到Vue
- [x] 重构FluentDesignUI
- [x] 抽取记录
- [x] 更新功能
- [x] 公平平衡算法优化
- [x] 小组管理功能
- [x] 桌面端后台常驻
- [x] 抽奖模式
- [x] [插件系统](https://github.com/Cyrene2008/CyreneNameRoller-Plugin-Template)
- [ ] 积分系统
- [ ] 多平台支持
  - [x] Windows10+
  - [x] Web
  - [ ] Android
  - [x] Linux（提供官方 Tauri 构建：deb / AppImage）
- [x] 悬浮窗启动
- [ ] 更多功能正在路上♪

## 功能

**随机点名**
- 单人/多人模式，禁止重复（不放回抽取）
- 平衡算法：被抽中次数越少，下次概率越高
- 彩虹名称动画、English Mode

**翻牌点名**
- 3D 翻转卡牌动画
- 一键多抽（自动洗牌+翻牌）
- 收牌历史持久化、名单实时切换

**数据管理**
- 数据统计：抽取次数、概率、平衡概率
- 抽取记录：姓名、名单、来源、时间
- 名单管理：CRUD、批量删除（10秒撤销）、CSV/XLSX/JSON/CYRENE 智能识别导入与可选格式导出
- 小组绑定随名单文件完整导入导出，人员 UUID 保持稳定

**抽奖模式**
- 奖品滚动抽取与按权重划分扇区的幸运转盘
- 先抽人员再批量分配奖品，包含库存校验与独立抽奖记录
- 多奖品单管理，支持 JSON/CSV 导入导出

**个性化**
- UI 缩放（50%-200%）、名字字体大小调整
- 桃粉、Windows Fluent 与智能生成的自定义浅/深主题
- 深色/浅色模式、中/英文切换、自动停止与多种结果强调动画

**插件系统**
- 支持在线安装、更新、卸载、启用和禁用 `.cnrp` 插件
- 插件可贡献独立 Dock 大型页面、宿主原生 Fluent 设置页面、动画包与 Canvas/WebGL 视觉层
- Web/Tauri 使用同一套权限化能力桥接，不支持的平台操作会明确降级
- 名单、抽取历史、统计与公平平衡参数以只读快照提供；新玩法只能通过宿主 `draw.execute` 发起抽取
- 抽取结果始终由宿主 CAF/安全随机逻辑决定，统计和历史只能由宿主追加，插件不能指定结果、改写或删除既有数据
- [官方插件模板、Fluent 组件画廊与 API 文档](https://github.com/Cyrene2008/CyreneNameRoller-Plugin-Template)

## 页面展示

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/4dd696bd-b5cf-4c5c-810a-e842103384f8" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100935_090" src="https://github.com/user-attachments/assets/57dc6aa5-8ea6-4a04-9ed1-29cfcc513c50" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100952_359" src="https://github.com/user-attachments/assets/d0bb484f-f474-42b5-b221-eccd35eca42c" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100959_607" src="https://github.com/user-attachments/assets/39c997a5-a801-4a24-bc3b-e9c3b87cab33" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101005_678" src="https://github.com/user-attachments/assets/ea989841-1436-4170-9a3c-4e93fa23224b" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101012_407" src="https://github.com/user-attachments/assets/d012c58f-53a8-47c6-8411-6f31125f5fb0" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101018_167" src="https://github.com/user-attachments/assets/75edb038-89de-42bd-8913-0a65519eaa0b" />
<img width="1655" height="2380" alt="wechat_longscreenshot_2026-07-10_101035_521" src="https://github.com/user-attachments/assets/cbc33cb6-7e86-4c77-9c24-643aa2cc1302" />
<img width="2011" height="958" alt="ScreenShot_2026-07-10_101211_600" src="https://github.com/user-attachments/assets/dc43abf1-ac54-40b6-9833-859386070530" />

## 快速开始

```bash
git clone https://github.com/StarCyrene/CyreneNameRoller.git
cd CyreneNameRoller
npm install
npm run dev
```

## 构建 Tauri 客户端

```bash
npm run tauri:build
```

打包产物在 `src-tauri/target/` 目录下。

## 技术栈

Vue 3 + Vite + Tauri + Pinia + Vue Router + @iconify/vue (Fluent UI Icons)

## 许可证

[GPL-3.0](LICENSE)
