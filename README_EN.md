# Cyrene's Name Roller

A random name picker desktop app built with Vue 3 + Tauri, featuring Windows 11 Fluent Design.

## Views

<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101123_833" src="https://github.com/user-attachments/assets/f7fcb810-3cd0-4d8c-9a6b-69a1a7f7de4d" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100935_090" src="https://github.com/user-attachments/assets/57dc6aa5-8ea6-4a04-9ed1-29cfcc513c50" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100952_359" src="https://github.com/user-attachments/assets/d0bb484f-f474-42b5-b221-eccd35eca42c" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_100959_607" src="https://github.com/user-attachments/assets/39c997a5-a801-4a24-bc3b-e9c3b87cab33" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101005_678" src="https://github.com/user-attachments/assets/ea989841-1436-4170-9a3c-4e93fa23224b" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101012_407" src="https://github.com/user-attachments/assets/d012c58f-53a8-47c6-8411-6f31125f5fb0" />
<img width="1655" height="1021" alt="ScreenShot_2026-07-10_101018_167" src="https://github.com/user-attachments/assets/75edb038-89de-42bd-8913-0a65519eaa0b" />
<img width="1655" height="2380" alt="wechat_longscreenshot_2026-07-10_101035_521" src="https://github.com/user-attachments/assets/cbc33cb6-7e86-4c77-9c24-643aa2cc1302" />
<img width="2011" height="958" alt="ScreenShot_2026-07-10_101211_600" src="https://github.com/user-attachments/assets/dc43abf1-ac54-40b6-9833-859386070530" />

## Features

Open **Roller** in the Dock and use the selector at the bottom of the page to switch between eight tools. Existing Card bookmarks still work.

| Tool | What it does |
| --- | --- |
| Roller / Cards | Call one or more names, or turn over cards. Card trays are saved separately for each list. |
| Wheel | Spin for a single name; the pointer lands on the sector containing the drawn person. |
| Light Tunnel | Draw several distinct names at once and reveal them together or one by one. With motion off, names appear immediately. |
| Seat Spotlight | Use roster order immediately and skip anyone absent. Optionally paste and preview an Excel seating chart for projection. |
| Firefly Relay | Each handoff draws and records one person who has not yet held the light this round. |
| Petal Riddle | Guess a drawn name from clues, uncover letters, or reveal it at once. Guesses do not create additional records. |
| Constellations | Make temporary random teams that differ in size by at most one and copy the result. Saved groups and roll call records are unchanged. |

**Prize draws**

Roll prizes, spin a weighted wheel, open a Bloom Box, or scratch a ticket. Preview stock and the odds of the next draw. Draw one prize or a batch, then reveal the results without consuming stock again. Scratch tickets also have a keyboard-accessible reveal button.

**Random Name Roller**
- Single/multi-player mode, forbid duplicates (sampling without replacement)
- Balance algorithm: fewer picks = higher probability next round
- Rainbow name animation, English Mode

**Card Flip Mode**
- 3D card flip animation
- Quick multi-draw (auto shuffle + flip)
- Persistent card history, real-time list switching

**Data Management**
- Statistics: pick count, probability, balanced probability
- Extraction records: name, list, source, timestamp
- List manager: CRUD, batch delete (10s undo), import/export
- SHA-256 password protection

**QR Sync**
- In the desktop roster, select **Sync to phone** and choose the active people list, active prize list, or a full backup. The stream defaults to 10 FPS, supports 3–30 FPS, and repeats to recover missing frames.
- On Android or the mobile site over HTTPS, select **Scan to receive** and allow camera access. Lists are added and selected. A full backup requires the receiving device's data password and confirmation before replacing its data. No shared network is required.

**Personalization**
- UI scale (75%-200%), name font size adjustment
- Dark/Light mode, Chinese/English switch
- Additional languages (Beta): 日本語, 한국어, 繁體中文, Français, Deutsch, Español, Русский, Português, Italiano, Tiếng Việt
- Interface text is translated by Microsoft Edge; names, prizes and records are skipped and never sent. Translations are encrypted on this device and reused offline
- translate.js (MIT) is bundled with the application and verified by SHA-256; it is never loaded from a CDN

**Plugin System**
- Install, update, uninstall, enable, and disable `.cnrp` plugins from the built-in catalog or local files
- Plugins can contribute full Dock pages, host-native Fluent settings, animation packs, and Canvas/WebGL visual surfaces
- The same permission-based capability bridge works on Web and Tauri, with explicit fallback for unavailable platform operations
- Names, records, statistics, and CAF settings are exposed as read-only snapshots; new draw experiences use host-owned `draw.execute`
- The host selects every result and append-only commits statistics and history; plugins cannot choose winners or rewrite existing core data
- [Official plugin template, Fluent component gallery, and API documentation](https://github.com/Cyrene2008/CyreneNameRoller-Plugin-Template)

## Source Development

### Requirements

- Node.js 22
- Bun 1.3.14
- Rust stable
- [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/StarCyrene/CyreneNameRoller.git
cd CyreneNameRoller
bun install
bun run dev
```

Start the Tauri desktop client:

```bash
bun run tauri:dev
```

### Build

Build the Web version:

```bash
bun run build
```

Build the Tauri client:

```bash
bun run tauri:build
```

Desktop installers are written to `target/release/bundle/`.

With the Android SDK, NDK, JDK and Rust targets installed, build an Android 9+ test APK with:

```bash
bun run tauri android build --apk --debug
```

APK output is under `src-tauri/gen/android/app/build/outputs/apk/`. Use an updated Android System WebView for device testing.

## Tech Stack

Vue 3 + Vite + Tauri + Pinia + Vue Router + @iconify/vue (Fluent UI Icons)

## License

[GPL-3.0](LICENSE)
