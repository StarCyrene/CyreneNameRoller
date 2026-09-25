# 成对范例说明（FancyCNR）

- `manifest.example.yml` + `contributions.pair.example.json` 为同一虚构插件的成对声明。
- 开发插件时文件名必须是包根下的 `manifest.yml` 与 `contributions.json`（本目录仅作文档范例，文件名带 `.example` / `.pair` 后缀）。
- `contributions.pair.example.json` 为合法 JSON（无注释）；说明见本文件。
- 约定：
  - 扁平根：`settings` / `pages` / 其它贡献键，不是 `{ "contributes": { ... } }`
  - `settings` 由宿主 VueFluentWidgets 渲染；`storageKey` 与 iframe 共用
  - `pages` 仅 iframe（`entry`），禁止 `native`
  - 省略贡献键 = 无该类贡献
  - 读写 settings 需要 `storage:read` / `storage:write`
- 字段规范：`docs/compose/spec/plugin-manifest-split.md`
- 单文件简化示例：`contributions.example.json`
- 交互预览：`../contributions-preview.html`
