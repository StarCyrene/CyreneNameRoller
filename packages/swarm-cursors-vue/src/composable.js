import { inject, onUnmounted, ref } from "vue";
import { SWARM_CURSORS_KEY } from "./injection.js";
import { createSwarmCursors } from "./core.js";

/**
 * Access the swarm core from a component's setup().
 *
 *   const { start, stop, toggle, running, loading, loaded, error } = useSwarmCursors()
 *
 * `running`, `loading`, `loaded` and `error` are refs; the rest are functions.
 */
export function useSwarmCursors() {
  let core = inject(SWARM_CURSORS_KEY, null);
  if (!core) {
    // SSR with a client-only plugin: components using the composable still
    // need to render. A no-op core is enough for the server pass; the real one
    // is injected on the client.
    if (typeof window === "undefined") {
      core = createSwarmCursors({ button: false });
    } else {
      throw new Error(
        "[swarm-cursors] plugin not installed. Call app.use(SwarmCursors, options) first."
      );
    }
  }

  const initial = core.getState();
  const running = ref(initial.running);
  const loading = ref(initial.loading);
  const loaded = ref(initial.loaded);
  const pageEnabled = ref(initial.pageEnabled);
  const pageHud = ref(initial.pageHud);
  const error = ref(initial.error);

  const off = core.on("state", function (s) {
    running.value = s.running;
    loading.value = s.loading;
    loaded.value = s.loaded;
    pageEnabled.value = s.pageEnabled;
    pageHud.value = s.pageHud;
    error.value = s.error;
  });

  onUnmounted(off);

  return {
    start: core.start,
    replay: core.replay,
    stop: core.stop,
    toggle: core.toggle,
    setPageEnabled: core.setPageEnabled,
    running,
    loading,
    loaded,
    pageEnabled,
    pageHud,
    error,
    core,
  };
}
