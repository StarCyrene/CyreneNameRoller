<template>
  <div class="count-stepper" :class="{ disabled }">
    <span v-if="label" class="stepper-label">{{ label }}</span>
    <span class="stepper-box">
      <button type="button" class="stepper-button" :disabled="disabled || modelValue <= min"
        :aria-label="en ? 'Decrease' : '减少'" @click="change(-1)">−</button>
      <input class="stepper-input" type="number" :value="modelValue" :min="min" :max="max" :step="step"
        :disabled="disabled" :aria-label="label || (en ? 'Count' : '人数')" inputmode="numeric"
        @change="onChange" @keydown.enter.prevent="onChange" />
      <button type="button" class="stepper-button" :disabled="disabled || modelValue >= upperBound"
        :aria-label="en ? 'Increase' : '增加'" @click="change(1)">+</button>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  label: { type: String, default: '' },
  disabled: Boolean,
  en: Boolean
})
const emit = defineEmits(['update:modelValue'])
// Keep the control usable while a roster is temporarily empty (max would be 0).
const upperBound = computed(() => Math.max(props.min, props.max))

function clamp(value) {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return props.modelValue
  return Math.max(props.min, Math.min(upperBound.value, number))
}
function change(direction) {
  if (props.disabled) return
  emit('update:modelValue', clamp(props.modelValue + direction * props.step))
}
function onChange(event) {
  const next = clamp(event.target.value)
  event.target.value = next
  if (next !== props.modelValue) emit('update:modelValue', next)
}
</script>

<style scoped>
.count-stepper { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.stepper-label { white-space: nowrap; }
.stepper-box { display: inline-flex; align-items: stretch; overflow: hidden; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-card-solid); }
.stepper-button { width: 30px; border: 0; background: transparent; color: var(--text-secondary); font: 600 17px/1 var(--font-ui); cursor: pointer; }
.stepper-button:hover:enabled { background: var(--bg-hover); color: var(--accent-dark); }
.stepper-button:disabled, .disabled .stepper-input { opacity: .4; cursor: default; }
.stepper-input { width: 3.3em; height: 32px; padding: 0 2px; border: 0; border-inline: 1px solid var(--border-default); background: transparent; color: var(--text-primary); font: inherit; font-weight: 700; text-align: center; }
.stepper-input:focus-visible, .stepper-button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.stepper-input::-webkit-outer-spin-button, .stepper-input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }
.stepper-input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
@media (prefers-reduced-motion: reduce) { .stepper-button { transition: none; } }
</style>
