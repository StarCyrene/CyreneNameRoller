<template>
  <FluentSelect :model-value="modelValue" :options="options"
    :data-i18n-data-select="selectedIsData ? '' : null" @update:model-value="$emit('update:modelValue', $event)">
    <!-- FluentSelect teleports this menu to body, outside the wrapper guard. -->
    <template #option="{ option }"><span :translate="option.uiLabel ? null : 'no'" :lang="option.lang">{{ option.label }}</span></template>
  </FluentSelect>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ modelValue: [String, Number], options: { type: Array, default: () => [] } })
defineEmits(['update:modelValue'])
const selectedIsData = computed(() => {
  const selected = props.options.find(option => option.value === props.modelValue)
  return !!selected && !selected.uiLabel
})
</script>
