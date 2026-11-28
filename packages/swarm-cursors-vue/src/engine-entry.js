// Lazy entry point for the engine. The Vue plugin dynamic-imports this module
// on the first start, so SSR bundles and pages that never use the effect don't
// pay for the 200 KB engine.
import "./engine-runtime.js";

function api() {
  if (typeof window === "undefined") return null;
  return window.__divPointers || null;
}

export function isLoaded() {
  return !!api();
}

export function isRunning() {
  const a = api();
  return !!(a && a.app && !a.app.dead);
}

export function start(opts) {
  const a = api();
  if (!a) throw new Error("[swarm-cursors] engine did not initialise");
  if (!a.app) a.start(opts);
}

export function stop(reveal, immediate) {
  const a = api();
  if (a && a.app) a.stop(reveal !== false, immediate);
}

export function setWorkerPointersHidden(hidden) {
  const layer = api()?.app?.view?.cursorsEl;
  if (layer) layer.hidden = hidden;
}

export function toggle() {
  const a = api();
  if (!a) throw new Error("[swarm-cursors] engine did not initialise");
  a.toggle();
}
