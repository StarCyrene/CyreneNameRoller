<template>
  <section class="paste-plan">
    <label for="seat-table">{{ en ? 'Paste a seating chart' : '粘贴座位表' }}</label>
    <p>{{ en ? 'Copy cells from Excel, or paste CSV / TSV. Use a name or a person ID in each occupied seat. Keep empty seats blank and include everyone once.' : '从 Excel 复制座位区域，或粘贴 CSV / TSV。每格填姓名或人员 ID，空座留空；每人须出现一次，不需要表头。' }}</p>
    <textarea id="seat-table" ref="input" v-model="source" rows="4" maxlength="250001" spellcheck="false" :placeholder="en ? 'Paste the whole table here…' : '在这里粘贴整张表…'" />
    <template v-if="source.trim()">
      <p aria-live="polite">{{ en ? 'Preview' : '预览' }} · {{ preview.rows }} × {{ preview.columns }} · {{ en ? 'Empty seats: ' : '空座：' }}{{ preview.empty }}</p>
      <div v-if="preview.order.length" class="paste-preview" :style="{ '--cols': preview.columns }">
        <span v-for="(id, i) in preview.order.slice(0, preview.columns * 4)" :key="i">{{ people.get(id)?.cn || '—' }}</span>
      </div>
      <small v-if="preview.rows > 4 && preview.order.length">{{ en ? 'Showing the first four rows.' : '预览显示前四排。' }}</small>
      <ul v-if="preview.errors.length" class="paste-errors">
        <li v-for="(item, i) in preview.errors.slice(0, 20)" :key="i">{{ describe(item) }}</li>
      </ul>
      <small v-if="preview.errors.length > 20">{{ en ? 'First 20 issues shown.' : '以上为前 20 处问题。' }}</small>
    </template>
    <div class="paste-actions">
      <FluentButton variant="primary" size="sm" :disabled="locked || !preview.valid" @click="$emit('apply', preview)">{{ en ? 'Use this seating chart' : '确认使用这张座位表' }}</FluentButton>
      <FluentButton variant="secondary" size="sm" @click="$emit('cancel')">{{ en ? 'Cancel' : '取消' }}</FluentButton>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { previewSeatPaste } from '../../utils/seatPaste.mjs'
const props = defineProps({ names: Array, en: Boolean, locked: Boolean })
defineEmits(['apply', 'cancel'])
const source = ref('')
const input = ref(null)
onMounted(() => input.value?.focus())
const people = computed(() => new Map(props.names.map(p => [p.id, p])))
const preview = computed(() => previewSeatPaste(source.value, props.names))
function describe(e) {
  const en = props.en
  const position = e.row ? (en ? `Row ${e.row}, column ${e.col}: ` : `第 ${e.row} 行第 ${e.col} 列：`) : ''
  const labels = en ? { empty: 'Paste a chart first.', large: 'The table is too large.', wide: 'The chart can have at most 12 columns.', format: 'Check the quotation marks in the table.', unknown: 'No matching person: ', duplicate: 'Already seated: ', ambiguous: 'Several people share this name: ', missing: 'Still missing: ' }
    : { empty: '请先粘贴座位表。', large: '表格超出大小限制。', wide: '每排最多可放 12 个座位。', format: '表格中的引号不匹配。', unknown: '找不到此人：', duplicate: '重复出现：', ambiguous: '有同名人员：', missing: '还缺少：' }
  const ids = e.kind === 'ambiguous' ? props.names.filter(p => p.cn?.trim() === e.value || p.en?.trim() === e.value).map(p => p.id).join(' / ') : ''
  return position + labels[e.kind] + e.value + (ids ? (en ? ' · Use ID: ' : ' · 请改用 ID：') + ids : '')
}
</script>
<style scoped>
.paste-plan { display: grid; gap: 8px; margin-top: 12px; padding: 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--bg-card-solid); min-width: 0; }
.paste-plan label { font-weight: 650; } .paste-plan p,.paste-plan small,.paste-errors { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.paste-plan textarea { resize: vertical; width: 100%; min-height: 64px; padding: 8px; background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: 13px/1.5 var(--font-ui); }
.paste-preview { display: grid; grid-template-columns: repeat(var(--cols), minmax(48px, 1fr)); gap: 3px; overflow-x: auto; }
.paste-preview span { padding: 3px 6px; border-radius: 3px; background: var(--bg-hover); font-size: 12px; }
.paste-errors { padding-left: 18px; max-height: 110px; overflow: auto; overflow-wrap: anywhere; }
.paste-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
