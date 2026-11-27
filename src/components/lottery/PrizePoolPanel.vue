<template>
  <aside class="pool-panel" :aria-label="en ? 'Prize pool' : '当前奖池'">
    <header><h2>{{ en ? 'Prize pool' : '当前奖池' }}</h2><span class="pool-count">{{ en ? `${segments.length} ${segments.length === 1 ? 'type' : 'types'}` : `${segments.length} 种` }}</span></header>
    <template v-if="segments.length">
      <p>{{ en ? 'Odds for the next item. Sold-out prizes are excluded.' : '下一件奖品的中奖概率。售罄奖品会自动退出奖池。' }}</p>
      <ul>
        <li v-for="segment in visible" :key="segment.prize.id" :style="{ '--swatch': segment.color }">
          <div class="pool-item"><i aria-hidden="true"></i><strong>{{ segment.prize.name }}</strong><b>{{ chance(segment.probability) }}</b></div>
          <div class="pool-meta"><span>{{ segment.prize.quality }}</span><span>{{ en ? `${segment.prize.quantity} left` : `剩 ${segment.prize.quantity} 件` }}</span></div>
        </li>
      </ul>
      <button v-if="segments.length > limit" class="pool-more" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? (en ? 'Show less' : '收起奖池') : (en ? `Show all ${segments.length}` : `查看全部 ${segments.length} 种`) }}</button>
    </template>
    <p v-else>{{ en ? 'Add a prize or restock an existing one to start a draw.' : '添加新奖品，或为已有奖品补充库存，即可开始抽取。' }}</p>
    <RouterLink class="pool-link" to="/lottery/prizes"><FluentIcon icon="gift-16-regular" :width="16" />{{ en ? 'Manage prizes' : '管理奖品' }}<span aria-hidden="true">→</span></RouterLink>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ segments: { type: Array, required: true }, en: Boolean })
const limit = 5
const expanded = ref(false)
const visible = computed(() => expanded.value ? props.segments : props.segments.slice(0, limit))
const percent = computed(() => new Intl.NumberFormat(props.en ? 'en' : 'zh-CN', { style: 'percent', maximumFractionDigits: 1 }))
function chance(value) { return value > 0 && value < 0.001 ? '<0.1%' : percent.value.format(value) }
</script>

<style scoped>
.pool-panel { align-self: start; min-width: 0; padding: 18px; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-card); }
header, .pool-item, .pool-meta, .pool-link { display: flex; align-items: center; gap: 8px; }
h2 { margin: 0; color: var(--text-primary); font-size: 16px; }
.pool-count { margin-left: auto; white-space: nowrap; border: 1px solid var(--border-default); border-radius: 20px; padding: 2px 8px; font-size: 11px; color: var(--text-secondary); }
p { color: var(--text-secondary); margin: 9px 0 14px; font-size: 12px; line-height: 1.6; }
ul { margin: 0; padding: 0; list-style: none; }
li { padding: 10px 0; border-top: 1px solid var(--border-default); }
.pool-item i { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--swatch); }
.pool-item strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.pool-item b { flex: 0 0 auto; margin-left: auto; color: var(--text-primary); font-size: 12px; font-variant-numeric: tabular-nums; }
.pool-meta { margin: 4px 0 0 16px; justify-content: space-between; color: var(--text-secondary); font-size: 11px; }
.pool-more, .pool-link { color: var(--text-secondary); font: inherit; font-size: 12px; }
.pool-more { padding: 5px 0; background: none; border: none; text-decoration: underline; cursor: pointer; }
.pool-link { border-top: 1px solid var(--border-default); padding-top: 12px; margin-top: 6px; text-decoration: none; font-weight: 600; }
.pool-link span { margin-left: auto; }.pool-link:hover, .pool-more:hover { color: var(--accent-dark); }
</style>
