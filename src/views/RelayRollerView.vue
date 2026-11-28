<template>
  <ClassroomSheet :title="en ? 'Firefly Relay' : '流萤传灯'" :locked="rounds.busy"
    :description="en ? 'Pass the light to one new person at a time. Each handoff records one name.' : '每传一次灯，就从还没接过灯的人里抽一位，记一次点名。'">
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
        <strong class="relay-headline" :key="current?.id">{{ current ? displayName(current) : (en ? 'Who goes first?' : '谁来点亮？') }}</strong>
        <small>{{ rounds.turns.length }} / {{ rounds.relayLimit }} · {{ en ? 'turns' : '本轮人数' }}</small>
      </div>
      <div class="relay-meter" aria-hidden="true"><i :style="{ width:(rounds.turns.length / (rounds.relayLimit || 1) * 100) + '%' }" /></div>
    </div>
    <div class="classroom-actions">
      <CountStepper :label="complete ? (en ? 'Next round length' : '下轮人数') : (en ? 'Round length' : '每轮人数')"
        :model-value="rounds.nextTarget" :min="1" :max="Math.min(100,rounds.people.length)"
        :disabled="(!!current && !complete) || rounds.busy || !rounds.people.length" :en="en" @update:model-value="setSize" />
      <div class="button-set">
        <FluentButton v-if="current && !complete" variant="secondary" :disabled="rounds.busy" @click="rounds.resetRelay">{{ en ? 'End round' : '结束本轮' }}</FluentButton>
        <FluentButton class="relay-advance" variant="primary" :disabled="!rounds.people.length || rounds.busy" @click="advance">
          {{ rounds.busy ? (en ? 'Drawing…' : '点名中…') : complete ? (en ? 'Start another round' : '开启下一轮') : current ? (en ? 'Pass the light' : '把灯传给下一位') : (en ? 'Light the first lantern' : '点亮第一盏灯') }}
        </FluentButton>
      </div>
    </div>
    <p v-if="!rounds.people.length" class="classroom-caption">{{ en ? 'This list has no names to draw.' : '这份名单还没有可抽取的人。' }} <RouterLink class="empty-link" to="/lists">{{ en ? 'Manage names' : '管理名单' }}</RouterLink></p>
    <p v-if="rounds.error" role="alert">{{ rounds.error }}</p>
    <div v-if="current" class="classroom-panel">
      <h2>{{ complete ? (en ? 'Round complete' : '本轮传灯完成') : (en ? 'Path of the light' : '灯走过的路') }}</h2>
      <ol class="relay-trail"><li v-for="(person,i) in rounds.turns" :key="person.id"><span>{{ i+1 }}</span>{{ displayName(person) }}</li></ol>
    </div>
  </ClassroomSheet>
</template>
<script setup>
import { computed } from 'vue'
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
const displayName = person => settings.settings.englishMode && person.englishName || person.name
function setSize(value) {
  rounds.relaySize = boundCount(value, Math.min(100,rounds.people.length), 5)
}
function advance() {
  if (complete.value) rounds.resetRelay()
  return rounds.passLight()
}
</script>
<style scoped>
.relay-stage { position:relative; isolation:isolate; display:flex; align-items:center; justify-content:center; gap:clamp(8px,4vw,52px); min-height:clamp(190px,33vh,310px); overflow:hidden; background:radial-gradient(ellipse at 28% 38%,color-mix(in srgb,var(--accent) 15%,transparent),transparent 62%),var(--bg-card-solid) !important; }
.firefly-art { width:clamp(72px,21%,185px); color:var(--accent-dark); flex:none; }
.light-holder { min-width:0; display:grid; gap:6px; }
.light-holder span,.light-holder small { color:var(--text-secondary); font-size:14px; }
.light-holder strong { font:700 clamp(24px,4vw,58px)/1.25 var(--font-display); overflow-wrap:anywhere; animation:pass-glow .45s ease-out; }
.relay-meter { position:absolute; inset:auto 0 0; height:4px; background:var(--border-subtle); }.relay-meter i { display:block;height:100%;background:var(--accent);transition:width .3s; }
.relay-trail { padding:0;margin:0;list-style:none;display:flex;gap:8px;flex-wrap:wrap; }
.relay-trail li { display:flex;align-items:center;gap:7px;padding:5px 11px 5px 5px;border:1px solid var(--border-strong);border-radius:22px;overflow-wrap:anywhere;max-width:100%; }
.relay-trail span { display:grid;place-items:center;min-width:24px;height:24px;border-radius:50%;background:var(--bg-hover);font-size:12px;color:var(--text-secondary); }
@keyframes pass-glow { from {opacity:.4;transform:translateY(5px)} to {opacity:1;transform:none} }
@media(prefers-reduced-motion:reduce){.light-holder strong,.relay-meter i{animation:none;transition:none}}
:global(.perf-no-anim) .light-holder strong,:global(.perf-no-anim) .relay-meter i{animation:none;transition:none}
</style>
