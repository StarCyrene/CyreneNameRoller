<template>
  <fieldset class="seat-draw-options" :disabled="disabled" :aria-label="en ? 'Seat draw options' : '座位点名选项'">
    <FluentTabs class="seat-gender-options" :aria-label="en ? 'Include' : '点名范围'"
      :model-value="gender" :options="genderOptions" @update:model-value="selectGender" />
    <FluentTabs class="seat-count-options" :aria-label="en ? 'Draw mode' : '抽取模式'"
      :model-value="multiple ? 'multiple' : 'single'" :options="modeOptions" @update:model-value="selectMode" />
    <CountStepper v-if="multiple" :model-value="Math.min(count, max)" :min="2" :max="max"
      :disabled="disabled || eligibleCount < 2" :en="en" :label="en ? 'Names to draw' : '抽取人数'" @update:model-value="emit('update:count', $event)" />
    <small v-if="multiple && eligibleCount === 1" class="seat-options-note">{{ en ? 'At least two eligible people are needed.' : '多人点名需要至少两名符合条件的同学。' }}</small>
  </fieldset>
</template>

<script setup>
import { computed } from 'vue'
import CountStepper from './CountStepper.vue'

const props = defineProps({ gender: String, multiple: Boolean, count: Number, eligibleCount: Number, disabled: Boolean, en: Boolean })
const emit = defineEmits(['update:gender', 'update:multiple', 'update:count'])
const max = computed(() => Math.max(2, Math.min(100, props.eligibleCount)))
const genderOptions = computed(() => [
  { value: 'all', label: props.en ? 'Everyone' : '全部', icon: 'fluent:people-16-regular' },
  { value: 'male', label: props.en ? 'Male only' : '仅男', symbol: '♂' },
  { value: 'female', label: props.en ? 'Female only' : '仅女', symbol: '♀' }
])
const modeOptions = computed(() => [
  { value: 'single', label: props.en ? 'Draw one' : '抽取单人', icon: 'fluent:person-24-regular' },
  { value: 'multiple', label: props.en ? 'Draw several' : '抽取多人', icon: 'fluent:people-24-regular' }
])
function selectGender(value) { if (!props.disabled) emit('update:gender', value) }
function selectMode(value) { if (!props.disabled) emit('update:multiple', value === 'multiple') }
</script>

<style scoped>
.seat-draw-options { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-inline-size: 0; border: 0; margin: 0; padding: 0; }
.seat-draw-options:disabled { opacity: .66; }
.seat-draw-options :deep(button) { min-height: 34px; }
.seat-options-note { color: var(--text-secondary); }
@media (pointer: coarse) {
  .seat-draw-options :deep(button), .seat-draw-options :deep(.stepper-input) { min-height: 44px; }
  .seat-draw-options :deep(.stepper-button) { min-width: 44px; }
}
</style>
