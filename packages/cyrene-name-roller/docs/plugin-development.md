# CyreneNameRoller Plugin Development Guide

## Project structure

```text
my-plugin/
  manifest.yml          # identity, entry, permissions
  contributions.json    # optional: pages, settings, commands, packs
  README.md
  src/worker.js
  src/visual.js
  pages/main.html
  animations/presets.json
  assets/icon.svg
```

The declaration is split in two:

- `manifest.yml` holds plugin **identity and permissions** (YAML). It never contains `contributes`, `settings`, `pages` or `api`.
- `contributions.json` holds **only contributions**, as a flat object (`settings`, `pages`, `commands`, …). It is optional: omit it when the plugin contributes nothing. It must not repeat identity fields, and it must not be wrapped in a `contributes` key.

Both files must never coexist with a single-file `manifest.json`. When `manifest.yml` is present the loader treats the package as new-format and rejects a stray `manifest.json`. Packages that ship only `manifest.json` keep working unchanged (legacy format, including `pages[].native`).

Use `cnrp create <directory>` for the basic template, or `cnrp create <directory> --template sound-effects` for the complete audio example.

## Manifest

```yaml
# manifest.yml
schemaVersion: 1
id: cn.example.my-plugin
name: My Plugin
version: 1.0.0
author: Your Name

engine:
  min: 1.2.0
  max: 1.2.0

entry: src/worker.js
readme: README.md

permissions:
  - events:draw
  - events:lifecycle
  - draw:execute
  - storage:read
  - storage:write

# optional
# icon: assets/icon.svg
# platformEntries: { tauri: src/worker.js }
# supportedPlatforms: [web, tauri]
# dependencies: []
# capabilities:
#   system:execute: { required: false, platforms: [tauri] }
# systemOperations: []
```

```json
// contributions.json
{
  "pages": [
    { "id": "main", "title": "Plugin", "location": "dock", "order": 700, "icon": "sparkle-24-regular", "entry": "pages/main.html" }
  ],
  "commands": [
    { "id": "refresh", "title": "刷新插件数据", "locations": ["command-palette", "page-header"], "icon": "arrow-clockwise-24-regular" }
  ]
}
```

`integrity` is written by `cnrp pack` into `manifest.yml`; never add it by hand. It covers every packaged file except `manifest.yml` itself, including `contributions.json`.

The plugin ID is the permanent identity for installation, updates and storage. Use a lower-case reverse-domain identifier. `engine` refers to the plugin API version, not the application `26.x` version.

`engine.min` is the hard requirement: when it is newer than the host API, the plugin cannot be loaded. `engine.max` describes the newest API version the developer has verified. A newer host will still load a plugin whose `engine.max` is older, but will show a compatibility warning because some behavior may have changed. This lets the loader remain backward compatible without pretending every old plugin has been fully verified on every future API.

## Worker lifecycle

```js
import { definePlugin, PluginEvents } from '@starcyrene/cyrene-name-roller/plugin-sdk'

definePlugin({
  async activate(context) {
    this.request = context.request
  },
  async onEvent(event, payload) {
    if (event === PluginEvents.ROLLER_RESULT) {
      await this.request('notifications.show', {
        message: `Received ${payload.results.length} results`,
        type: 'info'
      })
    }
  },
  async deactivate() {
    this.request = null
  }
})
```

Activation must complete within ten seconds. The Worker has no host DOM, Pinia, arbitrary Tauri invocation, network API, child Worker or `importScripts` access. Unhandled runtime errors disable the plugin.

## Permissions and RPC

| Permission | RPC | Purpose |
| --- | --- | --- |
| `storage:read` | `storage.read` | Read one value in the plugin namespace. |
| `storage:write` | `storage.write` | Write one value in the plugin namespace. |
| `events:draw` | — | Receive draw events. |
| `events:lifecycle` | — | Receive application-ready, route, theme and resize events. |
| `draw:execute` | `draw.execute` | Request a host-owned CAF draw and append its statistics/history transaction. |
| `ui:animations` | — | Contribute validated animation packs. |
| `ui:visual-surfaces` | — | Contribute isolated background Canvas/WebGL workers. |
| `ui:appearance` | — | Contribute validated semantic appearance-token packs. |
| `notifications:show` | `notifications.show` | Show a host notification. |
| `audio:select` | `audio.select` | Ask the user to choose an audio file. |
| `audio:play` | `audio.play` | Play a user-selected local audio data URL. |
| `names:read` | `names.read` | Read a snapshot of lists, people and groups. |
| `records:read` | `records.read` | Read a snapshot of draw history. |
| `statistics:read` | `statistics.read` | Read aggregate draw counts and the total count. |
| `balance:read` | `balance.read` | Read the fairness algorithm version, enabled state and public parameters. |

Core lists, existing draw history, statistics and fairness parameters are intentionally read-only. The SDK does not expose matching write RPCs, so plugins cannot rewrite history, alter counts or weaken fairness. `draw.execute` is the compatibility alias for the host-owned `draw` transaction: the host chooses results through CAF, updates statistics and appends immutable records as one operation. `storage.write` writes only inside that plugin's own namespace.

Audio files are limited to 16 MB each. The plugin namespace has a 96 MB serialized data quota. Storage keys are restricted to short alphanumeric/dot/dash/underscore values.

### Composable host extension model

API 1.2 is not designed as an ever-growing list of feature-specific RPC names. Plugins receive a host descriptor and compose a small set of primitives:

```js
import { describeHost, queryResource, executeTransaction } from '@starcyrene/cyrene-name-roller/plugin-sdk'

const host = await describeHost(context)
const names = await queryResource(context, 'names', { listId: 'class-a' })
const receipt = await executeTransaction(context, 'draw', {
  listId: names.currentListId,
  target: 'people',
  count: 1
})
```

`host.resources` lists read-only resources available to the installed plugin. `host.transactions` lists host-owned mutations. A future host can register another resource or transaction without inventing a new transport or changing the page bridge. The same descriptor is available as `context.host` and through `host.describe`, allowing old plugins to detect new capabilities and degrade gracefully.

### Plugin-owned commands

Commands are a generic product contribution, not a list of privileged host actions. They let the host place a plugin-defined action in a command palette, page header or context menu while the implementation remains in the plugin Worker:

```js
import { definePlugin } from '@starcyrene/cyrene-name-roller/plugin-sdk'

definePlugin({
  async onCommand(commandId, args) {
    if (commandId !== 'refresh') return { handled: false }
    const value = await this.request('storage.read', { key: 'settings' })
    return { handled: true, value, args }
  }
})
```

Declare the command in `contributions.json`:

```json
{
  "commands": [
    {
      "id": "refresh",
      "title": "刷新插件数据",
      "titleEn": "Refresh plugin data",
      "locations": ["command-palette", "page-header"],
      "icon": "arrow-clockwise-24-regular",
      "order": 300
    }
  ]
}
```

The host validates the declaration, keeps the command registry separate from core routes, and brokers invocation to the plugin Worker with a bounded timeout. A command does not gain extra permissions and cannot write core history, statistics, CAF parameters or draw results. Older hosts can ignore this optional contribution after inspecting `host.extensionPoints.commands`.

The model is **product freedom, core-hosted state transitions**: a plugin is free to create a new page, interaction model, visualization or workflow; whenever it needs to modify protected application state, it submits an intent to a discovered host transaction. Existing records, statistics and CAF parameters remain immutable, and draw results remain host-selected.

## Platform compatibility and system bridges

Plugins never invoke Tauri, PowerShell, `cmd`, browser globals, or arbitrary child processes directly. The host exposes a small, permissioned platform bridge. Every bridge request returns a structured result; an unavailable optional capability returns `ok: false` with `code: "UNSUPPORTED_PLATFORM"` instead of throwing, so the plugin can safely continue on Web.

The Worker context includes `context.platform` (`web` or `tauri`, plus the detected OS) and `context.capabilities`. Use the SDK helpers `getPlatform()`, `getCapabilities()`, `isCapabilityAvailable()` and `requestCapability()` to write one plugin that works on both targets.

Supported bridges are `system.open-url`, `system.select-file`, `system.select-directory`, `system.clipboard-read`, `system.clipboard-write`, `system.reveal-file` and `system.execute`. URL opening, file selection, clipboard and audio selection use browser APIs on Web where possible; directory selection, file revealing and native process operations are unavailable on Web and safely degrade.

Declare capabilities explicitly in `manifest.yml`:

```json
{
  "permissions": ["system:select-directory", "system:open-url"],
  "capabilities": {
    "system:select-directory": { "required": false },
    "system:open-url": { "required": true }
  }
}
```

Required capabilities unavailable on the current platform prevent activation. Optional capabilities are shown to the user during installation and return a structured unsupported result. A plugin should either show a Web-specific UI or skip that operation:

```js
import { definePlugin, getPlatform, requestCapability } from '@starcyrene/cyrene-name-roller/plugin-sdk'

definePlugin({
  async activate(context) {
    const platform = await getPlatform(context)
    if (platform.runtime === 'tauri') {
      await requestCapability(context, 'system.select-directory')
    } else {
      await context.request('notifications.show', { message: 'Web 端不支持目录选择，已使用浏览器兼容流程。' })
    }
  }
})
```

For platform-specific Worker or page code, provide `platformEntries.web` and native entries such as `platformEntries.windows` or `platformEntries.macos`. The host chooses the Web entry in a browser and the OS-specific entry in Tauri. A page is not registered on Web only when it has neither `platformEntries.web` nor a generic `entry` fallback.

`system.execute` is deliberately restricted to fixed, user-visible operations declared in the manifest. The command name must be a simple executable name and its argument array is immutable; arbitrary PowerShell/CMD strings, shell pipelines and runtime command construction are rejected. If a feature needs dynamic data, use a dedicated bridge or implement a Web-specific fallback instead.

## Draw events

- `draw:item-result`
- `draw:result`
- `roller:start`
- `roller:item-result`
- `roller:result`
- `card:item-result`
- `card:result`
- `lottery:item-result`
- `lottery:result`
- `lottery:assign-result`

Use item events for per-result behavior and summary events for once-per-operation behavior.

Lifecycle events require `events:lifecycle`:

- `app:ready`
- `app:route-changed`
- `app:theme-changed`
- `app:resize`
- `plugin:storage-changed` (sent only to the plugin that wrote the key; page, Worker and subscribed visual surfaces receive it)

Event payloads are cloned snapshots. Mutating them never changes application state.

`app:theme-changed` is also the visual-performance contract. Its payload contains
`theme`, `dark`, `accent`, `perfAnimations` and `reducedMotion`. The application
settings switch `perfAnimations` is authoritative: when it is false, Canvas/WebGL
surfaces must stop continuous render loops and clear non-essential effects, then
resume with at most one loop when it is restored. `reducedMotion` describes the
browser/Windows preference for diagnostics and adaptive styling; it does not
silently disable host GSAP/WAAPI animations. The host caches the latest lifecycle
snapshot and replays subscribed events after a visual surface activates.

## Host-mediated CAF draws

Plugins can build entirely new draw experiences, but must ask the host to commit the result:

```js
import { definePlugin, executeDraw } from '@starcyrene/cyrene-name-roller/plugin-sdk'

definePlugin({
  async activate(context) {
    const receipt = await executeDraw(context, {
      listId: 'class-a',
      target: 'people',
      gender: 'all',
      count: 6,
      allowDuplicates: false
    })
    console.log(receipt.operationId, receipt.results)
  }
})
```

Only filters are accepted: `listId`, `target`, `gender`, `count` and `allowDuplicates`. Candidate weights, selected IDs, result arrays, record bodies and fairness settings are not part of the API. The returned receipt is generated by the host and includes the operation ID, algorithm version and committed results. People draws use CAF; group draws use the host group-selection implementation. A successful request updates statistics where applicable and appends records tagged with the plugin ID and operation ID.

## Plugin pages and settings

Use host-native settings whenever possible. The application renders the declaration with its own Fluent components, theme, spacing and responsive layout, so the plugin looks and behaves like a first-party page. In the split format the settings live in the **top-level `settings` key of `contributions.json`**, grouped into sections:

```json
{
  "settings": {
    "title": "My plugin",
    "storageKey": "settings",
    "sections": [
      {
        "id": "general",
        "title": "General",
        "fields": [
          { "id": "enabled", "type": "toggle", "path": "enabled", "label": "Enabled", "default": true },
          { "id": "volume", "type": "slider", "path": "volume", "label": "Volume", "min": 0, "max": 1, "step": 0.01, "default": 0.7 },
          { "id": "mode", "type": "select", "path": "mode", "label": "Mode", "options": [{ "value": "once", "label": "Once" }] },
          { "id": "sound", "type": "audio", "path": "sound", "label": "Sound" }
        ]
      }
    ]
  }
}
```

A `field` may omit `path`; the storage key then defaults to the field `id`. `storageKey` defaults to `settings` and must match `/^[a-z][a-z0-9._-]{0,63}$/i`.

Supported field types are `toggle`, `checkbox`, `select`, `slider` (`range` is accepted as an alias), `audio`, `animation-select`, `component-style-select`, `component-override-select`, `component-override-toggle` and `result-presentation-select`. `component-override-toggle` binds one validated `packId`: enabling it selects that override pack and disabling it restores the target default. Ordinary values are stored in the plugin namespace under `storageKey` and can be read by the Worker through `storage.read`; contribution selectors and toggles are maintained by the host registries and never enter plugin storage.

Read and write these values with the same `storageKey`, so the host settings page and your own page share one object:

```js
const settings = await CyrenePlugin.settings.read()
await CyrenePlugin.settings.patch({ enabled: false })
```

`plugin:storage-changed` reaches a mounted plugin page whenever the changed key equals its `storageKey`, even without `events:lifecycle`.

A **pure settings plugin** (no Worker, no page) is valid as long as `settings.sections` is not empty. `pages[].native` is **not** allowed in the split format — declare settings at the top level instead.

HTML pages remain supported for rich custom functionality and are rendered in a sandboxed frame with the `window.CyrenePlugin.request()` bridge. They cannot access the host DOM. The host injects the current semantic appearance tokens, a small Fluent base stylesheet, `window.CyrenePlugin.host`, `window.CyrenePlugin.settingsKey`, and live theme updates. Use the provided `.cyrene-fluent-page`, `.cyrene-fluent-card`, `.cyrene-fluent-row` and `.cyrene-muted` primitives as a baseline, then build any page-specific UI inside the plugin frame. Host-native settings remain the simplest choice for ordinary configuration.

Set `location: "dock"` to make a substantial plugin page a first-level Dock destination. The page still uses the same sandbox and permission model; Dock placement does not grant extra privileges. `order` controls stable placement and `icon` uses a Fluent icon name. Use `location: "plugins"` for secondary/configuration pages.

In the split format `pages[]` holds **iframe pages only**; each page needs an `entry` (or `platformEntries`). Settings are declared separately in the top-level `settings` key.

The host selector fields (`animation-select`, `component-style-select`, `component-override-select`, `component-override-toggle`, `result-presentation-select`) must not declare a `path`. Declare a `target` (and `packId` where required); the host lists contributions from the current plugin and persists the active selection in application state.

> Legacy packages keep `pages[].native` with a `controls` array. The legacy control names `range` and the `settingsKey` field on the page are still accepted there; only the split format uses `settings.sections[].fields`.

## Animation packs

Declare `ui:animations` and reference one or more JSON packs:

```json
{
  "animationPacks": [
    { "id": "motion", "title": "More Motion", "source": "animations/presets.json" }
  ]
}
```

```json
{
  "schemaVersion": 1,
  "presets": [
    {
      "id": "soft-spring",
      "target": "roller.finish",
      "label": "Soft spring",
      "animation": {
        "keyframes": [
          { "opacity": 0, "transform": "scale(.86) translateY(10px)" },
          { "opacity": 1, "transform": "scale(1.04) translateY(0)", "offset": 0.7 },
          { "opacity": 1, "transform": "scale(1)" }
        ],
        "options": { "duration": 620, "easing": "cubic-bezier(.2,.9,.2,1)" }
      }
    }
  ]
}
```

Targets are `page.transition`, `roller.finish`, `card.deal`, `card.flip`, `lottery.finish` and `global.transition`. Legacy WAAPI keyframes remain supported. API 1.2 additionally accepts host-run GSAP `from`/`to` definitions:

```json
{
  "gsap": {
    "from": { "opacity": 0, "y": 28, "scale": 0.82, "filter": "blur(8px)" },
    "to": { "opacity": 1, "y": 0, "scale": 1, "filter": "blur(0px)" },
    "options": { "duration": 760, "ease": "elastic.out(1,0.36)" }
  }
}
```

The host owns the GSAP runtime, cancellation, the application animation switch and cleanup. Plugins declare bounded visual values; they do not receive callbacks, selectors, network-backed CSS, result-writing access or unrestricted host DOM access. Animation packs cannot replace or modify the host-selected result, result text or result data.

## Canvas and WebGL visual surfaces

Visual surfaces are independent Workers drawing only behind core content:

```json
{
  "visualSurfaces": [
    {
      "id": "aurora",
      "title": "Aurora",
      "entry": "src/visual.js",
      "placement": "background",
      "events": ["app:resize", "draw:result"]
    }
  ]
}
```

```js
import { defineVisualSurface } from '@starcyrene/cyrene-name-roller/plugin-sdk'

defineVisualSurface({
  activate(context) {
    this.canvas = context.canvas
    this.ctx = context.canvas.getContext('2d')
  },
  onResize(viewport) {
    this.canvas.width = viewport.pixelWidth
    this.canvas.height = viewport.pixelHeight
  },
  onEvent(event) {
    if (event === 'draw:result') this.renderBurst()
  },
  deactivate() {}
})
```

The host transfers an `OffscreenCanvas` where supported and calls visual lifecycle methods in this order: `activate(context)`, initial `onResize(viewport)`, then subscribed lifecycle-event replay. Canvas 2D and WebGL are available through the browser implementation. The host GSAP runner animates registered host targets; it is not injected into the isolated visual Worker. Use a bounded Worker render loop for particles and multi-layer effects, stop it in `deactivate`, obey the host `perfAnimations` switch, and degrade gracefully when OffscreenCanvas/WebGL is unavailable.

## Semantic appearance packs

Appearance packs are safe application-wide visual token sets, not arbitrary CSS. They can provide a full theme or a small override that inherits a generated Peach/Fluent base:

```json
{
  "appearancePacks": [{
    "id": "ocean-glass",
    "title": "海蓝玻璃",
    "titleEn": "Ocean Glass",
    "base": "fluent",
    "light": {
      "--accent": "#0067c0",
      "--bg-base": "#f7fbff",
      "--text-primary": "#10243a",
      "--text-on-accent": "#ffffff"
    },
    "dark": {
      "--accent": "#60aeea",
      "--bg-base": "#101820",
      "--text-primary": "#f4f8fc",
      "--text-on-accent": "#0a1620"
    }
  }]
}
```

Only documented semantic color and shadow tokens are accepted. Selectors, layout properties, scripts and network/data-backed CSS are rejected. Explicit foreground/background pairs must meet a 4.5:1 contrast ratio. If the providing plugin is disabled or removed, the application automatically falls back to Peach.

## Dependencies

```json
{
  "dependencies": [
    { "id": "cn.example.base", "range": "^1.0.0", "dataAccess": false }
  ]
}
```

The host installs dependencies first, detects cycles, validates version ranges and prevents disabling/uninstalling a plugin that has enabled dependents. Cross-plugin storage reads additionally require `dataAccess: true` and `shareData: true` on the target plugin.

Use the SDK helper instead of constructing the RPC name manually:

```js
import { readDependencyStorage } from '@starcyrene/cyrene-name-roller/plugin-sdk'

const sharedSettings = await readDependencyStorage(context, 'cn.example.base', 'settings')
```

## Packaging and signatures

```bash
npx cnrp validate ./my-plugin
npx cnrp pack ./my-plugin --out ./dist/my-plugin-1.0.0.cnrp
```

The CLI bundles the Worker with esbuild, obfuscates JavaScript, creates a per-file SHA-256 integrity map, compresses the package and emits an authenticated `CNRP1` AES-GCM envelope.

For a split-format plugin, `pack` writes the normalized identity plus the injected `integrity` back into `manifest.yml` and keeps `contributions.json` byte-for-byte. The integrity map covers every packaged file except `manifest.yml`, including `contributions.json`. For a legacy plugin it stays in `manifest.json` and covers everything except `manifest.json`.

For a catalog release, sign the package with an Ed25519 private key:

```bash
npx cnrp pack ./my-plugin \
  --out ./dist/my-plugin-1.0.0.cnrp \
  --private-key ./publisher-private.pem
```

Never commit the private key. Publish the base64 SPKI public key in `plugins/list.json`. GitHub Release assets expose their SHA-256 digest through the API, while the Ed25519 signature remains the publisher-identity trust mechanism.

## Catalog entry

```json
{
  "id": "cn.example.my-plugin",
  "name": "My Plugin",
  "repository": "owner/repository",
  "release": {
    "provider": "github",
    "channel": "latest",
    "assetPattern": "my-plugin-*.cnrp"
  },
  "publisherKey": "base64-spki-ed25519",
  "dependencies": []
}
```

For GitHub plugins, do not hard-code `version`, `downloadUrl` or `sha256`. The application resolves the latest stable GitHub Release, selects the uploaded `.cnrp` asset with `assetPattern`, and uses the asset's `sha256:` digest automatically. Drafts and prereleases are not selected. Fixed `version`/`downloadUrl`/`sha256` entries remain supported for non-GitHub or pinned-version catalogs.

The application downloads `plugins/list.json` at runtime through the selected source (`gh.昔涟.cn`, `gh-proxy.com` or GitHub). A proxy is only a transport; the GitHub asset digest and publisher signature remain the trust boundary.

## Recovery and release checklist

- Validate the manifest and package.
- Request only required permissions.
- Test install, enable, disable, update and uninstall.
- Test the page in light/dark themes and narrow layouts.
- Test all declared draw events without duplicating summary/item behavior.
- Do not include secrets, absolute local paths or publisher private keys.
- Verify the Release asset name matches `assetPattern` and the catalog public key is current.
- If a plugin crashes the application session, the next startup enters clean mode and disables all plugins for recovery.

## API 1.4 constrained UI

API 1.4 extends the host-owned UI contributions introduced in API 1.3 with native contribution selectors, binary component override toggles and precise Roller filter visibility targets. The plugin declares intent in `manifest.yml` and `contributions.json`; the host validates, resolves and renders every contribution. Plugins never receive Vue components, host DOM access, arbitrary CSS selectors or a core algorithm reference.

### Component styles and visibility

Use the `ui:component-styles` and `ui:component-overrides` permissions only when needed. Styles target stable component IDs and may adjust documented size, semantic colors, font size/weight, host font aliases, spacing, radius, borders, shadows and alignment tokens. CSS selectors, CSS files, `url()`, `var()`, `display`, `z-index`, `pointer-events`, positioning and script-backed values are rejected. Protected targets such as the authoritative result, list identity, errors, integrity state and recovery controls cannot be hidden or restyled with plugin fonts.

The original 13 API 1.3 targets remain frozen by the host component registry. API 1.4 adds six optional, hide-only Roller filter targets: `roller.filter.english-mode`, `roller.filter.draw-target`, `roller.filter.gender`, `roller.filter.draw-count`, `roller.filter.duplicates` and `roller.filter.count`. Hiding any filter changes only its rendering; the host keeps its current or default value. `roller.filters` still controls the whole filter area and may be hidden or compressed. `app.title-bar` reports unavailable on Web. A failed override package is rejected atomically; it is never partially applied. Disabling or uninstalling a plugin removes its style variables and `FontFace` registrations.

### Native views and slots

`ui:native-views` contributions use a fixed declarative schema and one of these slot IDs:

- `slot:roller.side-panel`
- `slot:roller.below-result`
- `slot:records.toolbar`

Unknown slots return `available: false`. HTML, scripts, expressions, `eval`, arbitrary host objects and non-semantic icons are rejected. Generic native views always show an unavoidable "由插件提供" source label and the plugin name. `VerifiedResult` is not a general view node: only the host injects the current verified `DrawReceipt` in the result presentation context.

### Authoritative draws and platform boundaries

Roller host draws and plugin-requested draws use the same Core Client transaction entry. On Web, the Core Worker owns the algorithm, serial transaction queue, statistics/history submission and `DrawReceipt` generation. On Tauri, Rust owns the authoritative draw, statistics, records and authenticated `CoreStateEnvelope`; the frontend Store and generic `storage_set` cannot write core data. Plugins receive a bound `Principal` and capability-scoped RPC only, never the Worker port, internal request IDs or Tauri grant tokens.

API 1.2 plugins remain valid without repackaging. Their legacy RPC path creates a `legacyPrincipal` and reaches the same authorization kernel, and their existing events, required `DrawReceipt` fields and Chinese error messages remain compatible. See [API 1.2 to 1.3 migration](./api-1.2-to-1.3.md) before declaring new 1.3 contributions.

Before publishing the SDK or a catalog entry, run `node --test scripts/plugin-api-1.4-release.test.mjs`. The regression intentionally keeps the frozen API 1.2 fixture bytes unchanged and verifies API 1.3 compatibility separately.
