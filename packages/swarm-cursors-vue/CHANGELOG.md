# Changelog

## 1.4.0

- Set `companionMode: "replace"` to use the themed, stemless arrow from entry
  into an enabled page, through the cover and drawing, and after the reveal.
  Text, controls, drag and resize cursors retain their native feedback. The
  default remains `"follow"`, which appears after the rebuild.
- Use a root CSS variable in the cursor palette to track app theme changes,
  including a stationary native arrow. Replacement is suspended on touch,
  for reduced motion and forced colors, and outside the page.

## 1.3.1

- Mark the main content area with `data-swarm-pageview` to center the cover
  logo, line and glow within its visible bounds during in-app navigation.
  Without a visible marker, the cover stays centered in the viewport. Layouts
  can omit the marker on mobile to keep their existing alignment.
- A Nuxt startup replacement of the same URL no longer restarts the initial
  build. Direct visits and reloads center the logo in the viewport and draw
  the Dock with the first page.

## 1.3.0

- On Vue Router navigation, keep the favicon cover until the new page starts
  drawing on its own background. A second navigation cancels the old capture.
  The overlay, favicon cover, and companion are excluded from capture.
- Mark shared navigation with `data-swarm-persist` to keep the real controls
  visible and clickable. Its entire subtree is omitted from route drawings;
  the first visit and a manual replay still draw the full page.
- Freeze the working cursors at completion and fade them in place. Preserve
  legible text in nested gradient headings.
- Include a Chinese integration guide for Vue Router and Nuxt projects.

## 1.2.0

- The bottom HUD is hidden by default. A page can enable it with
  `meta.swarmCursors: { hud: true }` (or the `hud` plugin option).
- Sound is disabled by default. Enable it per page or globally with
  `sound: true`.
- After the rebuild, the overlay fades out without the cursors flying away.
  One small companion cursor stays and follows the pointer.
- Route changes show a themed cover first, then capture the page behind it and
  rebuild. The visitor never sees the finished new page get erased.
- `captureDelay` gives dynamic content time to load behind the cover.
- Images inside a rounded, clipped wrapper (circular avatars) inherit the
  wrapper's radius, so the rebuilt avatar stays circular.

## 1.1.0

- Per-page configuration through `meta.swarmCursors` / `definePageMeta`.
- `setPageEnabled()` and `pageEnabled` state.
- Pink pill theme, `accentDark`, `danger` and a custom `colors` palette.

## 1.0.0

- Initial Vue 3 plugin: global pill, lazy engine chunk, auto start,
  router integration, SSR no-op and CSP-compatible styles.
