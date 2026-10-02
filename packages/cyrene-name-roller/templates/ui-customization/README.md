# Cyrene UI Customization

API 1.4 example using stable component IDs, bounded size, color, font size/weight and host font aliases, optional component hiding, native contribution selectors, all three declarative native view slots and all four host-bound result layouts.

The plugin declares identity in `manifest.yml` and every contribution in `contributions.json`; the host selectors live in the top-level `settings` block (never in `pages[].native`).

The three style packs cover navigation, roller, card, lottery and statistics targets. The override packs demonstrate `collapse`, `compact` and `reserve` semantics only on optional components. Protected and required targets remain visible.

The native views use host-approved nodes, semantic icons, read-only bindings and declared commands in `slot:roller.side-panel`, `slot:roller.below-result` and `slot:records.toolbar`. `show-statistics` reads a host snapshot, while `describe-host` discovers available resources and transactions.

The plugin never supplies winner names or result arrays. `draw-now` submits an intent to the host-owned draw transaction. The `single`, `list`, `grid` and `spotlight` presentations receive their verified result content from the host.

On Windows/Tauri, `desktop-check` calls the declared fixed `system.execute` operation. The same command is unavailable on Web and other platforms; no arbitrary program, arguments or network URL can be supplied by the plugin.
