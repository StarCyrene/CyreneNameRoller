# CyreneNameRoller Plugin SDK

The official developer package is `@starcyrene/cyrene-name-roller`. Import the public SDK through:

```js
import { definePlugin, PluginEvents } from '@starcyrene/cyrene-name-roller/plugin-sdk'
```

Create and package a plugin:

```bash
npx cnrp create ./my-plugin
npx cnrp validate ./my-plugin
npx cnrp pack ./my-plugin --out ./dist/my-plugin.cnrp
```

`npx cnrp create` scaffolds the split declaration: `manifest.yml` for identity, entry and permissions, plus `contributions.json` for pages, settings, commands and packs. Single-file `manifest.json` packages from earlier releases remain installable.

`.cnrp` means Cyrene NameRoller Plugin File. The application installs it from the independent Plugin Dock page or by drag and drop. A page normally appears under the Plugin section; plugins may explicitly contribute a top-level Dock page with `location: "dock"`. Plugin pages are never injected into Settings. Host-rendered plugin settings are declared in the top-level `settings` key of `contributions.json` and open from the plugin card.

See [Development Guide](./plugin-development.md) for the manifest, permissions, events, UI sandbox, dependencies, signatures and publication format.

The guide also defines the cross-platform bridge for browser and Tauri plugins. Optional native capabilities return structured unsupported results on Web, while required capabilities prevent activation until the user moves to a compatible host.

API 1.2 defines a composable extension kernel: capability discovery, read-only resource queries, host-owned transactions, arbitrary Dock pages, plugin-owned commands, host-run GSAP/WAAPI animations, semantic appearance packs and isolated Canvas/WebGL visual surfaces. These primitives provide large-feature freedom while keeping draw results, existing records, statistics and fairness parameters under host control.

The package is now API `1.4.0`. API 1.4 adds host-native component style/override/result selectors, binary override toggles and six precise Roller filter visibility targets on top of the constrained UI model introduced in API 1.3. These contributions are validated by the host and cannot alter authoritative names, results, statistics, records, errors or integrity state. Web draws run through the Core Worker; Tauri draws and core persistence run through the Rust authority transaction.

Existing API `1.2.0` and `1.3.0` plugins remain compatible and do not need to be repackaged. For the original contribution model, read [API 1.2 to 1.3](./api-1.2-to-1.3.md) and run the repository release regression before publishing.
