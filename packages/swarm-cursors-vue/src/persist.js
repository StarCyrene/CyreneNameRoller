export const PERSIST_ATTRIBUTE = "data-swarm-persist";
const selector = "[" + PERSIST_ATTRIBUTE + "]";
const pageViewAttribute = "data-swarm-pageview";
const pageViewSelector = "[" + pageViewAttribute + "]";

// Subtract the union of the marked rectangles. Simply cutting an even/odd
// hole for each element would paint their intersection back in.
export function overlayClip(width, height, rectangles) {
  const holes = rectangles.map((r) => ({
    l: Math.max(0, r.left), r: Math.min(width, r.right),
    t: Math.max(0, r.top), b: Math.min(height, r.bottom),
  })).filter((h) => h.l < h.r && h.t < h.b);
  if (!holes.length) return "none";
  const edges = [...new Set([0, width, ...holes.flatMap((h) => [h.l, h.r])])].sort((a, b) => a - b);
  const visible = [];
  for (let i = 1; i < edges.length; i++) {
    const l = edges[i - 1], r = edges[i];
    const column = holes.filter((h) => h.l < r && h.r > l).sort((a, b) => a.t - b.t);
    let t = 0;
    for (const h of column) {
      if (t < h.t) visible.push({ l, r, t, b: h.t });
      t = Math.max(t, h.b);
    }
    if (t < height) visible.push({ l, r, t, b: height });
  }
  if (!visible.length) return "inset(50%)";
  if (visible.length === 1) {
    const { l, r, t, b } = visible[0];
    return `inset(${t}px ${width - r}px ${height - b}px ${l}px)`;
  }
  return 'path("' + visible.map(({ l, r, t, b }) => `M${l} ${t}H${r}V${b}H${l}Z`).join(" ") + '")';
}

function visibleRects(el, win) {
  if (win.getComputedStyle(el).visibility !== "visible") return [];
  const bounds = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  for (let p = el; p; p = p.parentElement) {
    const s = win.getComputedStyle(p);
    if (s.display === "none" || Number(s.opacity) === 0 || s.contentVisibility === "hidden") return [];
    if (p === el || (s.overflowX === "visible" && s.overflowY === "visible")) continue;
    const r = p.getBoundingClientRect();
    const sx = p.offsetWidth ? r.width / p.offsetWidth : 1;
    const sy = p.offsetHeight ? r.height / p.offsetHeight : 1;
    if (s.overflowX !== "visible") {
      const x = r.left + p.clientLeft * sx;
      bounds.left = Math.max(bounds.left, x);
      bounds.right = Math.min(bounds.right, x + p.clientWidth * sx);
    }
    if (s.overflowY !== "visible") {
      const y = r.top + p.clientTop * sy;
      bounds.top = Math.max(bounds.top, y);
      bounds.bottom = Math.min(bounds.bottom, y + p.clientHeight * sy);
    }
  }
  return Array.from(el.getClientRects(), (r) => ({
    left: Math.max(r.left, bounds.left), top: Math.max(r.top, bounds.top),
    right: Math.min(r.right, bounds.right), bottom: Math.min(r.bottom, bounds.bottom),
  }));
}

// Place the cover artwork inside the visible part of the marked page view.
// The opaque host stays full-size so the rest of the destination cannot flash.
function artworkInsets(views, win, width, height) {
  for (const el of views) {
    for (const rect of visibleRects(el, win)) {
      const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      const right = Math.min(width, rect.right), bottom = Math.min(height, rect.bottom);
      if (right > left && bottom > top) return `${top}px ${width - right}px ${height - bottom}px ${left}px`;
    }
  }
  return "0px";
}

// Measure before first paint, then follow layout (including Dock transitions)
// while the route cover or drawing surface is visible.
export function bindRouteLayout(host, artwork = null) {
  const doc = host.ownerDocument, win = doc.defaultView;
  let elements = [...doc.querySelectorAll(selector)];
  let views = artwork ? [...doc.querySelectorAll(pageViewSelector)] : [];
  const watched = artwork ? selector + "," + pageViewSelector : selector;
  let frame, previous, previousInsets;
  function update() {
    const w = doc.documentElement.clientWidth, h = win.innerHeight;
    const value = overlayClip(w, h, elements.flatMap((el) => visibleRects(el, win)));
    if (value !== previous) {
      host.style.setProperty("clip-path", value, "important");
      previous = value;
    }
    if (artwork) {
      const insets = artworkInsets(views, win, w, h);
      if (insets !== previousInsets) {
        artwork.style.inset = insets;
        previousInsets = insets;
      }
    }
    frame = elements.length || views.length ? win.requestAnimationFrame(update) : null;
  }
  const observer = new win.MutationObserver((records) => {
    // Edits inside the engine shadow tree are never observed here.
    if (!records.some((m) => m.type === "attributes" || [...m.addedNodes, ...m.removedNodes].some(
      (n) => n.nodeType === 1 && (n.matches(watched) || n.querySelector(watched))
    ))) return;
    elements = [...doc.querySelectorAll(selector)];
    if (artwork) views = [...doc.querySelectorAll(pageViewSelector)];
    win.cancelAnimationFrame(frame);
    update();
  });
  observer.observe(doc.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: artwork ? [PERSIST_ATTRIBUTE, pageViewAttribute] : [PERSIST_ATTRIBUTE],
  });
  update();
  return () => {
    win.cancelAnimationFrame(frame);
    observer.disconnect();
    host.style.removeProperty("clip-path");
    if (artwork) artwork.style.removeProperty("inset");
  };
}
