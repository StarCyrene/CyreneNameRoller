/*!
 * swarm-cursors-vue — a Vue 3 plugin for divPointers
 * Joel Califa's Swarm; browser adaptation by Dhvanil Patel; divPointers
 * derivative by Nitin Thakur; Vue integration by Cyrene2008. See NOTICE.md.
 *
 * Erase the page, then let a swarm of cursors rebuild it live. The engine is
 * bundled and lazy-loaded; no browser extension and no remote code.
 */
import { SWARM_CURSORS_KEY } from "./injection.js";
import { createSwarmCursors } from "./core.js";
import { useSwarmCursors } from "./composable.js";
import { SwarmCursorsTrigger, SwarmCursorsButton } from "./components.js";

const installed = new WeakSet();

const SwarmCursors = {
  install(app, options) {
    if (!app || installed.has(app)) return;
    installed.add(app);

    // On the server createSwarmCursors() returns a no-op core, so the same
    // plugin can be installed in a universal (SSR + client) Nuxt/Vue setup.
    const core = createSwarmCursors(options || {});
    app.provide(SWARM_CURSORS_KEY, core);
    app.config.globalProperties.$swarmCursors = core;
    app.component("SwarmCursorsTrigger", SwarmCursorsTrigger);
    app.component("SwarmCursorsButton", SwarmCursorsButton);
  },
};

SwarmCursors.version = "1.4.1";

export default SwarmCursors;
export { createSwarmCursors, useSwarmCursors, SwarmCursorsTrigger, SwarmCursorsButton, SWARM_CURSORS_KEY };
export const install = SwarmCursors.install;



