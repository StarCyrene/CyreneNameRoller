// A themed veil shown between a route change and the start of the rebuild.
// It hides the raw new page so the visitor never sees the finished page get
// erased; the engine captures the page behind it.

import { bindRouteLayout } from "./persist.js";

const CSS = [
  ":host {",
  "  all: initial;",
  "  position: fixed;",
  "  inset: 0;",
  "  z-index: 2147483647;",
  "  display: block;",
  "  pointer-events: none;",
  "  opacity: 0;",
  "  transition: none;",
  "  background-color: var(--swarm-cover-light, #fef7fb);",
  "}",
  "@media (prefers-color-scheme: dark) { :host(:not([data-scheme=light])) { background-color: var(--swarm-cover-dark, #1a0f16); } }",
  ":host([data-scheme=dark]) { background-color: var(--swarm-cover-dark, #1a0f16); }",
  ".artwork { position: absolute; inset: 0; }",
  ".glow {",
  "  position: absolute;",
  "  inset: 0;",
  "  background: radial-gradient(700px 460px at 50% 38%, rgba(255, 106, 217, .14), transparent 70%);",
  "  background: radial-gradient(ellipse 430px 310px at 50% 50%, color-mix(in srgb, var(--swarm-cover-accent, #ff6ad9) 8%, transparent), transparent 76%);",
  "}",
  ".logo {",
  "  position: absolute;",
  "  left: 50%;",
  "  top: 50%;",
  "  width: 64px;",
  "  height: 64px;",
  "  transform: translate(-50%, -50%);",
  "  filter: drop-shadow(0 8px 18px rgba(255, 106, 217, .22));",
  "  animation: cover-bob 2.2s ease-in-out infinite;",
  "}",
  ".logo img { width: 100%; height: 100%; display: block; object-fit: contain; border-radius: 16px; }",
  ".logo svg { width: 100%; height: 100%; display: block; color: var(--swarm-cover-accent, #ff6ad9); }",
  ".line {",
  "  position: absolute;",
  "  left: 50%;",
  "  top: calc(50% + 48px);",
  "  width: 64px;",
  "  height: 2px;",
  "  transform: translateX(-50%);",
  "  border-radius: 2px;",
  "  background: linear-gradient(90deg, transparent, var(--swarm-cover-accent, #ff6ad9), transparent);",
  "  opacity: .5;",
  "  animation: cover-line 1.8s ease-in-out infinite;",
  "}",
  "@keyframes cover-bob {",
  "  0%, 100% { transform: translate(-50%, -50%) translateY(0); }",
  "  50% { transform: translate(-50%, -50%) translateY(-5px); }",
  "}",
  "@keyframes cover-line {",
  "  0%, 100% { opacity: .25; transform: translateX(-50%) scaleX(.7); }",
  "  50% { opacity: .7; transform: translateX(-50%) scaleX(1); }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  .logo, .line { animation: none; }",
  "}",
].join("\n");

const HEART_SVG = [
  '<svg viewBox="0 0 24 24" aria-hidden="true">',
  '  <path fill="currentColor" d="M12 21.2s-8.4-5.3-8.4-11.2A4.7 4.7 0 0 1 12 7.1a4.7 4.7 0 0 1 8.4 2.9c0 5.9-8.4 11.2-8.4 11.2z"/>',
  "</svg>",
].join("");

export function createCover(options) {
  const opts = options || {};
  if (typeof document === "undefined") return null;

  const host = document.createElement("swarm-cover");
  const root = host.attachShadow({ mode: "open" });

  let sheet = null;
  try {
    if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in root) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
  } catch (_) {}
  if (!sheet) {
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
  }

  const glow = document.createElement("div");
  glow.className = "glow";
  const logo = document.createElement("div");
  logo.className = "logo";
  if (opts.logo) {
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.onerror = function () {
      logo.innerHTML = HEART_SVG;
    };
    img.src = opts.logo;
    logo.appendChild(img);
  } else {
    logo.innerHTML = HEART_SVG;
  }
  const line = document.createElement("div");
  line.className = "line";
  const artwork = document.createElement("div");
  artwork.className = "artwork";
  artwork.append(glow, logo, line);
  root.appendChild(artwork);

  let hideTimer = null;
  let destroyed = false;
  let releaseClip = null;

  host.style.setProperty("--swarm-cover-light", opts.color || "#fef7fb");
  host.style.setProperty("--swarm-cover-dark", opts.dark || "#1a0f16");
  host.style.setProperty("--swarm-cover-accent", opts.accent || "#ff6ad9");
  function colors() {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const theme = el.dataset.theme || el.dataset.colorMode;
      const mode = /^(dark|light)$/.test(theme) ? theme :
        el.classList.contains("dark") ? "dark" : el.classList.contains("light") ? "light" : null;
      if (mode) { host.dataset.scheme = mode; return; }
    }
    const declared = getComputedStyle(document.documentElement).colorScheme;
    if (declared === "light" || declared === "dark") host.dataset.scheme = declared;
    else host.removeAttribute("data-scheme"); // CSS follows the live OS preference.
  }
  const themeChanges = new MutationObserver(colors);

  function show(route = false) {
    if (destroyed) return;
    colors();
    for (const el of [document.documentElement, document.body]) {
      if (el) themeChanges.observe(el, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-mode"] });
    }
    clearTimeout(hideTimer);
    // Both overlays live at the document root. A new navigation must also
    // cover a previous rebuild that is still running or fading away.
    if (host !== document.documentElement.lastElementChild) document.documentElement.appendChild(host);
    if (route && !releaseClip) releaseClip = bindRouteLayout(host, artwork);
    if (!route && releaseClip) { releaseClip(); releaseClip = null; }
    host.style.transition = "none";
    host.style.display = "block";
    host.style.opacity = "1";
  }

  function hide(immediate = false) {
    if (destroyed) return;
    clearTimeout(hideTimer);
    host.style.transition = immediate ? "none" : "opacity .25s ease";
    host.style.opacity = "0";
    const finish = () => {
      themeChanges.disconnect();
      host.style.display = "none";
      if (releaseClip) { releaseClip(); releaseClip = null; }
    };
    if (immediate) finish();
    else hideTimer = setTimeout(finish, 280);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    themeChanges.disconnect();
    clearTimeout(hideTimer);
    if (releaseClip) releaseClip();
    host.remove();
  }

  host.style.display = "none";
  document.documentElement.appendChild(host);

  return { el: host, show, hide, destroy, colors };
}
