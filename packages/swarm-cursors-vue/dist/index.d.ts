import type { App, Component, Ref } from "vue";

export interface SwarmCursorsState {
  running: boolean;
  loading: boolean;
  loaded: boolean;
  played: boolean;
  pageEnabled: boolean;
  pageHud: boolean;
  error: string | null;
}

export interface SwarmCursorsRouteMeta {
  swarmCursors?:
    | boolean
    | {
        enabled?: boolean;
        hud?: boolean;
        sound?: boolean;
        companion?: boolean;
        autoReveal?: boolean;
        captureDelay?: number;
      };
}

export interface SwarmCursorsLabels {
  label?: string;
  sublabel?: string;
  loading?: string;
  loadingSub?: string;
  error?: string;
  errorSub?: string;
  replay?: string;
  replaySub?: string;
}

export type SwarmCursorsPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom-center";

export type SwarmCursorsTheme = "dark" | "light" | "pink";

export interface SwarmCursorsRouter {
  afterEach(callback: (...args: any[]) => any): (() => void) | void;
  beforeEach?(callback: (...args: any[]) => any): (() => void) | void;
  onError?(callback: (...args: any[]) => any): (() => void) | void;
  isReady?(): Promise<void>;
}

export interface SwarmCursorsOptions {
  /** Show the floating trigger pill. Default: true. */
  button?: boolean;
  /** Start automatically once the plugin is installed. Default: false. */
  auto?: boolean;
  /** Delay before an automatic start, in ms. Default: 1800. */
  autoDelay?: number;
  /** Start on each confirmed route, replacing an unfinished rebuild. */
  autoOnRoute?: boolean;
  /** Delay after a route change, in ms. Default: 900. */
  routeDelay?: number;
  /** With auto, only start once per tab + path. */
  once?: boolean;
  /** Preload the engine chunk after install without starting it. */
  preload?: boolean;
  position?: SwarmCursorsPosition;
  theme?: SwarmCursorsTheme;
  accent?: string;
  accentDark?: string;
  danger?: string;
  colors?: string[];
  /** Show the engine's bottom control bar. Default: false. */
  hud?: boolean;
  /** Enable the synthesized soundtrack. Default: false. */
  sound?: boolean;
  /** Enable the companion cursor. Default: true. */
  companion?: boolean;
  /** Follow the mouse after a rebuild (default), or replace its arrow throughout an enabled page. */
  companionMode?: "follow" | "replace";
  /** Fade back to the real page when the rebuild completes. Default: true (false when hud is true). */
  autoReveal?: boolean;
  /** Delay before the automatic reveal, in ms. Default: 1600. */
  autoRevealDelay?: number;
  /** Extra time the page stays hidden before capture, so dynamic content can load. Default: 0. */
  captureDelay?: number;
  /** Show a short themed veil while the next page is prepared. Default: true. */
  cover?: boolean;
  coverColor?: string;
  coverColorDark?: string;
  zIndex?: number | string;
  router?: SwarmCursorsRouter;
  labels?: SwarmCursorsLabels;
  label?: string;
  sublabel?: string;
  loadingLabel?: string;
  loadingSublabel?: string;
  errorLabel?: string;
  errorSublabel?: string;
  replayLabel?: string;
  replaySublabel?: string;
}

export interface SwarmCursorsCore {
  state: SwarmCursorsState;
  getState(): SwarmCursorsState;
  getOptions(): Record<string, any>;
  start(): Promise<void>;
  stop(reveal?: boolean): void;
  toggle(): void;
  setPageEnabled(enabled: boolean): void;
  on(
    event: "state" | "start" | "end" | "error",
    listener: (payload: any) => void
  ): () => void;
  attachRouter(router: SwarmCursorsRouter): () => void;
  detachRouter(): void;
  destroy(): void;
}

export interface UseSwarmCursorsReturn {
  start: () => Promise<void>;
  stop: (reveal?: boolean) => void;
  toggle: () => void;
  setPageEnabled: (enabled: boolean) => void;
  running: Ref<boolean>;
  loading: Ref<boolean>;
  loaded: Ref<boolean>;
  pageEnabled: Ref<boolean>;
  pageHud: Ref<boolean>;
  error: Ref<string | null>;
  core: SwarmCursorsCore;
}

export function useSwarmCursors(): UseSwarmCursorsReturn;

export function createSwarmCursors(options?: SwarmCursorsOptions): SwarmCursorsCore;

export const SwarmCursorsTrigger: Component;
export const SwarmCursorsButton: Component;
export const SWARM_CURSORS_KEY: symbol;
export const install: (app: App, options?: SwarmCursorsOptions) => void;

export interface SwarmCursorsPlugin {
  install(app: App, options?: SwarmCursorsOptions): void;
  version: string;
}

declare const plugin: SwarmCursorsPlugin;
export default plugin;
