// One small pink cursor that stays after the rebuild, following the pointer
// with a gentle lag. It lives outside the engine overlay, so it survives the
// automatic "Go live" fade.

import { createNativeCompanion } from "./native-companion.js";
import { arrowArtwork } from "./arrow.js";

const CSS = [
  ":host {",
  "  all: initial;",
  "  position: fixed;",
  "  left: 0;",
  "  top: 0;",
  "  z-index: 2147482000;",
  "  display: block;",
  "  pointer-events: none;",
  "  opacity: 1;",
  "  transition: opacity .7s ease;",
  "}",
  ".c {",
  "  position: absolute;",
  "  left: 0;",
  "  top: 0;",
  "  width: 27px;",
  "  height: 27px;",
  "  opacity: 0;",
  "  transform: translate3d(-100px, -100px, 0);",
  "  transition: opacity .6s ease;",
  "  filter: drop-shadow(0 1px 1px rgb(25 15 25 / 20%));",
  "}",
  ".c svg { width: 100%; height: 100%; display: block; overflow: visible; }",
  "@media (pointer: coarse) { :host { display: none; } }",
  "@media (prefers-reduced-motion: reduce) { :host { display: none; } }",
].join("\n");

const SVG = [
  '<svg viewBox="0 0 24 24" aria-hidden="true">',
  arrowArtwork("var(--c, #ff6ad9)"),
  "</svg>",
].join("");

export function createCompanion(options) {
  const opts = options || {};
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  if (opts.mode === "replace") return createNativeCompanion(opts.color);

  const fine =
    !window.matchMedia || !window.matchMedia("(pointer: coarse)").matches;
  const reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) {
    return { el: null, show() {}, hide() {}, destroy() {}, setColor() {} };
  }

  const host = document.createElement("swarm-companion");
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
  wrap.className = "c";
  wrap.innerHTML = SVG;
  root.appendChild(wrap);

  const color = opts.color || "#ff6ad9";
  host.style.setProperty("--c", color);

  let x = window.innerWidth - 90;
  let y = window.innerHeight - 140;
  let tx = x;
  let ty = y;
  let raf = 0;
  let shown = false;
  let destroyed = false;

  function place(px, py) {
    tx = Math.max(4, Math.min(window.innerWidth - 30, px + 9));
    ty = Math.max(4, Math.min(window.innerHeight - 30, py + 12));
  }

  function onMove(event) {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    place(event.clientX, event.clientY);
  }

  function tick() {
    if (destroyed) return;
    const dx = tx - x;
    const dy = ty - y;
    x += dx * 0.14;
    y += dy * 0.14;
    if (Math.abs(dx) < 0.05) x = tx;
    if (Math.abs(dy) < 0.05) y = ty;
    wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function show() {
    if (destroyed || shown) return;
    shown = true;
    host.style.display = "block";
    host.style.opacity = "1";
    wrap.style.opacity = "1";
    start();
  }

  function hide() {
    if (destroyed) return;
    shown = false;
    host.style.opacity = "0";
    wrap.style.opacity = "0";
    stop();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("resize", onResize);
    host.remove();
  }

  function setColor(value) {
    if (!value) return;
    host.style.setProperty("--c", value);
  }

  function onResize() {
    place(tx, ty);
  }

  window.addEventListener("pointermove", onMove, { passive: true, capture: true });
  window.addEventListener("resize", onResize, { passive: true });

  wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  host.style.opacity = "0";
  host.style.display = "block";
  (document.body || document.documentElement).appendChild(host);

  return { el: host, show, hide, destroy, setColor };
}
