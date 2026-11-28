import { defineComponent, h } from "vue";
import { useSwarmCursors } from "./composable.js";

/**
 * Renderless trigger. Use it when you want your own button:
 *
 *   <SwarmCursorsTrigger v-slot="{ start, running }">
 *     <button :disabled="running" @click="start">播放重建</button>
 *   </SwarmCursorsTrigger>
 */
export const SwarmCursorsTrigger = defineComponent({
  name: "SwarmCursorsTrigger",
  setup(_, { slots }) {
    const { start, stop, toggle, running, loading } = useSwarmCursors();
    return function () {
      if (!slots.default) return null;
      return slots.default({
        start,
        stop,
        toggle,
        running: running.value,
        loading: loading.value,
      });
    };
  },
});

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "42px",
  padding: "0 18px",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, .24)",
  background: "linear-gradient(180deg, #b06cff, #8239e8)",
  color: "#fff",
  font: "600 14px/1 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(130, 57, 232, .3), inset 0 1px 0 rgba(255, 255, 255, .24)",
};

/**
 * Small ready-made button. Drop it anywhere; it calls the same global core.
 * Pass a `class`/`style` to restyle, or use SwarmCursorsTrigger for full
 * control.
 */
export const SwarmCursorsButton = defineComponent({
  name: "SwarmCursorsButton",
  props: {
    label: { type: String, default: "看 AI 光标重建本页" },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots, attrs }) {
    const { start, running, core } = useSwarmCursors();
    const coreOptions = core && typeof core.getOptions === "function" ? core.getOptions() : {};
    const accent = coreOptions.accent || "#A259FF";
    const accentDark = coreOptions.accentDark || accent;
    const themed = {
      ...buttonStyle,
      background: `linear-gradient(180deg, ${accent}, ${accentDark})`,
      boxShadow: "0 12px 30px rgba(0, 0, 0, .18), inset 0 1px 0 rgba(255, 255, 255, .24)",
    };

    return function () {
      const { onClick, style, ...rest } = attrs;
      const handlers = Array.isArray(onClick)
        ? onClick
        : typeof onClick === "function"
          ? [onClick]
          : [];
      const disabled = props.disabled || running.value;
      return h(
        "button",
        {
          ...rest,
          type: "button",
          disabled,
          onClick(event) {
            for (const fn of handlers) fn(event);
            start().catch(function () {});
          },
          style: [themed, disabled ? { opacity: 0.6, cursor: "default" } : null, style],
        },
        slots.default ? slots.default() : props.label
      );
    };
  },
});
