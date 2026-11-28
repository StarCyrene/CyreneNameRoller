// Framework-agnostic core: engine loading, start/stop state machine, optional
// floating pill, auto-start and router hooks. The Vue plugin is a thin layer
// on top of this.

import { createPill } from "./pill.js";
import { createCompanion } from "./companion.js";
import { createCover } from "./cover.js";

const DEFAULT_POSITION = "bottom-right";

function defaults() {
  const zh =
    (typeof document !== "undefined" && /^zh\b/i.test(document.documentElement.lang || "")) ||
    (typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language || ""));

  return {
    button: true,
    auto: false,
    autoDelay: 1800,
    autoOnRoute: false,
    routeDelay: 900,
    once: false,
    preload: false,
    position: DEFAULT_POSITION,
    theme: "dark",
    accent: "#A259FF",
    accentDark: "#D9408F",
    danger: "#F24822",
    colors: null,
    hud: false,
    sound: false,
    companion: true,
    companionMode: "follow",
    autoReveal: true,
    autoRevealDelay: 1600,
    captureDelay: 0,
    cover: true,
    coverColor: "#fef7fb",
    coverColorDark: "#1a0f16",
    zIndex: 2147483000,
    router: null,

    label: zh ? "看 AI 光标重建本页" : "Watch AI cursors rebuild this page",
    sublabel: zh ? "Swarm Cursors · 无需安装扩展" : "Swarm Cursors · no extension needed",
    loadingLabel: zh ? "正在召唤光标…" : "Summoning cursors…",
    loadingSublabel: zh ? "第一次加载大约 1 秒" : "First load takes about a second",
    errorLabel: zh ? "没加载成功，点我再试一次" : "Couldn't load — click to retry",
    errorSublabel: zh ? "检查页面是否允许加载脚本" : "Check that scripts are allowed on this page",
    replayLabel: zh ? "再看一次" : "Watch it again",
    replaySublabel: zh ? "让光标把这一页重新画一遍" : "Let the swarm redraw this page",
  };
}

function resolveOptions(options) {
  const d = defaults();
  const o = options || {};
  const labels = o.labels || {};
  const pick = (flat, key, fallback) => {
    if (o[flat] != null && o[flat] !== "") return o[flat];
    if (labels[key] != null && labels[key] !== "") return labels[key];
    return fallback;
  };

  return {
    ...d,
    ...o,
    button: o.button !== false,
    auto: !!o.auto,
    autoOnRoute: !!o.autoOnRoute,
    once: !!o.once,
    preload: !!o.preload,
    position: o.position || d.position,
    theme: o.theme || d.theme,
    accent: o.accent || d.accent,
    accentDark: o.accentDark || d.accentDark,
    danger: o.danger || d.danger,
    colors: Array.isArray(o.colors) && o.colors.length ? o.colors.slice() : null,
    hud: !!o.hud,
    sound: !!o.sound,
    companion: o.companion !== false,
    companionMode: o.companionMode === "replace" ? "replace" : "follow",
    autoReveal: o.autoReveal !== false,
    autoRevealDelay: Math.max(
      0,
      Number(o.autoRevealDelay != null ? o.autoRevealDelay : d.autoRevealDelay) || 0
    ),
    captureDelay: Math.max(
      0,
      Number(o.captureDelay != null ? o.captureDelay : d.captureDelay) || 0
    ),
    cover: o.cover !== false,
    coverColor: o.coverColor || d.coverColor,
    coverColorDark: o.coverColorDark || d.coverColorDark,
    zIndex: o.zIndex != null ? o.zIndex : d.zIndex,
    autoDelay: Math.max(0, Number(o.autoDelay != null ? o.autoDelay : d.autoDelay) || 0),
    routeDelay: Math.max(0, Number(o.routeDelay != null ? o.routeDelay : d.routeDelay) || 0),
    label: pick("label", "label", d.label),
    sublabel: pick("sublabel", "sublabel", d.sublabel),
    loadingLabel: pick("loadingLabel", "loading", d.loadingLabel),
    loadingSublabel: pick("loadingSublabel", "loadingSub", d.loadingSublabel),
    errorLabel: pick("errorLabel", "error", d.errorLabel),
    errorSublabel: pick("errorSublabel", "errorSub", d.errorSublabel),
    replayLabel: pick("replayLabel", "replay", d.replayLabel),
    replaySublabel: pick("replaySublabel", "replaySub", d.replaySublabel),
  };
}

function noopCore() {
  const state = {
    running: false,
    loading: false,
    loaded: false,
    played: false,
    pageEnabled: true,
    pageHud: false,
    error: null,
  };
  return {
    state,
    getState: () => ({ ...state }),
    getOptions: () => ({}),
    start: () => Promise.resolve(),
    stop() {},
    toggle() {},
    setPageEnabled() {},
    attachRouter() {
      return () => {};
    },
    destroy() {},
    on() {
      return () => {};
    },
  };
}

// Track in-flight fetches/XHRs so the engine can wait for a page's dynamic
// content before capturing it. Without this, a page that is still fetching
// release/API data gets captured in its "loading" state, and the rebuild
// briefly shows spinners that the real page has already replaced.
function installNetworkTracker() {
  if (typeof window === "undefined") return null;
  if (window.__swarmCursorsNet) return window.__swarmCursorsNet;

  const net = {
    inflight: 0,
    last: typeof performance !== "undefined" ? performance.now() : Date.now(),
  };

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = function () {
        net.inflight++;
        net.last = performance.now();
        try {
          return origFetch.apply(this, arguments).finally(function () {
            net.inflight--;
            net.last = performance.now();
          });
        } catch (err) {
          net.inflight--;
          throw err;
        }
      };
    }
  } catch (_) {}

  try {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (proto && !proto.__swarmCursorsPatched) {
      const open = proto.open;
      const send = proto.send;
      proto.open = function () {
        this.__swarmCursorsTracked = true;
        return open.apply(this, arguments);
      };
      proto.send = function () {
        if (this.__swarmCursorsTracked) {
          net.inflight++;
          net.last = performance.now();
          this.addEventListener(
            "loadend",
            function () {
              net.inflight--;
              net.last = performance.now();
            },
            { once: true }
          );
        }
        return send.apply(this, arguments);
      };
      proto.__swarmCursorsPatched = true;
    }
  } catch (_) {}

  net.waitIdle = function (quiet, timeout) {
    const q = quiet == null ? 600 : quiet;
    const max = timeout == null ? 8000 : timeout;
    const started = performance.now();
    return new Promise(function (resolve) {
      const check = function () {
        const now = performance.now();
        if ((net.inflight === 0 && now - net.last >= q) || now - started >= max) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  };

  window.__swarmCursorsNet = net;
  window.__swarmCursorsWaitIdle = function () {
    return net.waitIdle(600, 8000);
  };
  return net;
}

export function createSwarmCursors(options) {
  if (typeof window === "undefined" || typeof document === "undefined") return noopCore();

  installNetworkTracker();

  const opts = resolveOptions(options);
  const listeners = new Map();
  const state = {
    running: false,
    loading: false,
    loaded: false,
    played: false,
    pageEnabled: true,
    pageHud: opts.hud,
    error: null,
  };

  let pageOpts = {
    enabled: true,
    hud: opts.hud,
    sound: opts.sound,
    companion: opts.companion,
    autoReveal: opts.autoReveal,
    captureDelay: opts.captureDelay,
  };

  let engine = null;
  let enginePromise = null;
  let pill = null;
  let companion = null;
  let cover = null;
  let coverTimer = null;
  // A confirmed build may still be inside routeDelay, before an engine exists.
  let committedCover = null;
  let poll = null;
  let showTimer = null;
  let autoTimer = null;
  let revealTimer = null;
  let revealScheduled = false;
  let routerOff = null;
  let routerBeforeOff = null;
  let routerErrorOff = null;
  let routerAttached = false;
  let routerEpoch = 0;
  let pendingRoute = null;
  let destroyed = false;
  let runId = 0;
  let startPromise = null;

  function snapshot() {
    return { ...state };
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        if (window.console && console.error) console.error("[swarm-cursors]", err);
      }
    }
  }

  function setState(patch) {
    Object.assign(state, patch);
    emit("state", snapshot());
  }

  function on(type, fn) {
    if (typeof fn !== "function") return () => {};
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => {
      const set = listeners.get(type);
      if (set) set.delete(fn);
    };
  }

  function pillCopy(mode) {
    if (!pill) return;
    if (mode === "loading") {
      pill.setCopy(opts.loadingLabel, opts.loadingSublabel);
    } else if (mode === "error") {
      pill.setCopy(opts.errorLabel, opts.errorSublabel);
    } else {
      pill.setCopy(
        state.played ? opts.replayLabel : opts.label,
        state.played ? opts.replaySublabel : opts.sublabel
      );
    }
    pill.setState(mode === "loading" ? "loading" : mode === "error" ? "error" : "idle");
  }

  function ensurePill() {
    if (!opts.button || pill) return;
    pill = createPill({
      position: opts.position,
      theme: opts.theme,
      accent: opts.accent,
      accentDark: opts.accentDark,
      colors: opts.colors,
      zIndex: opts.zIndex,
      label: opts.label,
      sublabel: opts.sublabel,
      onClick() {
        start().catch(function () {});
      },
    });
  }

  function ensureCompanion() {
    if (companion) return;
    companion = createCompanion({
      mode: opts.companionMode,
      color: (opts.colors && opts.colors[0]) || opts.accent,
    });
  }

  // The native arrow belongs to the enabled page. Only the decorative
  // follower has a lifecycle tied to the end of a drawing.
  function syncArrow(enabled = state.pageEnabled && pageOpts.companion !== false) {
    if (opts.companionMode !== "replace") return;
    if (enabled && !destroyed) { ensureCompanion(); companion?.show(); }
    else companion?.hide();
  }

  function routeArrow(route) {
    const page = routePageOptions(route);
    syncArrow(page.enabled !== false && (page.companion ?? opts.companion));
  }

  function hideFollower() {
    if (opts.companionMode === "follow") companion?.hide();
  }

  function faviconHref() {
    try {
      const links = [
        ...document.querySelectorAll(
          'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]'
        ),
      ];
      const href = links.map((l) => l.href).filter(Boolean)[0];
      return href || location.origin + "/favicon.ico";
    } catch (_) {
      return "";
    }
  }

  function ensureCover() {
    if (opts.cover === false || cover) return;
    cover = createCover({
      logo: faviconHref(),
      color: opts.coverColor,
      dark: opts.coverColorDark,
      accent: opts.accent,
    });
  }

  function showCover(route = false, guard = false) {
    if (opts.cover === false) return;
    ensureCover();
    if (!cover) return;
    hideFollower();
    cover.show(route);
    if (!guard) committedCover = { route };
    clearTimeout(coverTimer);
    if (guard) {
      // An unresolved guard hasn't changed the page. Return to its real
      // state, including a previous destination still preparing a capture.
      coverTimer = setTimeout(restoreCover, 12000);
    } else {
      // If an import or capture actually hangs, abandon the build as well.
      // A late result must never erase an already revealed destination.
      const delay = Math.max(opts.autoDelay, opts.routeDelay) + pageOpts.captureDelay;
      coverTimer = setTimeout(() => stop(false), Math.min(2147483647, delay + 30000));
    }
  }

  function restoreCover() {
    syncArrow();
    if (committedCover) showCover(committedCover.route);
    else {
      hideCover(true);
      if (opts.companionMode === "follow" && companion && state.pageEnabled && state.played && !state.running && !state.loading && pageOpts.companion) companion.show();
    }
  }

  function hideCover(immediate = false) {
    committedCover = null;
    clearTimeout(coverTimer);
    coverTimer = null;
    if (cover) cover.hide(immediate);
  }

  function applyTheme() {
    try {
      const theme = window.__swarmCursorsTheme || (window.__swarmCursorsTheme = {});
      theme.colors = opts.colors;
      theme.accent = opts.accent;
      theme.danger = opts.danger;
      theme.hud = pageOpts.hud;
      theme.sound = pageOpts.sound;
      theme.captureDelay = pageOpts.captureDelay;
    } catch (_) {}
  }

  function loadEngine() {
    if (engine) return Promise.resolve(engine);
    if (enginePromise) return enginePromise;
    // The engine reads the palette once, at module evaluation, and the HUD /
    // sound flags at each App construction. Set both before importing.
    applyTheme();
    enginePromise = import("./engine-entry.js")
      .then((mod) => {
        engine = mod;
        if (!destroyed) setState({ loaded: true });
        return mod;
      })
      .catch((err) => {
        enginePromise = null;
        throw err;
      });
    return enginePromise;
  }

  function stopPoll() {
    if (poll) {
      clearInterval(poll);
      poll = null;
    }
  }

  function finish() {
    const wasActive = state.running || state.loading;
    stopPoll();
    setState({ running: false, loading: false });
    if (!wasActive) return;
    committedCover = null;
    if (!pendingRoute) hideCover(true);
    clearTimeout(showTimer);
    if (state.pageEnabled) {
      if (pageOpts.companion !== false) ensureCompanion();
      if (pill || companion) {
        showTimer = setTimeout(() => {
          if (destroyed || !state.pageEnabled || pendingRoute || committedCover) return;
          if (pill) {
            pillCopy("idle");
            pill.show();
          }
          if (companion && pageOpts.companion !== false) companion.show();
        }, 700);
      }
    }
    emit("end", snapshot());
  }

  function watch() {
    stopPoll();
    poll = setInterval(() => {
      if (destroyed) return;
      const app = window.__divPointers && window.__divPointers.app;
      if (app && !app.dead) {
        if (!state.running) setState({ running: true });
        if (!app.complete && revealScheduled) {
          revealScheduled = false;
          clearTimeout(revealTimer);
          revealTimer = null;
        }
        if (app.complete && pageOpts.autoReveal !== false && !revealScheduled) {
          revealScheduled = true;
          clearTimeout(revealTimer);
          revealTimer = setTimeout(() => {
            if (destroyed) return;
            if (pendingRoute) { revealScheduled = false; return; }
            if (window.__divPointers && window.__divPointers.app) stop(true);
          }, opts.autoRevealDelay);
        }
        return;
      }
      finish();
    }, 320);
  }

  function begin(options) {
    const route = !!(options && options.route);
    if (destroyed || !state.pageEnabled) return Promise.resolve();
    if (state.running) return Promise.resolve();
    if (state.loading && startPromise) return startPromise;

    const id = ++runId;
    clearTimeout(autoTimer);
    clearTimeout(showTimer);
    clearTimeout(revealTimer);
    revealScheduled = false;
    applyTheme();
    hideFollower();
    ensurePill();
    if (pill) {
      pill.hide();
      pillCopy("loading");
    }
    setState({ loading: true, error: null });
    emit("start", snapshot());

    const onError = (err) => {
      if (destroyed || id !== runId) return;
      stopPoll();
      committedCover = null;
      if (!pendingRoute) hideCover(true);
      setState({ running: false, loading: false, error: String((err && err.message) || err) });
      if (pill) { pillCopy("error"); pill.show(); }
      emit("error", err);
    };
    startPromise = loadEngine()
      .then((mod) => {
        if (destroyed || id !== runId) return;
        applyTheme();
        mod.start({
          route, covered: !!cover && cover.el.style.opacity === "1",
          routerManaged: routerAttached,
          onDrawing() {
            if (destroyed || id !== runId) return;
            committedCover = null;
            if (!pendingRoute) { hideCover(); syncArrow(); }
          },
          onError,
        });
        setState({ running: true, loading: false, played: true });
        watch();
      })
      .catch((err) => {
        if (destroyed || id !== runId) return;
        onError(err);
        throw err;
      })
      .finally(() => {
        if (id === runId) startPromise = null;
      });

    return startPromise;
  }

  function start() {
    return begin();
  }

  function stop(reveal) {
    runId++;
    startPromise = null;
    clearTimeout(autoTimer);
    clearTimeout(revealTimer);
    revealScheduled = false;
    hideCover(true);
    if (engine && engine.isLoaded()) engine.stop(reveal !== false);
    if (!state.running) finish();
  }

  function toggle() {
    if (state.running || engine && engine.isRunning()) stop(true);
    else start().catch(function () {});
  }

  function armAuto(delay, options) {
    if (destroyed || !state.pageEnabled) return;
    clearTimeout(autoTimer);
    const wait = Math.max(0, delay == null ? opts.autoDelay : delay);
    autoTimer = setTimeout(() => {
      if (destroyed || !state.pageEnabled || state.running || state.loading) return;
      begin(options).catch(function () {});
    }, wait);
  }

  function autoAlreadyPlayed(route, record = true) {
    if (!opts.once) return false;
    const path = route && route.fullPath ? route.fullPath : location.pathname;
    try {
      const key = "swarm-cursors:auto:" + path;
      if (sessionStorage.getItem(key)) return true;
      if (record) sessionStorage.setItem(key, "1");
    } catch (_) {}
    return false;
  }

  function routePageOptions(route) {
    const v = route && route.meta ? route.meta.swarmCursors : undefined;
    if (v === false) return { enabled: false };
    if (v && typeof v === "object") {
      return {
        enabled: v.enabled !== false,
        hud: v.hud,
        sound: v.sound,
        companion: v.companion,
        autoReveal: v.autoReveal,
        captureDelay: v.captureDelay,
      };
    }
    return { enabled: true };
  }

  function setPageEnabled(value) {
    const enabled = value !== false;
    if (state.pageEnabled === enabled) { syncArrow(); return; }
    state.pageEnabled = enabled;
    syncArrow();
    if (!enabled) {
      clearTimeout(autoTimer);
      clearTimeout(showTimer);
      clearTimeout(revealTimer);
      revealScheduled = false;
      stop(false);
      if (pill) pill.hide();
      if (companion) companion.hide();
      hideCover();
    } else {
      if (pill) {
        pillCopy("idle");
        pill.show();
      }
      if (companion && pageOpts.companion !== false && state.played) companion.show();
    }
    emit("state", snapshot());
  }

  function applyPageOptions(next) {
    const enabled = next.enabled !== false;
    const hud = next.hud !== undefined ? !!next.hud : opts.hud;
    pageOpts = {
      enabled,
      hud,
      sound: next.sound !== undefined ? !!next.sound : opts.sound,
      companion: next.companion !== undefined ? next.companion !== false : opts.companion,
      autoReveal:
        next.autoReveal !== undefined
          ? next.autoReveal !== false
          : hud
            ? false
            : opts.autoReveal,
      captureDelay:
        next.captureDelay !== undefined
          ? Math.max(0, Number(next.captureDelay) || 0)
          : opts.captureDelay,
    };
    state.pageHud = hud;
    applyTheme();
    setPageEnabled(enabled);
    if (!enabled || pageOpts.companion === false) {
      if (companion) companion.hide();
    }
    emit("state", snapshot());
  }

  function applyRoute(route, first) {
    const page = routePageOptions(route);
    // A confirmed destination supersedes the outgoing import, capture and reveal.
    if (!first) {
      runId++;
      startPromise = null;
      clearTimeout(autoTimer);
      clearTimeout(revealTimer);
      clearTimeout(showTimer);
      revealScheduled = false;
      stopPoll();
      if (engine) engine.stop(false, true);
      if (state.running || state.loading) {
        setState({ running: false, loading: false });
        emit("end", snapshot());
      }
    }
    applyPageOptions(page);
    if (!page.enabled) { hideCover(true); return; }

    const wantsAuto = opts.autoOnRoute || (first && opts.auto);
    if (!wantsAuto) {
      hideCover(true);
      return;
    }
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      hideCover(true);
      if (pill) pill.show();
      return;
    }

    if (opts.once && autoAlreadyPlayed(route)) {
      state.played = true;
      hideCover(true);
      if (pill) {
        pillCopy("idle");
        pill.show();
      }
      emit("state", snapshot());
      return;
    }

    if (pill) pill.hide();
    hideFollower();
    showCover(!first);
    // Only explicitly persistent UI survives a route. Similar cards and
    // headings on different pages must still be drawn on the blank canvas.
    armAuto(first ? opts.autoDelay : opts.routeDelay, { route: !first });
  }

  function attachRouter(router) {
    if (!router || typeof router.afterEach !== "function") return function () {};
    detachRouter();
    routerAttached = true;
    const epoch = routerEpoch;
    let initialized = false;
    let firstLocation = null;
    // Nuxt can force-replace the very same location after router.isReady().
    // That confirmation belongs to the first build, including its Dock.
    const matchesFirst = (r) =>
      typeof firstLocation?.fullPath === "string" && r?.fullPath === firstLocation.fullPath &&
      (!firstLocation.matched || !r.matched || (r.matched.length === firstLocation.matched.length &&
        r.matched.every((record, i) => record === firstLocation.matched[i])));
    const reconfirmsFirst = (to, from) => matchesFirst(to) && matchesFirst(from);
    const applyFirst = (route) => {
      initialized = true;
      firstLocation = route;
      applyRoute(route, true);
    };
    const canceled = (to) => {
      if (to !== pendingRoute) return;
      pendingRoute = null;
      restoreCover();
    };

    if (typeof router.beforeEach === "function") {
      routerBeforeOff = router.beforeEach(function (to, from) {
        if (destroyed || reconfirmsFirst(to, from)) return;
        pendingRoute = to;
        routeArrow(to);
        if (!opts.autoOnRoute || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const page = routePageOptions(to);
        if (page.enabled === false || autoAlreadyPlayed(to, false)) return;
        showCover(initialized, true);
      });
    }

    routerOff = router.afterEach(function (to, from, failure) {
      if (destroyed || epoch !== routerEpoch) return;
      if (failure) { canceled(to); return; }
      if (reconfirmsFirst(to, from)) {
        firstLocation = null;
        // A same-location replacement may also supersede a pending guard.
        if (pendingRoute) { pendingRoute = null; restoreCover(); }
        return;
      }
      pendingRoute = null;
      if (!initialized) applyFirst(to);
      else {
        firstLocation = null;
        applyRoute(to, false);
      }
    });
    if (typeof router.onError === "function") routerErrorOff = router.onError((err, to) => canceled(to));

    if (typeof router.isReady === "function") {
      router.isReady()
        .then(function () {
          if (destroyed || epoch !== routerEpoch || initialized) return;
          applyFirst(router.currentRoute && router.currentRoute.value);
        })
        .catch(function () { if (epoch === routerEpoch && !initialized) hideCover(true); });
    } else {
      applyFirst(router.currentRoute && router.currentRoute.value);
    }

    return detachRouter;
  }

  function detachRouter() {
    routerAttached = false;
    routerEpoch++;
    pendingRoute = null;
    if (routerErrorOff) {
      try { routerErrorOff(); } catch (_) {}
      routerErrorOff = null;
    }
    if (routerOff) {
      try {
        routerOff();
      } catch (_) {}
      routerOff = null;
    }
    if (routerBeforeOff) {
      try {
        routerBeforeOff();
      } catch (_) {}
      routerBeforeOff = null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    runId++;
    startPromise = null;
    stopPoll();
    clearTimeout(showTimer);
    clearTimeout(autoTimer);
    clearTimeout(revealTimer);
    revealScheduled = false;
    detachRouter();
    if (engine && engine.isLoaded()) engine.stop(false);
    if (companion) {
      companion.destroy();
      companion = null;
    }
    hideCover();
    if (cover) {
      cover.destroy();
      cover = null;
    }
    if (pill) {
      pill.destroy();
      pill = null;
    }
    setState({ running: false, loading: false });
  }

  // --- init ---------------------------------------------------------------

  const hasRouter = !!(opts.router && typeof opts.router.afterEach === "function");
  // With a router, wait for the first route before showing the pill: a page
  // whose meta disables SwarmCursors should not flash it.
  state.pageEnabled = !hasRouter;
  if (hasRouter) {
    const current = opts.router.currentRoute?.value;
    if (current && (!current.matched || current.matched.length)) routeArrow(current);
  } else syncArrow();

  ensurePill();
  if (!state.pageEnabled && pill) pill.hide();

  if (hasRouter && (opts.auto || opts.autoOnRoute) && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    const initial = opts.router.currentRoute && opts.router.currentRoute.value;
    if (!initial || !initial.meta || routePageOptions(initial).enabled !== false) {
      showCover();
    }
  }

  if (opts.auto && !hasRouter) {
    if (autoAlreadyPlayed()) {
      state.played = true;
      if (pill) {
        pillCopy("idle");
        pill.show();
      }
      emit("state", snapshot());
    } else {
      const reduce =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        if (pill) pill.show();
      } else {
        if (pill) pill.hide();
        showCover();
        armAuto();
      }
    }
  }

  if (hasRouter) attachRouter(opts.router);
  if (opts.preload) loadEngine().catch(function () {});

  return {
    state,
    getState: snapshot,
    getOptions: () => ({ ...opts }),
    start,
    stop,
    toggle,
    setPageEnabled,
    on,
    attachRouter,
    detachRouter,
    destroy,
  };
}

