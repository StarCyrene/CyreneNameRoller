import { arrowArtwork } from "./arrow.js";

// Leave controls, selection and platform cursors to the browser. Only the
// element under a real mouse gets a cursor declaration, never the whole page.
const roles = "button link textbox checkbox combobox radio switch tab menuitem option slider spinbutton scrollbar".split(" ");
const controls = ["a[href],button,input,textarea,select,label,summary,iframe,object,embed,canvas,[controls],[contenteditable],[draggable=true],[disabled],[inert],[aria-disabled=true]",
  ...roles.map(role => `[role~="${role}"]`)].join(",");
let instance = 0;

function overText(el, x, y) {
  if (getComputedStyle(el).userSelect === "none") return false;
  const caret = document.caretPositionFromPoint?.(x, y) || document.caretRangeFromPoint?.(x, y);
  if (!caret) return !document.caretPositionFromPoint && !document.caretRangeFromPoint;
  const node = caret.offsetNode || caret.startContainer, i = caret.offset ?? caret.startOffset;
  if (node?.nodeType !== Node.TEXT_NODE || !el.contains(node)) return false;
  // A caret query snaps even across empty margins. Check the two adjoining
  // characters, not the paragraph or the entire document.
  const range = document.createRange();
  range.setStart(node, Math.max(0, i - 1));
  range.setEnd(node, Math.min(node.length, i + 1));
  return [...range.getClientRects()].some(r => r.left <= x && x < r.right && r.top <= y && y < r.bottom);
}

export function createNativeCompanion(color) {
  const marker = "data-swarm-arrow-" + (++instance);
  const probe = document.createElement("swarm-companion");
  probe.hidden = true;
  probe.style.setProperty("display", "none", "important");
  probe.style.color = color;
  document.documentElement.appendChild(probe);
  let sheet, fallback;
  try {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    sheet = null;
    fallback = document.createElement("style");
    document.head.appendChild(fallback);
  }
  const fine = matchMedia("(any-pointer: fine)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const contrast = matchMedia("(forced-colors: active)");
  const listeners = new AbortController();
  const on = (el, name, fn) => el.addEventListener(name, fn, { capture: true, passive: true, signal: listeners.signal });
  let active = false, target = null, point = null, frame = 0, lastColor, colorFrame = 0, outside = false;
  function reset() {
    target?.removeAttribute(marker);
    target = null;
    cancelAnimationFrame(colorFrame);
    colorFrame = 0;
  }
  function forget() {
    outside = true;
    point = null;
    cancelAnimationFrame(frame);
    frame = 0;
    reset();
  }
  function paintColor() {
    // An external SVG cannot inherit the document's CSS variables. Resolve
    // only this swatch while a dynamic cursor is in use, even if the mouse is
    // stationary. Never walk the DOM or re-encode an unchanged image here.
    const fill = getComputedStyle(probe).color;
    if (lastColor !== fill) {
      lastColor = fill;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24">${arrowArtwork(fill)}</svg>`;
      const css = `:where([${marker}]){cursor:url("data:image/svg+xml,${encodeURIComponent(svg)}") 5 3,auto}`;
      if (sheet) sheet.replaceSync(css);
      else fallback.textContent = css;
    }
    colorFrame = target && !/^#[\da-f]{3,8}$/i.test(color) ? requestAnimationFrame(paintColor) : 0;
  }
  function update() {
    frame = 0;
    if (!active || outside || !fine.matches || reduce.matches || contrast.matches ||
        document.hidden || document.pointerLockElement) { reset(); return; }
    // On installation or returning from a disabled route the mouse may be
    // perfectly still. Ask the browser for its existing hover chain instead
    // of inventing a position or waiting for the first pointermove.
    const hovered = !point && document.querySelectorAll(":hover");
    const el = point ? document.elementFromPoint(...point) : hovered[hovered.length - 1];
    // Remove our previous declaration before inspecting the site's inherited
    // cursor, including changes to it since the last movement.
    reset();
    if (!(el instanceof HTMLElement) || el.shadowRoot || el.localName.includes("-") || el.matches("[tabindex]") ||
        el.closest(controls) || getComputedStyle(el).cursor !== "auto") return;
    if (point ? point[0] >= document.documentElement.clientWidth || point[1] >= document.documentElement.clientHeight ||
        overText(el, ...point) : getComputedStyle(el).userSelect !== "none" &&
        [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && /\S/.test(n.data))) return;
    target = el;
    paintColor();
    el.setAttribute(marker, "");
  }
  function schedule() { if (active && !frame) frame = requestAnimationFrame(update); }
  function move(e) {
    if (e.pointerType !== "mouse" || e.buttons) { forget(); return; }
    outside = false;
    point = [e.clientX, e.clientY];
    schedule();
  }
  for (const event of ["pointerover", "pointermove", "pointerup"]) on(window, event, move);
  for (const event of ["pointerdown", "pointercancel", "dragstart", "blur"]) on(window, event, forget);
  on(window, "pointerout", e => { if (!e.relatedTarget || e.relatedTarget.localName === "iframe") forget(); });
  on(document, "visibilitychange", forget);
  on(document, "pointerlockchange", forget);
  on(window, "scroll", schedule);
  on(window, "resize", schedule);
  for (const media of [fine, reduce, contrast]) on(media, "change", () => {
    if (!fine.matches || reduce.matches || contrast.matches) reset();
    else schedule();
  });
  return {
    el: probe,
    show() { active = true; cancelAnimationFrame(frame); update(); schedule(); },
    hide() { active = false; cancelAnimationFrame(frame); frame = 0; reset(); },
    setColor(value) { color = value; probe.style.color = color; schedule(); },
    destroy() {
      active = false; forget(); listeners.abort(); probe.remove();
      if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet);
      else fallback.remove();
    },
  };
}
