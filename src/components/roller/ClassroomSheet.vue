<template>
  <section class="classroom-sheet" :class="{ 'classroom-sheet-wide': wide }">
    <header class="classroom-head">
      <div><h1>{{ title }}</h1><p>{{ description }}</p></div>
      <label class="classroom-field">{{ en ? 'Name list' : '名单' }}
        <select :value="names.currentListId" :disabled="locked" @change="names.switchList($event.target.value)">
          <option v-for="list in names.allLists" :key="list.id" :value="list.id" translate="no">{{ list.name }}</option>
        </select>
      </label>
    </header>
    <slot />
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { useNamesStore } from '../../stores/names'
import { useSettingsStore } from '../../stores/settings'
defineProps({ title: String, description: String, locked: Boolean, wide: Boolean })
const names = useNamesStore()
const settings = useSettingsStore()
const en = computed(() => settings.settings.language === 'en')
</script>
<style>
.classroom-sheet { color:var(--text-primary); width:min(100%,1050px); margin:auto; padding:clamp(16px,3vw,40px); display:grid; gap:20px; }
.classroom-sheet-wide { width:100%; min-height:100%; margin:0; padding:clamp(12px,2.7cqi,44px); grid-template-rows:auto 1fr; gap:clamp(12px,1.65cqi,24px); }
.classroom-sheet-wide .classroom-head > div { min-width:0; }
.classroom-head, .classroom-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px 22px; }
.classroom-head h1 { font:700 clamp(24px,3vw,34px)/1.2 var(--font-display); margin:0 0 6px; }
.classroom-head p, .classroom-caption { margin:0; color:var(--text-secondary); font-size:14px; line-height:1.6; }
.classroom-field { display:inline-flex; gap:7px; align-items:center; font-size:13px; font-weight:600; color:var(--text-secondary); }
.classroom-field input,.classroom-field select,.classroom-sheet textarea { border:1px solid var(--border-strong); border-radius:var(--radius-md); background:var(--bg-card-solid); color:var(--text-primary); padding:7px 9px; font:inherit; max-width: min(56vw,240px); }
.classroom-field input { width:4.8em; }
.classroom-sheet :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.classroom-sheet .classroom-panel { padding:clamp(16px,2.6vw,28px); border:1px solid var(--border-strong); background:var(--bg-card); border-radius:var(--radius-xl); }
.classroom-sheet .button-set { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.classroom-sheet h2 { font-size:17px; margin:0 0 12px; }
.classroom-sheet .empty-link { color:var(--text-secondary); text-decoration:underline; }
</style>
