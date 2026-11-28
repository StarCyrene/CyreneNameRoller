<template>
  <span class="verified-result" :class="`verified-result-${presentation?.layout || 'single'}`" data-authority="host-verified">
    <span>{{ displayName }}</span>
    <small v-if="presentation?.style?.showAlgorithm || presentation?.style?.showOperationId">
      <template v-if="presentation?.style?.showAlgorithm">{{ receipt.algorithm }} {{ receipt.algorithmVersion }}</template>
      <template v-if="presentation?.style?.showAlgorithm && presentation?.style?.showOperationId"> · </template>
      <template v-if="presentation?.style?.showOperationId">{{ receipt.operationId }}</template>
    </small>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps({
  receipt: { type: Object, required: true },
  index: { type: Number, required: true },
  presentation: { type: Object, default: null },
  englishMode: { type: Boolean, default: undefined }
})

const settingsStore = useSettingsStore()
const item = computed(() => props.receipt?.results?.[props.index] || null)
const displayName = computed(() => {
  const result = item.value
  if (!result) return ''
  return ((props.englishMode ?? settingsStore.settings.englishMode) && result.englishName) || result.name
})
</script>

<style scoped>
.verified-result { display: inline-flex; flex-direction: column; align-items: inherit; gap: 4px; }
.verified-result small { font-size: 11px; font-weight: 400; opacity: .7; }
</style>
