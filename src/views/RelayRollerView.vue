<template>
  <ClassroomSheet wide class="relay-sheet" :title="en ? 'Firefly Relay' : '流萤传灯'" :locked="rounds.busy"
    :description="en ? 'Pass the light to one new person at a time. Each handoff records one name.' : '每传一次灯，就从还没接过灯的人里抽一位，记一次点名。'">
    <div class="relay-workbench">
    <div class="relay-stage classroom-panel">
      <svg class="firefly-art" viewBox="0 0 180 146" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-linecap="round">
          <path d="M6 110Q41 121 56 86T112 45Q143 41 138 63T99 73Q87 64 98 58T128 65" stroke-dasharray="2 5" opacity=".55"/>
          <path d="M34 57Q52 62 59 46M126 107Q147 119 165 99" opacity=".4"/>
        </g>
        <g v-for="([x,y,s],i) in lights" :key="i" :transform="'translate('+x+' '+y+') scale('+s+')'">
          <circle r="14" fill="currentColor" opacity=".10"/><circle r="8" fill="currentColor" opacity=".23"/>
          <path d="M0 0Q-14 -16 -16 -7Q-17 0 0 0M1 0Q7 -17 13 -11Q17 -4 1 0" fill="currentColor" opacity=".64"/>
          <ellipse rx="4" ry="5" transform="rotate(27)" fill="currentColor"/>
        </g>
      </svg>
      <div class="light-holder" role="status" aria-live="polite" aria-atomic="true">
        <span>{{ current ? (en ? 'Holding the light' : '此刻，灯在') : (en ? 'Before the first light' : '第一盏灯') }}</span>
        <strong v-if="current" class="relay-headline" :key="current.id" translate="no">{{ displayName(current) }}</strong>
        <strong v-else class="relay-headline">{{ en ? 'Who goes first?' : '谁来点亮？' }}</strong>
        <small>{{ rounds.turns.length }} / {{ rounds.relayLimit }} · {{ en ? 'turns' : '本轮人数' }}</small>
      </div>
      <div class="relay-meter" aria-hidden="true"><i :style="{ width:(rounds.turns.length / (rounds.relayLimit || 1) * 100) + '%' }" /></div>
    </div>
    <aside class="relay-sidebar">
      <section class="relay-log classroom-panel" aria-labelledby="relay-log-title">
        <h2 id="relay-log-title">{{ complete ? (en ? 'Round complete' : '本轮传灯完成') : (en ? 'Path of the light' : '灯走过的路') }}</h2>
        <ol v-if="current" ref="trail" class="relay-trail" tabindex="0" role="list" aria-labelledby="relay-log-title">
          <li v-for="(person,i) in rounds.turns" :key="person.id" :aria-current="i === rounds.turns.length - 1 ? 'step' : undefined">
            <span aria-hidden="true">{{ i+1 }}</span><strong translate="no">{{ displayName(person) }}</strong>
          </li>
        </ol>
        <p v-else class="classroom-caption">{{ en ? 'Names will appear here in the order they receive the light.' : '第一盏灯亮起后，名字会按接到灯的顺序留在这里。' }}</p>
      </section>
      <div class="relay-controls classroom-actions classroom-panel">
        <CountStepper :label="complete ? (en ? 'Next round length' : '下轮人数') : (en ? 'Round length' : '每轮人数')"
          :model-value="rounds.nextTarget" :min="1" :max="Math.min(100,rounds.people.length)"
          :disabled="(!!current && !complete) || rounds.busy || !rounds.people.length" :en="en" @update:model-value="setSize" />
        <div class="relay-actions button-set">
          <FluentButton v-if="current && !complete" variant="secondary" :disabled="rounds.busy" @click="rounds.resetRelay">{{ en ? 'End round' : '结束本轮' }}</FluentButton>
          <FluentButton class="relay-advance" variant="primary" :disabled="!rounds.people.length || rounds.busy" @click="advance">
            {{ rounds.busy ? (en ? 'Drawing…' : '点名中…') : complete ? (en ? 'Start another round' : '开启下一轮') : current ? (en ? 'Pass the light' : '把灯传给下一位') : (en ? 'Light the first lantern' : '点亮第一盏灯') }}
          </FluentButton>
        </div>
        <p v-if="!rounds.people.length" class="classroom-caption">{{ en ? 'This list has no names to draw.' : '这份名单还没有可抽取的人。' }} <RouterLink class="empty-link" to="/lists">{{ en ? 'Manage names' : '管理名单' }}</RouterLink></p>
        <p v-if="rounds.error" role="alert">{{ rounds.error }}</p>
      </div>
    </aside>
    </div>
  </ClassroomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import ClassroomSheet from '../components/roller/ClassroomSheet.vue'
import CountStepper from '../components/roller/CountStepper.vue'
import { useSettingsStore } from '../stores/settings'
import { useClassroomRounds } from '../stores/classroomRounds'
import { boundCount } from '../utils/classroomRounds'
const settings = useSettingsStore()
const rounds = useClassroomRounds()
const lights = [[34,104,.75],[71,64,.58],[131,57,1.15],[149,104,.6]]
const en = computed(() => settings.settings.language === 'en')
const current = computed(() => rounds.turns.at(-1))
const complete = computed(() => !!current.value && rounds.turns.length >= rounds.relayLimit)
const trail = ref(null)
const displayName = person => settings.settings.englishMode && person.englishName || person.name
watch([trail, current], () => {
  if (trail.value) trail.value.scrollTop = trail.value.scrollHeight
}, { flush: 'post' })
function setSize(value) {
  rounds.relaySize = boundCount(value, Math.min(100,rounds.people.length), 5)
}
function advance() {
  if (complete.value) rounds.resetRelay()
  return rounds.passLight()
}
</script>
<style scoped>
.relay-workbench { display:grid; grid-template-columns:minmax(0,1fr) minmax(265px,.45fr); gap:clamp(12px,1.55cqi,22px); min-width:0; }
.relay-stage { position:relative; isolation:isolate; display:grid; align-content:center; justify-items:center; gap:clamp(8px,2.25cqi,30px); min-height:clamp(220px,49cqh,550px); overflow:hidden; background:radial-gradient(ellipse at 50% 36%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 72%),var(--bg-card-solid) !important; }
.firefly-art { width:min(85%,clamp(115px,24cqi,315px)); color:var(--accent-dark); flex:none; }
.light-holder { width:100%; min-width:0; text-align:center; display:grid; gap:8px; }
.light-holder span,.light-holder small { color:var(--text-secondary); font-size:14px; }
.light-holder strong { font:700 clamp(25px,5.2cqi,76px)/1.16 var(--font-display); overflow-wrap:anywhere; animation:pass-glow .45s ease-out; }
.relay-meter { position:absolute; inset:auto 0 0; height:4px; background:var(--border-subtle); }.relay-meter i { display:block;height:100%;background:var(--accent);transition:width .3s; }
.relay-sidebar { display:flex; flex-direction:column; justify-content:space-between; gap:12px; min-width:0; }
.relay-sidebar .classroom-panel { padding:clamp(12px,1.55cqi,24px); }
.relay-log { display:grid; gap:10px; }
.relay-log h2 { margin:0; }
.relay-controls.classroom-actions { display:grid; justify-content:stretch; justify-items:end; gap:10px; }
.relay-controls p { margin:0; justify-self:stretch; }
.relay-controls :deep(.count-stepper) { min-width:0; max-width:100%; flex-wrap:wrap; justify-content:flex-end; text-align:end; }
.relay-controls :deep(.stepper-label) { white-space:normal; overflow-wrap:anywhere; }
.relay-actions { justify-content:flex-end; }
.relay-actions :deep(button) { min-height:44px; }
.relay-trail { padding:2px;margin:0;list-style:none;display:grid;gap:6px;max-height:clamp(88px,41cqh,445px);overflow:auto;scrollbar-gutter:stable; }
.relay-trail li { display:flex;align-items:center;gap:8px;padding:5px 10px 5px 5px;border:1px solid var(--border-default);border-radius:var(--radius-md);overflow-wrap:anywhere;min-width:0; }
.relay-trail li[aria-current="step"] { border-color:var(--border-strong);background:var(--bg-hover); }
.relay-trail strong { font-size:clamp(14px,1.1cqi,17px); min-width:0; }
.relay-trail span { display:grid;place-items:center;min-width:24px;height:24px;border-radius:50%;background:var(--bg-hover);font-size:12px;color:var(--text-secondary); }
@container roller-panel (min-width:721px) and (min-height:450px) {
  .relay-sheet.classroom-sheet { height:100%; grid-template-rows:auto minmax(0,1fr); }
  .relay-workbench { min-height:0; grid-template-rows:minmax(0,1fr); }
  .relay-sidebar { min-height:0; display:grid; grid-template-rows:minmax(0,1fr) auto; }
  .relay-log { min-height:0; grid-template-rows:auto minmax(0,1fr); }
  .relay-trail { min-height:0; max-height:none; align-content:start; }
}
@container roller-panel (max-width:720px) {
  .relay-workbench { grid-template-columns:minmax(0,1fr); align-content:start; }
  .relay-stage { min-height:clamp(188px,35cqh,275px); }
  .firefly-art { width:clamp(78px,24cqi,145px); }
  .relay-trail { max-height:clamp(84px,23cqh,185px); }
  .relay-controls.classroom-actions { grid-template-columns:minmax(0,1fr) auto; align-items:center; }
  .relay-controls p { grid-column:1 / -1; }
}
@container roller-panel (max-width:520px) {
  .relay-controls.classroom-actions { grid-template-columns:minmax(0,1fr); }
  .relay-actions { width:100%; }
  .relay-actions :deep(button) { flex:1 1 auto; }
}
@keyframes pass-glow { from {opacity:.4;transform:translateY(5px)} to {opacity:1;transform:none} }
@media(prefers-reduced-motion:reduce){.light-holder strong,.relay-meter i{animation:none;transition:none}}
:global(.perf-no-anim) .light-holder strong,:global(.perf-no-anim) .relay-meter i{animation:none;transition:none}
</style>
