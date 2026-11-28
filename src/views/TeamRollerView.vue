<template>
  <ClassroomSheet :title="en ? 'Constellations' : '连星成诗'"
    :description="en ? 'Shuffle the class into temporary teams of similar size. Saved groups and roll call records stay as they are.' : '把名单随机分成几组，每组人数最多差一人。临时组队不改原有小组，也不记点名。'">
    <div class="team-studio classroom-panel">
      <svg class="star-chart" viewBox="0 0 240 120" aria-hidden="true">
        <g v-for="(path,i) in paths" :key="i">
          <polyline :points="path.map(p=>p.join(',')).join(' ')" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/>
          <g v-for="([x,y],j) in path" :key="j"><circle :cx="x" :cy="y" :r="j===1 ? 9 : 6" opacity=".12" fill="currentColor"/><circle :cx="x" :cy="y" :r="j===1 ? 3.4 : 2.3" fill="currentColor"/></g>
        </g>
      </svg>
      <div><h2>{{ en ? 'Draw a constellation' : '把散落的星连起来' }}</h2>
        <p class="classroom-caption">{{ en ? poolSize+' eligible names · whitelist entries sit out.' : poolSize+' 人参与组队，白名单成员不参与。' }}</p>
        <div class="team-setup">
          <label class="classroom-field">{{ en ? 'Teams' : '分成几组' }}
            <input type="number" min="1" :max="poolSize" :value="rounds.groups" :disabled="!poolSize" @change="setCount" />
          </label>
          <FluentButton variant="primary" :disabled="!poolSize" @click="deal">{{ rounds.teams.length ? (en ? 'Reshuffle teams' : '重新分组') : (en ? 'Form teams' : '随机分组') }}</FluentButton>
        </div>
      </div>
    </div>
    <p v-if="!poolSize" class="classroom-caption">{{ en ? 'Switch lists or add someone to form a team.' : '换一份名单，或先添上参与组队的人吧。' }} <RouterLink class="empty-link" to="/lists">{{ en ? 'Manage names' : '管理名单' }}</RouterLink></p>
    <template v-if="rounds.teams.length">
      <div class="classroom-actions">
        <strong role="status">{{ en ? rounds.teams.length+' teams · '+poolSize+' people' : '本次分组 · '+ rounds.teams.length +' 组，'+poolSize+' 人' }}</strong>
        <FluentButton variant="secondary" @click="copy">{{ copied ? (en ? 'Copied' : '已复制') : (en ? 'Copy teams' : '复制分组') }}</FluentButton>
      </div>
      <label v-if="manualCopy" class="copy-text">{{ en ? 'Select and copy your teams:' : '选中并复制分组文字：' }}<textarea ref="copyBox" readonly :value="summary" /></label>
      <div :key="dealId" class="team-grid">
        <article v-for="(team,i) in rounds.teams" :key="i" class="classroom-panel team-card" :style="{ '--delay':Math.min(i,8)*28+'ms' }">
          <header><h2>{{ label(i) }}</h2><small>{{ en ? team.length+' people' : team.length+' 人' }}</small></header>
          <ul><li v-for="person in team" :key="person.id" class="team-member">{{ name(person) }}</li></ul>
        </article>
      </div>
    </template>
  </ClassroomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import ClassroomSheet from '../components/roller/ClassroomSheet.vue'
import { useSettingsStore } from '../stores/settings'
import { useClassroomRounds } from '../stores/classroomRounds'
import { boundCount } from '../utils/classroomRounds'
const rounds = useClassroomRounds()
const settings = useSettingsStore()
const en = computed(() => settings.settings.language === 'en')
const poolSize = computed(() => rounds.teamPool.length)
const paths = [[[8,63],[32,38],[61,52],[75,23]],[[84,89],[111,61],[134,80],[148,53],[111,61]],[[159,35],[188,22],[207,52],[225,45]]]
const label = i => en.value ? 'Team '+(i+1) : '第 '+(i+1)+' 组'
const name = p => settings.settings.englishMode && p.en || p.cn
const summary = computed(() => rounds.teams.map((group,i)=>label(i)+': '+group.map(name).join(en.value ? ', ' : '、')).join('\n'))
const copied = ref(false), manualCopy = ref(false), copyBox = ref(null), dealId = ref(0)
watch(summary, () => { copied.value=false; manualCopy.value=false })
function setCount(event) {
  rounds.teamCount = boundCount(event.target.value,poolSize.value,4)
  event.target.value = rounds.teamCount
}
function deal() { rounds.dealTeams(); dealId.value++ }
async function copy() {
  try { await navigator.clipboard.writeText(summary.value); copied.value=true }
  catch { manualCopy.value=true; await nextTick(); copyBox.value?.select() }
}
</script>
<style scoped>
.team-studio { display:flex; gap:clamp(12px,4vw,60px); align-items:center; justify-content:center; min-height:185px; background:radial-gradient(ellipse at 20% 45%,color-mix(in srgb,var(--accent) 13%,transparent),transparent 64%),var(--bg-card-solid)!important; }
.star-chart { width:clamp(74px,30%,245px);color:var(--accent-dark);flex:none; }
.team-studio h2 { font-family:var(--font-display); font-size:clamp(20px,2.5vw,29px);margin-bottom:4px; }
.team-setup { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; margin-top:16px; }
.team-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr)); gap:12px; }
.team-card { animation:join-stars .28s both ease-out; animation-delay:var(--delay); }
.team-card header { display:flex;justify-content:space-between;align-items:center;gap:8px; }
.team-card h2 { margin:0; }.team-card small { color:var(--text-secondary); }
.team-card ul { display:flex;flex-wrap:wrap;gap:7px;padding:0;margin:14px 0 0;list-style:none; }.team-card li { padding:3px 9px;border-radius:var(--radius-full);background:var(--bg-hover);overflow-wrap:anywhere;max-width:100%; }
.copy-text { display:grid;gap:6px; }.copy-text textarea { max-width:100%;min-height:5em; }
@keyframes join-stars { from{opacity:.4;transform:translateY(5px)} to{opacity:1;transform:none} }
@container roller-workspace (max-width:460px){.team-studio{flex-direction:column;align-items:start}.star-chart{width:100px;height:45px}}
@media(prefers-reduced-motion:reduce){.team-card{animation:none}}
:global(.perf-no-anim) .team-card{animation:none}
</style>
