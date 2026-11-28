// Shadow-DOM trigger pill. Kept outside Vue's render tree so site CSS can't
// touch it, and styled through adoptedStyleSheets so strict CSP still works.

const CSS = [
  ":host {",
  "  all: initial;",
  "  position: fixed;",
  "  z-index: 2147483000;",
  "  display: block;",
  "  color-scheme: dark;",
  "  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;",
  "  -webkit-font-smoothing: antialiased;",
  "}",
  ":host([data-position='bottom-right']) { right: 22px; bottom: 22px; }",
  ":host([data-position='bottom-left'])  { left: 22px; bottom: 22px; }",
  ":host([data-position='top-right'])    { right: 22px; top: 22px; }",
  ":host([data-position='top-left'])     { left: 22px; top: 22px; }",
  ":host([data-position='bottom-center']) { left: 50%; bottom: 22px; transform: translateX(-50%); }",
  "button {",
  "  all: unset;",
  "  box-sizing: border-box;",
  "  display: flex;",
  "  align-items: center;",
  "  gap: 11px;",
  "  max-width: calc(100vw - 28px);",
  "  padding: 8px 13px 8px 9px;",
  "  border-radius: 999px;",
  "  background: rgba(20, 20, 23, .93);",
  "  color: #fff;",
  "  cursor: pointer;",
  "  text-align: left;",
  "  white-space: nowrap;",
  "  box-shadow: 0 14px 34px rgba(0, 0, 0, .32), 0 2px 8px rgba(0, 0, 0, .2), inset 0 0 0 1px rgba(255, 255, 255, .12);",
  "  -webkit-backdrop-filter: blur(14px) saturate(1.2);",
  "  backdrop-filter: blur(14px) saturate(1.2);",
  "  transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, background .22s ease;",
  "  position: relative;",
  "  overflow: hidden;",
  "}",
  "button::after {",
  "  content: '';",
  "  position: absolute;",
  "  inset: 0;",
  "  background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,.16) 48%, transparent 70%);",
  "  transform: translateX(-120%);",
  "  transition: transform .5s ease;",
  "  pointer-events: none;",
  "}",
  "button:hover { transform: translateY(-2px); box-shadow: 0 18px 42px rgba(0,0,0,.4), 0 0 0 1px var(--swarm-accent), inset 0 0 0 1px rgba(255,255,255,.14); }",
  "button:hover::after { transform: translateX(120%); }",
  "button:active { transform: translateY(0) scale(.985); }",
  "button:focus-visible { outline: 2px solid var(--swarm-accent); outline-offset: 3px; }",
  "button[disabled] { cursor: progress; }",
  "button[data-state='error'] { box-shadow: 0 14px 34px rgba(0,0,0,.32), inset 0 0 0 1px rgba(242,72,34,.65); }",
  ".orb {",
  "  position: relative;",
  "  flex: 0 0 auto;",
  "  width: 30px; height: 30px;",
  "  border-radius: 50%;",
  "  display: grid; place-items: center;",
  "  background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.2), rgba(255,255,255,.045) 64%, rgba(255,255,255,.02));",
  "  box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 0 16px rgba(162,89,255,.16);",
  "  overflow: hidden;",
  "}",
  ".orb svg { width: 19px; height: 19px; display: block; overflow: visible; }",
  ".orb .c1 { fill: var(--swarm-c1, #F24E1E); stroke: #fff; stroke-width: 1.1; stroke-linejoin: round; }",
  ".orb .c2 { fill: var(--swarm-c2, #A259FF); stroke: #fff; stroke-width: 1.1; stroke-linejoin: round; opacity: .96; }",
  ".dot { position: absolute; width: 3px; height: 3px; border-radius: 50%; opacity: .9; }",
  ".d1 { background: var(--swarm-dot1, #1ABCFE); left: 5px; top: 6px; box-shadow: 0 0 5px var(--swarm-dot1, #1ABCFE); }",
  ".d2 { background: var(--swarm-dot2, #0ACF83); right: 5px; bottom: 6px; box-shadow: 0 0 5px var(--swarm-dot2, #0ACF83); }",
  ".copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }",
  ".label { display: block; font-size: 12.5px; font-weight: 650; letter-spacing: .01em; line-height: 1.25; color: #fff; overflow: hidden; text-overflow: ellipsis; }",
  ".sub { display: block; font-size: 10px; font-weight: 500; letter-spacing: .015em; line-height: 1.2; color: rgba(255,255,255,.55); overflow: hidden; text-overflow: ellipsis; }",
  ".action { flex: 0 0 auto; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,.08); margin-left: 1px; }",
  ".play { width: 9px; height: 9px; display: block; fill: #fff; transform: translateX(1px); }",
  ".spinner {",
  "  display: none;",
  "  width: 11px; height: 11px;",
  "  border-radius: 50%;",
  "  border: 1.6px solid rgba(255,255,255,.25);",
  "  border-top-color: #fff;",
  "  animation: swarm-spin .75s linear infinite;",
  "}",
  "button[data-state='loading'] .play { display: none; }",
  "button[data-state='loading'] .spinner { display: block; }",
  "button[data-state='loading'] .action { background: rgba(255,255,255,.13); }",
  "@keyframes swarm-spin { to { transform: rotate(360deg); } }",
  ":host([data-theme='light']) { color-scheme: light; }",
  ":host([data-theme='light']) button {",
  "  background: rgba(255,255,255,.96);",
  "  color: #16171b;",
  "  box-shadow: 0 14px 34px rgba(20,20,30,.16), 0 1px 3px rgba(20,20,30,.12), inset 0 0 0 1px rgba(20,20,30,.09);",
  "}",
  ":host([data-theme='light']) button:hover { box-shadow: 0 18px 42px rgba(20,20,30,.2), 0 0 0 1px var(--swarm-accent), inset 0 0 0 1px rgba(20,20,30,.1); }",
  ":host([data-theme='light']) .label { color: #16171b; }",
  ":host([data-theme='light']) .sub { color: rgba(22,23,27,.56); }",
  ":host([data-theme='light']) .action { background: rgba(20,20,30,.07); }",
  ":host([data-theme='light']) .play { fill: #16171b; }",
  ":host([data-theme='light']) .spinner { border-color: rgba(20,20,30,.2); border-top-color: #16171b; }",
  ":host([data-theme='pink']) { color-scheme: dark; }",
  ":host([data-theme='pink']) button {",
  "  background: linear-gradient(135deg, var(--swarm-accent, #ff6ad9), var(--swarm-accent-dark, #e055c0));",
  "  color: #fff;",
  "  box-shadow: 0 14px 34px rgba(255, 106, 217, .38), 0 2px 8px rgba(224, 85, 192, .24), inset 0 0 0 1px rgba(255, 255, 255, .24);",
  "  box-shadow: 0 14px 34px color-mix(in srgb, var(--swarm-accent, #ff6ad9) 38%, transparent), 0 2px 8px color-mix(in srgb, var(--swarm-accent-dark, #e055c0) 24%, transparent), inset 0 0 0 1px rgba(255, 255, 255, .24);",
  "}",
  ":host([data-theme='pink']) button:hover {",
  "  box-shadow: 0 18px 42px rgba(255, 106, 217, .48), 0 0 0 1px rgba(255, 255, 255, .55), inset 0 0 0 1px rgba(255, 255, 255, .26);",
  "  box-shadow: 0 18px 42px color-mix(in srgb, var(--swarm-accent, #ff6ad9) 48%, transparent), 0 0 0 1px rgba(255, 255, 255, .55), inset 0 0 0 1px rgba(255, 255, 255, .26);",
  "}",
  ":host([data-theme='pink']) .label { color: #fff; }",
  ":host([data-theme='pink']) .sub { color: rgba(255, 255, 255, .74); }",
  ":host([data-theme='pink']) .action { background: rgba(255, 255, 255, .18); }",
  ":host([data-theme='pink']) .orb {",
  "  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .34), 0 0 16px rgba(255, 255, 255, .24);",
  "}",
  ":host([data-theme='pink']) .orb .c1 { fill: #fff; stroke: #d9408f; }",
  ":host([data-theme='pink']) .orb .c2 { fill: #ffe0f0; stroke: #fff; }",
  ":host([data-theme='pink']) .d1 { background: #fff; box-shadow: 0 0 5px #fff; }",
  ":host([data-theme='pink']) .d2 { background: #ffe0f0; box-shadow: 0 0 5px #ffe0f0; }",
  "@media (max-width: 640px) {",
  "  :host([data-position='bottom-right']) { right: 12px; bottom: 12px; }",
  "  :host([data-position='bottom-left'])  { left: 12px; bottom: 12px; }",
  "  :host([data-position='top-right'])    { right: 12px; top: 12px; }",
  "  :host([data-position='top-left'])     { left: 12px; top: 12px; }",
  "  :host([data-position='bottom-center']) { bottom: 12px; }",
  "  button { padding: 7px 11px 7px 8px; gap: 9px; }",
  "  .sub { display: none; }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  button, button::after, .spinner { transition: none !important; animation: none !important; }",
  "}",
].join("\n");

import { ARROW } from "./arrow.js";

const HTML = [
  '<button type="button" part="button" data-state="idle">',
  '  <span class="orb" aria-hidden="true">',
  '    <svg viewBox="0 0 24 24">',
  `      <path class="c1" d="${ARROW}"/>`,
  `      <path class="c2" transform="translate(8 6) scale(.72)" d="${ARROW}"/>`,
  '    </svg>',
  '    <i class="dot d1"></i>',
  '    <i class="dot d2"></i>',
  '  </span>',
  '  <span class="copy">',
  '    <span class="label"></span>',
  '    <span class="sub"></span>',
  '  </span>',
  '  <span class="action" aria-hidden="true">',
  '    <svg class="play" viewBox="0 0 10 10"><path d="M2.2 1.1 8.8 5 2.2 8.9z"/></svg>',
  '    <span class="spinner"></span>',
  '  </span>',
  "</button>",
].join("\n");

export function createPill(options) {
  const opts = options || {};
  if (typeof document === "undefined") return null;

  const host = document.createElement("swarm-cursors");
  host.setAttribute("data-position", opts.position || "bottom-right");
  host.setAttribute("data-theme", opts.theme || "dark");
  if (opts.accent) host.style.setProperty("--swarm-accent", opts.accent);
  if (opts.accentDark) host.style.setProperty("--swarm-accent-dark", opts.accentDark);
  if (opts.zIndex != null) host.style.zIndex = String(opts.zIndex);

  const colors = Array.isArray(opts.colors) ? opts.colors : [];
  if (colors[0]) host.style.setProperty("--swarm-c1", colors[0]);
  if (colors[1]) host.style.setProperty("--swarm-c2", colors[1]);
  if (colors[2]) host.style.setProperty("--swarm-dot1", colors[2]);
  if (colors[3]) host.style.setProperty("--swarm-dot2", colors[3]);

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

  const wrap = document.createElement("div");
  wrap.innerHTML = HTML;
  root.appendChild(wrap.firstElementChild);

  const button = root.querySelector("button");
  const labelEl = root.querySelector(".label");
  const subEl = root.querySelector(".sub");

  function setCopy(label, sub) {
    labelEl.textContent = label || "";
    subEl.textContent = sub || "";
    button.setAttribute("aria-label", (label || "") + (sub ? " — " + sub : ""));
  }

  function setState(value) {
    button.dataset.state = value || "idle";
    button.disabled = value === "loading";
  }

  function show() {
    host.style.display = "block";
  }

  function hide() {
    host.style.display = "none";
  }

  function destroy() {
    host.remove();
  }

  setCopy(opts.label || "", opts.sublabel || "");
  button.addEventListener("click", function () {
    if (opts.onClick) opts.onClick();
  });

  const parent = document.body || document.documentElement;
  parent.appendChild(host);

  return { el: host, button, show, hide, setCopy, setState, destroy };
}
