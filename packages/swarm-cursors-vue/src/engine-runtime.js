import { bindRouteLayout, PERSIST_ATTRIBUTE } from "./persist.js";
import { ARROW as ARROW_D, arrowArtwork } from "./arrow.js";

/*
 * divPointers — npm / Vue build
 *
 * Snapshots the current page into a blueprint (boxes, text blocks, media,
 * borders, repeated components), blanks the page, then lets a swarm of
 * cursors rebuild it on a canvas: crosshair-drawn rects, typed
 * text, pen-tool lines, ruler guides with snapping, alt-drag duplicates.
 *
 * Differences from the standalone extension engine:
 *   - never starts by itself; the Vue plugin calls window.__divPointers.start()
 *   - a second copy leaves the existing instance alone instead of toggling it
 *   - inline styles go through CSSOM / adoptedStyleSheets, so strict CSP works
 *
 * Sources: Joel Califa's Swarm → DhvanilPatel/swarm-cursors →
 * nitin7213/SWARM_DIVPOINTERS- → Cyrene2008's Vue adaptation.
 * The upstream browser engine has no stated general license. See NOTICE.md.
 */
(() => {
  "use strict";

  const KEY = "__divPointers";
  // The npm/Vue build never auto-starts: the host app decides when to run it.
  // If another copy is already on the page, leave that one alone.
  if (window[KEY]) return;

  // ---------------------------------------------------------------- constants

  // The Vue wrapper can pass a custom palette before this module is imported.
  const THEME = (typeof window !== "undefined" && window.__swarmCursorsTheme) || {};

  const NAMES = [
    "Ada", "Linus", "Grace", "Alan", "Margaret", "Ken", "Barbara", "Dennis",
    "Radia", "Guido", "Frances", "Bjarne", "Hedy", "Tim", "Katherine", "Edsger",
    "Joan", "Donald", "Sophie", "Niklaus", "Anita", "Brian", "Mary", "Rob",
    "Ida", "Yukihiro", "Shafi", "Leslie", "Jean", "Vint", "Lynn", "Bram",
  ];
  const COLORS = Array.isArray(THEME.colors) && THEME.colors.length
    ? THEME.colors
    : [
        "#F24E1E", "#A259FF", "#1ABCFE", "#0ACF83", "#FF7262", "#FFC700",
        "#9747FF", "#E8467C", "#14AE5C", "#0D99FF", "#FF8A00", "#00B5CE",
      ];
  const BLUE = THEME.accent || "#0D99FF";
  // One modifier combo, same on every platform - no Mac-vs-Windows label
  // branching needed. Earlier versions used Ctrl+Alt, but "Alt" is labeled
  // "Option" on a Mac keyboard (cosmetic) and, worse, holding it remaps the
  // character a Mac delivers for a given key (functional - see the e.code
  // comment below), so it needed per-platform text just to describe itself.
  // Ctrl and Shift are physical keys with the same name and the same
  // delivered e.code on every platform and OS, so one label does for both.
  // The letters themselves (L/V/S/H, not the more obvious C/R/M/H) were
  // picked to dodge Chrome's own reserved Ctrl+Shift+<letter> bindings:
  // Ctrl+Shift+C is "toggle inspect-element mode" (and Cmd+Shift+C the same
  // on Mac), Ctrl+Shift+R/Cmd+Shift+R is hard-reload, and Ctrl+Shift+M is
  // "browse as Guest" (Cmd+Shift+M too) - all genuine browser-level
  // shortcuts that win before a keydown ever reaches page JS, so matching
  // them here would just silently never fire. L, V, S and H have no browser
  // or DevTools binding on either platform.
  const MODLABEL = "Ctrl+Shift+";
  const RED = THEME.danger || "#F24822";
  // Cursor look: "solid" (flat fill, original) or "glow" (a soft halo of each
  // cursor's own color radiating outward, via a CSS drop-shadow filter — not a
  // change to the cursor artwork itself). Independent of, and much simpler
  // than, the old theme system. Persisted across replays/visits.
  let cursorStyle = (() => {
    try {
      return localStorage.getItem("__divPointersCursorStyle") === "glow" ? "glow" : "solid";
    } catch (_) {
      return "solid";
    }
  })();
  function setCursorStyle(v) {
    cursorStyle = v;
    try {
      localStorage.setItem("__divPointersCursorStyle", v);
    } catch (_) {}
  }
  // HUD position (dragged) and collapsed (hidden-to-a-nub) state, persisted
  // the same way as cursor style/format so a bar you moved or tucked away
  // stays that way on the next rebuild.
  function loadHudPos() {
    try {
      const p = JSON.parse(localStorage.getItem("__divPointersHudPos"));
      if (p && typeof p.x === "number" && typeof p.y === "number") return p;
    } catch (_) {}
    return null;
  }
  function saveHudPos(x, y) {
    try {
      localStorage.setItem("__divPointersHudPos", JSON.stringify({ x, y }));
    } catch (_) {}
  }
  let hudCollapsed = (() => {
    try {
      return localStorage.getItem("__divPointersHudCollapsed") === "1";
    } catch (_) {
      return false;
    }
  })();
  function setHudCollapsed(v) {
    hudCollapsed = v;
    try {
      localStorage.setItem("__divPointersHudCollapsed", v ? "1" : "0");
    } catch (_) {}
  }
  let hudVertical = (() => {
    try {
      return localStorage.getItem("__divPointersHudVertical") === "1";
    } catch (_) {
      return false;
    }
  })();
  function setHudVertical(v) {
    hudVertical = v;
    try {
      localStorage.setItem("__divPointersHudVertical", v ? "1" : "0");
    } catch (_) {}
  }
  // Recording container: "webm" (universal) or "mp4" when the browser's
  // MediaRecorder actually supports muxing it (Chrome 105+ on most
  // platforms). True .mov isn't something MediaRecorder can produce — that
  // needs a QuickTime muxer (e.g. ffmpeg.wasm), which is too heavy for an
  // extension with no backend — so the real choice on the web platform is
  // webm vs. mp4, and the HUD only offers mp4 when the browser can do it.
  let recordFormat = (() => {
    try {
      return localStorage.getItem("__divPointersRecordFormat") === "mp4" ? "mp4" : "webm";
    } catch (_) {
      return "webm";
    }
  })();
  function setRecordFormat(v) {
    recordFormat = v;
    try {
      localStorage.setItem("__divPointersRecordFormat", v);
    } catch (_) {}
  }
  const RULER = 20;
  const MIN_AGENTS = 8;
  const MAX_AGENTS = 48;
  const INTRO_AGENTS = 18;
  const MAX_ITEMS = 4000;
  const MAX_WORLD_H = 40000;
  const SVGNS = "http://www.w3.org/2000/svg";

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const bump = (it) => {
    it.v++;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const f1 = (n) => Math.round(n * 10) / 10;

  // True while the real page's own focus is on a real, editable field (an
  // input/textarea/select or a contenteditable element) that isn't part of
  // our own shadow UI. Letter shortcuts (C/R/M/Esc) must stay out of the way
  // whenever this is true, or typing a shortcut letter into a real form while
  // the rebuild plays would hijack the keystroke — for "r" that means firing
  // getDisplayMedia() (a real screen-share prompt) in the middle of someone's
  // typing, which is exactly the "can't write in textboxes" bug.
  function isRealFieldFocused(host) {
    const el = document.activeElement;
    if (!el || (host && host.contains(el))) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function alphaOf(c) {
    if (!c || c === "transparent") return 0;
    const slash = c.match(/\/\s*([\d.]+%?)\s*\)/);
    if (slash) return slash[1].endsWith("%") ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
    const m = c.match(/^rgba\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",");
      return p.length >= 4 ? parseFloat(p[3]) : 1;
    }
    return 1;
  }

  function intersect(a, b) {
    if (!a || !b) return null;
    const l = Math.max(a.l, b.l);
    const t = Math.max(a.t, b.t);
    const r = Math.min(a.r, b.r);
    const bt = Math.min(a.b, b.b);
    return r > l && bt > t ? { l, t, r, b: bt } : null;
  }

  const ltrb = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });

  // ----------------------------------------------------------- cursor shapes

  const HOT = {
    arrow: [4.5, 2.5],
    dup: [4.5, 2.5],
    pen: [3, 3],
    "pen-add": [3, 3],
    "pen-close": [3, 3],
    cross: [12, 12],
    ibeam: [12, 12],
    ew: [12, 12],
    ns: [12, 12],
  };

  function cursorSVG(shape, c) {
    const st = 'stroke="#fff" stroke-width="1.5" stroke-linejoin="round"';
    switch (shape) {
      case "arrow":
        return arrowArtwork(c);
      case "dup":
        return (
          `<path d="${ARROW_D}" transform="translate(4 3.5)" fill="#fff" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>` +
          arrowArtwork(c)
        );
      case "pen":
      case "pen-add":
      case "pen-close": {
        let s =
          `<path d="M17.4 10.6 L20.6 13.8 L13.8 20.6 L10.6 17.4 Z" fill="${c}" ${st}/>` +
          `<path d="M3 3 L13.1 6.3 L17.4 10.6 L10.6 17.4 L6.3 13.1 Z" fill="${c}" ${st}/>` +
          `<path d="M3.6 3.6 L8.9 8.9" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>` +
          `<circle cx="10.2" cy="10.2" r="1.75" fill="none" stroke="#fff" stroke-width="1.2"/>`;
        if (shape === "pen-add")
          s +=
            `<g stroke-linecap="round"><path d="M23 19.5 V26.5 M19.5 23 H26.5" stroke="#fff" stroke-width="3.4"/>` +
            `<path d="M23 19.5 V26.5 M19.5 23 H26.5" stroke="#1E1E1E" stroke-width="1.3"/></g>`;
        if (shape === "pen-close")
          s +=
            `<circle cx="23" cy="23" r="2.8" fill="none" stroke="#fff" stroke-width="3.2"/>` +
            `<circle cx="23" cy="23" r="2.8" fill="none" stroke="#1E1E1E" stroke-width="1.2"/>`;
        return s;
      }
      case "cross":
        return (
          `<g stroke-linecap="round"><path d="M12 3.5 V20.5 M3.5 12 H20.5" stroke="#fff" stroke-width="3.6"/>` +
          `<path d="M12 3.5 V20.5 M3.5 12 H20.5" stroke="${c}" stroke-width="1.5"/></g>`
        );
      case "ibeam": {
        const d =
          "M8.5 4.5 H10.5 Q12 4.5 12 6 Q12 4.5 13.5 4.5 H15.5 M12 6 V18 M8.5 19.5 H10.5 Q12 19.5 12 18 Q12 19.5 13.5 19.5 H15.5";
        return (
          `<g fill="none" stroke-linecap="round"><path d="${d}" stroke="#fff" stroke-width="3.6"/>` +
          `<path d="${d}" stroke="${c}" stroke-width="1.5"/></g>`
        );
      }
      case "ew":
      case "ns":
        return `<path d="M2.5 12 L7 7.5 V10.4 H17 V7.5 L21.5 12 L17 16.5 V13.6 H7 V16.5 Z"${
          shape === "ns" ? ' transform="rotate(90 12 12)"' : ""
        } fill="${c}" ${st}/>`;
    }
    return "";
  }

  const IMG_ICON =
    '<svg class="ph" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18 L10 13 L14 16 L17 13.5 L21 17"/></svg>';

  // ------------------------------------------------------------------ capture

  const OWN_HOSTS = new Set(["div-pointers", "swarm-cover", "swarm-companion", "swarm-cursors"]);
  const SKIP = new Set([
    "script", "style", "noscript", "template", "head", "meta", "link", "title",
    "base", "datalist", "area", "map", "source", "track", "param", ...OWN_HOSTS,
  ]);
  const DROP_IN_CLONE = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed", "link", "meta"]);
  const REPLACED = new Set(["img", "svg", "video", "canvas", "iframe", "embed", "object", "picture"]);
  const FORMS = new Set(["input", "textarea", "select"]);
  const ATOMIC = new Set(["img", "svg", "video", "canvas", "input", "select", "textarea", "iframe", "picture", "button"]);

  const TEXT_PROPS = [
    "color", "font-family", "font-size", "font-weight", "font-style", "font-variant",
    "font-stretch", "font-feature-settings", "font-variation-settings", "font-kerning",
    "font-optical-sizing", "line-height", "letter-spacing", "word-spacing",
    "text-transform", "text-align", "text-indent", "text-decoration-line",
    "text-decoration-color", "text-decoration-style", "text-decoration-thickness",
    "text-underline-offset", "text-shadow", "white-space", "white-space-collapse",
    "text-wrap-mode", "text-wrap-style", "direction", "overflow-wrap", "word-break",
    "hyphens", "tab-size", "-webkit-text-fill-color", "-webkit-text-stroke-width",
    "-webkit-text-stroke-color", "text-rendering", "-webkit-font-smoothing",
    "list-style-type", "list-style-position", "list-style-image", "writing-mode",
  ];
  const BOX_PROPS = [
    "display", "box-sizing", "width", "height", "min-width", "min-height", "max-width",
    "max-height", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "border-top-width",
    "border-right-width", "border-bottom-width", "border-left-width", "border-top-style",
    "border-right-style", "border-bottom-style", "border-left-style", "border-top-color",
    "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius",
    "border-bottom-left-radius", "background-color", "background-image",
    "background-size", "background-position", "background-repeat", "background-clip",
    "-webkit-background-clip", "box-shadow", "opacity", "vertical-align", "position",
    "top", "right", "bottom", "left", "flex-direction", "flex-wrap", "align-items",
    "justify-content", "gap", "flex-grow", "flex-shrink", "flex-basis", "align-self",
    "object-fit", "object-position", "overflow-x", "overflow-y", "text-overflow",
    "-webkit-line-clamp", "-webkit-box-orient", "visibility", "transform", "filter",
    "float", "fill", "stroke", "clip-path", "mix-blend-mode",
    "-webkit-mask-image", "-webkit-mask-size", "-webkit-mask-position", "-webkit-mask-repeat",
  ];
  const ELEM_PROPS = [...TEXT_PROPS, ...BOX_PROPS];
  const SVG_PROPS = [
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "fill-opacity",
    "stroke-opacity", "fill-rule", "clip-rule", "opacity", "color", "stop-color",
    "stop-opacity", "display", "visibility", "font-family", "font-size", "font-weight",
    "text-anchor", "dominant-baseline", "letter-spacing", "mix-blend-mode", "filter",
  ];
  const SVG_OUTER_PROPS = [
    "margin-top", "margin-right", "margin-bottom", "margin-left", "vertical-align", "display",
    "position", "top", "right", "bottom", "left", "transform", "transform-origin",
    "flex-shrink", "flex-grow", "align-self", "order", "overflow",
  ];
  const RECT_PROPS = [
    "background-color", "background-image", "background-size", "background-position",
    "background-repeat", "background-origin", "background-clip", "border-top-width",
    "border-right-width", "border-bottom-width", "border-left-width", "border-top-style",
    "border-right-style", "border-bottom-style", "border-left-style", "border-top-color",
    "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius",
    "border-bottom-left-radius", "box-shadow", "backdrop-filter", "filter", "clip-path",
    "-webkit-mask-image", "-webkit-mask-size", "-webkit-mask-position", "-webkit-mask-repeat",
  ];

  function styleString(cs, props) {
    let s = "";
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v !== "") s += `${p}:${v};`;
    }
    return s;
  }

  // Gradient text uses `-webkit-text-fill-color: transparent` + a clipped
  // background. The rebuild can't reproduce the clipped gradient, so fall
  // back to the theme accent instead of drawing invisible text.
  const TRANSPARENT_FILL = /^(transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;
  function textFillFallback(cs, css) {
    const fill = (cs.getPropertyValue("-webkit-text-fill-color") || "").trim();
    const color = (cs.getPropertyValue("color") || "").trim();
    if (TRANSPARENT_FILL.test(fill) || TRANSPARENT_FILL.test(color)) {
      const accent = THEME.accent || "#ff6ad9";
      css += `-webkit-text-fill-color:${accent};`;
      if (TRANSPARENT_FILL.test(color)) css += `color:${accent};`;
    }
    return css;
  }

  // Apply a style string through the CSSOM instead of a style attribute.
  // CSPs that set `style-src` can block setAttribute("style", ...), while
  // CSSOM writes are allowed, so the rebuild keeps working on protected sites.
  function setStyle(el, css) {
    if (!el) return;
    if (el.style) el.style.cssText = css || "";
    else el.setAttribute("style", css || "");
  }

  const lhPx = (cs) => {
    const v = parseFloat(cs.lineHeight);
    return isNaN(v) ? (parseFloat(cs.fontSize) || 16) * 1.2 : v;
  };

  function kidsOf(el) {
    if (el.shadowRoot) return [...el.shadowRoot.childNodes];
    if (el.localName === "slot") {
      const a = el.assignedNodes({ flatten: true });
      return a.length ? a : [...el.childNodes];
    }
    return [...el.childNodes];
  }

  // Copy one element's computed style onto its clone, fix up media sources.
  // ::before / ::after become real spans so icons, chevrons and separators survive.
  function pseudoClone(src, which) {
    const ps = getComputedStyle(src, which);
    const c = ps.content;
    if (!c || c === "none" || c === "normal" || ps.display === "none") return null;
    const sp = document.createElement("span");
    const str = c.match(/^"((?:[^"\\]|\\.)*)"/);
    if (str) sp.textContent = str[1].replace(/\\(.)/g, "$1");
    else if (/^url\(/.test(c)) {
      const u = c.match(/^url\(\s*["']?([^"')]+)["']?\s*\)/);
      if (u) {
        const im = document.createElement("img");
        im.src = u[1];
        setStyle(im, "display:inline-block;vertical-align:middle;");
        sp.appendChild(im);
      }
    }
    setStyle(sp, styleString(ps, ELEM_PROPS));
    return sp;
  }

  function addPseudos(src, dst) {
    const b = pseudoClone(src, "::before");
    if (b) dst.insertBefore(b, dst.firstChild);
    const a = pseudoClone(src, "::after");
    if (a) dst.appendChild(a);
  }

  function prepClone(src, dst) {
    const tag = src.localName;
    if (DROP_IN_CLONE.has(tag)) {
      dst.remove();
      return null;
    }
    const cs = getComputedStyle(src);
    if (cs.display === "none") {
      dst.remove();
      return null;
    }
    const isSvg = src instanceof SVGElement;
    let st = styleString(cs, isSvg ? SVG_PROPS : ELEM_PROPS);
    if (!isSvg && cs.backgroundClip.includes("text")) st = textFillFallback(cs, st);
    if (isSvg && tag === "svg" && !src.ownerSVGElement) {
      dst.setAttribute("width", src.clientWidth || src.getBoundingClientRect().width);
      dst.setAttribute("height", src.clientHeight || src.getBoundingClientRect().height);
      st += styleString(cs, SVG_OUTER_PROPS);
    }
    setStyle(dst, st);
    for (const a of [...dst.attributes]) {
      const n = a.name;
      if (n.startsWith("on") || n === "contenteditable" || n === "tabindex" || n === "autofocus" || n === "srcset" || n === "sizes" || n === "loading")
        dst.removeAttribute(n);
    }
    if (tag === "img") {
      dst.setAttribute("src", imgSrc(src));
      dst.setAttribute("decoding", "async");
    }
    if (tag === "svg") fixSvgRefs(src, dst);
    // Clones live in the page's document: custom elements would be upgraded by the
    // site's own JS (and often wipe their content), media would play. Swap in inert stand-ins.
    if (tag === "audio") {
      dst.remove();
      return null;
    }
    if (tag === "video" || tag === "canvas" || (!isSvg && tag.includes("-"))) {
      let rep;
      const vurl = tag === "video" ? videoUrl(src) : null;
      if (vurl) {
        rep = document.createElement("video");
        for (const [k, v] of [["src", vurl], ["muted", ""], ["playsinline", ""], ["preload", "auto"]]) rep.setAttribute(k, v);
        if (!src.paused || src.autoplay) rep.setAttribute("autoplay", "");
        if (src.loop || src.autoplay || !src.paused) rep.setAttribute("loop", "");
        if (src.poster) rep.setAttribute("poster", src.poster);
      } else if (tag === "video" || tag === "canvas") {
        let url = tag === "video" ? src.poster : canvasPixels(src);
        rep = document.createElement(url ? "img" : "span");
        if (url) rep.setAttribute("src", url);
        else st += "background:#1b1b1f;";
      } else {
        rep = document.createElement("span");
        while (dst.firstChild) rep.appendChild(dst.firstChild);
      }
      setStyle(rep, st);
      if (dst.parentNode) dst.replaceWith(rep);
      dst = rep;
    }
    if (!isSvg && !REPLACED.has(tag) && !FORMS.has(tag) && tag !== "img") addPseudos(src, dst);
    return dst;
  }

  // Clones are made in a document without a custom-element registry so the
  // site's component code never runs on them.
  let inertDoc = null;
  const inert = () => inertDoc || (inertDoc = document.implementation.createHTMLDocument(""));

  function cloneStyled(src) {
    const dst = inert().importNode(src, true);
    const a = [...src.querySelectorAll("*")];
    const b = [...dst.querySelectorAll("*")];
    const root = prepClone(src, dst) || document.createElement("span");
    for (let i = 0; i < a.length && i < b.length; i++) prepClone(a[i], b[i]);
    return root;
  }

  function cloneDescendantsStyled(src, dst) {
    const a = src.querySelectorAll("*");
    const b = dst.querySelectorAll("*");
    for (let i = 0; i < a.length && i < b.length; i++) prepClone(a[i], b[i]);
  }

  function imgSrc(img) {
    let s = img.currentSrc || img.src || "";
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    if (lazy && (!s || s.startsWith("data:") || !img.complete || !img.naturalWidth)) {
      try {
        s = new URL(lazy, location.href).href;
      } catch (_) {}
    }
    return s;
  }

  // Shadow trees can't see document-level <symbol>/<linearGradient> ids, so
  // inline anything the clone references.
  function fixSvgRefs(src, dst) {
    for (const u of dst.querySelectorAll("use")) {
      const href = u.getAttribute("href") || u.getAttribute("xlink:href");
      if (!href || href[0] !== "#") continue;
      const ref = document.getElementById(href.slice(1));
      if (!ref) continue;
      const isSym = ref.localName === "symbol";
      const g = document.createElementNS(SVGNS, isSym ? "svg" : "g");
      if (isSym) {
        for (const at of ["viewBox", "preserveAspectRatio"]) if (ref.getAttribute(at)) g.setAttribute(at, ref.getAttribute(at));
        g.setAttribute("width", u.getAttribute("width") || "100%");
        g.setAttribute("height", u.getAttribute("height") || "100%");
        g.setAttribute("x", u.getAttribute("x") || 0);
        g.setAttribute("y", u.getAttribute("y") || 0);
        g.setAttribute("overflow", "visible");
      } else if (u.getAttribute("x") || u.getAttribute("y")) {
        g.setAttribute("transform", `translate(${u.getAttribute("x") || 0} ${u.getAttribute("y") || 0})`);
      }
      const us = u.getAttribute("style");
      if (us) setStyle(g, us);
      for (const ch of ref.childNodes) {
        if (ch.nodeType !== 1) {
          g.appendChild(ch.cloneNode(true));
          continue;
        }
        g.appendChild(cloneStyled(ch));
      }
      u.replaceWith(g);
    }
    const html = dst.outerHTML;
    const ids = new Set();
    html.replace(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g, (_, id) => ids.add(id));
    if (!ids.size) return;
    let defs = null;
    for (const id of ids) {
      if (dst.querySelector(`[id="${CSS.escape(id)}"]`)) continue;
      const ref = document.getElementById(id);
      if (!ref) continue;
      if (!defs) {
        defs = document.createElementNS(SVGNS, "defs");
        dst.insertBefore(defs, dst.firstChild);
      }
      defs.appendChild(ref.cloneNode(true));
    }
  }

  // Pixels for things the DOM can't give back (WebGL canvases, playing video,
  // cross-origin iframes) come from a screenshot taken when the user clicked.
  function cropShot(shot, r) {
    if (!shot || !shot.valid) return null;
    if (r.height > innerHeight * 3 || r.width > innerWidth * 2) return null;
    const vis = intersect(ltrb(r), { l: 0, t: 0, r: innerWidth, b: innerHeight });
    if (!vis) return null;
    const k = shot.scale;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.width * k));
    c.height = Math.max(1, Math.round(r.height * k));
    const w = (vis.r - vis.l) * k;
    const h = (vis.b - vis.t) * k;
    c.getContext("2d").drawImage(shot.img, vis.l * k, vis.t * k, w, h, (vis.l - r.left) * k, (vis.t - r.top) * k, w, h);
    const full = vis.l <= r.left + 1 && vis.t <= r.top + 1 && vis.r >= r.right - 1 && vis.b >= r.bottom - 1;
    try {
      return c.toDataURL(full ? "image/jpeg" : "image/webp", 0.9);
    } catch (_) {
      return null;
    }
  }

  // A URL another <video> can play: the chosen source, a <source>, or a lazy-load data-src.
  // (blob:/MediaSource streams are tied to the original element and can't be reused.)
  function videoUrl(el) {
    const cands = [el.currentSrc, el.getAttribute("src"), el.getAttribute("data-src")];
    for (const s of el.querySelectorAll("source")) cands.push(s.getAttribute("src"), s.getAttribute("data-src"));
    for (const c of cands) {
      if (!c || /^(blob|mediasource):/i.test(c)) continue;
      try {
        return new URL(c, location.href).href;
      } catch (_) {}
    }
    return null;
  }

  function canvasPixels(el) {
    try {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 12;
      const g = probe.getContext("2d");
      g.drawImage(el, 0, 0, 12, 12);
      const d = g.getImageData(0, 0, 12, 12).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a > 0 ? el.toDataURL() : null;
    } catch (_) {
      return null;
    }
  }

  function boxyStyle(st) {
    if (alphaOf(st.backgroundColor) > 0.02) return true;
    if (st.backgroundImage && st.backgroundImage !== "none") return true;
    if (st.boxShadow && st.boxShadow !== "none") return true;
    for (const s of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(st["border" + s + "Width"]) > 0 && st["border" + s + "Style"] !== "none" && alphaOf(st["border" + s + "Color"]) > 0.02) return true;
    }
    return false;
  }

  function sameColor(a, b) {
    return (a || "").replace(/\s/g, "") === (b || "").replace(/\s/g, "");
  }

  function pageBackground() {
    const h = document.documentElement;
    const b = document.body;
    const hs = getComputedStyle(h);
    const bs = b ? getComputedStyle(b) : null;
    const pick = (cs) => ({
      color: cs.backgroundColor,
      image: cs.backgroundImage,
      size: cs.backgroundSize,
      position: cs.backgroundPosition,
      repeat: cs.backgroundRepeat,
    });
    if (alphaOf(hs.backgroundColor) > 0.01 || hs.backgroundImage !== "none") return { ...pick(hs), from: h };
    if (bs && (alphaOf(bs.backgroundColor) > 0.01 || bs.backgroundImage !== "none")) return { ...pick(bs), from: b };
    const dark = /dark/.test(hs.colorScheme) && matchMedia("(prefers-color-scheme: dark)").matches;
    return { color: dark ? "rgb(18, 18, 18)" : "rgb(255, 255, 255)", image: "none", from: null };
  }

  /**
   * Walk the live DOM and produce a blueprint the swarm can rebuild.
   * Items live in "world" coords (scroller content space) or, for fixed UI,
   * in screen coords on an "over"/"under" layer.
   */
  const unitScale = [1, 1];
  function createScaleReader(css) {
    const cache = new Map([[document.documentElement, unitScale]]);
    function scaleOf(el) {
      if (!el) return unitScale;
      if (cache.has(el)) return cache.get(el);
      const cs = css(el);
      let scale = scaleOf(el.assignedSlot || el.parentElement || el.getRootNode().host);
      if (scale && cs.display !== "contents" && (cs.display !== "inline" || REPLACED.has(el.localName) || FORMS.has(el.localName))) {
        if ((cs.rotate && cs.rotate !== "none") || cs.perspective !== "none") scale = null;
        if (scale && cs.transform !== "none") {
          const m = new DOMMatrixReadOnly(cs.transform);
          scale = m.is2D && m.a > 0 && m.d > 0 && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6
            ? [scale[0] * m.a, scale[1] * m.d] : null;
        }
        if (scale && cs.scale && cs.scale !== "none") {
          const [x, y = x, z = 1] = cs.scale.split(/\s+/).map(Number);
          scale = x > 0 && y > 0 && z === 1 ? [scale[0] * x, scale[1] * y] : null;
        }
      }
      cache.set(el, scale);
      return scale;
    }
    return scaleOf;
  }

  const screenBounds = () => ({ l: 0, t: 0, r: innerWidth, b: innerHeight });
  const worldBounds = (vp) => {
    const port = intersect(screenBounds(), { l: vp.ox, t: vp.oy, r: vp.ox + vp.vw, b: vp.oy + vp.vh });
    return port && {
      l: port.l - vp.ox + vp.sx, t: port.t - vp.oy + vp.sy,
      r: port.r - vp.ox + vp.sx, b: port.b - vp.oy + vp.sy,
    };
  };
  const boxBounds = (b) => ({ l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h });

  function captureModel(env, shot) {
    const { ox, oy, sx, sy, vw, vh } = env.geom();
    const docW = Math.max(env.scrollWidth(), vw);
    const docH = Math.min(Math.max(env.scrollHeight(), vh), MAX_WORLD_H);
    const items = [];
    const roots = [];
    let order = 0;
    const csCache = new Map();
    const css = (el) => {
      let c = csCache.get(el);
      if (!c) {
        c = getComputedStyle(el);
        csCache.set(el, c);
      }
      return c;
    };
    const inlineCache = new Map();
    const fullClip = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    const viewClip = screenBounds();
    const pageBg = env.pageBg;
    const floats = [];
    const bars = [];
    const anchors = [];
    let portKey = null;
    const html = document.documentElement;
    const body = document.body;
    const textScale = createScaleReader(el => css(el));
    // A text leaf normally clones its whole inline subtree. Descend through
    // marked branches to omit persistent UI and capture each live glyph separately.
    const separateBranches = new Set();
    const glyphAttribute = "data-swarm-glyph";
    const glyphSelector = "[" + glyphAttribute + "]";
    const selector = env.route ? glyphSelector + ",[" + PERSIST_ATTRIBUTE + "]" : glyphSelector;
    for (const el of document.querySelectorAll(selector)) {
      for (let p = el; p && !separateBranches.has(p); p = p.parentElement) separateBranches.add(p);
    }

    const conv = (r, layer) =>
      layer === "world"
        ? { x: r.left - ox + sx, y: r.top - oy + sy, w: r.width, h: r.height }
        : { x: r.left, y: r.top, w: r.width, h: r.height };
    const convClip = (c, layer) =>
      layer === "world" ? { l: c.l - ox + sx, t: c.t - oy + sy, r: c.r - ox + sx, b: c.b - oy + sy } : { ...c };
    const clipFor = (r, clip, layer) => {
      if (r.left >= clip.l - 0.5 && r.top >= clip.t - 0.5 && r.right <= clip.r + 0.5 && r.bottom <= clip.b + 0.5) return null;
      return convClip(clip, layer);
    };
    const inDoc = (b, layer) =>
      layer === "world"
        ? b.x + b.w > 0 && b.x < docW && b.y + b.h > 0 && b.y < docH
        : b.x + b.w > 0 && b.x < innerWidth && b.y + b.h > 0 && b.y < innerHeight;

    function add(it) {
      it.id = items.length;
      it.v = 1;
      it.rv = 0;
      it.vis = false;
      it.dx = 0;
      it.dy = 0;
      it.scale = 1;
      it.mode = "own";
      items.push(it);
      return it;
    }

    function allInline(el) {
      if (separateBranches.has(el)) return false;
      let v = inlineCache.get(el);
      if (v !== undefined) return v;
      v = !el.shadowRoot;
      if (v)
        for (const c of el.children) {
          const tag = c.localName;
          if (SKIP.has(tag) || tag === "br" || tag === "wbr") continue;
          if (c instanceof SVGElement) continue;
          const d = css(c).display;
          if (d === "none") continue;
          if (d === "inline") {
            if (!allInline(c)) {
              v = false;
              break;
            }
          } else if (!d.startsWith("inline")) {
            v = false;
            break;
          }
        }
      inlineCache.set(el, v);
      return v;
    }

    function rootStyle(cs, isRun) {
      let s = textFillFallback(cs, styleString(cs, TEXT_PROPS));
      if (isRun) return s + "display:block;padding:0;margin:0;box-sizing:border-box;width:100%;height:100%;position:relative;";
      const pad = (side) =>
        (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
      let d = cs.display;
      if (/flex/.test(d)) {
        d = "flex";
        s += styleString(cs, ["flex-direction", "flex-wrap", "align-items", "justify-content", "align-content", "row-gap", "column-gap"]);
      } else if (/grid/.test(d)) {
        d = "grid";
        s += styleString(cs, [
          "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-auto-columns",
          "grid-auto-rows", "align-items", "justify-items", "justify-content", "align-content",
          "row-gap", "column-gap",
        ]);
      } else if (d === "list-item" || d === "-webkit-box") {
        // keep
      } else d = "block";
      s += `display:${d};padding:${pad("top")}px ${pad("right")}px ${pad("bottom")}px ${pad("left")}px;`;
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.textOverflow === "ellipsis" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none")) {
        s += styleString(cs, ["overflow-x", "overflow-y", "text-overflow", "-webkit-line-clamp", "-webkit-box-orient"]);
      }
      return s + "margin:0;box-sizing:border-box;width:100%;height:100%;position:relative;";
    }

    function textItem(base, root, tb, cs, [scaleX, scaleY]) {
      const fs = parseFloat(cs.fontSize) || 16;
      const text = root.textContent.replace(/\s+/g, " ").trim();
      // The overlay is outside the original transform tree. Lay the clone out at
      // its original size inside the projected box, then project the whole clone.
      if (scaleX !== 1 || scaleY !== 1) {
        root.style.width = (100 / scaleX) + "%";
        root.style.height = (100 / scaleY) + "%";
        root.style.transformOrigin = "top left";
        root.style.transform = `scale(${scaleX},${scaleY})`;
      }
      return add({
        kind: "text",
        ...base,
        tb,
        full: root,
        fs: fs * scaleY,
        lh: lhPx(cs) * scaleY,
        align: cs.textAlign,
        text,
        sig: text,
      });
    }

    function emitLeaf(el, cs, r, ctx, key) {
      const scale = textScale(el) || unitScale;
      const [scaleX, scaleY] = scale;
      const root = document.createElement("div");
      setStyle(root, rootStyle(cs, false));
      const clone = inert().importNode(el, true);
      cloneDescendantsStyled(el, clone);
      while (clone.firstChild) root.appendChild(clone.firstChild);
      addPseudos(el, root);
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const tr = rg.getBoundingClientRect();
      // table cells center their content vertically; reproduce the offset
      if (cs.display === "table-cell" && tr.height) root.style.paddingTop = Math.max(0, tr.top - r.top) / scaleY + "px";
      // floats outside the leaf (figures, infoboxes) shape its line boxes: add invisible shims
      if (/^(block|list-item)$/.test(root.style.display)) {
        const n = (p, factor) => (parseFloat(cs.getPropertyValue(p)) || 0) * factor;
        const cl = r.left + n("border-left-width", scaleX) + n("padding-left", scaleX);
        const ct = r.top + n("border-top-width", scaleY) + n("padding-top", scaleY);
        const cr = r.right - n("border-right-width", scaleX) - n("padding-right", scaleX);
        for (const f of floats) {
          if (f.b <= r.top + 1 || f.t >= r.bottom - 1 || f.r <= r.left + 1 || f.l >= r.right - 1) continue;
          if (f.el.contains(el)) continue;
          const shim = document.createElement("div");
          const top = Math.max(0, f.t - ct);
          const w = f.side === "left" ? f.r - cl : cr - f.l;
          if (w <= 0) continue;
          setStyle(shim, `float:${f.side};clear:${f.side};width:${w / scaleX}px;height:${Math.max(0, f.b - Math.max(f.t, ct)) / scaleY}px;margin-top:${top / scaleY}px;`);
          root.insertBefore(shim, root.firstChild);
        }
      }
      const box = conv(r, ctx.layer);
      const tb = tr.width > 0 && tr.height > 0 ? conv(tr, ctx.layer) : { ...box };
      tb.x = clamp(tb.x, box.x - 4, box.x + box.w);
      tb.y = clamp(tb.y, box.y - 4, box.y + box.h);
      const it = textItem(
        { ...box, layer: ctx.layer, key, op: ctx.op, clip: clipFor(r, ctx.clip, ctx.layer), parentBox: ctx.boxItem, blend: cs.mixBlendMode !== "normal" ? cs.mixBlendMode : ctx.blend || "" },
        root,
        tb,
        cs,
        scale,
      );
      if (el.hasAttribute(glyphAttribute) && /^[0-9:]$/.test(it.text)) it.glyph = el;
    }

    function emitRun(el, cs, run, ctx) {
      const rg = document.createRange();
      rg.setStartBefore(run[0]);
      rg.setEndAfter(run[run.length - 1]);
      const r = rg.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (!intersect(ltrb(r), ctx.clip)) return;
      const root = document.createElement("div");
      setStyle(root, rootStyle(cs, true));
      const scale = textScale(el) || unitScale;
      const single = r.height < lhPx(cs) * scale[1] * 1.6;
      if (single) {
        root.style.whiteSpace = "nowrap";
        // This block starts at the source text range, not its line box.
        // Keep a plain one-line run centered in that range without adding
        // the original leading above it a second time.
        if (cs.writingMode === "horizontal-tb" && run.every((n) => n.nodeType === 3) && rg.getClientRects().length === 1) {
          root.style.lineHeight = r.height / scale[1] + "px";
        }
      }
      for (const n of run) {
        if (n.nodeType === 3) root.appendChild(document.createTextNode(n.data));
        else root.appendChild(cloneStyled(n));
      }
      const box = conv(r, ctx.layer);
      if (!inDoc(box, ctx.layer)) return;
      box.w += 1;
      textItem(
        { ...box, layer: ctx.layer, key: ctx.key(), op: ctx.op, clip: clipFor(r, ctx.clip, ctx.layer), parentBox: ctx.boxItem, blend: ctx.blend || "" },
        root,
        { ...box },
        cs,
        scale,
      );
    }

    function lineItem(pts, stroke, sw, dash, ctx, key) {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return add({
        kind: "line",
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        pts,
        stroke,
        sw,
        dash,
        placed: 0,
        shut: false,
        edit: false,
        owner: null,
        layer: ctx.layer,
        key,
        op: ctx.op,
        clip: null,
        parentBox: ctx.boxItem,
        sig: pts.length + stroke,
      });
    }

    function emitBox(el, cs, r, ctx, key, forceRect) {
      if (el === html) return null;
      const tag = el.localName;
      const bgc = cs.backgroundColor;
      const bgi = cs.backgroundImage;
      const bgVisible = (alphaOf(bgc) > 0.01 && !sameColor(bgc, pageBg.color)) || bgi !== "none";
      if (el === body && pageBg.from === body) return null;
      const sides = ["top", "right", "bottom", "left"].map((s) => {
        const w = parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0;
        const st = cs.getPropertyValue(`border-${s}-style`);
        const c = cs.getPropertyValue(`border-${s}-color`);
        return w > 0 && st !== "none" && st !== "hidden" && alphaOf(c) > 0.02 ? { s, w, st, c } : null;
      });
      const nb = sides.filter(Boolean).length;
      const shadow = cs.boxShadow && cs.boxShadow !== "none";
      const backdrop = cs.backdropFilter && cs.backdropFilter !== "none";
      const b = conv(r, ctx.layer);
      if (tag === "hr") {
        const c = sides[0] ? sides[0].c : alphaOf(bgc) > 0.01 ? bgc : "rgb(200,200,200)";
        const y = b.y + b.h / 2;
        lineItem([{ x: b.x, y }, { x: b.x + b.w, y }], c, Math.max(1, Math.min(b.h, 2)), null, ctx, key);
        return null;
      }
      const sameAsPage = alphaOf(bgc) > 0.01 && sameColor(bgc, pageBg.color) && bgi === "none";
      if (!forceRect && !bgVisible && !shadow && !backdrop) {
        if (nb === 0) return null;
        if (nb < 4) {
          for (const sd of sides) {
            if (!sd) continue;
            const hw = sd.w / 2;
            let pts;
            if (sd.s === "top") pts = [{ x: b.x, y: b.y + hw }, { x: b.x + b.w, y: b.y + hw }];
            else if (sd.s === "bottom") pts = [{ x: b.x, y: b.y + b.h - hw }, { x: b.x + b.w, y: b.y + b.h - hw }];
            else if (sd.s === "left") pts = [{ x: b.x + hw, y: b.y }, { x: b.x + hw, y: b.y + b.h }];
            else pts = [{ x: b.x + b.w - hw, y: b.y }, { x: b.x + b.w - hw, y: b.y + b.h }];
            const dash = sd.st === "dashed" ? `${sd.w * 3} ${sd.w * 2}` : sd.st === "dotted" ? `${sd.w} ${sd.w * 1.5}` : null;
            lineItem(pts, sd.c, sd.w, dash, ctx, key);
          }
          return null;
        }
      }
      if (sameAsPage && nb === 0 && !shadow && !backdrop && !forceRect) return null;
      const cssText = styleString(cs, RECT_PROPS);
      return add({
        kind: "rect",
        blend: cs.mixBlendMode !== "normal" ? cs.mixBlendMode : ctx.blend || "",
        big: b.w * b.h > vw * vh * 0.4,
        ...b,
        css: cssText,
        radius: cs.borderRadius,
        draw: null,
        styled: false,
        layer: ctx.layer,
        key,
        op: ctx.op,
        clip: clipFor(r, ctx.clip, ctx.layer),
        parentBox: ctx.boxItem,
        sig: cssText,
      });
    }

    // Decorative ::before/::after on containers (overlays, glows, standalone icons).
    // Their boxes aren't exposed, so derive them from the host box and the pseudo's insets.
    const PSEUDO_EL = { localName: "pseudo" };
    function emitPseudoBox(el, cs, r, ctx, which, empty) {
      const ps = getComputedStyle(el, which);
      const c = ps.content;
      if (!c || c === "none" || c === "normal" || ps.display === "none" || ps.visibility !== "visible") return;
      const pop = parseFloat(ps.opacity);
      if (!(pop > 0.03)) return;
      const n = (v) => parseFloat(v) || 0;
      const w = parseFloat(ps.width);
      const h = parseFloat(ps.height);
      if (!(w > 0 && h > 0)) return;
      const pad = {
        l: r.left + n(cs.borderLeftWidth), t: r.top + n(cs.borderTopWidth),
        r: r.right - n(cs.borderRightWidth), b: r.bottom - n(cs.borderBottomWidth),
      };
      let L;
      let T;
      if (ps.position === "absolute") {
        if (cs.position === "static") return; // containing block is some other ancestor
        const bw = w + n(ps.paddingLeft) + n(ps.paddingRight) + n(ps.borderLeftWidth) + n(ps.borderRightWidth);
        const bh = h + n(ps.paddingTop) + n(ps.paddingBottom) + n(ps.borderTopWidth) + n(ps.borderBottomWidth);
        L = ps.left !== "auto" ? pad.l + n(ps.left) : ps.right !== "auto" ? pad.r - n(ps.right) - bw : pad.l;
        T = ps.top !== "auto" ? pad.t + n(ps.top) : ps.bottom !== "auto" ? pad.b - n(ps.bottom) - bh : pad.t;
        const m = ps.transform.match(/^matrix\(([^)]+)\)$/);
        if (m) {
          const k = m[1].split(",").map(Number);
          L += k[4];
          T += k[5];
        }
        const fake = { left: L, top: T, right: L + bw, bottom: T + bh, width: bw, height: bh };
        if (!intersect(ltrb(fake), ctx.clip)) return;
        emitBox(PSEUDO_EL, ps, fake, { ...ctx, op: ctx.op * pop }, ctx.key(), false);
      } else {
        const cl = pad.l + n(cs.paddingLeft);
        const ct = pad.t + n(cs.paddingTop);
        const cw = pad.r - n(cs.paddingRight) - cl;
        const ch = pad.b - n(cs.paddingBottom) - ct;
        const align = (ps.alignSelf !== "auto" ? ps.alignSelf : cs.alignItems) || "";
        const vAlign = () => (/center/.test(align) ? ct + (ch - h) / 2 : /end/.test(align) ? ct + ch - h : ct);
        if (empty) {
          // the only content of an icon-ish element: centre it in the content box
          L = cl + Math.max(0, (cw - w) / 2);
          T = ct + Math.max(0, (ch - h) / 2);
        } else if (/flex/.test(cs.display) && /^row/.test(cs.flexDirection)) {
          // icon before the first / after the last item of a flex row (chevrons, arrows)
          const kidsR = [...el.children]
            .filter((k) => css(k).display !== "none" && css(k).position !== "absolute" && css(k).position !== "fixed")
            .map((k) => k.getBoundingClientRect())
            .filter((k) => k.width || k.height);
          if (!kidsR.length) return;
          const gap = n(cs.columnGap);
          if (which === "::after") L = kidsR[kidsR.length - 1].right + gap + n(ps.marginLeft);
          else L = kidsR[0].left - gap - n(ps.marginRight) - w;
          T = vAlign();
        } else return;
        const fake = { left: L, top: T, right: L + w, bottom: T + h, width: w, height: h };
        if (!intersect(ltrb(fake), ctx.clip)) return;
        emitBox(PSEUDO_EL, ps, fake, { ...ctx, op: ctx.op * pop }, ctx.key(), false);
      }
    }

    function mediaFor(el, cs, r) {
      const tag = el.localName;
      const fit = `object-fit:${cs.objectFit};object-position:${cs.objectPosition};`;
      if (tag === "img") {
        const src = imgSrc(el);
        if (!src) return null;
        const m = document.createElement("img");
        m.src = src;
        m.decoding = "async";
        setStyle(m, fit + "display:block;");
        m.draggable = false;
        return { el: m, sig: src };
      }
      if (tag === "svg") {
        const m = cloneStyled(el);
        m.setAttribute("width", "100%");
        m.setAttribute("height", "100%");
        m.style.display = "block";
        m.style.overflow = "visible";
        m.style.margin = "0";
        m.style.position = "static";
        // the box we draw is the transformed bounding box; keep only a pure rotation/flip
        const mt = cs.transform.match(/^matrix\(([^)]+)\)$/);
        const k = mt ? mt[1].split(",").map(Number) : null;
        m.style.transform = k && Math.abs(Math.hypot(k[0], k[1]) - 1) < 0.02 && Math.abs(Math.hypot(k[2], k[3]) - 1) < 0.02 ? `matrix(${k[0]},${k[1]},${k[2]},${k[3]},0,0)` : "none";
        m.style.transformOrigin = "50% 50%";
        const h = m.outerHTML;
        return { el: m, sig: h.length + ":" + h.slice(0, 160) };
      }
      const imgOf = (src, extra) => {
        const m = document.createElement("img");
        m.src = src;
        setStyle(m, (extra || "") + "display:block;width:100%;height:100%;");
        m.draggable = false;
        return { el: m, sig: src.slice(0, 120) + src.length };
      };
      if (tag === "canvas" || tag === "iframe" || tag === "embed" || tag === "object") {
        const crop = cropShot(shot, r);
        if (crop) return imgOf(crop);
      }
      if (tag === "video") {
        // Cross-origin video can't be read back as pixels once it's off-screen, so
        // rebuild it as a real (muted) video in the state the original was in.
        const crop = cropShot(shot, r);
        const url = videoUrl(el);
        if (url) {
          const v = document.createElement("video");
          v.setAttribute("src", url);
          v.setAttribute("muted", "");
          v.setAttribute("playsinline", "");
          v.setAttribute("preload", "auto");
          if (el.loop || el.autoplay || !el.paused) v.setAttribute("loop", "");
          if (!el.paused || el.autoplay) v.setAttribute("data-play", "");
          if (el.crossOrigin) v.setAttribute("crossorigin", el.crossOrigin);
          if (el.currentTime > 0) v.setAttribute("data-t", String(el.currentTime));
          const poster = crop || el.poster;
          if (poster) v.setAttribute("poster", poster);
          setStyle(v, fit + "display:block;width:100%;height:100%;");
          return { el: v, sig: url };
        }
        if (crop) return imgOf(crop);
        let src = el.poster || "";
        if (!src && el.videoWidth) {
          try {
            const c = document.createElement("canvas");
            c.width = el.videoWidth;
            c.height = el.videoHeight;
            c.getContext("2d").drawImage(el, 0, 0);
            src = c.toDataURL("image/jpeg", 0.82);
          } catch (_) {}
        }
        if (src) {
          const m = document.createElement("img");
          m.src = src;
          setStyle(m, fit + "display:block;");
          return { el: m, sig: src.slice(0, 200) };
        }
        const d = document.createElement("div");
        setStyle(d, "background:#111;");
        return { el: d, sig: "video" };
      }
      if (tag === "canvas") {
        const src = canvasPixels(el);
        if (src) return imgOf(src);
        return null;
      }
      // iframe / embed / object
      const d = document.createElement("div");
      let host = "";
      try {
        host = new URL(el.src || el.data || "", location.href).hostname.replace(/^www\./, "");
      } catch (_) {}
      d.setAttribute(
        "style",
        "background:#F1F2F4;display:flex;align-items:center;justify-content:center;font:500 12px/1.2 system-ui,sans-serif;color:#8A8F98;letter-spacing:.01em;",
      );
      d.textContent = host || "embed";
      return { el: d, sig: "frame:" + host };
    }

    function emitMedia(el, cs, r, ctx, key) {
      let src = el;
      let scs = cs;
      if (el.localName === "picture") {
        src = el.querySelector("img");
        if (!src) return;
        scs = css(src);
      }
      const m = mediaFor(src, scs, r);
      if (!m) return;
      const b = conv(r, ctx.layer);
      const pb = ctx.boxItem;
      const inheritedRadius =
        pb && pb.overflowHidden && pb.radius && pb.radius !== "0px" && cs.borderRadius === "0px"
          ? pb.radius
          : "";
      add({
        kind: "image",
        ...b,
        blend: cs.mixBlendMode !== "normal" ? cs.mixBlendMode : ctx.blend || "",
        media: m.el,
        frame: styleString(cs, ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"]),
        radius: cs.borderRadius !== "0px" ? cs.borderRadius : inheritedRadius,
        shadow: cs.boxShadow !== "none" ? cs.boxShadow : "",
        bg: alphaOf(cs.backgroundColor) > 0.01 ? cs.backgroundColor : "",
        draw: null,
        styled: false,
        layer: ctx.layer,
        key,
        op: ctx.op,
        clip: clipFor(r, ctx.clip, ctx.layer),
        parentBox: ctx.boxItem,
        sig: m.sig,
      });
    }

    function emitForm(el, cs, r, ctx, key) {
      const tag = el.localName;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden") return;
      const b = conv(r, ctx.layer);
      if (tag === "input" && (type === "checkbox" || type === "radio")) {
        const accent = cs.accentColor && cs.accentColor !== "auto" ? cs.accentColor : "#0B6CFF";
        const s = document.createElementNS(SVGNS, "svg");
        s.setAttribute("viewBox", "0 0 16 16");
        s.setAttribute("width", "100%");
        s.setAttribute("height", "100%");
        const on = el.checked;
        s.innerHTML =
          type === "radio"
            ? `<circle cx="8" cy="8" r="7" fill="#fff" stroke="${on ? accent : "#767676"}" stroke-width="1.2"/>${on ? `<circle cx="8" cy="8" r="4" fill="${accent}"/>` : ""}`
            : `<rect x="1" y="1" width="14" height="14" rx="2.5" fill="${on ? accent : "#fff"}" stroke="${on ? accent : "#767676"}" stroke-width="1.2"/>${on ? '<path d="M4.2 8.3 L7 11 L12 5.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : ""}`;
        add({
          kind: "image", ...b, media: s, frame: "", radius: "0px", shadow: "", bg: "",
          draw: null, styled: false, layer: ctx.layer, key, op: ctx.op, clip: null,
          parentBox: ctx.boxItem, sig: type + on,
        });
        return;
      }
      const boxIt = emitBox(el, cs, r, ctx, key, false);
      let text = "";
      let ph = false;
      if (tag === "select") text = (el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].text) || "";
      else if (["submit", "button", "reset"].includes(type)) text = el.value || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
      else if (type === "password") text = "•".repeat((el.value || "").length);
      else if (["range", "color", "file", "image"].includes(type)) text = "";
      else text = el.value || "";
      if (!text && el.placeholder) {
        text = el.placeholder;
        ph = true;
      }
      if (!text.trim()) return;
      const root = document.createElement("div");
      const pad = (side) =>
        (parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
      const isButton = ["submit", "button", "reset"].includes(type);
      let st = styleString(cs, TEXT_PROPS);
      st += `padding:${pad("top")}px ${pad("right")}px ${pad("bottom")}px ${pad("left")}px;margin:0;box-sizing:border-box;width:100%;height:100%;overflow:hidden;`;
      st += tag === "textarea" ? "display:block;white-space:pre-wrap;" : `display:flex;align-items:center;white-space:pre;${isButton ? "justify-content:center;" : ""}`;
      if (ph) st += `color:${getComputedStyle(el, "::placeholder").color};-webkit-text-fill-color:currentColor;`;
      setStyle(root, st);
      root.textContent = text;
      textItem(
        { ...b, layer: ctx.layer, key: key + 0.5, op: ctx.op, clip: clipFor(r, ctx.clip, ctx.layer), parentBox: boxIt || ctx.boxItem },
        root,
        { ...b },
        cs,
        textScale(el) || unitScale,
      );
    }

    function walk(el, ctx, parent) {
      if (items.length >= MAX_ITEMS) return;
      const tag = el.localName;
      if (SKIP.has(tag) || el === env.host || (env.route && el.hasAttribute(PERSIST_ATTRIBUTE))) return;
      const cs = css(el);
      const disp = cs.display;
      if (disp === "none") return;
      if (disp === "contents") {
        // transparent wrapper (incl. <slot>): its loose text still renders, styled by it
        let run = [];
        const flushRun = () => {
          if (ctx.key && run.some((n) => /\S/.test(n.data))) emitRun(el, cs, run, ctx);
          run = [];
        };
        for (const c of kidsOf(el)) {
          if (c.nodeType === 3) run.push(c);
          else if (c.nodeType === 1) {
            flushRun();
            walk(c, ctx, parent);
          }
        }
        flushRun();
        return;
      }
      const op = ctx.op * parseFloat(cs.opacity);
      if (!(op > 0.03)) return;
      const r = el.getBoundingClientRect();
      // "visually hidden" accessibility text: 1px boxes, clip:rect(0 0 0 0), clip-path:inset(50%)
      // (html/body overflow belongs to the viewport, so a 0px-tall body clips nothing)
      const clipsSelf = el !== html && el !== body && el !== env.scroller && cs.overflowX !== "visible" && cs.overflowY !== "visible";
      if (clipsSelf && (r.width <= 2 || r.height <= 2)) return;
      if (cs.position === "absolute" && /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) return;
      if (/inset\(50%\)|circle\(0px/.test(cs.clipPath)) return;
      if (cs.float !== "none" && r.width > 1 && r.height > 1) {
        const [scaleX, scaleY] = textScale(el) || unitScale;
        const n = (p, factor) => (parseFloat(cs.getPropertyValue(p)) || 0) * factor;
        floats.push({ el, side: cs.float, l: r.left - n("margin-left", scaleX), t: r.top - n("margin-top", scaleY), r: r.right + n("margin-right", scaleX), b: r.bottom + n("margin-bottom", scaleY) });
      }
      let layer = ctx.layer;
      let clip = ctx.clip;
      let zTop = ctx.zTop;
      let posd = ctx.posd;
      const pos = cs.position;
      if (pos === "fixed" && layer !== "over") {
        layer = "over";
        clip = viewClip;
      } else if (pos === "sticky" && layer === "world") {
        // stuck (or sitting exactly where it would stick) at the top of its scroller
        const top = parseFloat(cs.top);
        const [, scaleY] = textScale(el) || unitScale;
        if (!isNaN(top) && Math.abs(r.top - oy - top * scaleY) < 2 && r.height < vh * 0.4) {
          layer = "over";
          clip = viewClip;
        }
      }
      // z-index counts for positioned boxes and for flex/grid items (even when static)
      const pe = el.parentElement;
      const flexItem = pos === "static" && pe && /flex|grid/.test(css(pe).display);
      if (pos !== "static" || flexItem) {
        if (cs.zIndex !== "auto") {
          if (zTop == null) zTop = parseInt(cs.zIndex, 10) || 0;
        } else if (pos !== "static") posd = true;
      }
      const keyFn = () => (zTop || 0) * 1e7 + (posd ? 5e6 : 0) + order++;
      if (layer === "over" && ctx.layer !== "over" && r.top <= 4 && r.width >= vw * 0.8 && r.height > 20 && r.height <= 200) {
        bars.push({ node: null, r, start: items.length, key: (zTop || 0) * 1e7 + (posd ? 5e6 : 0) + order - 0.5 });
      }
      const isScroller = !env.isRoot && el === env.scroller;
      const kidLayer = isScroller ? "world" : layer;
      const box = conv(r, layer);
      const visible = cs.visibility === "visible";
      const sized = r.width >= 1 && r.height >= 1;
      const emit = visible && sized && !!intersect(ltrb(r), clip) && inDoc(box, layer);

      const node = {
        el, tag, cls: (el.getAttribute && el.getAttribute("class")) || "", layer,
        start: items.length, end: items.length, kids: [], box,
      };
      (parent ? parent.kids : roots).push(node);
      if (emit && el !== html && el !== body && intersect(ltrb(r), viewClip)) anchors.push({ el, box, layer });

      if (REPLACED.has(tag) || FORMS.has(tag)) {
        if (emit) {
          if (FORMS.has(tag)) emitForm(el, cs, r, { ...ctx, layer, clip, op }, keyFn());
          else emitMedia(el, cs, r, { ...ctx, layer, clip, op }, keyFn());
        }
        node.end = items.length;
        return;
      }

      let boxItem = ctx.boxItem;
      if (emit) {
        const b = emitBox(el, cs, r, { ...ctx, layer, clip, op }, keyFn(), false);
        if (b) {
          b.overflowHidden =
            el !== html && el !== body && (cs.overflowX !== "visible" || cs.overflowY !== "visible");
          boxItem = b;
        }
      }

      let kidClip = clip;
      if (isScroller) {
        kidClip = fullClip;
        portKey = keyFn();
      }
      else if (el !== html && el !== body && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) {
        const [x, y] = textScale(el) || unitScale;
        const bl = (parseFloat(cs.borderLeftWidth) || 0) * x;
        const bt = (parseFloat(cs.borderTopWidth) || 0) * y;
        const br = (parseFloat(cs.borderRightWidth) || 0) * x;
        const bb = (parseFloat(cs.borderBottomWidth) || 0) * y;
        kidClip = intersect(clip, { l: r.left + bl, t: r.top + bt, r: r.right - br, b: r.bottom - bb });
        if (!kidClip) {
          node.end = items.length;
          return;
        }
      }
      const blend = cs.mixBlendMode !== "normal" ? cs.mixBlendMode : ctx.blend;
      const kctx = { op, layer: kidLayer, clip: kidClip, zTop, posd, boxItem, key: keyFn, blend };

      // Decide: one text leaf, or a mix of text runs and nested blocks.
      // Closed <details> and content-visibility:hidden still report real boxes for
      // content that isn't painted, so only the summary (or nothing) gets built.
      if (cs.contentVisibility === "hidden") {
        node.end = items.length;
        return;
      }
      let kids = kidsOf(el);
      if (tag === "details" && !el.open) {
        const sum = kids.find((n) => n.nodeType === 1 && n.localName === "summary");
        kids = sum ? [sum] : [];
      }
      const emptyEl = !kids.some((k) => (k.nodeType === 3 && /\S/.test(k.data)) || k.nodeType === 1);
      const pctx = { ...kctx, layer, clip };
      const directText = kids.some((n) => n.nodeType === 3 && /\S/.test(n.data));
      const kinds = [];
      let allRun = !el.shadowRoot;
      let anyText = directText;
      for (const n of kids) {
        if (n.nodeType === 3) {
          kinds.push(1);
          continue;
        }
        if (n.nodeType !== 1 || SKIP.has(n.localName)) {
          kinds.push(0);
          continue;
        }
        const d = css(n).display;
        if (d === "none") {
          kinds.push(0);
          continue;
        }
        let inl = false;
        const nt = n.localName;
        if (separateBranches.has(n) || n.shadowRoot || nt === "slot") inl = false;
        else if (nt === "br" || nt === "wbr") inl = true;
        else if (d === "inline") inl = allInline(n);
        else if (directText && d.startsWith("inline")) inl = true;
        if (inl && !anyText && /\S/.test(n.textContent)) anyText = true;
        kinds.push(inl ? 1 : 2);
        if (!inl) allRun = false;
      }

      if (allRun && anyText && !isScroller) {
        if (visible && sized && emit) emitLeaf(el, cs, r, { ...kctx, layer }, keyFn());
        node.end = items.length;
        return;
      }
      // (text leaves carry their pseudos inside the clone instead)
      if (emit && visible) emitPseudoBox(el, cs, r, pctx, "::before", emptyEl);
      const afterPseudo = () => {
        if (emit && visible) emitPseudoBox(el, cs, r, pctx, "::after", emptyEl);
      };

      let run = [];
      const flush = () => {
        if (!run.length) return;
        const hasText = run.some((n) => (n.nodeType === 3 ? /\S/.test(n.data) : /\S/.test(n.textContent)));
        if (hasText) {
          if (visible) emitRun(el, cs, run, kctx);
        } else {
          for (const n of run) if (n.nodeType === 1) walk(n, kctx, node);
        }
        run = [];
      };
      kids.forEach((n, i) => {
        if (kinds[i] === 1) run.push(n);
        else if (kinds[i] === 2) {
          flush();
          walk(n, kctx, node);
        }
      });
      flush();
      afterPseudo();
      node.end = items.length;
    }

    const rootLayer = env.isRoot ? "world" : "under";
    const rootClip = env.isRoot ? fullClip : viewClip;
    walk(html, { op: 1, layer: rootLayer, clip: rootClip, zTop: null, posd: false, boxItem: null }, null);

    // --------------------------------------------- repeated components (dup)
    const groups = [];
    const kindsSig = (n) => {
      let s = "";
      for (let i = n.start; i < n.end; i++) s += items[i].kind[0];
      return s;
    };
    const similar = (a, b, loose) =>
      a.w > 0 && b.w > 0 && a.h > 0 && b.h > 0 && a.h / b.h < 1.8 && b.h / a.h < 1.8 && (loose || (a.w / b.w < 1.6 && b.w / a.w < 1.6));
    function findGroups(node, inCopy) {
      if (inCopy) return;
      const buckets = new Map();
      for (const k of node.kids) {
        const n = k.end - k.start;
        if (n < 1 || n > 48) continue;
        if (items.slice(k.start, k.end).some((it) => it.glyph)) continue;
        // long single paragraphs read better typed than duplicated
        if (n === 1 && items[k.start].kind === "text" && items[k.start].text.length > 40) continue;
        const sig = `${k.tag}|${k.cls}|${k.layer}|${kindsSig(k)}`;
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig).push(k);
      }
      const copies = new Set();
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const m = list[0];
        const loose = m.end - m.start === 1 && items[m.start].kind === "text";
        const members = list.filter((k) => similar(k.box, m.box, loose));
        if (members.length < 2) continue;
        const g = { id: groups.length, master: members[0], copies: members.slice(1) };
        groups.push(g);
        for (const c of g.copies) copies.add(c);
      }
      for (const k of node.kids) findGroups(k, copies.has(k));
    }
    for (const r of roots) findGroups(r, false);

    for (const g of groups) {
      for (const c of g.copies) {
        for (let i = c.start; i < c.end; i++) {
          const it = items[i];
          if (it.copyOf) continue;
          it.copyOf = items[g.master.start + (i - c.start)];
          it.group = g;
        }
      }
    }

    const twinKey = new Map();
    for (const it of items) {
      if (it.kind !== "text" || it.copyOf || it.glyph || !it.text) continue;
      const k = `${it.layer}|${Math.round(it.tb.x / 4)}|${Math.round(it.tb.y / 4)}|${it.text}`;
      const m = twinKey.get(k);
      if (m) it.twinOf = m;
      else twinKey.set(k, it);
    }

    // ------------------------------------------------------------- tasks
    const tasks = [];
    const mk = (y, spec, deps, layer) => {
      const t = { id: tasks.length, y, spec, deps, state: "wait", doneAt: 0, layer };
      tasks.push(t);
      return t;
    };
    const KIND_TASK = { rect: "rect", image: "image", text: "text", line: "line" };
    for (const it of items) {
      if (it.copyOf) continue;
      if (it.twinOf) {
        it.final = it.twinOf.final;
        continue;
      }
      const deps = it.parentBox && it.parentBox.final ? it.parentBox.final : [];
      const y = it.kind === "text" ? it.tb.y : it.y;
      it.task = mk(y, { type: KIND_TASK[it.kind], it }, deps, it.layer);
      it.final = [it.task];
    }
    // inner groups first so outer copies can wait for them
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      const mItems = items.slice(g.master.start, g.master.end);
      const masterFinals = [];
      for (const it of mItems) if (it.final) masterFinals.push(...it.final);
      if (g.master.start < g.master.end && items[g.master.start].parentBox && items[g.master.start].parentBox.final)
        masterFinals.push(...items[g.master.start].parentBox.final);
      g.src = { items: mItems, box: g.master.box };
      g.dst = g.copies.map((c, k) => {
        const its = items.slice(c.start, c.end).filter((it) => it.group === g);
        const minY = Math.min(...its.map((it) => (it.kind === "text" ? it.tb.y : it.y)));
        const task = mk(minY, { type: "dup", g, k }, masterFinals, c.layer);
        for (const it of its) {
          it.dupTask = task;
          it.final = [task];
          const m = it.copyOf;
          let type = null;
          if (it.kind === "text" && it.sig !== m.sig) type = "edit";
          else if (it.kind === "image" && it.sig !== m.sig) type = "swap";
          else if (it.kind === "rect" && it.sig !== m.sig) type = "restyle";
          if (type) {
            it.editTask = mk(it.kind === "text" ? it.tb.y : it.y, { type, it }, [task], it.layer);
            it.final = [task, it.editTask];
          }
        }
        return { items: its, box: c.box, task };
      });
    }

    // -------------------------------------------------- guides & snapping
    const guides = [];
    const texts = items.filter((it) => it.kind === "text" && it.task && it.layer === "world" && it.fs >= 13 && it.tb.w > 30);
    const BAND = 900;
    const bands = new Map();
    for (const it of texts) {
      const k = Math.floor(it.tb.y / BAND);
      if (!bands.has(k)) bands.set(k, []);
      bands.get(k).push(it);
    }
    for (const [, list] of [...bands.entries()].sort((a, b) => a[0] - b[0])) {
      if (guides.length >= 16) break;
      const byX = new Map();
      for (const it of list) {
        const x = Math.round(it.tb.x);
        if (!byX.has(x)) byX.set(x, []);
        byX.get(x).push(it);
      }
      let best = null;
      for (const [x, l] of byX) if (l.length >= 3 && (!best || l.length > best[1].length)) best = [x, l];
      if (best) {
        const top = Math.min(...best[1].map((m) => m.tb.y));
        const members = best[1].filter((m) => m.tb.y < top + 450).sort((a, b) => b.fs - a.fs).slice(0, 2);
        const g = { axis: "x", pos: best[0], cur: best[0], op: 1, flash: 0, dragging: false, vis: false };
        guides.push(g);
        const gy = Math.min(...members.map((m) => m.tb.y)) - 30;
        g.task = mk(gy, { type: "guide", g }, [], "world");
        g.deps = [];
        for (const m of members) {
          m.task.spec.snap = g;
          m.task.spec.snapDx = m.tb.x - best[0];
          g.deps.push(m.task);
        }
      }
      const byY = new Map();
      for (const it of list) {
        const y = Math.round(it.tb.y);
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push(it);
      }
      let row = null;
      for (const [y, l] of byY) if (l.length >= 3 && (!row || l.length > row[1].length)) row = [y, l];
      if (row) {
        const m = row[1].find((it) => !it.task.spec.snap);
        if (m) {
          const g = { axis: "y", pos: row[0], cur: row[0], op: 1, flash: 0, dragging: false, vis: false };
          guides.push(g);
          g.task = mk(row[0] - 30, { type: "guide", g }, [], "world");
          g.deps = [m.task];
          m.task.spec.snap = g;
        }
      }
    }
    for (const it of items) if (it.kind === "text" && it.task && it.fs >= 28 && it.tb.h < 400) it.task.spec.grow = true;
    // deps always have lower ids, so one reverse pass propagates the earliest need
    for (const t of tasks) t.gate = t.y;
    for (let i = tasks.length - 1; i >= 0; i--) for (const d of tasks[i].deps) if (tasks[i].gate < d.gate) d.gate = tasks[i].gate;

    // A sticky header that is transparent at the top of the page still needs
    // something behind it once content scrolls underneath (sites add it on scroll).
    const backdrops = [];
    if (pageBg.image === "none")
      for (const b of bars) {
        const area = b.r.width * b.r.height;
        const covered = items.some(
          (it) => it.id >= b.start && it.layer === "over" && it.kind === "rect" && it.w * it.h >= area * 0.85 && /rgba?\(/.test(it.css) && !/background-color:\s*rgba\([^)]*,\s*0(\.\d+)?\)/.test(it.css),
        );
        if (!covered) backdrops.push({ x: b.r.left, y: b.r.top, w: b.r.width, h: b.r.height, key: b.key, color: pageBg.color });
      }

    return { items, tasks, groups, guides, docW, docH, backdrops, portKey, anchors };
  }

  // -------------------------------------------------------------- text reveal

  function wsOf(n, root) {
    for (let e = n; e && e !== root.parentNode; e = e.parentNode) {
      const w = e.style && e.style.whiteSpace;
      if (w) return w;
    }
    return "normal";
  }

  function prepText(it) {
    const live = it.full.cloneNode(true);
    const units = [];
    let seq = "";
    const boxes = [];
    (function rec(n, box) {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3) {
          let s = c.data;
          const ws = wsOf(n, live);
          if (!/^pre|break-spaces/.test(ws)) s = s.replace(/[\t\n\r ]+/g, " ");
          if (!s.length) {
            c.remove();
            continue;
          }
          units.push({ t: c, s, len: s.length, box });
          seq += s;
        } else if (c.nodeType === 1) {
          // media, and empty styled boxes (mask icons, dots, swatches) appear in one keystroke
          if (ATOMIC.has(c.localName) || c instanceof SVGElement || (!/\S/.test(c.textContent) && c.style && boxyStyle(c.style))) {
            units.push({ e: c, len: 1, box, on: true });
            seq += "□";
          } else {
            const b = c.style && boxyStyle(c.style) ? c : box;
            if (b === c) boxes.push(c);
            rec(c, b);
          }
        }
      }
    })(live, null);
    for (const u of units) {
      if (u.t) u.t.data = "";
      else {
        u.e.style.visibility = "hidden";
        u.on = false;
      }
    }
    for (const b of boxes) {
      b.style.visibility = "hidden";
      b.__on = false;
    }
    it.live = live;
    it.units = units;
    it.seq = seq;
    it.total = seq.length;
    it.shown = 0;
    it.rshown = 0;
  }

  function reveal(it, n) {
    let left = n;
    let last = null;
    for (const u of it.units) {
      const k = left <= 0 ? 0 : left >= u.len ? u.len : left;
      left -= k;
      if (u.t) {
        const want = k === u.len ? u.s : u.s.slice(0, k);
        if (u.t.data !== want) u.t.data = want;
        if (k) last = u.t;
      } else {
        const on = k > 0;
        if (u.on !== on) {
          u.e.style.visibility = on ? "" : "hidden";
          u.on = on;
        }
        if (on) last = u.e;
      }
      if (k && u.box && u.box.__on === false) {
        for (let b = u.box; b && b !== it.live; b = b.parentNode)
          if (b.__on === false) {
            b.style.visibility = "";
            b.__on = true;
          }
      }
    }
    return last;
  }

  // ------------------------------------------------------------------ styles

  const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.bg{position:absolute;inset:0;opacity:0;transition:opacity .5s ease}
.bg.on{opacity:1}
.layer,.port{position:absolute;overflow:hidden;pointer-events:none}
.layer{inset:0}
.world{position:absolute;left:0;top:0;will-change:transform}
.it{position:absolute;left:0;top:0;transform-origin:0 0}
.it.settle{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.r{background-color:var(--ph,#D9D9D9);transition:background-color .22s ease,border-radius .22s ease}
.r.st{background-color:transparent}
.r>.f{position:absolute;inset:0;opacity:0;transition:opacity .22s ease,background-color .35s ease,border-radius .35s ease,box-shadow .35s ease,border-color .35s ease}
.r.st>.f{opacity:1}
.m{background-color:var(--ph,#D9D9D9);overflow:hidden}
.m>.ph{position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);opacity:.7;transition:opacity .2s}
.m>.md{position:absolute;inset:0;width:100%;height:100%;opacity:0;clip-path:inset(0 0 100% 0);transition:opacity .35s ease,clip-path .6s cubic-bezier(.2,.75,.2,1)}
.m.st{background-color:transparent;transition:background-color .3s ease .3s}
.m.st>.ph{opacity:0}
.m.st>.md{opacity:1;clip-path:inset(0 0 0 0)}
.m>.md.swap{animation:swap .45s ease}
@keyframes swap{from{opacity:0;filter:blur(6px)}}
.m>.fr{position:absolute;inset:0;pointer-events:none}
.l svg{position:absolute;left:0;top:0;overflow:visible}
.bd{position:absolute;opacity:0;-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);box-shadow:0 1px 0 rgba(0,0,0,.06);pointer-events:none}
.caret{display:inline-block;width:1.5px;height:1.1em;margin-left:1px;margin-right:-2.5px;vertical-align:text-bottom;background:currentColor;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.sa{background-color:rgba(13,153,255,.28)!important}
.ov{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.badges,.cursors{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.badge{position:absolute;transform:translate(-50%);padding:1px 4px;border-radius:2px;color:#fff;font:600 11px/16px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;font-variant-numeric:tabular-nums}
.cursor{position:absolute;left:0;top:0;will-change:transform}
.cursor svg{position:absolute;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.28));transition:filter .25s ease}
:host(.cur-glow) .cursor svg{filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.28)) drop-shadow(0 0 3px currentColor) drop-shadow(0 0 9px currentColor)}
.rulers{position:absolute;inset:0;pointer-events:none}
.ruler{position:absolute;background:#2c2c2c;pointer-events:none}
.ruler svg{display:block}
.ruler-top{top:0;left:0;right:0;height:20px;border-bottom:1px solid #3a3a3a}
.ruler-left{top:0;left:0;bottom:0;width:20px;border-right:1px solid #3a3a3a}
.ruler-corner{position:absolute;top:0;left:0;width:20px;height:20px;background:#2c2c2c}
.rtext{font:500 9px Inter,system-ui,-apple-system,sans-serif;fill:#8c8c8c}
.rsel{fill:#0d99ff}
.intro{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.intro.on{opacity:1;transform:translate(-50%,-50%)}
.intro.gone{opacity:0;transform:translate(-50%,-50%) scale(.9)}
.intro img{display:block;width:60px;height:60px;object-fit:contain;filter:none;opacity:.9;border-radius:14px}
.intro .mono{width:60px;height:60px;border-radius:16px;background:#D7DADE;color:#fff;font:700 30px/60px Inter,system-ui,sans-serif;text-align:center}
.intro .mono.heart{background:transparent;color:var(--intro-accent,#ff6ad9);display:grid;place-items:center;filter:drop-shadow(0 0 10px rgba(255,106,217,.35))}
.intro .mono.heart svg{width:44px;height:44px;display:block}
.hud{position:absolute;left:0;top:0;opacity:0;transform:translateY(14px);display:flex;align-items:center;gap:10px;padding:6px 6px 6px 10px;background:rgba(30,30,30,.94);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.07);font:500 12px/1 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto;transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);white-space:nowrap;user-select:none;z-index:5;cursor:grab}
.hud.on{opacity:1;transform:translateY(0)}
.hud.dragging{cursor:grabbing;transition:none}
.hud.collapsed{padding:6px;gap:0}
.hud.collapsed>*:not(.hidebar){display:none}
.hud button.hidebar{min-width:22px;text-align:center;padding:6px 7px;color:#aaa;display:flex;align-items:center;justify-content:center;cursor:pointer}
.hud button.hidebar svg{transition:transform .25s ease}
.hud.collapsed button.hidebar svg{transform:rotate(180deg)}
.hud .dots{display:flex;padding-left:5px}
.hud .dots i{display:block;width:18px;height:18px;margin-left:-5px;border-radius:50%;border:2px solid #1e1e1e;font:700 9px/14px Inter,system-ui,sans-serif;font-style:normal;text-align:center;color:#fff;transition:background .3s}
.hud .txt,.hud .status{display:flex;align-items:center;gap:7px;color:#cfcfcf;font-variant-numeric:tabular-nums}
.hud .txt b{color:#fff;font-weight:600}
.hud .sep{width:1px;height:12px;background:#444}
.hud .bar{width:64px;height:3px;border-radius:2px;background:#3a3a3a;overflow:hidden}
.hud .bar i{display:block;height:100%;width:0;background:#0D99FF;transition:width .35s ease}
.hud button{all:unset;cursor:pointer;padding:7px 10px;border-radius:8px;background:#2c2c2c;color:#fff;font:500 12px/1 Inter,system-ui,-apple-system,sans-serif;transition:background .15s}
.hud button:hover{background:#3a3a3a}
.hud button.pri{background:#0D99FF}
.hud button.pri:hover{background:#2aa6ff}
.hud button.on{background:rgba(13,153,255,.22);color:#8fd0ff}
.hud button[hidden]{display:none}
.hud .x{padding:7px 9px;color:#aaa}
.hud button.snd{display:flex;align-items:center;gap:6px;padding:6px 8px}
.hud button.snd.off{color:#8a8a8a}
.hud button.snd.tap{background:#0D99FF;animation:hudpulse 1.6s ease-in-out infinite}
.hud .rec-group{display:flex;align-items:stretch;border-radius:8px;overflow:hidden;background:#2c2c2c}
.hud .rec-group button{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;color:#fff;font:500 12px/1 Inter,system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;transition:background .15s}
.hud .rec-group button:hover{background:#3a3a3a}
.hud .rec-group button.fmt{font-size:11px;box-shadow:-1px 0 0 rgba(255,255,255,.12);justify-content:center;width:38px;flex:none}
.hud .rec-group button.rec.on{background:#e0263f;animation:recpulse 1.3s ease-in-out infinite}
.hud .rec-group button.rec.busy{opacity:.55;cursor:default}
.hud button.curstyle{min-width:24px;text-align:center;display:flex;align-items:center;justify-content:center}
.hud button.orient{min-width:24px;text-align:center;padding:7px 8px;color:#aaa;display:flex;align-items:center;justify-content:center}
.hud button.orient svg{transition:transform .2s ease}
.hud button.help{min-width:24px;text-align:center;padding:7px 9px;color:#aaa;display:flex;align-items:center;justify-content:center}
@keyframes hudpulse{50%{box-shadow:0 0 0 4px rgba(13,153,255,.28)}}
/* Vertical layout: same bar, turned into a column - kept just as slim as the
   horizontal bar is short. The one thing that doesn't fit a slim column on
   its own is .status: its text ("23 agents • 1,204 / 5,302 layers") is what
   made an earlier version of this balloon out to match its full-line width.
   Giving it a fixed width and letting it wrap, instead of forcing the whole
   bar wide enough for one unbroken line, is what keeps the column narrow.
   Everything else is left to size to its own natural (small) width and sits
   centered, rather than stretching to match whatever's widest. */
.hud.vertical{flex-direction:column;align-items:center;gap:8px;padding:10px 8px}
.hud.vertical button.orient svg{transform:rotate(90deg)}
.hud.vertical .dots{padding-left:0;justify-content:center}
.hud.vertical .txt,.hud.vertical .status{display:block;width:124px;white-space:normal;text-align:center;line-height:1.6}
.hud.vertical .sep{display:inline-block;width:3px;height:3px;margin:0 5px;border-radius:50%;background:#555;vertical-align:middle}
.hud.vertical .bar{width:124px;height:3px}
.hud.vertical .rec-group{flex-direction:column}
.hud.vertical .rec-group button.fmt{box-shadow:0 -1px 0 rgba(255,255,255,.12)}
@keyframes recpulse{50%{box-shadow:0 0 0 4px rgba(224,38,63,.32)}}
.shortcuts{position:absolute;left:50%;bottom:76px;transform:translate(-50%,8px);opacity:0;pointer-events:none;background:rgba(24,24,24,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#fff;border-radius:12px;padding:14px 18px;box-shadow:0 10px 30px rgba(0,0,0,.32),inset 0 0 0 1px rgba(255,255,255,.07);font:500 12px/1.9 Inter,system-ui,-apple-system,sans-serif;transition:opacity .2s ease,transform .2s ease;z-index:6;white-space:nowrap}
.shortcuts.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.shortcuts h4{margin:0 0 6px;font:700 11px/1 Inter,system-ui,sans-serif;color:#8fd0ff;letter-spacing:.03em;text-transform:uppercase}
.shortcuts .row{display:flex;justify-content:space-between;gap:24px;color:#cfcfcf}
.shortcuts .row b{color:#fff;font-weight:600;background:#333;border-radius:4px;padding:1px 6px;font-size:11px}
`;

  // -------------------------------------------------------------------- env

  function detectEnv() {
    const se = document.scrollingElement || document.documentElement;
    let scroller = se;
    let isRoot = true;
    if (se.scrollHeight <= innerHeight + 4) {
      let best = null;
      let bestArea = 0;
      const all = document.body ? document.body.getElementsByTagName("*") : [];
      for (let i = 0; i < all.length && i < 20000; i++) {
        const el = all[i];
        if (el.scrollHeight <= el.clientHeight + 40) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== "visible" || !/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, innerWidth) - Math.max(0, r.left);
        const h = Math.min(r.bottom, innerHeight) - Math.max(0, r.top);
        const area = w * h;
        if (area > bestArea && w > innerWidth * 0.35 && h >= innerHeight * 0.4) {
          best = el;
          bestArea = area;
        }
      }
      if (best) {
        scroller = best;
        isRoot = false;
      }
    }
    let [scaleX, scaleY] = unitScale;
    const readScale = () => { if (!isRoot) [scaleX, scaleY] = createScaleReader(el => getComputedStyle(el))(scroller) || unitScale; };
    readScale();
    const env = {
      scroller,
      isRoot,
      host: null,
      pageBg: pageBackground(),
      readScale,
      geom() {
        if (isRoot) {
          return {
            ox: 0,
            oy: 0,
            sx: window.scrollX,
            sy: window.scrollY,
            vw: document.documentElement.clientWidth,
            vh: window.innerHeight,
          };
        }
        const r = scroller.getBoundingClientRect();
        return {
          ox: r.left + scroller.clientLeft * scaleX,
          oy: r.top + scroller.clientTop * scaleY,
          sx: scroller.scrollLeft * scaleX,
          sy: scroller.scrollTop * scaleY,
          vw: scroller.clientWidth * scaleX,
          vh: scroller.clientHeight * scaleY,
        };
      },
      scrollHeight: () => (isRoot ? Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0) : scroller.scrollHeight * scaleY),
      scrollWidth: () => (isRoot ? se.scrollWidth : scroller.scrollWidth * scaleX),
      scrollTo(y, x) {
        const opts = { top: y / scaleY, behavior: "instant" };
        if (x != null) opts.left = x / scaleX;
        if (isRoot) window.scrollTo(opts);
        else scroller.scrollTo(opts);
      },
      scrollBy(dy) {
        if (isRoot) window.scrollBy({ top: dy, behavior: "instant" });
        else scroller.scrollBy({ top: dy / scaleY, behavior: "instant" });
      },
    };
    return env;
  }

  // ------------------------------------------------------------------- view

  class View {
    constructor(env) {
      this.env = env;
      this.frozen = null;
      for (const old of document.querySelectorAll("div-pointers")) old.remove();
      const host = document.createElement("div-pointers");
      // pointer-events:none on the host itself, with only the HUD/shortcuts
      // panel opting back into "auto" (see their CSS rules): this is what lets
      // clicks, scrolling and typing pass straight through the rebuild to the
      // real page underneath — any scrollable container (not just the one main
      // scroller the capture step tracks) and any real form field both keep
      // working natively, exactly as if the overlay weren't there.
      host.style.cssText =
        "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;pointer-events:none !important;contain:strict !important;overflow:hidden !important;max-width:100vw;max-height:100vh;opacity:1;transition:opacity .6s ease;";
      env.host = host;
      this.host = host;
      const root = host.attachShadow({ mode: "open" });
      this.root = root;
      root.innerHTML = `
<div class="bg"></div>
<div class="layer under"></div>
<div class="port"><div class="world"></div></div>
<div class="layer over"></div>
<div class="intro"></div>
<svg class="ov"></svg>
<div class="badges"></div>
<div class="cursors" part="worker-pointers"></div>
<div class="rulers"></div>
<div class="hud">
  <button data-a="hidebar" class="hidebar" title="Hide the toolbar (${MODLABEL}H)">${CHEVRON_ICON}</button>
  <div class="dots"></div>
  <div class="txt"><span class="status">Scanning page…</span></div>
  <div class="bar"><i></i></div>
  <button data-a="tour" title="Auto-scroll while it builds">Tour</button>
  <button data-a="speed" title="Build speed">1×</button>
  <button data-a="cursorstyle" class="curstyle" title="Cursor look: solid (${MODLABEL}L to switch)">${CURSOR_ICON_SOLID}</button>
  <div class="rec-group">
    <button data-a="record" class="rec" title="Record this rebuild as a video (${MODLABEL}V)">⏺</button>
    <button data-a="format" class="fmt" hidden title="Recording format: WebM — click to switch">WebM</button>
  </div>
  <button data-a="sound" class="snd" title="Sound (${MODLABEL}S)"></button>
  <button data-a="orientation" class="orient" title="Lay the toolbar out as a column">${ORIENTATION_ICON}</button>
  <button data-a="help" class="help" title="Keyboard shortcuts">${HELP_ICON}</button>
  <button data-a="live" class="pri" hidden title="Fade back to the real page">Go live</button>
  <button data-a="replay" hidden title="Wipe and rebuild again">Replay</button>
  <button data-a="close" class="x" title="Exit (Esc)">✕</button>
</div>
<div class="shortcuts">
  <h4>Shortcuts</h4>
  <div class="row"><span>Start / stop divPointers</span><b>Ctrl+Shift+D</b></div>
  <div class="row"><span>Cursor look (solid / glow)</span><b>${MODLABEL}L</b></div>
  <div class="row"><span>Record a video</span><b>${MODLABEL}V</b></div>
  <div class="row"><span>Mute / unmute</span><b>${MODLABEL}S</b></div>
  <div class="row"><span>Hide / show toolbar</span><b>${MODLABEL}H</b></div>
  <div class="row"><span>Exit</span><b>Esc</b></div>
</div>`;
      // Constructable stylesheets are not blocked by `style-src` CSPs, unlike
      // an inline <style> element. Fall back to a normal <style> on browsers
      // without adoptedStyleSheets.
      let sheet = null;
      try {
        if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in root) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(STYLE);
          root.adoptedStyleSheets = [sheet];
        }
      } catch (_) {}
      if (!sheet) {
        const st = document.createElement("style");
        st.textContent = STYLE;
        root.insertBefore(st, root.firstChild);
      }
      const $ = (s) => root.querySelector(s);
      this.bg = $(".bg");
      this.under = $(".under");
      this.over = $(".over");
      this.port = $(".port");
      this.world = $(".world");
      this.intro = $(".intro");
      this.ov = $(".ov");
      this.badges = $(".badges");
      this.cursorsEl = $(".cursors");
      this.rulers = $(".rulers");
      this.hud = $(".hud");
      this.hudVisible = THEME.hud !== false;
      if (!this.hudVisible) this.hud.style.display = "none";
      this.status = $(".status");
      this.barFill = $(".bar i");
      this.dots = $(".dots");
      this.cursorEls = new Map();
      this._ovS = "";
      this._ovB = "";
      this._rulersOn = false;

      const pb = env.pageBg;
      this.bg.style.backgroundColor = pb.color;
      const rgb = (pb.color.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
      const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      if (lum < 0.4) this.host.style.setProperty("--ph", "#3B3D42");
      this.host.style.setProperty("--intro-accent", THEME.accent || "#ff6ad9");
      if (pb.image && pb.image !== "none") {
        this.bg.style.backgroundImage = pb.image;
        this.bg.style.backgroundSize = pb.size;
        this.bg.style.backgroundPosition = pb.position;
        this.bg.style.backgroundRepeat = pb.repeat;
      }
      this.makeIntroLogo();
      document.documentElement.appendChild(host);
      this.measure();
    }

    makeIntroLogo() {
      const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')];
      const sized = links
        .map((l) => ({ href: l.href, s: parseInt((l.getAttribute("sizes") || "0").split("x")[0], 10) || (l.rel.includes("apple") ? 180 : 32) }))
        .filter((l) => l.href)
        .sort((a, b) => b.s - a.s);
      const label = (document.title || location.hostname || "?").replace(/^www\./, "").trim();
      const mono = () => {
        this.intro.innerHTML = "";
        const d = document.createElement("div");
        d.className = "mono heart";
        d.innerHTML = HEART_ICON;
        this.intro.appendChild(d);
      };
      const href = sized.length ? sized[0].href : location.origin + "/favicon.ico";
      const img = document.createElement("img");
      img.onerror = mono;
      img.src = href;
      this.intro.appendChild(img);
    }

    measure() {
      this.env.readScale();
      this.W = innerWidth;
      this.H = innerHeight;
      this.g = this.env.geom();
      const g = this.g;
      this.port.style.left = g.ox + "px";
      this.port.style.top = g.oy + "px";
      this.port.style.width = g.vw + "px";
      this.port.style.height = g.vh + "px";
    }

    get vp() {
      if (this.frozen) return this.frozen;
      const g = this.env.geom();
      return { ...g, ox: this.g.ox, oy: this.g.oy };
    }

    syncWorld() {
      const vp = this.vp;
      this.world.style.transform = `translate(${-vp.sx}px,${-vp.sy}px)`;
    }

    mount(model) {
      this.world.style.width = model.docW + "px";
      this.world.style.height = model.docH + "px";
      const by = { world: [], under: [], over: [] };
      for (const it of model.items) by[it.layer].push(it);
      if (model.portKey != null) {
        // inner scroller: its scrolling content sits at the scroller's own place in
        // the stacking order (above its dialog/panel background, below later UI)
        const screen = [...by.under, ...by.over].sort((a, b) => a.key - b.key);
        const frag = document.createDocumentFragment();
        let placed = false;
        for (const it of screen) {
          if (!placed && it.key > model.portKey) {
            frag.appendChild(this.port);
            placed = true;
          }
          frag.appendChild(this.makeNode(it));
        }
        if (!placed) frag.appendChild(this.port);
        this.over.appendChild(frag);
        const wl = by.world.sort((a, b) => a.key - b.key);
        const wf = document.createDocumentFragment();
        for (const it of wl) wf.appendChild(this.makeNode(it));
        this.world.appendChild(wf);
      } else
        for (const layer of ["under", "world", "over"]) {
          const list = by[layer].sort((a, b) => a.key - b.key);
          const frag = document.createDocumentFragment();
          for (const it of list) frag.appendChild(this.makeNode(it));
          (layer === "world" ? this.world : this[layer]).appendChild(frag);
        }
      this.backdrops = (model.backdrops || []).map((b) => {
        const d = document.createElement("div");
        d.className = "bd";
        const rgb = (b.color.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).join(",");
        setStyle(d, `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:rgba(${rgb},.82);`);
        this.over.insertBefore(d, this.over.firstChild);
        return d;
      });
      this.bdStart = this.env.geom().sy;
    }

    makeNode(it) {
      const n = document.createElement("div");
      n.style.display = "none";
      it.node = n;
      if (it.kind === "rect") {
        n.className = "it r";
        const f = document.createElement("div");
        f.className = "f";
        n.appendChild(f);
      } else if (it.kind === "image") {
        n.className = "it m";
        n.innerHTML = IMG_ICON;
      } else if (it.kind === "text") {
        n.className = "it t";
        prepText(it);
        if (it.glyph && it.units.length === 1 && it.units[0].t) {
          n.setAttribute("data-swarm-glyph", "");
          this.watchGlyph(it);
        }
      } else if (it.kind === "line") {
        n.className = "it l";
        n.innerHTML = '<svg width="1" height="1"><path fill="none"/></svg>';
      }
      if (it.op < 0.999) n.style.opacity = it.op;
      if (it.blend) n.style.mixBlendMode = it.blend;
      return n;
    }

    watchGlyph(it) {
      if (!this.glyphObserver) {
        this.glyphs = [];
        this.glyphObserver = new MutationObserver(() => {
          for (const glyph of this.glyphs) this.updateGlyph(glyph);
        });
      }
      this.glyphs.push(it);
      this.glyphObserver.observe(it.glyph, { childList: true, characterData: true, subtree: true });
      this.updateGlyph(it);
    }

    updateGlyph(it) {
      const value = it.glyph.textContent;
      const unit = it.units[0];
      if (value === unit.s || !/^[0-9:]$/.test(value)) return;
      unit.s = it.seq = value;
      // Updating the source never reveals an unbuilt glyph. Keep tracking it
      // during the final fade too, when the animation loop has already stopped.
      it._last = reveal(it, it.shown);
    }

    renderItem(it) {
      const tw = it.twinOf;
      if (tw && it._tv !== tw.v) {
        it._tv = tw.v;
        it.vis = tw.vis;
        it.shown = tw.total ? Math.round((tw.shown / tw.total) * it.total) : it.total;
        it.dx = tw.dx;
        it.dy = tw.dy;
        it.scale = tw.scale;
        it.done = tw.done;
        it.v++;
      }
      if (it.rv === it.v) return;
      it.rv = it.v;
      const n = it.node;
      if (!it.vis) {
        if (n.style.display !== "none") n.style.display = "none";
        return;
      }
      if (n.style.display === "none") n.style.display = "";
      if (it.settle) {
        it.settle = false;
        n.classList.add("settle");
        clearTimeout(n._st);
        n._st = setTimeout(() => n.classList.remove("settle"), 340);
      }
      if (it.kind === "line") {
        n.style.transform = `translate(${it.dx}px,${it.dy}px)`;
        const pts = it.pts.slice(0, it.placed);
        const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + (it.shut ? " Z" : "");
        const path = n.firstChild.firstChild;
        path.setAttribute("d", d);
        path.setAttribute("stroke", it.stroke);
        path.setAttribute("stroke-width", it.sw);
        path.setAttribute("stroke-linecap", "square");
        if (it.dash) path.setAttribute("stroke-dasharray", it.dash);
        return;
      }
      const w = it.draw ? it.draw.w : it.w;
      const h = it.draw ? it.draw.h : it.h;
      let tf = `translate(${it.x + it.dx}px,${it.y + it.dy}px)`;
      if (it.scale !== 1) tf += ` scale(${it.scale})`;
      n.style.transform = tf;
      n.style.width = w + "px";
      n.style.height = h + "px";
      const c = it.clip;
      n.style.clipPath =
        it.done && c ? `inset(${Math.max(0, c.t - it.y)}px ${Math.max(0, it.x + it.w - c.r)}px ${Math.max(0, it.y + it.h - c.b)}px ${Math.max(0, c.l - it.x)}px)` : "";

      if (it.kind === "rect") {
        const css = it.mode === "master" ? it.copyOf.css : it.css;
        if (n._css !== css) {
          setStyle(n.firstChild, css);
          n._css = css;
        }
        n.classList.toggle("st", !!it.styled);
        n.style.borderRadius = it.styled ? (it.mode === "master" ? it.copyOf.radius : it.radius) : "0px";
      } else if (it.kind === "image") {
        const src = it.mode === "master" ? it.copyOf : it;
        if (n._src !== src) {
          const old = n.querySelector(".md");
          const m = src.media.cloneNode(true);
          m.classList.add("md");
          if (old) {
            m.classList.add("swap");
            old.replaceWith(m);
          } else n.appendChild(m);
          if (m.localName === "video") {
            m.muted = true;
            const t = parseFloat(m.getAttribute("data-t"));
            if (t > 0) m.addEventListener("loadedmetadata", () => (m.currentTime = t), { once: true });
            if (m.hasAttribute("data-play")) m.play().catch(() => {});
          }
          n._src = src;
          if (src.frame) {
            let fr = n.querySelector(".fr");
            if (!fr) {
              fr = document.createElement("div");
              fr.className = "fr";
              n.appendChild(fr);
            }
            setStyle(fr, src.frame + `border-radius:${src.radius};`);
          }
        }
        n.classList.toggle("st", !!it.styled);
        n.style.borderRadius = it.styled ? src.radius : "0px";
        n.style.boxShadow = it.styled ? src.shadow : "";
        n.style.backgroundColor = it.styled && src.bg ? src.bg : "";
      } else if (it.kind === "text") {
        let content;
        if (it.mode === "master") {
          if (!it._mv) it._mv = it.copyOf.full.cloneNode(true);
          content = it._mv;
        } else content = it.live;
        if (n.firstChild !== content) {
          n.textContent = "";
          n.appendChild(content);
        }
        if (it.mode !== "master" && it.rshown !== it.shown) {
          it._last = reveal(it, it.shown);
          it.rshown = it.shown;
        }
        content.classList.toggle("sa", !!it.selAll);
        const wantCaret = it.editing && !it.selAll && it.mode !== "master";
        if (wantCaret) {
          if (!it._caret) {
            it._caret = document.createElement("span");
            it._caret.className = "caret";
          }
          const last = it._last;
          if (last && last.parentNode) last.parentNode.insertBefore(it._caret, last.nextSibling);
          else content.insertBefore(it._caret, content.firstChild);
        } else if (it._caret && it._caret.parentNode) it._caret.remove();
        if (it.scale !== 1) {
          const ox = it.tb.x - it.x + (it.align === "center" ? it.tb.w / 2 : it.align === "right" || it.align === "end" ? it.tb.w : 0);
          n.style.transformOrigin = `${ox}px ${it.tb.y - it.y}px`;
        }
      }
    }

    renderCursors(E) {
      const vp = E.vp;
      const seen = new Set();
      for (const c of E.cursors) {
        let el = this.cursorEls.get(c.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "cursor";
          el.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"></svg>';
          this.cursorsEl.appendChild(el);
          this.cursorEls.set(c.id, el);
          el._shape = "";
        }
        seen.add(c.id);
        const X = c.sticky ? c.x : c.x - vp.sx + vp.ox;
        const Y = c.sticky ? c.y : c.y - vp.sy + vp.oy;
        el.style.transform = `translate(${f1(X)}px,${f1(Y)}px)`;
        const svg = el.firstChild;
        if (el._shape !== c.shape) {
          svg.innerHTML = cursorSVG(c.shape, c.color);
          svg.style.color = c.color; // lets the glow filter's `currentColor` match this cursor
          el._shape = c.shape;
          const [hx, hy] = HOT[c.shape];
          el._hx = hx;
          el._hy = hy;
          svg.style.transformOrigin = `${hx}px ${hy}px`;
        }
        const s = 1 - c.press * 0.12;
        svg.style.transform = `translate(${-el._hx}px,${-el._hy}px) rotate(${f1(c.angle)}deg) scale(${s})`;
      }
      for (const [id, el] of this.cursorEls)
        if (!seen.has(id)) {
          el.remove();
          this.cursorEls.delete(id);
        }
    }

    renderOverlay(E) {
      const vp = E.vp;
      const W = this.W;
      const H = this.H;
      const X = (x, st) => f1(st ? x : x - vp.sx + vp.ox);
      const Y = (y, st) => f1(st ? y : y - vp.sy + vp.oy);
      let s = "";
      let b = "";
      for (const g of E.guides) {
        if (!g.vis || g.op <= 0) continue;
        const sw = 1 + g.flash;
        const flt = g.flash > 0 ? ` filter="drop-shadow(0 0 ${f1(2 + g.flash * 3)}px ${RED})"` : "";
        if (g.axis === "x") {
          const x = X(g.cur);
          s += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${RED}" stroke-width="${sw}" opacity="${f1(g.op)}"${flt}/>`;
        } else {
          const y = Y(g.cur);
          s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${RED}" stroke-width="${sw}" opacity="${f1(g.op)}"${flt}/>`;
        }
      }
      for (const it of E.editLines) {
        const st = it.layer !== "world";
        const pts = it.pts.slice(0, it.placed).map((p) => [X(p.x + it.dx, st), Y(p.y + it.dy, st)]);
        const o = it.owner;
        const all = o ? [...pts, [X(o.x, o.sticky), Y(o.y, o.sticky)]] : pts;
        s += `<polyline points="${all.map((p) => p.join(",")).join(" ")}${it.shut && pts[0] ? " " + pts[0].join(",") : ""}" fill="none" stroke="${BLUE}" stroke-width="1.5"/>`;
        for (const p of pts) s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="#fff" stroke="${BLUE}" stroke-width="1.5"/>`;
      }
      const rt = E.rulers.t;
      for (const c of E.cursors) {
        if (!c.ov) continue;
        const st = c.sticky;
        for (const v of c.ov()) {
          if (v.t === "box") {
            const x = X(v.b.x, st);
            const y = Y(v.b.y, st);
            const w = f1(v.b.w);
            const h = f1(v.b.h);
            const col = v.color === "red" ? RED : BLUE;
            s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="1"/>`;
            if (v.underline && v.underline.w > 0) {
              const u = v.underline;
              s += `<line x1="${X(u.x, st)}" x2="${X(u.x + u.w, st)}" y1="${Y(u.y, st)}" y2="${Y(u.y, st)}" stroke="${BLUE}" stroke-width="1.5"/>`;
            }
            if (v.rulerLines && rt > 0.05)
              s += `<g stroke="${BLUE}" stroke-width="1" stroke-dasharray="2 2" opacity="${f1(rt)}"><line x1="${RULER}" x2="${x}" y1="${f1(y + h / 2)}" y2="${f1(y + h / 2)}"/><line x1="${f1(x + w / 2)}" x2="${f1(x + w / 2)}" y1="${RULER}" y2="${y}"/></g>`;
            if (v.handles)
              for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]])
                s += `<rect x="${f1(hx - 3.5)}" y="${f1(hy - 3.5)}" width="7" height="7" fill="#fff" stroke="${col}" stroke-width="1"/>`;
            if (v.badge && w > 0) b += `<div class="badge" data-l="${f1(x + w / 2)}" data-t="${f1(y + h + 8)}" data-bg="${col}">${v.badge}</div>`;
          } else if (v.t === "measure") {
            const a = { x: X(v.a.x, st), y: Y(v.a.y, st) };
            const z = { x: X(v.b.x, st), y: Y(v.b.y, st) };
            s += `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" stroke="${RED}" stroke-width="1"/>`;
            const horiz = a.y === z.y;
            b += `<div class="badge" data-l="${f1(horiz ? (a.x + z.x) / 2 : a.x + 18)}" data-t="${f1(horiz ? a.y + 8 : (a.y + z.y) / 2 - 9)}" data-bg="${RED}">${v.label}</div>`;
          }
        }
      }
      if (s !== this._ovS) {
        this.ov.innerHTML = s;
        this._ovS = s;
      }
      if (b !== this._ovB) {
        this.badges.innerHTML = b;
        for (const el of this.badges.children) {
          el.style.left = el.dataset.l + "px";
          el.style.top = el.dataset.t + "px";
          el.style.background = el.dataset.bg;
        }
        this._ovB = b;
      }
    }

    renderRulers(E) {
      const t = E.rulers.t;
      if (t <= 0.001) {
        if (this._rulersOn) {
          this.rulers.innerHTML = "";
          this._rulersOn = false;
        }
        return;
      }
      this._rulersOn = true;
      const vp = E.vp;
      const W = this.W;
      const H = this.H;
      const step = 100;
      let u = "";
      let a = "";
      const x0 = Math.floor((vp.sx - vp.ox) / step) * step;
      for (let c = x0; c - vp.sx + vp.ox < W; c += step / 2) {
        const x = f1(c - vp.sx + vp.ox);
        const major = c % step === 0;
        u += `<line x1="${x}" x2="${x}" y1="${major ? 13 : 16}" y2="${RULER}" stroke="#5E5E5E"/>`;
        if (major) u += `<text x="${f1(x + 3)}" y="11" class="rtext">${c}</text>`;
      }
      const y0 = Math.floor((vp.sy - vp.oy) / step) * step;
      for (let c = y0; c - vp.sy + vp.oy < H; c += step / 2) {
        const y = f1(c - vp.sy + vp.oy);
        const major = c % step === 0;
        a += `<line y1="${y}" y2="${y}" x1="${major ? 13 : 16}" x2="${RULER}" stroke="#5E5E5E"/>`;
        if (major) a += `<text x="11" y="${f1(y - 3)}" class="rtext" transform="rotate(-90 11 ${f1(y - 3)})">${c}</text>`;
      }
      for (const c of E.cursors) {
        if (!c.ov || c.sticky) continue;
        for (const v of c.ov()) {
          if (v.t !== "box" || !v.handles) continue;
          const l = f1(v.b.x - vp.sx + vp.ox);
          const r = f1(v.b.x + v.b.w - vp.sx + vp.ox);
          const tp = f1(v.b.y - vp.sy + vp.oy);
          const bt = f1(v.b.y + v.b.h - vp.sy + vp.oy);
          u = `<rect x="${l}" y="0" width="${f1(r - l)}" height="${RULER}" fill="rgba(13,153,255,0.22)"/>` + u + `<text x="${f1(l + 3)}" y="11" class="rtext rsel">${Math.round(v.b.x)}</text>`;
          a = `<rect y="${tp}" x="0" height="${f1(bt - tp)}" width="${RULER}" fill="rgba(13,153,255,0.22)"/>` + a;
        }
      }
      for (const g of E.guides) {
        if (!g.dragging) continue;
        if (g.axis === "x") {
          const x = f1(g.cur - vp.sx + vp.ox);
          u += `<line x1="${x}" x2="${x}" y1="0" y2="${RULER}" stroke="${RED}"/><text x="${f1(x + 4)}" y="11" class="rtext" fill="${RED}">${Math.round(g.cur)}</text>`;
        } else {
          const y = f1(g.cur - vp.sy + vp.oy);
          a += `<line y1="${y}" y2="${y}" x1="0" x2="${RULER}" stroke="${RED}"/>`;
        }
      }
      this.rulers.innerHTML =
        `<div class="ruler ruler-top"><svg width="${W}" height="${RULER}">${u}</svg></div>` +
        `<div class="ruler ruler-left"><svg width="${RULER}" height="${H}">${a}</svg></div>` +
        `<div class="ruler-corner"></div>`;
      const topEl = this.rulers.children[0];
      const leftEl = this.rulers.children[1];
      const cornerEl = this.rulers.children[2];
      topEl.style.transform = `translateY(${f1((t - 1) * 100)}%)`;
      leftEl.style.transform = `translateX(${f1((t - 1) * 100)}%)`;
      cornerEl.style.opacity = f1(t);
    }

    render(E) {
      this.syncWorld();
      if (this.backdrops && this.backdrops.length) {
        const o = f1(clamp((Math.abs(E.vp.sy - this.bdStart) - 8) / 80, 0, 1));
        if (o !== this._bdO) {
          this._bdO = o;
          for (const d of this.backdrops) d.style.opacity = o;
        }
      }
      if (E.items) for (const it of E.items) this.renderItem(it);
      this.renderOverlay(E);
      if (!E.finished) this.renderCursors(E);
      this.renderRulers(E);
    }
  }

  // ----------------------------------------------------------------- engine

  class Engine {
    constructor(view, viewportOnly) {
      this.view = view;
      this.viewportOnly = viewportOnly;
      this.vp = view.vp;
      this.items = null;
      this.tasks = [];
      this.groups = [];
      this.guides = [];
      this.editLines = new Set();
      this.cursors = [];
      this.started = false;
      this.ready = false;
      this.frontier = 0;
      this.vel = 0;
      this.tempo = 1;
      this.speed = 1;
      this.time = 0;
      this.rulers = { want: 0, t: 0, lastNeed: -10 };
      this.lastScroll = null;
      this.nextId = 0;
      this.spawnCooldown = 0;
      this.finished = false;
      this.lastT = null;
      this.tv = { x: 0, y: 0 };
      this.mouse = null;
      this.retired = 0;
      this.doneCount = 0;
      const vp = this.vp;
      for (let n = 0; n < INTRO_AGENTS; n++) {
        const side = n % 2 === 0;
        const p = this.fromViewport(side ? vp.ox - 40 - rand(0, 200) : vp.ox + vp.vw + 40 + rand(0, 200), vp.oy + rand(0.05, 0.95) * vp.vh);
        const c = this.makeCursor(p.x, p.y, n < MIN_AGENTS);
        c.follow = true;
        this.cursors.push(c);
      }
    }

    setModel(m) {
      this.items = m.items;
      this.tasks = m.tasks;
      this.groups = m.groups;
      this.guides = m.guides;
      this.viewportWork = null;
      this.guideDeps = new Map(m.guides.map((g) => [g, g.deps || []]));
      // A carried-over restart (see carryOverUnchanged) can hand this a model
      // whose unchanged items' tasks are already marked "done" before a
      // single cursor has touched them - those need to count as already
      // finished here too, not as still-pending work the swarm has to get
      // through before it's willing to call the build complete.
      let preDone = 0;
      for (const t of m.tasks) if (t.state === "done") preDone++;
      this.doneCount = preDone;
      this.ready = true;
    }

    makeCursor(x, y, home = false) {
      const id = this.nextId++;
      const fast = Math.random() < 0.25;
      return {
        id, x, y, home,
        name: NAMES[id % NAMES.length],
        color: COLORS[id % COLORS.length],
        shape: "arrow", press: 0, task: null, gen: null, ov: null,
        idleFor: 0, leaving: false, worked: false, sticky: false,
        vx: 0, vy: 0, angle: 0,
        speed: fast ? rand(1000, 1500) : rand(300, 750),
        force: fast ? rand(3500, 6000) : rand(700, 1800),
        spin: fast ? rand(2.2, 3.4) : rand(0.8, 1.8),
        curl: rand(-1, 1), orbit: rand(70, 170), follow: false,
      };
    }

    get viewTop() {
      return this.vp.sy;
    }
    get viewBot() {
      return this.vp.sy + this.vp.vh;
    }
    fromViewport(x, y) {
      const vp = this.vp;
      return { x: x - vp.ox + vp.sx, y: y - vp.oy + vp.sy };
    }
    taskY(t) {
      return t.layer === "world" ? t.y : this.viewTop + t.y;
    }

    // screen position of a cursor / an item (for panning and loudness)
    scr(c) {
      const vp = this.vp;
      return c.sticky ? { x: c.x, y: c.y } : { x: c.x - vp.sx + vp.ox, y: c.y - vp.sy + vp.oy };
    }

    sfxPlace(kind, it, b) {
      if (!this.sfx) return;
      const vp = this.vp;
      b = b || this.bounds(it);
      let x = b.x + b.w / 2;
      let y = b.y + b.h / 2;
      if (!it || it.layer === "world") {
        x += vp.ox - vp.sx;
        y += vp.oy - vp.sy;
      }
      this.sfx.place(kind, x, y, b.w, b.h, vp.vw, vp.vh, (it && it.fs) || 0);
    }

    start() {
      if (this.started || !this.ready) return;
      this.started = true;
      this.startTime = this.time;
      for (const c of this.cursors) {
        c.follow = false;
        c.gen = null;
        c.angle = ((((c.angle + 180) % 360) + 360) % 360) - 180;
      }
      if (this.sfx) this.sfx.start();
      if (this.onStart) this.onStart();
    }

    bounds(it) {
      if (it.kind === "text") {
        let h = it.tb.h;
        if (it.editing && !it.selAll && it.total) {
          const lines = Math.max(1, Math.round(it.tb.h / it.lh));
          h = Math.min(it.tb.h, Math.max(it.lh, Math.ceil((it.shown / it.total) * lines) * it.lh));
        }
        const s = it.scale;
        const ax = it.align === "center" ? it.tb.w * (1 - s) / 2 : it.align === "right" || it.align === "end" ? it.tb.w * (1 - s) : 0;
        return { x: it.tb.x + it.dx + ax, y: it.tb.y + it.dy, w: it.tb.w * s, h: h * s };
      }
      if (it.kind === "line") {
        return { x: it.x + it.dx, y: it.y + it.dy, w: it.w, h: it.h };
      }
      return {
        x: it.x + it.dx,
        y: it.y + it.dy,
        w: it.draw ? it.draw.w : it.w,
        h: it.draw ? it.draw.h : it.h,
      };
    }

    unionBounds(list) {
      const bs = list.map((it) => this.bounds(it));
      const x = Math.min(...bs.map((b) => b.x));
      const y = Math.min(...bs.map((b) => b.y));
      return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
    }

    underline(it, b) {
      return { x: b.x, y: b.y + (it.lh * 0.5 + it.fs * 0.42) * it.scale, w: Math.min(b.w, it.tb.w * it.scale), h: 0 };
    }

    selection(it, extra) {
      const b = this.bounds(it);
      return Object.assign(
        {
          t: "box",
          b,
          handles: true,
          badge: `${Math.round(b.w)} × ${Math.round(b.h)}`,
          rulerLines: true,
          underline: it.kind === "text" ? this.underline(it, b) : undefined,
        },
        extra,
      );
    }

    available() {
      const out = [];
      const work = this.workInViewport();
      for (const t of work || this.tasks) {
        if (t.state !== "wait") continue;
        if (!work && t.layer === "world" && t.gate > this.frontier) continue;
        let ok = true;
        for (const d of t.deps)
          if (d.state !== "done") {
            ok = false;
            break;
          }
        if (ok) out.push(t);
      }
      return out;
    }

    workInViewport() {
      if (!this.viewportOnly || !this.items) return null;
      const vp = this.vp;
      const key = [vp.ox, vp.oy, vp.sx, vp.sy, vp.vw, vp.vh, innerWidth, innerHeight].join("/");
      if (this.viewportWork?.key === key) return this.viewportWork.tasks;
      const world = worldBounds(vp), screen = screenBounds();
      const tasks = new Set();
      const requireTask = (task) => {
        if (tasks.has(task)) return;
        tasks.add(task);
        for (const dep of task.deps) requireTask(dep);
      };
      for (const it of this.items) {
        if (!it.final) continue;
        const viewport = it.layer === "world" ? world : screen;
        const painted = boxBounds(it.kind === "text" ? it.tb : it);
        const clipped = it.clip ? intersect(painted, it.clip) : painted;
        if (viewport && clipped && intersect(clipped, viewport)) for (const t of it.final) requireTask(t);
      }
      this.viewportWork = { key, tasks };
      return tasks;
    }

    pick(c, list) {
      let best = null;
      let bestS = Infinity;
      const top = this.viewTop - 40;
      const bot = this.viewBot;
      const cy = c.sticky ? c.y + this.viewTop : c.y;
      for (const t of list) {
        const y = this.taskY(t);
        const u = y >= top && y <= bot ? 0 : y < top ? 1 : 2;
        const s = u * 1e6 + (u === 1 ? top - y : y) * 0.6 + Math.abs(y - cy) * 0.4 - (t.spec.type === "guide" ? 5e5 : 0);
        if (s < bestS) {
          bestS = s;
          best = t;
        }
      }
      return best;
    }

    // work that's unlocked but unfinished (things past the frontier need scrolling, not waiting)
    backlog() {
      let n = 0;
      const work = this.workInViewport();
      for (const t of work || this.tasks) if (t.state !== "done" && (work || t.layer !== "world" || t.gate <= this.frontier)) n++;
      return n;
    }

    step(dt) {
      if (this.finished) return;
      dt = Math.min(dt, 0.05);
      this.time += dt;
      const vp = (this.vp = this.view.vp);
      const sv = Math.abs(vp.sy - (this.lastScroll == null ? vp.sy : this.lastScroll)) / Math.max(dt, 0.001);
      this.lastScroll = vp.sy;
      this.vel = Math.max(this.vel * Math.exp(-dt * 1.2), this.vel * 0.7 + sv * 0.3);
      if (this.started) this.frontier = Math.max(this.frontier, this.viewBot);
      const avail = this.started ? this.available() : [];
      this.tempo = clamp(2.1 + this.vel / 900 + (avail.length / Math.max(1, this.cursors.length)) * 0.5, 2.1, 4.5) * this.speed;

      if (this.rulers.want > 0) this.rulers.lastNeed = this.time;
      const rt = this.time - this.rulers.lastNeed < 0.7 ? 1 : 0;
      this.rulers.t += (rt - this.rulers.t) * Math.min(1, dt * 10);
      if (Math.abs(rt - this.rulers.t) < 0.002) this.rulers.t = rt;

      for (const g of this.guides) {
        if (!g.vis) continue;
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.5);
        const deps = this.guideDeps.get(g) || [];
        if (g.shownAt == null) g.shownAt = this.time;
        if (!g.dragging && g.op > 0 && this.time - g.shownAt > 7 && !deps.some((t) => t.state === "active")) g.op = Math.max(0, g.op - dt * 1.2);
        else if (!g.dragging && deps.every((t) => t.state === "done")) {
          const last = Math.max(0, ...deps.map((t) => t.doneAt));
          if (this.time - last > 1.2 && g.op > 0) g.op = Math.max(0, g.op - dt * 1.2);
        }
      }

      if (this.started && (this.viewportOnly ? this.backlog() === 0 : this.doneCount === this.tasks.length)) {
        this.finished = true;
        this.endTime = this.time;
        if (this.onComplete) this.onComplete();
        return;
      }
      if (!this.started) {
        const center = this.fromViewport(vp.ox + vp.vw / 2, vp.oy + vp.vh / 2);
        if (this.follow(dt, this.cursors, center, 0.7) && this.ready) this.start();
        return;
      }
      if (this.cursors.some((c) => c.follow))
        this.follow(
          dt,
          this.cursors.filter((c) => c.follow),
        );

      this.spawnCooldown -= dt;
      const want = clamp(MIN_AGENTS + Math.floor(this.vel / 40) + Math.floor(avail.length / 2), MIN_AGENTS, MAX_AGENTS);
      const active = this.cursors.filter((c) => !c.leaving).length;
      const busy = this.cursors.filter((c) => c.task).length;
      if (active < want && avail.length > active - busy && this.spawnCooldown <= 0) {
        const left = Math.random() < 0.5;
        const p = this.fromViewport(left ? vp.ox - 40 : vp.ox + vp.vw + 40, vp.oy + rand(0.2, 0.8) * vp.vh);
        this.cursors.push(this.makeCursor(p.x, p.y));
        this.spawnCooldown = 0.035;
      }

      for (const c of this.cursors) {
        if (c.task || c.leaving || c.follow) continue;
        const t = this.pick(c, avail);
        if (!t) continue;
        avail.splice(avail.indexOf(t), 1);
        t.state = "active";
        c.task = t;
        c.worked = true;
        c.idleFor = 0;
        if (t.layer !== "world") {
          c.sticky = true;
          c.x += vp.ox - vp.sx;
          c.y += vp.oy - vp.sy;
        }
        c.gen = this.run(c, t);
      }

      for (const c of [...this.cursors]) {
        if (c.follow) continue;
        c.press = Math.max(0, c.press - dt * 6);
        if (c.angle !== 0) c.angle = Math.abs(c.angle) < 0.5 ? 0 : c.angle * (1 - Math.min(1, dt * 10));
        if (!c.task) {
          c.idleFor += dt;
          if (!c.leaving && c.idleFor > 2.5 && this.cursors.filter((m) => !m.leaving).length > MIN_AGENTS && !c.home) {
            c.leaving = true;
            c.gen = this.leave(c);
          }
          if (!c.gen) c.gen = this.idle(c);
        }
        if (c.gen.next(dt).done) {
          if (c.task) {
            c.task.state = "done";
            c.task.doneAt = this.time;
            this.doneCount++;
            c.task = null;
            c.ov = null;
            if (c.sticky) {
              c.sticky = false;
              c.x -= vp.ox - vp.sx;
              c.y -= vp.oy - vp.sy;
            }
            c.shape = "arrow";
          }
          c.gen = null;
          if (c.leaving) {
            if (c.worked) this.retired++;
            this.cursors.splice(this.cursors.indexOf(c), 1);
          }
        }
      }
    }

    flockTarget() {
      if (this.mouse) return this.fromViewport(this.mouse.x, this.mouse.y);
      const t = this.time;
      const vp = this.vp;
      return this.fromViewport(vp.ox + vp.vw * (0.5 + 0.28 * Math.sin(t * 0.37)), vp.oy + vp.vh * (0.5 + 0.25 * Math.sin(t * 0.53 + 1)));
    }

    // Boids-ish orbit around a target, ported from the original.
    follow(dt, list, target, scale = 1) {
      const m = this.mouse ? this.fromViewport(this.mouse.x, this.mouse.y) : null;
      const o = target || this.flockTarget();
      const time = this.time;
      if (m && this.lastT && dt > 0) {
        const k = Math.min(1, dt * 18);
        this.tv.x += ((m.x - this.lastT.x) / dt - this.tv.x) * k;
        this.tv.y += ((m.y - this.lastT.y) / dt - this.tv.y) * k;
      }
      this.lastT = m;
      const R = 135 * scale * (1 + 0.18 * Math.sin(time * 0.55));
      const swirl = Math.tanh(Math.cos(time * 0.11) * 3);
      const want = [];
      for (const c of list) {
        const vx = c.x - o.x;
        const vy = c.y - o.y;
        const d = Math.hypot(vx, vy) || 0.01;
        const nx = vx / d;
        const ny = vy / d;
        const ang = Math.atan2(vy, vx);
        const off = (c.orbit - 120) * 0.55 * scale;
        const rr = R * (1 + 0.3 * Math.sin(3 * ang + time * 0.7)) + off;
        const tang = 300 * (0.7 + c.spin * 0.2) * swirl;
        const rad = clamp((rr - d) * 4, -2600, 1400);
        const far = Math.min(1, Math.max(0, (d - rr) / 600));
        want.push([-ny * tang + nx * rad - ny * c.curl * 400 * far, nx * tang + ny * rad + nx * c.curl * 400 * far]);
      }
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        let ax = 0;
        let ay = 0;
        let wsum = 0;
        for (let j = 0; j < list.length; j++) {
          if (j === i) continue;
          const q = list[j];
          const d = Math.hypot(q.x - c.x, q.y - c.y);
          if (d > 90) continue;
          const w = 1 - d / 90;
          ax += q.vx * w;
          ay += q.vy * w;
          wsum += w;
        }
        let [fx, fy] = want[i];
        if (wsum > 0) {
          fx = fx * 0.7 + (ax / wsum) * 0.3;
          fy = fy * 0.7 + (ay / wsum) * 0.3;
        }
        const dist = Math.max(0, Math.hypot(c.x - o.x, c.y - o.y) - 180 * scale);
        const maxV = c.speed * (1.3 + Math.min(3.2, dist / 90));
        const L = Math.hypot(fx, fy);
        if (L > maxV) {
          fx *= maxV / L;
          fy *= maxV / L;
        }
        let gx = (fx - c.vx) * 6;
        let gy = (fy - c.vy) * 6;
        const maxF = c.force * (1.4 + Math.min(5, dist / 50));
        const G = Math.hypot(gx, gy);
        if (G > maxF) {
          gx *= maxF / G;
          gy *= maxF / G;
        }
        c.vx += gx * dt;
        c.vy += gy * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
      const R0 = 48;
      let touched = false;
      if (m)
        for (const c of list) {
          const vx = c.x - m.x;
          const vy = c.y - m.y;
          const d = Math.hypot(vx, vy) || 0.01;
          if (d >= R0) continue;
          touched = true;
          const nx = vx / d;
          const ny = vy / d;
          c.x = m.x + nx * R0;
          c.y = m.y + ny * R0;
          const rel = (c.vx - this.tv.x) * nx + (c.vy - this.tv.y) * ny;
          if (rel < 0) {
            c.vx -= nx * rel * 1.6;
            c.vy -= ny * rel * 1.6;
          }
          c.vx += nx * 260;
          c.vy += ny * 260;
        }
      for (const c of list) {
        if (Math.hypot(c.vx, c.vy) < 30) continue;
        const d = ((((Math.atan2(c.vy, c.vx) * 180) / Math.PI + 128 - c.angle + 540) % 360) + 360) % 360 - 180;
        c.angle += d * Math.min(1, dt * 8);
        c.press = Math.max(0, c.press - dt * 6);
      }
      return touched;
    }

    // ------------------------------------------------------- primitives

    *wait(t) {
      let n = 0;
      while (n < t) n += (yield) * this.tempo;
    }

    *moveTo(c, target, o = {}) {
      const get = typeof target === "function" ? target : () => target;
      const x0 = c.x;
      const y0 = c.y;
      const p0 = get();
      const dist = Math.hypot(p0.x - x0, p0.y - y0);
      if (dist < 0.5) {
        c.x = p0.x;
        c.y = p0.y;
        if (o.onStep) o.onStep();
        return;
      }
      const dur = clamp(0.12 + Math.sqrt(dist) * 0.021, 0.14, 0.9) / (o.speed || 1);
      const bend = (o.bend != null ? o.bend : (Math.random() < 0.5 ? -1 : 1) * rand(0.04, 0.14)) * Math.min(dist, 600);
      let t = 0;
      while (t < dur) {
        t += (yield) * this.tempo;
        const k = Math.min(1, t / dur);
        const e = o.drag || k < 0.15 ? easeInOut(k) : easeOut(k);
        const p = get();
        const dx = p.x - x0;
        const dy = p.y - y0;
        const L = Math.hypot(dx, dy) || 1;
        const off = Math.sin(Math.PI * e) * bend;
        c.x = x0 + dx * e + (-dy / L) * off;
        c.y = y0 + dy * e + (dx / L) * off;
        if (o.onStep) o.onStep();
      }
      const p = get();
      c.x = p.x;
      c.y = p.y;
      if (o.onStep) o.onStep();
    }

    *click(c) {
      c.press = 1;
      if (this.sfx) this.sfx.press(this.scr(c).x, this.vp.vw);
      yield* this.wait(0.07);
    }

    *type(it, c) {
      const N = it.total;
      const k = clamp(70 / Math.max(1, N), 0.06, 1);
      let budget = 0;
      let i = it.shown;
      while (i < N) {
        budget += (yield) * this.tempo;
        while (i < N && budget > 0) {
          const ch = it.seq[i];
          let d = rand(0.012, 0.04);
          if (ch === " ") d += rand(0, 0.03);
          if (ch === "\n") d += 0.1;
          if (Math.random() < 0.025) d += rand(0.08, 0.2);
          budget -= d * k;
          i++;
        }
        if (c && this.sfx && i > it.shown) this.sfx.key(this.scr(c).x, this.vp.vw, c.id, i - it.shown, /\s/.test(it.seq.slice(it.shown, i)) ? 1 : 0);
        it.shown = i;
        bump(it);
      }
    }

    *idle(c) {
      for (;;) {
        const vp = this.vp;
        const top = this.viewTop;
        const bot = this.viewBot;
        const p = { x: rand(vp.sx + vp.vw * 0.17, vp.sx + vp.vw * 0.83), y: rand(top + (bot - top) * 0.2, top + (bot - top) * 0.8) };
        yield* this.moveTo(c, p, { speed: 0.35 });
        let w = rand(0.4, 1.4);
        while (w > 0) {
          w -= yield;
          if (c.y < this.viewTop || c.y > this.viewBot) break;
        }
      }
    }

    *leave(c) {
      const right = c.x > this.vp.sx + this.vp.vw / 2;
      yield* this.moveTo(
        c,
        () => {
          const vp = this.vp;
          return this.fromViewport(right ? vp.ox + vp.vw + 60 : vp.ox - 60, c.y - this.viewTop + vp.oy);
        },
        { speed: 0.8 },
      );
    }

    run(c, t) {
      const s = t.spec;
      switch (s.type) {
        case "rect":
          return this.drawBox(c, s.it, false);
        case "image":
          return this.drawBox(c, s.it, true);
        case "line":
          return this.drawLine(c, s.it);
        case "text":
          return this.drawText(c, s.it, s.snap || null, !!s.grow);
        case "guide":
          return this.dragGuide(c, s.g);
        case "dup":
          return this.duplicate(c, s.g, s.k);
        case "edit":
          return this.editText(c, s.it);
        case "restyle":
        case "swap":
          return this.restyle(c, s.it);
      }
      return this.wait(0.1);
    }

    // Where a drag should end so a huge box doesn't drag the cursor off-screen.
    dragEnd(c, it) {
      const vp = this.vp;
      const screen = c.sticky;
      const right = screen ? vp.ox + vp.vw : vp.sx + vp.vw;
      const bot = screen ? vp.oy + vp.vh : this.viewBot;
      const x = it.x + it.w > right - 16 ? Math.max(it.x + Math.min(it.w, 40), right - 30) : it.x + it.w;
      const y = it.y + it.h > bot - 16 ? Math.max(it.y + Math.min(it.h, 40), bot - 40) : it.y + it.h;
      return { x: Math.min(x, it.x + it.w), y: Math.min(y, it.y + it.h) };
    }

    *drawBox(c, it, isImg) {
      c.shape = "cross";
      yield* this.moveTo(c, { x: it.x, y: it.y });
      c.press = 1;
      it.vis = true;
      if (it.big) it.styled = true;
      it.draw = { w: 0, h: 0 };
      bump(it);
      c.ov = () => [this.selection(it)];
      const end = this.dragEnd(c, it);
      yield* this.moveTo(c, end, {
        speed: 0.75,
        drag: true,
        bend: 0,
        onStep: () => {
          it.draw = { w: Math.max(0, c.x - it.x), h: Math.max(0, c.y - it.y) };
          bump(it);
        },
      });
      if (end.x < it.x + it.w - 0.5 || end.y < it.y + it.h - 0.5) {
        const w0 = it.draw.w;
        const h0 = it.draw.h;
        let k = 0;
        while (k < 1) {
          k = Math.min(1, k + ((yield) * this.tempo) / 0.5);
          const e = easeOut(k);
          it.draw = { w: w0 + (it.w - w0) * e, h: h0 + (it.h - h0) * e };
          bump(it);
        }
      }
      it.draw = null;
      bump(it);
      c.shape = "arrow";
      yield* this.wait(rand(0.18, 0.3));
      it.styled = true;
      bump(it);
      this.sfxPlace(isImg ? "image" : "rect", it);
      yield* this.wait(isImg ? 0.5 : 0.35);
      c.ov = null;
      it.done = true;
      bump(it);
    }

    *drawLine(c, it) {
      c.shape = "pen-add";
      yield* this.moveTo(c, it.pts[0]);
      yield* this.click(c);
      it.vis = true;
      it.edit = true;
      it.placed = 1;
      it.owner = c;
      bump(it);
      this.editLines.add(it);
      c.shape = "pen";
      for (let i = 1; i < it.pts.length; i++) {
        yield* this.moveTo(c, it.pts[i], { bend: rand(-0.03, 0.03) });
        yield* this.click(c);
        it.placed = i + 1;
        bump(it);
        yield* this.wait(rand(0.04, 0.12));
      }
      it.owner = null;
      bump(it);
      yield* this.moveTo(c, { x: c.x + rand(14, 30), y: c.y + rand(10, 24) }, { speed: 1.4 });
      yield* this.wait(0.3);
      it.edit = false;
      this.editLines.delete(it);
      it.done = true;
      bump(it);
      this.sfxPlace("line", it);
    }

    *drawText(c, it, guide, grow) {
      if (guide) {
        if (guide.axis === "x") {
          it.dx = rand(28, 64);
          it.dy = rand(-8, 8);
        } else {
          it.dx = rand(-8, 8);
          it.dy = rand(18, 34) * (Math.random() < 0.5 ? -1 : 1);
        }
      }
      if (grow) it.scale = Math.min(1, 18 / it.fs);
      const b0 = this.bounds(it);
      c.shape = "cross";
      yield* this.moveTo(c, { x: b0.x, y: b0.y });
      const lineH = Math.min(b0.h, it.lh * it.scale);
      if (b0.w < 140 && it.tb.h < it.lh * 1.6) {
        yield* this.click(c);
      } else {
        c.press = 1;
        const ghost = { x: b0.x, y: b0.y, w: 0, h: 0 };
        c.ov = () => [{ t: "box", b: ghost, handles: true, badge: `${Math.round(ghost.w)} × ${Math.round(ghost.h)}`, rulerLines: true }];
        yield* this.moveTo(
          c,
          { x: b0.x + b0.w, y: b0.y + lineH },
          {
            speed: 0.9,
            drag: true,
            bend: 0,
            onStep: () => {
              ghost.w = Math.max(0, c.x - b0.x);
              ghost.h = Math.max(0, c.y - b0.y);
            },
          },
        );
      }
      it.vis = true;
      it.editing = true;
      it.shown = 0;
      bump(it);
      c.shape = "ibeam";
      c.ov = () => [{ t: "box", b: this.bounds(it) }];
      yield* this.moveTo(c, { x: c.x + rand(-30, 10), y: c.y + rand(10, 30) }, { speed: 1.5 });
      yield* this.type(it, c);
      yield* this.wait(0.12);
      it.editing = false;
      bump(it);
      this.sfxPlace("text", it);
      c.shape = "arrow";
      c.ov = () => [this.selection(it)];
      if (grow) {
        const steps = [24, 32, 40, 48, 56, 64, 72, 88, 104].filter((s) => s < it.fs && s > 18);
        let k = 0;
        for (const s of [...steps, it.fs]) {
          yield* this.wait(0.06);
          it.scale = s / it.fs;
          bump(it);
          if (this.sfx) this.sfx.grow(k++, this.scr(c).x, this.vp.vw);
        }
        it.scale = 1;
        bump(it);
        yield* this.wait(0.15);
      }
      if (guide) {
        // give the guide a moment to land; never block a cursor on it
        let waited = 0;
        while (guide.task.state !== "done" && waited < 1.6) waited += (yield) * this.tempo;
        if (guide.task.state !== "done") guide = null;
      }
      if (guide) {
        const u = this.bounds(it);
        const a = { x: u.x + Math.min(u.w * 0.4, 60) + rand(-6, 6), y: u.y + Math.min(u.h * 0.5, 22) };
        yield* this.moveTo(c, a);
        c.press = 1;
        const p = { x: a.x - it.dx, y: a.y - it.dy };
        const m = {
          x: p.x + (guide.axis === "x" ? -rand(2, 5) : rand(-6, 6)),
          y: p.y + (guide.axis === "y" ? -rand(2, 5) : rand(-3, 3)),
        };
        const drag = () => {
          let h = c.x - p.x;
          let v = c.y - p.y;
          if (guide.axis === "x" && Math.abs(h) < 9) {
            if (h !== 0 && it.dx !== 0) {
              if (guide.flash < 0.5 && this.sfx) this.sfx.snap(this.scr(c).x, this.vp.vw);
              guide.flash = 1;
            }
            h = 0;
          }
          if (guide.axis === "y" && Math.abs(v) < 9) {
            if (v !== 0 && it.dy !== 0) {
              if (guide.flash < 0.5 && this.sfx) this.sfx.snap(this.scr(c).x, this.vp.vw);
              guide.flash = 1;
            }
            v = 0;
          }
          it.dx = h;
          it.dy = v;
          bump(it);
        };
        yield* this.moveTo(c, m, { speed: 0.6, drag: true, onStep: drag });
        yield* this.wait(0.1);
        yield* this.moveTo(c, p, { speed: 2, onStep: drag });
        it.dx = 0;
        it.dy = 0;
        bump(it);
        yield* this.wait(0.25);
      } else if (it.dx || it.dy) {
        const dx0 = it.dx;
        const dy0 = it.dy;
        let k = 0;
        while (k < 1) {
          k = Math.min(1, k + ((yield) * this.tempo) / 0.3);
          const e = easeInOut(k);
          it.dx = dx0 * (1 - e);
          it.dy = dy0 * (1 - e);
          bump(it);
        }
        yield* this.wait(0.15);
      } else yield* this.wait(0.2);
      c.ov = null;
      it.done = true;
      bump(it);
    }

    *dragGuide(c, g) {
      this.rulers.want++;
      try {
        const r = rand(-0.15, 0.15);
        const from = () => {
          const vp = this.vp;
          return g.axis === "x"
            ? this.fromViewport(vp.ox + 10, vp.oy + vp.vh * (0.45 + r))
            : this.fromViewport(vp.ox + vp.vw * 0.3 + r * 200, vp.oy + 10);
        };
        c.shape = "arrow";
        yield* this.moveTo(c, from);
        while (this.rulers.t < 0.95) yield;
        yield* this.moveTo(c, from, { speed: 3 });
        c.press = 1;
        c.shape = g.axis === "x" ? "ew" : "ns";
        g.vis = true;
        g.dragging = true;
        g.op = 1;
        const upd = () => {
          g.cur = g.axis === "x" ? c.x : c.y;
        };
        upd();
        const to = () => {
          const s = from();
          return g.axis === "x" ? { x: g.pos, y: s.y + 40 } : { x: s.x + 30, y: g.pos };
        };
        yield* this.moveTo(c, to, { speed: 0.55, drag: true, onStep: upd });
        g.cur = g.pos;
        g.dragging = false;
        if (this.sfx) {
          const p = this.scr(c);
          this.sfx.place("guide", p.x, p.y, 1, 1, this.vp.vw, this.vp.vh, 0);
        }
        c.shape = "arrow";
        yield* this.wait(0.25);
      } finally {
        this.rulers.want--;
      }
    }

    *duplicate(c, g, k) {
      const dst = g.dst[k];
      let src = g.src;
      const cand = [g.src, ...g.dst.filter((d) => d.task.state === "done")];
      const dd = (a) => Math.hypot(a.box.x - dst.box.x, a.box.y - dst.box.y);
      for (const s of cand) if (dd(s) < dd(src)) src = s;
      const sb = this.unionBounds(src.items);
      c.shape = "arrow";
      const u = { x: sb.x + Math.min(sb.w * 0.45, 70) + rand(-8, 8), y: sb.y + Math.min(sb.h * 0.45, 30) + rand(-4, 4) };
      yield* this.moveTo(c, u);
      yield* this.click(c);
      c.ov = () => [{ t: "box", b: sb, handles: true, badge: `${Math.round(sb.w)} × ${Math.round(sb.h)}` }];
      yield* this.wait(rand(0.15, 0.3));
      c.shape = "dup";
      yield* this.wait(0.12);
      c.press = 1;
      const ox = src.box.x - dst.box.x;
      const oy = src.box.y - dst.box.y;
      for (const it of dst.items) {
        it.vis = true;
        it.mode = "master";
        it.dx = ox;
        it.dy = oy;
        if (it.kind === "rect" || it.kind === "image") {
          it.styled = true;
          it.draw = null;
        }
        if (it.kind === "line") {
          it.placed = it.pts.length;
        }
        bump(it);
      }
      const m = { x: u.x - ox, y: u.y - oy };
      c.ov = () => {
        const cb = this.unionBounds(dst.items);
        const h = [
          { t: "box", b: sb, color: "red" },
          { t: "box", b: cb, color: "red" },
        ];
        const sp = this.spacing(sb, cb);
        if (sp) h.push(sp);
        return h;
      };
      yield* this.moveTo(c, m, {
        speed: 0.6,
        drag: true,
        onStep: () => {
          for (const it of dst.items) {
            it.dx = ox + (c.x - u.x);
            it.dy = oy + (c.y - u.y);
            bump(it);
          }
        },
      });
      this.sfxPlace("dup", dst.items[0], this.unionBounds(dst.items));
      for (const it of dst.items) {
        it.dx = 0;
        it.dy = 0;
        it.settle = true;
        if (!it.editTask) it.mode = "own";
        if (it.kind === "text" && it.mode === "own") it.shown = it.total;
        bump(it);
      }
      yield* this.wait(0.1);
      c.shape = "arrow";
      c.ov = () => {
        const cb = this.unionBounds(dst.items);
        return [{ t: "box", b: cb, handles: true, badge: `${Math.round(cb.w)} × ${Math.round(cb.h)}` }];
      };
      yield* this.wait(0.35);
      for (const it of dst.items)
        if (!it.editTask) {
          it.done = true;
          bump(it);
        }
    }

    spacing(a, b) {
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (oy > 0) {
        const y = Math.max(a.y, b.y) + oy / 2;
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        const gap = r.x - (l.x + l.w);
        if (gap > 0) return { t: "measure", a: { x: l.x + l.w, y }, b: { x: r.x, y }, label: String(Math.round(gap)) };
      } else if (ox > 0) {
        const x = Math.max(a.x, b.x) + ox / 2;
        const [t, btm] = a.y < b.y ? [a, b] : [b, a];
        const gap = btm.y - (t.y + t.h);
        if (gap > 0) return { t: "measure", a: { x, y: t.y + t.h }, b: { x, y: btm.y }, label: String(Math.round(gap)) };
      }
      return null;
    }

    *editText(c, it) {
      c.shape = "arrow";
      const b = this.bounds(it);
      yield* this.moveTo(c, { x: b.x + Math.min(b.w * 0.5, 50) + rand(-5, 5), y: b.y + Math.min(it.lh, b.h) * 0.55 });
      yield* this.click(c);
      yield* this.wait(0.08);
      yield* this.click(c);
      it.selAll = true;
      it.editing = true;
      bump(it);
      c.shape = "ibeam";
      c.ov = () => [{ t: "box", b: this.bounds(it) }];
      yield* this.wait(rand(0.2, 0.35));
      it.mode = "own";
      it.selAll = false;
      it.shown = 0;
      bump(it);
      yield* this.type(it, c);
      yield* this.wait(0.12);
      it.editing = false;
      bump(it);
      c.shape = "arrow";
      c.ov = () => [this.selection(it)];
      this.sfxPlace("edit", it);
      yield* this.wait(0.3);
      c.ov = null;
      it.done = true;
      bump(it);
    }

    *restyle(c, it) {
      c.shape = "arrow";
      const b = this.bounds(it);
      yield* this.moveTo(c, { x: b.x + Math.min(b.w * 0.5, 60) + rand(-6, 6), y: b.y + Math.min(b.h * 0.5, 30) + rand(-4, 4) });
      yield* this.click(c);
      c.ov = () => [this.selection(it)];
      yield* this.wait(rand(0.15, 0.3));
      it.mode = "own";
      bump(it);
      this.sfxPlace(it.kind === "image" ? "image" : "restyle", it);
      yield* this.wait(0.4);
      c.ov = null;
      it.done = true;
      bump(it);
    }
  }

  // ------------------------------------------------------------------ sound

  // A glass piano in E. Every finished piece of the page plays one note of the
  // E major pentatonic, quantized to a soft 16th-note grid, so a busy swarm comes
  // out as a generative melody: big sections low, small things high, pitch rising
  // left to right, panned to where the cursor is. Typing and clicks are quiet
  // paper ticks underneath. All synthesized; no audio files.
  const PENTA = [0, 2, 4, 7, 9]; // E F# G# B C#
  const E2 = 40;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let soundPref = true;
  const SPK_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/>';
  // HUD icons, matching SPK_ICON's language: 16x16, currentColor, mostly stroke —
  // so new buttons read as part of the same flat icon set, not pasted-on emoji.
  const CURSOR_ICON_SOLID =
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="${ARROW_D}"/></svg>`;
  const CURSOR_ICON_GLOW =
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path transform="scale(.667)" d="${ARROW_D}"/>` +
    '<path d="M12 .8 L12.6 2.3 L14.1 2.9 L12.6 3.5 L12 5 L11.4 3.5 L9.9 2.9 L11.4 2.3 Z" fill="currentColor" stroke="none"/></svg>';
  const HELP_ICON =
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.3"/><path d="M6.1 6.3a2 2 0 1 1 2.7 1.8c-.6.3-.9.7-.9 1.4"/><circle cx="8" cy="11.2" r=".15" fill="currentColor" stroke="none"/></svg>';
  // Chevron for the hide/show-toolbar toggle - points down (tuck away) when
  // expanded, CSS rotates it 180deg to point up (bring back) when collapsed.
  const CHEVRON_ICON =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.3 6 L8 10.5 L12.7 6"/></svg>';
  // Two stacked bars for "lay the toolbar out as a row" / rotated 90deg by
  // CSS for "as a column" - same glyph, just turned to match which one it
  // currently is.
  const ORIENTATION_ICON =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.2" width="12" height="3.6" rx="1"/><rect x="2" y="9.2" width="12" height="3.6" rx="1"/></svg>';
  const HEART_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.2s-8.4-5.3-8.4-11.2A4.7 4.7 0 0 1 12 7.1a4.7 4.7 0 0 1 8.4 2.9c0 5.9-8.4 11.2-8.4 11.2z"/></svg>';

  class Sound {
    constructor(playback) {
      this.playback = playback;
      this.volume = playback?.volume ?? 1;
      this.on = playback ? playback.sound : THEME.sound === false ? false : THEME.sound === true ? true : soundPref;
      this.ctx = null;
      this.bpm = 104;
      this.slots = new Map();
      this.lastKey = new Map();
      this.keyTimes = [];
      this.pressTimes = [];
      this.ends = []; // when each sounding piano voice dies out
      this.fakeNow = null; // offline renders drive the clock explicitly
    }

    init(offline) {
      if (this.ctx) return true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = offline || new Ctx({ latencyHint: "interactive" });
      } catch (_) {
        return false;
      }
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = this.on ? this.volume : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 14;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.3;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(out);
      out.connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(3.2, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      verb.connect(wet);
      wet.connect(master);
      this.out = out;
      this.master = master;
      this.verb = verb;
      this.noiseBuf = this.noise(1.5);
      this.t0 = this.now();
      return true;
    }

    now() {
      return this.fakeNow != null ? this.fakeNow : this.ctx.currentTime;
    }

    // Generated room: decaying stereo noise, darkened as it rings out.
    impulse(secs, decay) {
      const sr = this.ctx.sampleRate;
      const n = Math.floor(sr * secs);
      const b = this.ctx.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const k = i / n;
          const a = 0.55 - 0.4 * k; // lowpass closes over time: warm tail
          lp += a * (Math.random() * 2 - 1 - lp);
          d[i] = lp * Math.pow(1 - k, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
        }
      }
      return b;
    }

    noise(secs) {
      const sr = this.ctx.sampleRate;
      const b = this.ctx.createBuffer(1, Math.floor(sr * secs), sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }

    setOn(on) {
      this.on = on;
      if (!this.playback) soundPref = on;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(on ? this.volume : 0, t, 0.05);
      if (on) this.resume();
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume().catch(() => {});
    }

    get blocked() {
      return !!this.ctx && this.ctx.state !== "running" && this.fakeNow == null;
    }

    log(fn, args) {
      if (Array.isArray(window.__divPointersSfxLog)) window.__divPointersSfxLog.push({ t: performance.now() / 1000, fn, args });
    }

    ready() {
      return this.ctx && this.on && (this.fakeNow != null || this.ctx.state === "running");
    }

    // next 16th-note on the grid (or 8th for slow, low events)
    grid(div = 4) {
      const step = 60 / this.bpm / div;
      const now = this.now() + 0.015;
      const k = Math.ceil((now - this.t0) / step);
      return { when: this.t0 + k * step, slot: `${div}:${k}` };
    }

    pan(x, vw) {
      return clamp((x / Math.max(1, vw)) * 1.6 - 0.8, -0.8, 0.8);
    }

    bus(when, pan, send) {
      const g = this.ctx.createGain();
      const p = this.ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, when);
      g.connect(p);
      p.connect(this.master);
      if (send) {
        const s = this.ctx.createGain();
        s.gain.value = send;
        p.connect(s);
        s.connect(this.verb);
      }
      return g;
    }

    // Glass piano: a few sine partials (one inharmonic, for the glass) with a
    // soft felt-hammer tick, long exponential ring.
    piano(midi, when, vel, pan, ring = 2.4) {
      const now = this.now();
      this.ends = this.ends.filter((e) => e > now);
      if (this.ends.length >= 28) return;
      const ctx = this.ctx;
      const f = mtof(midi);
      const v = this.bus(when, pan, 0.85);
      v.gain.value = 0.3 * vel;
      const hi = f > 900;
      const parts = [
        [1, 1, 1],
        [2, 0.38, 0.55],
        [3, 0.12, 0.32],
        [2.756, 0.16, 0.42],
        [5.4, 0.05, 0.16],
      ];
      let last = null;
      for (const [r, a, d] of parts) {
        if (f * r > 15000) continue;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * r * (1 + (Math.random() - 0.5) * 0.002);
        const g = ctx.createGain();
        const dec = ring * d * (hi ? 0.65 : 1);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(a, when + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0006, when + dec);
        o.connect(g);
        g.connect(v);
        o.start(when);
        o.stop(when + dec + 0.05);
        last = o;
      }
      this.hammer(when, v, f, 0.5);
      this.ends.push(when + ring * (hi ? 0.65 : 1));
      if (last) last.onended = () => v.disconnect();
    }

    hammer(when, dest, f, amt) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(9000, f * 4 + 1200);
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.25 * amt, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0005, when + 0.03);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(when, Math.random());
      src.stop(when + 0.05);
    }

    // short filtered-noise ticks: typing and clicks
    tick(when, pan, freq, q, vel, len) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = this.bus(when, pan, 0.06);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel, when + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0004, when + len);
      src.connect(bp);
      bp.connect(g);
      src.start(when, Math.random() * 1.2);
      src.stop(when + len + 0.02);
      src.onended = () => g.disconnect();
    }

    // ---- events (screen coords in; all plain numbers so a log can be replayed)

    // one mechanical key: a sharp click on top of a short "thock" (deeper for space)
    clack(when, pan, space, vel = 1) {
      this.tick(when, pan, rand(3600, 5600), 2.2, rand(0.2, 0.3) * vel, rand(0.006, 0.011));
      this.tick(when + rand(0.001, 0.005), pan, space ? rand(380, 560) : rand(850, 1500), 1.6, (space ? 0.26 : rand(0.13, 0.2)) * vel, space ? 0.065 : rand(0.025, 0.042));
    }

    key(x, vw, id, n = 1, space = 0) {
      this.log("key", [x, vw, id, n, space]);
      if (!this.ready()) return;
      const t = this.now();
      if (t - (this.lastKey.get(id) || -1) < 0.024) return;
      this.keyTimes = this.keyTimes.filter((k) => t - k < 1);
      if (this.keyTimes.length > 80) return;
      this.lastKey.set(id, t);
      const pan = this.pan(x, vw);
      // a burst of characters in one frame becomes a quick roll of keys
      let at = t + 0.004;
      for (let k = 0; k < Math.min(n, 3) && this.keyTimes.length <= 80; k++) {
        this.keyTimes.push(t);
        this.clack(at, pan, space && k === 0, rand(0.75, 1));
        at += rand(0.018, 0.032);
      }
    }

    // a mouse button: press click, then a lighter release
    press(x, vw) {
      this.log("press", [x, vw]);
      if (!this.ready()) return;
      const t = this.now();
      this.pressTimes = this.pressTimes.filter((k) => t - k < 1);
      if (this.pressTimes.length > 40) return;
      this.pressTimes.push(t);
      const pan = this.pan(x, vw);
      this.tick(t + 0.004, pan, rand(2100, 2700), 4, 0.32, 0.012);
      this.tick(t + 0.005, pan, rand(650, 850), 2, 0.16, 0.022);
      this.tick(t + rand(0.055, 0.075), pan, rand(2900, 3400), 4, 0.15, 0.008);
    }

    // a finished element: rect, image, text, line, dup, guide, edit, restyle
    place(kind, x, y, w, h, vw, vh, fs) {
      this.log("place", [kind, x, y, w, h, vw, vh, fs]);
      if (!this.ready()) return;
      // only boxes, media, duplicates and guides sing; text and lines stay percussive
      if (kind === "text" || kind === "edit" || kind === "line") return;
      const area = (w * h) / Math.max(1, vw * vh);
      let oct;
      if (kind === "text") oct = fs >= 40 ? 2 : fs >= 22 ? 3 : 4;
      else if (kind === "guide") oct = 5;
      else oct = area > 0.08 ? 1 : area > 0.015 ? 2 : area > 0.002 ? 3 : 4;
      const deg = Math.floor(clamp(x / Math.max(1, vw), 0, 0.999) * 5);
      const midi = E2 + oct * 12 + PENTA[deg];
      const { when, slot } = this.grid(2);
      const seen = this.slots.get(slot) || [];
      if (seen.length >= 1) return;
      seen.push(midi);
      this.slots.set(slot, seen);
      if (this.slots.size > 64) this.slots.delete(this.slots.keys().next().value);
      const off = y < -40 || y > vh + 40 ? 0.45 : 1;
      const pan = this.pan(x, vw);
      const vel = ({ rect: 0.55, image: 0.5, dup: 0.5, guide: 0.3, restyle: 0.34 }[kind] || 0.4) * 0.42;
      const ring = oct <= 1 ? 3.6 : oct >= 4 ? 1.6 : 2.4;
      this.piano(midi, when, vel * off, pan, ring);
      if (kind === "image") this.piano(midi + (PENTA[(deg + 2) % 5] - PENTA[deg] + 12) % 12, when + 0.04, vel * 0.6 * off, pan, ring);
      if (kind === "dup") this.piano(E2 + 12 + (deg % 2 ? 7 : 0), when, 0.15 * off, pan * 0.5, 2.8);
    }

    // headings stepping up in size: a little rising run
    grow(step, x, vw) {
      this.log("grow", [step, x, vw]);
      if (!this.ready()) return;
      const t = this.now() + 0.004;
      this.tick(t, this.pan(x, vw), 2400 + step * 260, 5, 0.12, 0.01);
    }

    snap(x, vw) {
      this.log("snap", [x, vw]);
      if (!this.ready()) return;
      const t = this.now() + 0.004;
      const pan = this.pan(x, vw);
      this.tick(t, pan, 4800, 3, 0.36, 0.012);
      this.tick(t + 0.002, pan, 1200, 2, 0.2, 0.03);
    }

    // the page dissolving: an airy swell over a low open fifth
    intro() {
      this.log("intro", []);
      if (!this.ready()) return;
      const ctx = this.ctx;
      const t = this.now() + 0.02;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
      bp.frequency.exponentialRampToValueAtTime(900, t + 1.8);
      const g = this.bus(t, 0, 0.6);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
      src.connect(bp);
      bp.connect(g);
      src.start(t);
      src.stop(t + 2.3);
      src.onended = () => g.disconnect();
      for (const [m, d] of [[E2, 0], [E2 + 7, 0.08], [E2 + 12, 0.16]]) this.pad(m, t + 0.3 + d, 0.07, 2.6);
    }

    pad(midi, when, vel, len) {
      const ctx = this.ctx;
      const g = this.bus(when, 0, 0.9);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel, when + len * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0005, when + len);
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = mtof(midi);
        o.detune.value = det;
        o.connect(g);
        o.start(when);
        o.stop(when + len + 0.05);
      }
    }

    // the swarm fans out: E G# B E arpeggio on the grid
    start() {
      this.log("start", []);
      if (!this.ready()) return;
      const { when } = this.grid(4);
      const step = 60 / this.bpm / 4;
      [E2 + 24, E2 + 28, E2 + 31, E2 + 36, E2 + 40].forEach((m, i) => this.piano(m, when + i * step, 0.2, -0.5 + i * 0.25, 2));
    }

    // the last chord rings: E major add9, strummed
    finale() {
      this.log("finale", []);
      if (!this.ready()) return;
      const { when } = this.grid(2);
      const chord = [E2, E2 + 7, E2 + 12, E2 + 16, E2 + 19, E2 + 26, E2 + 28, E2 + 31, E2 + 36, E2 + 43];
      chord.forEach((m, i) => this.piano(m, when + i * 0.035, 0.34 - i * 0.015, -0.6 + (i / chord.length) * 1.2, 5.5));
      this.pad(E2 + 12, when, 0.05, 5);
    }

    // back to the real page: a falling sweep
    release() {
      this.log("release", []);
      if (!this.ready()) return;
      const ctx = this.ctx;
      const t = this.now() + 0.01;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1;
      bp.frequency.setValueAtTime(3000, t);
      bp.frequency.exponentialRampToValueAtTime(220, t + 1);
      const g = this.bus(t, 0, 0.5);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
      src.connect(bp);
      bp.connect(g);
      src.start(t);
      src.stop(t + 1.2);
      this.piano(E2 + 12, t + 0.05, 0.3, 0, 2.5);
    }

    close(after = 0) {
      if (!this.ctx || this.fakeNow != null) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(0, t + Math.max(0.05, after));
      setTimeout(() => ctx.close().catch(() => {}), (after + 0.2) * 1000);
    }
  }

  // ------------------------------------------------------- restart carry-over

  // A content+layer+kind key used to match the same real content across two
  // separate captures of the same page (e.g. immediately before and after an
  // in-page tab or route swap), independent of exactly where in traversal
  // order it happened to fall this time.
  function itemSig(it) {
    return it.kind + "|" + it.layer + "|" + (it.sig != null ? it.sig : "");
  }
  function itemPos(it) {
    return it.kind === "text" ? { x: it.tb.x, y: it.tb.y } : { x: it.x, y: it.y };
  }

  // Snaps an item straight to the fully-drawn state its own generator would
  // leave it in, bypassing the cursor animation entirely - mirrors the final
  // few lines of drawBox/drawLine/drawText (and the "master" finish step in
  // duplicate()) rather than inventing a new visual state of its own.
  function finishItemInstantly(it) {
    it.vis = true;
    it.mode = "own";
    if (it.kind === "rect" || it.kind === "image") {
      it.styled = true;
      it.draw = null;
    } else if (it.kind === "line") {
      it.edit = false;
      it.owner = null;
      it.placed = it.pts.length;
    } else if (it.kind === "text") {
      it.editing = false;
      it.selAll = false;
      it.shown = it.total;
      it.scale = 1;
      it.dx = 0;
      it.dy = 0;
    }
    it.done = true;
    bump(it);
  }

  // A composite signature for one duplicate-group "copy" (e.g. one row of a
  // sidebar list that was drawn by cloning a master row): every one of its
  // own items' signatures, in order. Two copies only match if everything in
  // them does - the whole row's worth of content, not just one field of it.
  function copySig(items) {
    let s = "";
    for (const it of items) s += itemSig(it) + "|";
    return s;
  }

  // Lines the new capture up against the one a quiet auto-restart is
  // replacing - same kind of content, same text or image or box styling,
  // same spot - so it just appears the way it already looked a moment ago
  // instead of being wiped and redrawn. Only what's actually new or changed
  // (the swapped-in tab/panel content) gets the cursor-drawn build. This is
  // the same idea keyed list reconciliation uses in React/Vue/Snabbdom-style
  // virtual-DOM diffing: match by a content key instead of by position, so
  // reordering or leaving things alone doesn't get mistaken for a change.
  //
  // Plain items (their own individual task) are matched one at a time by
  // kind+layer+content signature. A duplicate group - a sidebar's list of
  // conversations, a row of nav links, a grid of cards, all drawn as one
  // master plus cloned copies - is matched one COPY at a time instead, by
  // the combined signature of everything in that copy: a sidebar list is
  // exactly this shape, and without this, every row in it would redraw on
  // every restart even when none of them changed, just because the item-by-
  // item pass above skips anything that isn't its own plain, individually-
  // tasked item.
  function carryOverUnchanged(model, prevModel) {
    if (!prevModel) return;
    const pool = new Map(); // signature -> queue of old items, capture order
    for (const old of prevModel.items) {
      // A once-duplicated item still counts as existing content here, even
      // though it isn't one of this pass's own match targets below (a copy
      // never has its own individual task - see the group pass further
      // down): a list row that toggles out of its group entirely (e.g. it
      // picks up a one-off "active" class that no longer matches its
      // neighbors' signature) becomes a plain item with its own task on the
      // *new* side, and it should still find its own already-drawn self here.
      if (old.twinOf || old.glyph) continue;
      const k = itemSig(old);
      let q = pool.get(k);
      if (!q) pool.set(k, (q = []));
      q.push(old);
    }
    // `posOf` extracts {x,y} from whatever's in the queue - a plain item
    // (via itemPos) or a duplicate-group copy (via its own box) - since the
    // two pools below hold different kinds of thing at the same position.
    const matchClosest = (q, p, within, posOf) => {
      let bestIx = -1;
      let bestD = within;
      for (let i = 0; i < q.length; i++) {
        const op = posOf(q[i]);
        const d = Math.abs(op.x - p.x) + Math.abs(op.y - p.y);
        if (d < bestD) {
          bestD = d;
          bestIx = i;
        }
      }
      return bestIx;
    };
    for (const it of model.items) {
      if (it.copyOf || it.twinOf || it.glyph || !it.task || it.task.state !== "wait") continue;
      const q = pool.get(itemSig(it));
      if (!q || !q.length) continue;
      // The closest-positioned candidate, not just the first in the queue -
      // repeated identical content (two "Cancel" buttons, a repeated price)
      // can share a signature while sitting in very different spots.
      const ix = matchClosest(q, itemPos(it), 4, itemPos); // within ~4px counts as "the same spot"
      if (ix === -1) continue;
      q.splice(ix, 1);
      finishItemInstantly(it);
      it.task.state = "done";
    }

    if (!model.groups || !prevModel.groups) return;
    const copyPool = new Map();
    const addToCopyPool = (c) => {
      if (!c || !c.items || !c.items.length) return;
      const k = copySig(c.items);
      let q = copyPool.get(k);
      if (!q) copyPool.set(k, (q = []));
      q.push(c);
    };
    for (const g of prevModel.groups) {
      for (const c of g.dst || []) addToCopyPool(c);
      // The master row counts as a candidate too - which row in a group was
      // "the master" (own individual tasks) versus "a duplicate" (one shared
      // task) is an artifact of which rows happened to bucket together on
      // that particular capture (a row with a one-off "active"/"selected"
      // class drops out of the bucket entirely, which can bump a different
      // row into the master slot next time). A sidebar row that was the
      // master a moment ago and is now just another duplicate should still
      // find its own already-drawn self here.
      addToCopyPool(g.src);
    }
    for (const g of model.groups) {
      for (const c of g.dst || []) {
        if (!c.items.length || !c.task || c.task.state !== "wait") continue;
        const q = copyPool.get(copySig(c.items));
        if (!q || !q.length) continue;
        const ix = matchClosest(q, { x: c.box.x, y: c.box.y }, 6, (cc) => ({ x: cc.box.x, y: cc.box.y }));
        if (ix === -1) continue;
        q.splice(ix, 1);
        c.task.state = "done";
        for (const it of c.items) {
          if (it.twinOf) continue; // leave its own twin-sync alone
          finishItemInstantly(it);
          if (it.editTask) it.editTask.state = "done";
        }
      }
    }
  }

  // Decides whether an auto-triggered restart actually has anything new to
  // show before committing to one at all. Crossing the mutation bar above
  // only means "enough happened to be worth a look" - it doesn't mean any of
  // it was content a viewer would call new. A page with enough background
  // chatter to keep crossing that bar (a live dashboard re-rendering its own
  // rows, a chat widget's read-receipts, anything polling) would otherwise
  // restart every couple of seconds for as long as that chatter continues,
  // forever, since the cooldown above only paces that out rather than ever
  // ruling it out - and since every restart tears the current build down and
  // puts a new one up, even one that then finds everything carries over
  // instantly, that's still a visible blank-and-back flash each time: from
  // the outside, indistinguishable from "it keeps restarting on its own,"
  // which is exactly this bug.
  //
  // So: capture what's on screen right now, diff it against what's already
  // drawn using the exact same matching carryOverUnchanged uses for a real
  // restart, and only go through with one if something is actually left
  // over unmatched. This costs one extra, thrown-away capture per burst that
  // crosses the bar - cheap next to a capture the real restart was going to
  // do anyway - in exchange for never flashing the page for nothing. Any
  // uncertainty (no baseline yet, a capture that throws) falls through to
  // "yes, restart" - the safe side is drawing something extra, never going
  // silent on a real change.
  function hasNewContentToShow() {
    if (!app || !app.model || !app.env) return true;
    try {
      const trial = captureModel(app.env, null);
      carryOverUnchanged(trial, app.model);
      for (const t of trial.tasks) if (t.state === "wait") return true;
      return false;
    } catch (_) {
      return true;
    }
  }

  // -------------------------------------------------------------------- app

  class App {
    constructor() {
      this.dead = false;
      this.t0 = performance.now();
      this.tour = false;
      this.tourV = 0;
      this.tourAcc = 0;
      this.speeds = [1, 2, 3];
      this.speedIx = 0;
      this.complete = false;
      this.timing = {};
      this.recorder = null;
      this.recordStream = null;
      this.recordChunks = [];
      this.recordStart = 0;
      this.recordBusy = false;
    }

    async loadShot() {
      let src = window.__divPointersShot;
      window.__divPointersShot = null;
      if (src) lastShot = { src, at: this.env.geom() };
      else if (lastShot) src = lastShot.src; // Replay reuses the click-time screenshot
      if (!src) return null;
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch (_) {
        return null;
      }
      const g = lastShot && lastShot.src === src ? lastShot.at : this.env.geom();
      return { img, sx: g.sx, sy: g.sy, scale: img.naturalWidth / innerWidth, valid: false };
    }

    // `quiet`: used for an auto-triggered follow-along restart (a single-page
    // app's own route change - see scheduleSpaRestart), as opposed to the
    // user deliberately clicking the icon or Replay. Those are a one-time
    // event worth a flourish: wipe to blank, orbit the favicon, pause, THEN
    // fan out and build. Doing that same flourish on every route change the
    // user didn't ask for reads as "it's starting over from scratch" and (on
    // a tall page) visibly scrolls the viewport during the scan pass, on top
    // of a page they're actively using - so a quiet restart skips the orbit
    // intro, the artificial pause, and the scroll-triggering scan entirely,
    // and goes straight from "old content frozen" to "cursors drawing the
    // new content" as fast as a real capture allows.
    async run(opts) {
      const quiet = !!(opts && opts.quiet);
      this.viewportOnly = !!opts?.viewportOnly;
      this.env = detectEnv();
      this.env.route = !!(opts && opts.route);
      this.routerManaged = !!opts?.routerManaged;
      const shotP = this.loadShot();
      this.view = new View(this.env);
      if (this.env.route) {
        this.releasePersistentClip = bindRouteLayout(this.view.host);
        // The cover owns the first frames. Never fade through the real page
        // while handing off to the new model, including when cover is disabled.
        // A site can paint its body with a translucent gradient; give it the
        // browser's opaque canvas underneath, just as the real page would have.
        this.view.host.style.setProperty("color-scheme", getComputedStyle(document.documentElement).colorScheme, "important");
        this.view.host.style.setProperty("background-color", "Canvas", "important");
        this.view.bg.style.transition = "none";
        this.view.bg.classList.add("on");
        if (opts.covered) this.view.host.style.setProperty("visibility", "hidden", "important");
      }
      this.engine = new Engine(this.view, this.viewportOnly);
      this.sfx = new Sound(opts?.playback);
      this.sfx.init();
      this.engine.sfx = this.sfx;
      this.engine.onStart = () => {
        this.view.intro.classList.add("gone");
        if (this.env.route) this.view.host.style.removeProperty("visibility");
        opts?.onDrawing?.();
      };
      this.engine.onComplete = () => this.onComplete();
      this.bind();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
      await nextFrame();
      if (this.dead) return;
      this.renderSoundBtn();
      this.renderCursorStyleBtn();
      this.renderRecordBtn();
      this.renderFormatBtn();
      this.renderHudCollapse();
      this.renderHudVertical();
      this.positionHud();
      this.bindHudDrag();
      if (!quiet && !this.env.route) this.sfx.intro();
      this.view.bg.classList.add("on");
      if (!quiet && !this.env.route) this.view.intro.classList.add("on");
      this.view.hud.classList.add("on");
      const mark = (k) => (this.timing[k] = Math.round(performance.now() - this.t0));
      if (!this.env.route) await sleep(quiet ? 60 : 520);
      await unhidePage();
      mark("blank");
      if (this.dead) return;
      const extra = quiet ? 0 : Math.max(0, Number(THEME.captureDelay) || 0);
      if (extra) await sleep(extra);
      if (this.dead) return;
      if (!quiet && !opts?.playback && !this.viewportOnly) await this.scan();
      mark("scan");
      if (this.dead) return;
      try {
        await Promise.race([document.fonts.ready, sleep(quiet ? 300 : 1200)]);
      } catch (_) {}
      mark("fonts");
      if (typeof window.__swarmCursorsWaitIdle === "function") {
        await window.__swarmCursorsWaitIdle();
        if (this.dead) return;
      }
      mark("idle");
      this.view.measure();
      const shot = await shotP;
      if (this.dead) return;
      if (shot) {
        const g = this.env.geom();
        shot.valid = Math.abs(g.sx - shot.sx) < 1 && Math.abs(g.sy - shot.sy) < 1;
      }
      let model;
      try {
        model = captureModel(this.env, shot);
      } catch (err) {
        console.error("[divPointers] capture failed", err);
        model = { items: [], tasks: [], groups: [], guides: [], docW: 0, docH: 0 };
      }
      mark("capture");
      if (this.dead) return;
      this.view.mount(model);
      // Unmarked shared content can still carry over between captures.
      if (opts && opts.prevModel) carryOverUnchanged(model, opts.prevModel);
      this.engine.setModel(model);
      this.model = model;
      this.watchLiveRegions();
      mark("mount");
      if (!quiet && !this.env.route) {
        const wait = 1500 - (performance.now() - this.t0);
        if (wait > 0) await sleep(wait);
      }
      if (this.dead) return;
      this.engine.start();
    }

    watchLiveRegions() {
      const regions = document.querySelectorAll("[data-swarm-live-region]");
      if (!regions.length) return;
      this.liveObserver = new MutationObserver((mutations) => {
        if (!mutations.some(({ target }) => {
          const el = target.nodeType === 1 ? target : target.parentElement;
          return el && !el.closest("[data-swarm-glyph]");
        })) return;
        // Structural updates belong to the live page. Keep the app responsive
        // and avoid crossing from a stale picture to a different layout.
        this.handoff();
      });
      for (const region of regions) this.liveObserver.observe(region, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["class", "hidden", "open", "style", "aria-hidden"],
      });
    }

    handoff() {
      if (app === this) stop(false, true);
      else this.finishFade?.();
    }

    layoutMatches() {
      if (!this.model?.anchors || !this.view.host.isConnected) return true;
      const vp = this.view.vp;
      const world = worldBounds(vp);
      let checked = 0;
      for (const { el, box, layer } of this.model.anchors) {
        if (layer === "world" && (!world || !intersect(boxBounds(box), world))) continue;
        const r = el.getBoundingClientRect();
        const x = box.x + (layer === "world" ? vp.ox - vp.sx : 0);
        const y = box.y + (layer === "world" ? vp.oy - vp.sy : 0);
        if (!el.isConnected || Math.max(
          Math.abs(x - r.left), Math.abs(y - r.top),
          Math.abs(box.w - r.width), Math.abs(box.h - r.height),
        ) > 2) return false;
        if (++checked === 256) break;
      }
      return true;
    }

    async scan() {
      const env = this.env;
      const g = env.geom();
      const H = env.scrollHeight();
      if (H <= g.vh * 1.25) return;
      this.view.frozen = { ...this.view.vp };
      const steps = Math.min(28, Math.ceil(H / (g.vh * 0.85)));
      for (let i = 1; i <= steps && !this.dead; i++) {
        env.scrollTo(Math.min(H, (H / steps) * i));
        await nextFrame();
        await sleep(30);
      }
      if (this.dead) return;
      env.scrollTo(g.sy, g.sx);
      await nextFrame();
      await sleep(750);
      if (this.dead) return;
      env.scrollTo(g.sy, g.sx);
      this.view.frozen = null;
    }

    bind() {
      const on = (t, ev, fn, o) => {
        t.addEventListener(ev, fn, o);
        (this.unbinds || (this.unbinds = [])).push(() => t.removeEventListener(ev, fn, o));
      };
      // Capture phase on document catches a "scroll" from ANY scrollable
      // element on the page (it isn't a bubbling event, but capture-phase
      // listeners on an ancestor still see it on the way down) — not just the
      // one main scroller the capture step tracks, now that other containers
      // (a sidebar, an inner panel) are free to scroll natively too.
      on(document, "scroll", (event) => {
        const primary = event.target === this.env.scroller || (this.env.isRoot && event.target === document);
        if (this.model && this.viewportOnly && ((this.complete && primary) ||
            (!primary && event.target?.closest?.("[data-swarm-live-region]")))) {
          this.handoff();
          return;
        }
        if (!this.view.frozen) this.view.syncWorld();
      }, { passive: true, capture: true });
      on(window, "resize", () => {
        if (this.model && this.viewportOnly) this.handoff();
        else this.view.measure();
      });
      on(window, "wheel", () => {
        if (this.engine.ready) this.engine.start();
      }, { passive: true });
      on(window, "pointermove", (e) => {
        this.engine.mouse = { x: e.clientX, y: e.clientY };
      }, { passive: true });
      on(document.documentElement, "pointerleave", () => {
        this.engine.mouse = null;
      });
      on(window, "keydown", (e) => {
        // Escape always works, even while a real field has focus - it's a
        // non-printable key that never ends up as typed content, so letting
        // it through can't interfere with normal writing.
        if (e.key === "Escape") {
          e.stopPropagation();
          stop(false);
          this.unlockSound();
          return;
        }
        // Beyond that, the real page is interactive now, so a real
        // input/textarea/select/contenteditable that has focus wins outright:
        // none of our letter shortcuts fire, and the keystroke is left
        // completely alone to reach the real field normally. Belt-and-
        // suspenders on top of that: every letter shortcut also requires
        // Ctrl+Shift held, so a plain typed "l", "v", "s" or "h" - anywhere,
        // even somewhere isRealFieldFocused doesn't recognize as a field -
        // can never be mistaken for one.
        if (isRealFieldFocused(this.view.host)) {
          this.unlockSound();
          return;
        }
        // e.code (the physical key, e.g. "KeyL"), not e.key, so this reads
        // the same physical key regardless of what character a given
        // modifier+layout combination would otherwise produce - belt and
        // suspenders alongside the Ctrl+Shift requirement itself.
        const withMod = e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey;
        if (e.code === "KeyS" && withMod) {
          this.sfx.setOn(!this.sfx.on);
          this.renderSoundBtn();
        } else if (e.code === "KeyL" && withMod) {
          this.toggleCursorStyle();
        } else if (e.code === "KeyV" && withMod) {
          this.toggleRecord();
        } else if (e.code === "KeyH" && withMod) {
          this.toggleHudCollapsed();
        }
        this.unlockSound();
      }, true);
      // browsers only let audio start after a click/keypress on the page
      on(window, "pointerdown", () => this.unlockSound(), true);
      on(this.view.hud, "click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const a = b.dataset.a;
        if (a === "close") stop(false);
        else if (a === "live") stop(true);
        else if (a === "replay") restart();
        else if (a === "tour") {
          this.tour = !this.tour;
          b.classList.toggle("on", this.tour);
          b.textContent = this.tour ? "Touring" : "Tour";
          if (this.tour) this.engine.start();
        } else if (a === "sound") {
          if (this.sfx.on && this.sfx.blocked) this.sfx.resume();
          else this.sfx.setOn(!this.sfx.on);
          setTimeout(() => this.renderSoundBtn(), 60);
        } else if (a === "speed") {
          this.speedIx = (this.speedIx + 1) % this.speeds.length;
          this.engine.speed = this.speeds[this.speedIx];
          b.textContent = this.speeds[this.speedIx] + "×";
        } else if (a === "cursorstyle") {
          this.toggleCursorStyle();
        } else if (a === "record") {
          this.toggleRecord();
        } else if (a === "format") {
          this.cycleFormat();
        } else if (a === "help") {
          this.toggleShortcuts(b);
        } else if (a === "hidebar") {
          // A real drag that happened to end on this button (the only thing
          // left to grab once the bar is collapsed - see bindHudDrag) still
          // fires a click afterward; swallow that one so dragging a
          // collapsed nub doesn't also toggle it back open mid-drag.
          if (this.hudJustDragged) {
            this.hudJustDragged = false;
          } else {
            this.toggleHudCollapsed();
          }
        } else if (a === "orientation") {
          this.toggleHudVertical();
        }
      });
      // Tapping anywhere outside the shortcuts popover closes it — including
      // on the real page now that it's clickable again, so this listens on
      // document, not just our own shadow root. e.composedPath() (not
      // e.target) is required here: a pointerdown that starts inside our
      // shadow DOM gets its e.target retargeted to the <div-pointers> host
      // for any listener outside that shadow tree, which would otherwise
      // make every click on our own HUD look like an "outside" click.
      on(document, "pointerdown", (e) => {
        const panel = this.view.root.querySelector(".shortcuts");
        if (!panel || !panel.classList.contains("on")) return;
        const path = e.composedPath();
        const helpBtn = this.view.root.querySelector('[data-a="help"]');
        if (path.includes(panel) || (helpBtn && path.includes(helpBtn))) return;
        panel.classList.remove("on");
      }, true);
    }

    // ---------------------------------------------------------- shortcuts
    // Opens the legend anchored above the "?" button itself, not centered on
    // the screen, so it visibly belongs to the button that opened it.
    toggleShortcuts(btn) {
      const panel = this.view.root.querySelector(".shortcuts");
      const willOpen = !panel.classList.contains("on");
      if (willOpen) {
        const r = btn.getBoundingClientRect();
        const ph = panel.getBoundingClientRect().height;
        const pw = panel.getBoundingClientRect().width;
        const cx = clamp(r.left + r.width / 2, 8 + pw / 2, innerWidth - 8 - pw / 2);
        panel.style.left = `${Math.round(cx)}px`;
        // Anchored above the button by default (the usual case, HUD near the
        // bottom); if the HUD has been dragged somewhere that would push the
        // panel off the top of the screen, flip it to open downward instead.
        const spaceAbove = r.top - 10;
        if (spaceAbove >= ph + 8) {
          panel.style.bottom = `${Math.round(innerHeight - r.top + 10)}px`;
          panel.style.top = "auto";
        } else {
          panel.style.top = `${Math.round(r.bottom + 10)}px`;
          panel.style.bottom = "auto";
        }
      }
      panel.classList.toggle("on", willOpen);
    }

    // ------------------------------------------------------- cursor style
    toggleCursorStyle() {
      setCursorStyle(cursorStyle === "glow" ? "solid" : "glow");
      this.renderCursorStyleBtn();
    }

    renderCursorStyleBtn() {
      const glow = cursorStyle === "glow";
      this.view.host.classList.toggle("cur-glow", glow);
      const b = this.view.root.querySelector('[data-a="cursorstyle"]');
      if (!b) return;
      b.innerHTML = glow ? CURSOR_ICON_GLOW : CURSOR_ICON_SOLID;
      b.title = `Cursor look: ${glow ? "glow" : "solid"} (${MODLABEL}L to switch)`;
    }

    // ------------------------------------------------------------ hud bar
    // Hide-to-a-nub and free dragging, both persisted so the bar stays where
    // (and whether) you left it. Position is plain left/top pixels rather
    // than the centering transform the default spot used to rely on, so a
    // drag and the open/close slide animation (still transform-based) don't
    // fight each other.
    toggleHudCollapsed() {
      setHudCollapsed(!hudCollapsed);
      this.renderHudCollapse();
    }

    renderHudCollapse() {
      this.view.hud.classList.toggle("collapsed", hudCollapsed);
      const b = this.view.root.querySelector('[data-a="hidebar"]');
      if (b) b.title = hudCollapsed ? `Show the toolbar (${MODLABEL}H)` : `Hide the toolbar (${MODLABEL}H)`;
    }

    // Lays the bar out as a column instead of a row. Re-runs positionHud()
    // afterward since swapping the flex direction changes the bar's own
    // width/height, and a position clamped against the OLD dimensions could
    // now sit partly off-screen (most noticeable once collapsed to a nub in
    // a corner).
    toggleHudVertical() {
      setHudVertical(!hudVertical);
      this.renderHudVertical();
      this.positionHud();
    }

    renderHudVertical() {
      this.view.hud.classList.toggle("vertical", hudVertical);
      const b = this.view.root.querySelector('[data-a="orientation"]');
      if (b) b.title = hudVertical ? "Lay the toolbar out as a row" : "Lay the toolbar out as a column";
    }

    positionHud() {
      const hud = this.view.hud;
      const saved = loadHudPos();
      const w = hud.offsetWidth, h = hud.offsetHeight;
      let x, y;
      if (saved) {
        x = clamp(saved.x, 8, Math.max(8, innerWidth - w - 8));
        y = clamp(saved.y, 8, Math.max(8, innerHeight - h - 8));
      } else {
        x = (innerWidth - w) / 2;
        y = innerHeight - h - 20;
      }
      hud.style.left = `${Math.round(x)}px`;
      hud.style.top = `${Math.round(y)}px`;
    }

    bindHudDrag() {
      const hud = this.view.hud;
      const on = (t, ev, fn, o) => {
        t.addEventListener(ev, fn, o);
        (this.unbinds || (this.unbinds = [])).push(() => t.removeEventListener(ev, fn, o));
      };
      let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0, startedOnHidebar = false;
      on(hud, "pointerdown", (e) => {
        const btn = e.target.closest("button");
        // Every other button is left alone so its own click still works
        // untouched. The hidebar button is the one exception: collapsed, its
        // own CSS hides everything else on the bar, so it's the only thing
        // left on screen to grab - without this a collapsed nub could never
        // be dragged again until expanded back out.
        if (btn && btn.dataset.a !== "hidebar") return;
        dragging = true;
        moved = false;
        startedOnHidebar = !!btn;
        startX = e.clientX;
        startY = e.clientY;
        const r = hud.getBoundingClientRect();
        origX = r.left;
        origY = r.top;
        hud.classList.add("dragging");
      });
      // Tracked on document, not hud itself, and deliberately WITHOUT
      // setPointerCapture: capturing on pointerdown would be the simpler way
      // to keep receiving move events once the pointer leaves the (small,
      // 40-ish px tall) bar - but it also reliably re-routes the browser's
      // own native "click" event afterward to whatever held the capture
      // instead of the button the press actually started on, no matter when
      // the capture is released. That's invisible for every other button
      // (pointerdown bails out for them above, so they never capture
      // anything), but it's exactly the hidebar button's own click that
      // this is needed to preserve - so capture is skipped entirely here,
      // and a document-level listener is used instead to keep tracking
      // movement anywhere on the page, bar bounds or not.
      on(document, "pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        const w = hud.offsetWidth, h = hud.offsetHeight;
        const x = clamp(origX + dx, 8, Math.max(8, innerWidth - w - 8));
        const y = clamp(origY + dy, 8, Math.max(8, innerHeight - h - 8));
        hud.style.left = `${Math.round(x)}px`;
        hud.style.top = `${Math.round(y)}px`;
      }, true);
      const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        hud.classList.remove("dragging");
        if (moved) {
          const r = hud.getBoundingClientRect();
          saveHudPos(r.left, r.top);
          // Only suppress the trailing click when the drag itself started on
          // the hidebar button (the collapsed-nub-reposition case this is
          // for). A drag that started elsewhere on the bar - the dots, the
          // background - ends with its own trailing click landing on
          // whatever it actually started over, never on hidebar, so this
          // must stay false then or it would wrongly eat the NEXT, unrelated
          // click on the hidebar button too.
          if (startedOnHidebar) {
            this.hudJustDragged = true;
            // Safety net: normally the drag's own trailing click consumes
            // this (see the hidebar click handler). But if the drag ended
            // up clamped against a screen edge, the cursor can land past
            // where the (clamped) button actually stopped, so that trailing
            // click misses the button entirely and never consumes the flag -
            // which would otherwise silently eat a later, unrelated click on
            // the same button too. A short timeout clears it regardless.
            clearTimeout(this.hudJustDraggedTimer);
            this.hudJustDraggedTimer = setTimeout(() => { this.hudJustDragged = false; }, 0);
          }
        }
      };
      on(document, "pointerup", endDrag, true);
      on(document, "pointercancel", endDrag, true);
    }

    // ------------------------------------------------------------- recording
    // One-click "give me a video." Uses the standard getDisplayMedia/MediaRecorder
    // web APIs — no extension permission needed, just a one-time browser picker
    // (the user picks "this tab" and ticks "share tab audio" to capture the
    // synthesized soundtrack too). No server, no extra manifest permissions.

    toggleRecord() {
      if (this.recordBusy) return;
      if (this.recorder && this.recorder.state === "recording") this.stopRecord(true);
      else this.startRecord();
    }

    async startRecord() {
      if (this.recordBusy || (this.recorder && this.recorder.state === "recording")) return;
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        const b = this.view.root.querySelector('[data-a="record"]');
        if (b) b.title = "Recording isn't supported in this browser";
        return;
      }
      this.recordBusy = true;
      this.renderRecordBtn();
      let stream;
      try {
        // preferCurrentTab/selfBrowserSurface are newer, optional hints (ignored
        // harmlessly on browsers that don't know them) that pre-select/offer this
        // tab in the share picker, so there's as little friction as possible.
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: "include",
        });
      } catch (_) {
        this.recordBusy = false;
        this.renderRecordBtn();
        return; // user cancelled the picker — not an error
      }
      const supported = (m) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(m);
      const candidates =
        recordFormat === "mp4"
          ? ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
          : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mime = candidates.find(supported);
      let rec;
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch (_) {
        for (const tr of stream.getTracks()) tr.stop();
        this.recordBusy = false;
        this.renderRecordBtn();
        return;
      }
      this.recordStream = stream;
      this.recorder = rec;
      this.recordChunks = [];
      this.recordStart = performance.now();
      // Use whatever the recorder actually ended up with, not just the
      // request: the candidate chain can fall back past what the user asked
      // for (e.g. mp4 requested but unsupported mid-chain → webm used).
      this._recordMime = rec.mimeType || mime || "video/webm";
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) this.recordChunks.push(e.data);
      };
      rec.onstop = () => this.saveRecording();
      // the user can also end the capture from the browser's own "Stop sharing"
      // bar — treat that exactly like pressing our own stop button.
      stream.getVideoTracks()[0].onended = () => {
        if (this.recorder && this.recorder.state !== "inactive") this.stopRecord(true);
      };
      rec.start(250);
      this.recordBusy = false;
      this.renderRecordBtn();
    }

    stopRecord(save) {
      if (!this.recorder) return;
      this._recordSave = save;
      if (this.recorder.state !== "inactive") this.recorder.stop();
      if (this.recordStream) for (const tr of this.recordStream.getTracks()) tr.stop();
      this.renderRecordBtn();
    }

    saveRecording() {
      const chunks = this.recordChunks;
      const save = this._recordSave;
      const mime = this._recordMime || "video/webm";
      this.recorder = null;
      this.recordStream = null;
      this.recordChunks = [];
      this._recordMime = null;
      this.renderRecordBtn();
      if (!save || !chunks.length) return;
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `divpointers-${(location.hostname || "page").replace(/[^a-z0-9.-]/gi, "_")}-${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // Format toggle: only offered when the browser can actually mux mp4
    // (checked once and cached); otherwise the button stays hidden and
    // webm — supported everywhere — is the only option.
    cycleFormat() {
      if (typeof MediaRecorder === "undefined") return;
      setRecordFormat(recordFormat === "mp4" ? "webm" : "mp4");
      this.renderFormatBtn();
    }

    renderFormatBtn() {
      const b = this.view.root.querySelector('[data-a="format"]');
      if (!b) return;
      if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
        b.hidden = true;
        return;
      }
      if (this._mp4Ok === undefined) {
        this._mp4Ok = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2") || MediaRecorder.isTypeSupported("video/mp4");
      }
      b.hidden = !this._mp4Ok;
      if (!this._mp4Ok) return;
      const mp4 = recordFormat === "mp4";
      b.textContent = mp4 ? "MP4" : "WebM";
      b.title = `Recording format: ${mp4 ? "MP4" : "WebM"} — click to switch`;
    }

    renderRecordBtn() {
      const b = this.view.root.querySelector('[data-a="record"]');
      if (!b) return;
      const recording = this.recorder && this.recorder.state === "recording";
      b.classList.toggle("on", !!recording);
      b.classList.toggle("busy", this.recordBusy);
      if (recording) {
        const secs = Math.floor((performance.now() - this.recordStart) / 1000);
        b.innerHTML = `⏹ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
        b.title = `Stop recording and download the video (${MODLABEL}V)`;
      } else {
        b.innerHTML = "⏺";
        b.title = this.recordBusy ? "Starting…" : `Record this rebuild as a video (${MODLABEL}V)`;
      }
    }

    unlockSound() {
      if (this.dead || !this.sfx || !this.sfx.blocked) return;
      this.sfx.resume();
      setTimeout(() => this.renderSoundBtn(), 80);
    }

    renderSoundBtn() {
      const b = this.view.root.querySelector('[data-a="sound"]');
      if (!b || !this.sfx) return;
      const tap = this.sfx.on && this.sfx.blocked;
      const key = this.sfx.on ? (tap ? "tap" : "on") : "off";
      if (b._k === key) return;
      b._k = key;
      b.classList.toggle("off", key === "off");
      b.classList.toggle("tap", tap);
      const waves = '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8"/>';
      const mute = '<path d="M11 6l4 4M15 6l-4 4"/>';
      b.innerHTML = `${SPK_ICON}${key === "off" ? mute : waves}</svg>${tap ? "<span>Tap for sound</span>" : ""}`;
      b.title = key === "off" ? `Sound off (${MODLABEL}S)` : `Sound on (${MODLABEL}S)`;
    }

    frame(now) {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      try {
        this.engine.step(dt);
        if (this.tour) this.tourStep(dt);
        this.view.render(this.engine);
        if (!this._hudT || now - this._hudT > 200) {
          this._hudT = now;
          this.updateHud();
          this.renderSoundBtn();
          if (this.recorder && this.recorder.state === "recording") this.renderRecordBtn();
        }
      } catch (err) {
        console.error("[divPointers]", err);
      }
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    tourStep(dt) {
      const E = this.engine;
      if (!E.started) return;
      const g = this.env.geom();
      const maxY = this.env.scrollHeight() - g.vh;
      if (g.sy >= maxY - 1) {
        this.tourV = 0;
        return;
      }
      const crew = Math.max(MIN_AGENTS, E.cursors.filter((c) => !c.leaving).length);
      const backlog = E.backlog();
      const target = backlog <= Math.max(4, crew * 0.6) ? 230 : backlog <= crew * 1.5 ? 80 : 0;
      this.tourV += (target - this.tourV) * Math.min(1, dt * 2.5);
      this.tourAcc += this.tourV * dt;
      if (this.tourAcc >= 1) {
        const d = Math.floor(this.tourAcc);
        this.tourAcc -= d;
        this.env.scrollBy(d);
      }
    }

    updateHud() {
      const E = this.engine;
      const v = this.view;
      if (!E.ready) return;
      const workers = E.cursors.filter((c) => c.worked).length + E.retired;
      const total = E.tasks.length;
      const done = E.doneCount;
      if (this.complete) return;
      if (!E.started) v.status.innerHTML = `<b>${E.cursors.length}</b> agents ready<span class="sep"></span>${total.toLocaleString()} layers`;
      else {
        const pend = E.tasks.length - done;
        const below = E.tasks.some((t) => t.state === "wait" && t.layer === "world" && t.gate > E.frontier);
        v.status.innerHTML =
          `<b>${workers}</b> agents<span class="sep"></span><b>${done.toLocaleString()}</b> / ${total.toLocaleString()} layers` +
          (below && pend && !this.tour && E.backlog() === 0 ? `<span class="sep"></span>scroll to keep building` : "");
      }
      v.barFill.style.width = total ? `${(done / total) * 100}%` : "0%";
      const busy = E.cursors.filter((c) => c.task).slice(-5);
      const key = busy.map((c) => c.id).join(",");
      if (key !== this._dots) {
        this._dots = key;
        v.dots.innerHTML = "";
        for (const c of busy) {
          const i = document.createElement("i");
          i.style.background = c.color;
          i.title = c.name;
          i.textContent = c.name[0];
          v.dots.appendChild(i);
        }
      }
    }

    onComplete() {
      this.complete = true;
      if (this.sfx) this.sfx.finale();
      const E = this.engine;
      const v = this.view;
      const workers = E.cursors.filter((c) => c.worked).length + E.retired;
      const secs = (E.endTime - E.startTime).toFixed(1);
      v.cursorsEl.style.transition = "opacity .65s ease";
      v.cursorsEl.style.opacity = "0";
      v.status.innerHTML = `Rebuilt by <b>${workers}</b> agents in <b>${secs}s</b>`;
      v.barFill.style.width = "100%";
      v.dots.innerHTML = "";
      v.root.querySelector('[data-a="live"]').hidden = false;
      v.root.querySelector('[data-a="replay"]').hidden = false;
      v.root.querySelector('[data-a="tour"]').hidden = true;
      v.root.querySelector('[data-a="speed"]').hidden = true;
      this.tour = false;
    }

    destroy(reveal, immediate) {
      if (reveal && !immediate) {
        this.view.syncWorld();
        if (!this.layoutMatches()) immediate = true;
      }
      if (this.recorder && this.recorder.state === "recording") this.stopRecord(true); // closing mid-record still saves the video
      unhidePage();
      if (this.sfx) {
        if (reveal) this.sfx.release();
        this.sfx.close(reveal ? 1.4 : 0.25);
      }
      const removeHost = () => {
        this.view.glyphObserver?.disconnect();
        this.liveObserver?.disconnect();
        this.view.host.remove();
        this.releasePersistentClip?.();
      };
      const finish = () => {
        this.finishFade = null;
        this.dead = true;
        cancelAnimationFrame(this.raf);
        for (const u of this.unbinds || []) u();
        removeHost();
      };
      if (immediate) {
        finish();
      } else if (reveal) {
        // Freeze the swarm and fade the overlay. No flocking, no flying to the
        // pointer; the cursors simply disappear with the veil.
        this.dead = true;
        cancelAnimationFrame(this.raf);
        this.view.hud.classList.remove("on");
        this.view.host.style.setProperty("transition", "opacity .65s ease", "important");
        this.view.host.style.setProperty("opacity", "0", "important");
        this.finishFade = finish;
        setTimeout(() => this.finishFade?.(), 800);
      } else {
        this.view.host.style.setProperty("transition", "opacity .25s ease", "important");
        this.view.host.style.setProperty("opacity", "0", "important");
        this.dead = true;
        cancelAnimationFrame(this.raf);
        for (const u of this.unbinds || []) u();
        setTimeout(removeHost, 260);
      }
    }
  }

  // background.js may have hidden everything but media for its screenshot;
  // put the page back once our canvas covers it (or if we bail out early).
  async function unhidePage() {
    if (!window.__divPointersHidden) return;
    window.__divPointersHidden = false;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) await chrome.runtime.sendMessage({ type: "divptr:unhide" });
    } catch (_) {}
    if (typeof window.__divPointersUnhide === "function") {
      try {
        window.__divPointersUnhide();
      } catch (_) {}
    }
    await nextFrame();
  }

  let app = null;
  let lastShot = null;

  function start(opts) {
    if (app) return;
    const current = app = new App();
    current.run(opts).catch((err) => {
      if (app !== current) return;
      app = null;
      if (current.view) current.destroy(false, true);
      else current.dead = true;
      console.error("[divPointers]", err);
      opts?.onError?.(err);
    });
  }

  function stop(reveal, immediate) {
    clearTimeout(spaRestartTimer);
    spaRestartTimer = null;
    pendingSpaRestart = false;
    if (!app) return;
    const a = app;
    app = null;
    a.destroy(reveal, immediate);
  }

  // `quiet`: see App.run's own comment - an auto-triggered follow-along
  // restart (an SPA route change), not the user clicking Replay.
  function restart(opts) {
    const quiet = !!(opts && opts.quiet);
    let carried = null;
    if (app) {
      const a = app;
      if (a.routerManaged) opts = { ...opts, routerManaged: true };
      // Hand the outgoing build's model to the new one so it can carry
      // forward whatever didn't actually change (see carryOverUnchanged) -
      // only worth doing for a quiet, auto-triggered restart; a deliberate
      // Replay should still draw everything fresh.
      if (quiet && a.model) opts = { ...(opts || {}), prevModel: a.model };
      if (quiet && a.env.route) opts = { ...opts, route: true };
      app = null;
      a.dead = true;
      cancelAnimationFrame(a.raf);
      for (const u of a.unbinds || []) u();
      a.view.glyphObserver?.disconnect();
      a.liveObserver?.disconnect();
      a.view.host.remove();
      a.releasePersistentClip?.();
      if (a.sfx) a.sfx.close(0.1);
      // Rebuild from where the first run started so a cached screenshot's
      // crop coordinates still line up - only meaningful for Replay, which
      // reuses that original screenshot; a quiet auto-restart's capture never
      // uses it (background.js only takes a new one on an actual toolbar
      // click), so realigning to it here would just be an unasked-for scroll
      // jump on top of whatever the user is doing.
      if (!quiet && lastShot) a.env.scrollTo(lastShot.at.sy, lastShot.at.sx);
      // Replay shouldn't cut a recording short — hand the live MediaRecorder/stream
      // off to the new App instance so one video can span several rebuilds.
      if (a.recorder && a.recorder.state === "recording") {
        carried = { recorder: a.recorder, stream: a.recordStream, chunks: a.recordChunks, start: a.recordStart, mime: a._recordMime };
      }
    }
    start(opts);
    if (carried && app) {
      const na = app;
      na.recorder = carried.recorder;
      na.recordStream = carried.stream;
      na.recordChunks = carried.chunks;
      na.recordStart = carried.start;
      na._recordMime = carried.mime;
      na.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) na.recordChunks.push(e.data);
      };
      na.recorder.onstop = () => na.saveRecording();
      const vt = carried.stream.getVideoTracks()[0];
      if (vt) vt.onended = () => {
        if (na.recorder && na.recorder.state !== "inactive") na.stopRecord(true);
      };
      na.renderRecordBtn();
    }
  }

  // Back/forward-cache guard. Chrome can freeze an entire page - including
  // this content script's JS heap, DOM, running rAF loop and timers - rather
  // than tearing it down, then resume it later exactly as it was when the
  // user navigates with the browser's own Back/Forward (event.persisted is
  // only true on that kind of restore, never on a normal fresh load). Without
  // this, going back to a page you left mid-rebuild resumes a now-stale swarm:
  // physics steps see a multi-second/minute `dt` jump from the freeze and the
  // cursors lurch or jump, which reads as "the old one is loading" - it's
  // really the same page's own frozen state waking back up, not a fresh
  // navigation. Simplest correct fix: treat a bfcache restore like the user
  // just clicked the icon again - stop cleanly (no reveal flourish) back to
  // the plain live page, so there's nothing stale on screen; clicking the
  // toolbar icon starts a correct, fresh rebuild of whatever's there now.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && app) stop(false);
  });

  // Single-page-app route-change watch. Lots of sites don't do a real,
  // cross-document navigation when you click a "link" - client-side routing
  // (React Router, Vue Router, Next.js, a hand-rolled pushState setup...)
  // swaps the DOM for a new "page" and this content script's own JS context
  // is never touched. Left alone, the rebuild just keeps showing a snapshot
  // of whatever was on screen when you first clicked the icon, frozen, while
  // the real page underneath has already moved on - that's the "it freezes
  // when I click a link" symptom. The fix: notice the route changed and
  // restart cleanly against the new content, so it looks like the swarm
  // follows you from "page" to "page" inside the app, the same way Replay
  // already restarts a finished rebuild.
  //
  // (A real cross-document navigation - a different URL, full reload - is a
  // separate case this can't cover: that tears down this whole script, and
  // getting back in automatically would need this extension to hold
  // always-on host permissions across every site instead of the one-click
  // activeTab grant it deliberately asks for today.)
  let spaRestartTimer = null;
  let spaRestartArmedAt = 0; // when the currently-pending debounce was first armed, not last re-armed
  let lastSpaRestartAt = 0;
  let pendingSpaRestart = false;
  // A floor between two auto-restarts, independent of the mutation-burst
  // debounce above: a page that keeps shoveling >40-node updates at the DOM
  // (a live dashboard, a chat feed) could otherwise retrigger every second or
  // two indefinitely. This doesn't block a genuine fast double route-change
  // (the debounce already coalesces those into one restart) - it only stops
  // a SECOND, separate restart from following too soon after the last one.
  const SPA_RESTART_COOLDOWN_MS = 2500;
  function fireSpaRestart() {
    if (!app || app.dead || app.routerManaged) return;
    // Typing into a real field is exactly the moment NOT to interrupt with a
    // rebuild: a live search box, an autocomplete dropdown, a comment box
    // with a running character count - any of these can easily add/remove
    // enough nodes on a single keystroke to cross the mutation bar below,
    // and a restart mid-sentence is precisely the "it's restarting while I'm
    // trying to write" disruption this whole mechanism exists to avoid, not
    // cause. Hold the restart until focus actually leaves every real field
    // instead of firing on the keystroke that happened to trip the observer.
    if (isRealFieldFocused(app.view.host)) {
      pendingSpaRestart = true;
      return;
    }
    const now = performance.now();
    const sinceLast = now - lastSpaRestartAt;
    if (sinceLast < SPA_RESTART_COOLDOWN_MS) {
      // Still cooling down from the last one - don't drop this route change
      // on the floor, just push it to right after the cooldown ends, so a
      // quick run of navigations still settles on the last one.
      spaRestartTimer = setTimeout(() => {
        spaRestartTimer = null;
        fireSpaRestart();
      }, SPA_RESTART_COOLDOWN_MS - sinceLast);
      return;
    }
    // Nothing actually new since the last build - drop this one rather than
    // flashing a restart for content that would just carry over unchanged
    // anyway (see hasNewContentToShow).
    if (!hasNewContentToShow()) return;
    lastSpaRestartAt = now;
    restart({ quiet: true });
  }
  // A burst of qualifying mutations re-arms this on every call, which is
  // exactly what coalescing a route swap's own sequence (old content
  // leaving, new content arriving, its images loading) needs - but nothing
  // stopped a burst that never actually stops (a live dashboard re-rendering
  // its own rows, anything polling fast enough to re-cross the mutation bar
  // more often than every 400ms) from re-arming this forever, which pushed
  // the eventual restart back indefinitely - not just an ambient-noise
  // restart, ANY restart, including one a real click or a real route change
  // was waiting on. SPA_RESTART_MAX_COALESCE_MS caps how long one burst can
  // keep pushing the timer back, counted from the first mutation in it, not
  // the latest - so sustained chatter still gets coalesced into a restart
  // roughly this often instead of never.
  const SPA_RESTART_DEBOUNCE_MS = 400;
  const SPA_RESTART_MAX_COALESCE_MS = 1200;
  function scheduleSpaRestart() {
    if (!app || app.dead || app.routerManaged) return;
    const now = performance.now();
    if (!spaRestartTimer) spaRestartArmedAt = now; // a fresh burst, not a continuation of one
    clearTimeout(spaRestartTimer);
    const elapsed = now - spaRestartArmedAt;
    const delay = Math.max(0, Math.min(SPA_RESTART_DEBOUNCE_MS, SPA_RESTART_MAX_COALESCE_MS - elapsed));
    spaRestartTimer = setTimeout(() => {
      spaRestartTimer = null;
      fireSpaRestart();
    }, delay);
  }
  // Catches a restart that was held back because a real field had focus,
  // and lets it through once focus genuinely leaves every real field (a
  // small settle delay since, mid-transition between two real fields - e.g.
  // Tab from one form input to the next - the browser hasn't necessarily
  // settled on the next activeElement at the instant focusout itself fires).
  window.addEventListener(
    "focusout",
    () => {
      if (!pendingSpaRestart) return;
      setTimeout(() => {
        if (pendingSpaRestart && app && !app.dead && !isRealFieldFocused(app.view.host)) {
          pendingSpaRestart = false;
          fireSpaRestart();
        }
      }, 50);
    },
    true
  );
  // Back/forward inside the app's own router. (pushState/replaceState - the
  // other way routers change the URL - can't be intercepted from here: that
  // would mean monkey-patching `history` in this script's own isolated JS
  // world, which the page's own main-world router code never sees or calls
  // through. The MutationObserver below is what actually catches those.)
  window.addEventListener("popstate", scheduleSpaRestart);
  // Watches the shared DOM itself rather than any particular routing API, so
  // it works no matter how a site swaps its content. Shadow-DOM encapsulation
  // already keeps our own HUD/cursor/canvas updates (all inside div-pointers'
  // shadow root) invisible to a light-DOM observer, so this only ever sees
  // changes the real page itself made.
  //
  // A plain node-count burst, on its own, misses two common tab/panel
  // patterns: a small tab swap (a heading and a couple of paragraphs is
  // nowhere near a 40-node burst - swapping a single wrapping container for
  // another, even one full of its own nested content, is just ONE node out
  // and ONE node in as far as a childList mutation record is concerned,
  // since MutationObserver only reports the immediate children that changed,
  // never the whole replaced subtree) and a tab library that keeps every
  // panel mounted and just toggles a `hidden` attribute or a CSS class on it
  // (zero nodes added or removed at all). Both still happen right after a
  // real click, though - which ordinary incidental page life (a toast, a
  // lazy image, an ad slot, a chat widget nudging itself) does not. So a
  // mutation - of either kind - within a short window of a real pointerdown
  // is held to a much lower bar than one with no recent interaction behind
  // it, rather than raising the one shared threshold and losing the
  // protection against that incidental noise.
  const CLICK_CORRELATION_MS = 800;
  const CLICK_CORRELATED_THRESHOLD = 2;
  const AMBIENT_THRESHOLD = 40;
  // Counts element nodes only, not text nodes: a live clock, a relative
  // "2 minutes ago" timestamp, a view counter - anything that updates by
  // reassigning .textContent - swaps a text node on every tick, which would
  // otherwise be nearly guaranteed to cross a bar this low within 800ms of
  // *any* click on a page that happens to have one running, regardless of
  // what that click actually did.
  // Our own <div-pointers> host element lives in the light DOM (appended
  // straight to document.documentElement, not inside any shadow root), so
  // its own comings and goings - and any style/class attribute changes made
  // directly on it (the opacity fade on stop, the cur-glow toggle, the --ph
  // custom property) - are otherwise fully visible to this same observer.
  // Every genuine restart removes and re-adds this exact element, which is
  // itself a childList mutation on document.documentElement weighing enough
  // to meet the low click-correlated threshold on its own - so left
  // unguarded, a real restart's own remount could immediately requeue
  // another one, and so on. None of this is ever real page content, so it's
  // excluded outright rather than counted.
  const isOurHost = (node) => !!node && OWN_HOSTS.has(node.localName);
  const countElementNodes = (list) => {
    let n = 0;
    for (const node of list) if (node.nodeType === 1 && !isOurHost(node)) n++;
    return n;
  };
  let spaMutationBudget = 0;
  let spaMutationWindowStart = 0;
  let lastRealInteractionAt = 0;
  // A real pointerdown anywhere on the page - tracked purely as a timing
  // signal for the threshold check below, not acted on by itself. It also
  // zeroes the budget so the click-correlated window counts only what
  // happens AFTER the click: without this, something unrelated that was
  // already ticking away on the page (a live clock, a relative "2 minutes
  // ago" timestamp, anything updating on its own timer) could have already
  // built up enough of a budget that the next click - whatever it's for -
  // tips it over the lowered bar on its own. A click that's actually on our
  // own HUD can set this same as any other; that's harmless, since our own
  // shadow-DOM updates are invisible to the light-DOM observer below
  // regardless, so it can never be what the subsequent mutation check is
  // reacting to.
  window.addEventListener(
    "pointerdown",
    () => {
      lastRealInteractionAt = performance.now();
      spaMutationBudget = 0;
      spaMutationWindowStart = lastRealInteractionAt;
    },
    true
  );
  const spaObserver = new MutationObserver((mutations) => {
    if (!app || app.dead || app.routerManaged) return;
    const now = performance.now();
    if (now - spaMutationWindowStart > 1000) {
      spaMutationWindowStart = now;
      spaMutationBudget = 0;
    }
    for (const m of mutations) {
      if (isOurHost(m.target)) continue; // our own style/class change on the host itself
      spaMutationBudget += m.type === "attributes" ? 1 : countElementNodes(m.addedNodes) + countElementNodes(m.removedNodes);
    }
    const threshold =
      now - lastRealInteractionAt < CLICK_CORRELATION_MS ? CLICK_CORRELATED_THRESHOLD : AMBIENT_THRESHOLD;
    if (spaMutationBudget >= threshold) {
      // Once a burst has crossed the bar, clear it right away rather than
      // leaving it sitting above threshold for the rest of the rolling
      // window: left alone, every later mutation observed before the window
      // naturally expires - even a single harmless, zero-weight one, like a
      // live clock's own text tick - would keep re-reading as "still over
      // threshold" and call this again, repeatedly clearing and re-arming
      // scheduleSpaRestart's own debounce timer. On a page with any sub-second
      // ambient churn that can delay the real restart far past its intended
      // debounce, or - worse - fire a second, unprompted one well after a
      // genuine restart already went out, which is what reads as the rebuild
      // restarting in a loop on its own.
      spaMutationBudget = 0;
      scheduleSpaRestart();
    }
  });
  spaObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style", "aria-hidden", "aria-selected", "aria-expanded", "aria-current"],
  });

  window[KEY] = {
    toggle() {
      if (app) stop(false);
      else start();
    },
    start,
    stop,
    get app() {
      return app;
    },
    debug: { captureModel, detectEnv, Sound },
  };
})();
