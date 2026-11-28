<template>
  <ClassroomSheet class="tunnel-sheet" :title="tr('光轨穿梭','Light Tunnel')" :locked="locked"
    :description="tr('选好人数，让名字沿光轨抵达。每轮不重复，可以一起揭晓，也可以一个个看。','Choose how many names to draw without replacement. Reveal them together or one by one.')">
    <div class="tunnel" :class="{transit:flying}">
      <svg viewBox="0 0 700 240" preserveAspectRatio="none" aria-hidden="true">
        <g class="rails"><path d="M0 0L268 88M700 0L432 88M700 240L432 152M0 240L268 152M0 120H248M700 120H452"/></g>
        <g v-for="scale in [.32,.46,.63,.82,1.04]" :key="scale" :transform="'translate(350 120) scale('+scale+')'">
          <path class="gate" d="M-320 -98H-100M100 -98H320L345 -73V73L320 98H98M-98 98H-320L-345 73V-73L-320 -98"/>
        </g>
        <g class="signal-dots"><circle cx="97" cy="34" r="2.5"/><circle cx="175" cy="60" r="2"/><circle cx="532" cy="182" r="2"/><circle cx="605" cy="208" r="2.5"/></g>
      </svg>
      <span class="tunnel-mark" aria-hidden="true">LIGHT TUNNEL <i></i><i></i><i></i></span>
      <div v-if="flying" class="warp-streaks" aria-hidden="true">
        <i v-for="n in 16" :key="n" :style="{ '--angle': ((n * 22.5) % 360) + 'deg', '--delay': (n % 8) * 22 + 'ms' }" />
      </div>
      <div class="tunnel-announcement" role="status" aria-atomic="true">
        <template v-if="visible.length && !flying">
          <span v-if="pending || visible.length === 1" translate="no">{{ display(visible.at(-1)) }}</span>
          {{ round.shown }} / {{ round.results.length }} · {{ pending ? tr('已揭晓','revealed') : tr('揭晓完成','draw complete') }}
        </template>
        <template v-else>{{ stageTitle }}</template>
      </div>
      <div class="tunnel-display" :class="{ 'has-results': !flying && visible.length, 'focused-results': !grouped }">
        <span class="tunnel-stage-title">{{ stageTitle }}</span>
        <ol v-if="!flying && visible.length" ref="arrivals" class="arrivals"
          :class="{ 'arrivals-group': grouped }"
          :aria-label="tr('已抵达的名字','Arrived names')" tabindex="0" role="list">
          <li v-for="(person,i) in visible" :key="person.id"
            :class="{ featured: i === featuredIndex, 'new-arrival': i === featuredIndex && arrival === i + 1 }">
            <span v-if="visible.length > 1" class="arrival-index" aria-hidden="true">{{ String(i+1).padStart(2,'0') }}</span>
            <strong translate="no">{{ display(person) }}</strong>
          </li>
        </ol>
        <strong v-else class="tunnel-headline">{{ flying ? '···' : tr('下一站，是谁？','Who arrives next?') }}</strong>
        <div v-if="!flying && visible.length" class="tunnel-result-footer">
          <small>{{ round.shown }} / {{ round.results.length }} {{ tr('位已揭晓','revealed') }}</small>
          <FluentButton class="tunnel-copy-action" variant="secondary" :disabled="locked" @click="copy">
            {{ copied ? tr('已复制','Copied') : tr('复制名单','Copy names') }}
          </FluentButton>
        </div>
      </div>
    </div>
    <div class="tunnel-controls classroom-panel">
      <div class="classroom-actions">
        <div class="button-set">
          <CountStepper :label="tr('抽取人数','Names to draw')" :model-value="count" :min="1" :max="maxCount"
            :disabled="locked || pending || !maxCount" :en="settings.settings.language==='en'" @update:model-value="setCount" />
          <label class="classroom-field">{{ tr('揭晓方式','Reveal') }}
            <select v-model="style" :disabled="locked || pending">
              <option value="all">{{ tr('一起抵达','All at once') }}</option>
              <option value="steps">{{ tr('逐个抵达','One at a time') }}</option>
            </select>
          </label>
        </div>
        <div class="button-set">
          <FluentButton v-if="pending" class="tunnel-reveal-all" variant="secondary" :disabled="locked" @click="uncover(true)">{{ tr('全部揭晓','Reveal all') }}</FluentButton>
          <FluentButton class="tunnel-draw" variant="primary" :disabled="locked || !maxCount" @click="pending ? uncover(false) : launch()">
            {{ locked ? tr('穿行中…','In transit…') : pending ? tr('下一位抵达','Reveal next') : round ? tr('再抽一轮','Draw again') : tr('出发点名','Launch draw') }}
          </FluentButton>
        </div>
      </div>
      <p v-if="!maxCount" class="classroom-caption">{{ tr('这份名单还没有人。','This list has no names.') }} <RouterLink class="empty-link" to="/lists">{{ tr('管理名单','Manage names') }}</RouterLink></p>
      <p v-else-if="style==='steps'" class="classroom-caption">{{ tr('出发时一次抽齐并记入记录，之后每按一下只揭晓下一位。','Launching records the whole draw. Each subsequent press reveals the next name.') }}</p>
      <textarea v-if="manualCopy" ref="copyBox" class="tunnel-copy" readonly :value="summary" :aria-label="tr('选中并复制姓名','Select and copy names')" />
      <p v-if="tunnel.error" role="alert">{{ tunnel.error }}</p>
    </div>
  </ClassroomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ClassroomSheet from '../components/roller/ClassroomSheet.vue'
import CountStepper from '../components/roller/CountStepper.vue'
import { useClassroomRounds } from '../stores/classroomRounds'
import { useLightTunnel } from '../stores/lightTunnel'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { boundCount } from '../utils/classroomRounds'
const tunnel=useLightTunnel(), classroom=useClassroomRounds(), names=useNamesStore(), settings=useSettingsStore()
const tr=(zh,en)=>settings.settings.language==='en'?en:zh
const style=ref('all'), requested=ref(1), flying=ref(false), copied=ref(false), manualCopy=ref(false), copyBox=ref(null), arrivals=ref(null)
const arrival=ref(0)
const FLIGHT_MS=1500, REVEAL_MS=720
const listId=computed(()=>names.currentList.id), maxCount=computed(()=>Math.min(100,classroom.people.length))
const count=computed(()=>boundCount(requested.value,maxCount.value,1))
const round=computed(()=>tunnel.rounds[listId.value]), pending=computed(()=>round.value && round.value.shown<round.value.results.length)
const visible=computed(()=>round.value?.results.slice(0,round.value.shown) || [])
const grouped=computed(()=>!pending.value && visible.value.length>1)
const featuredIndex=computed(()=>grouped.value ? -1 : visible.value.length-1)
const display=p=>settings.settings.englishMode && p.englishName || p.name
const summary=computed(()=>visible.value.map(display).join('\n'))
const stageTitle=computed(()=>flying.value ? tr('光轨穿行中','In transit')
  : pending.value ? tr('名字陆续抵达','Names are arriving')
  : visible.value.length ? tr('本轮已经抵达','Arrivals from this draw')
  : tr('等待出发','Ready to launch'))
const locked=computed(()=>tunnel.busy || flying.value)
let timer, version=0, copyRequest=0
function setCount(value){requested.value=boundCount(value,maxCount.value,1)}
function stopFlight(){version++;clearTimeout(timer);flying.value=false}
function endFlight(){flying.value=false;arrival.value=round.value?.shown ?? 0}
function clearCopy(){copyRequest++;copied.value=false;manualCopy.value=false}
function canFly(){return settings.settings.perfAnimations!==false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden}
async function launch(){
  if (locked.value || !count.value) return
  const stamp=++version, start=performance.now()
  clearCopy();arrival.value=0;flying.value=canFly()
  const ok=await tunnel.draw(listId.value,count.value,style.value==='steps')
  if (stamp!==version) return
  if (ok && flying.value) timer=setTimeout(endFlight,Math.max(0,FLIGHT_MS-(performance.now()-start)))
  else flying.value=false
}
function uncover(all){
  if(locked.value) return
  clearCopy()
  tunnel.reveal(listId.value,all)
  if(canFly()&&!all){flying.value=true;timer=setTimeout(endFlight,REVEAL_MS)}
}
function onVisibility(){if(document.hidden)stopFlight()}
watch(listId,()=>{stopFlight();clearCopy();arrival.value=0})
// Scroll the list, not the whole workbench, to spotlight the latest arrival.
watch([arrivals,visible],()=>{
  const list=arrivals.value
  if(list) list.scrollTop=pending.value ? list.scrollHeight : 0
},{flush:'post'})
onMounted(()=>document.addEventListener('visibilitychange',onVisibility))
onBeforeUnmount(()=>{stopFlight();clearCopy();document.removeEventListener('visibilitychange',onVisibility)})
async function copy(){
  if(locked.value || !visible.value.length) return
  const stamp=++copyRequest
  try {
    await navigator.clipboard.writeText(summary.value)
    if(stamp===copyRequest){copied.value=true;manualCopy.value=false}
  } catch {
    if(stamp!==copyRequest) return
    copied.value=false;manualCopy.value=true
    await nextTick()
    if(stamp===copyRequest){
      copyBox.value?.focus()
      copyBox.value?.select()
    }
  }
}
</script>
<style scoped>
.tunnel-sheet.classroom-sheet {
  width: 100%;
  min-height: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.7cqh, 24px);
  padding: clamp(14px, 2.6cqw, 38px);
}
.tunnel {
  --track: color-mix(in srgb, var(--accent) 58%, #5499bd);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  place-items: center;
  text-align: center;
  flex: 1 0 auto;
  min-height: clamp(180px, 47cqh, 430px);
  padding: clamp(16px, 2.1cqi, 32px);
  padding-block-end: max(26px, 2.1cqi);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: radial-gradient(ellipse at 50% 55%, var(--bg-card-solid) 13%, transparent 66%), linear-gradient(120deg, color-mix(in srgb, var(--accent) 13%, var(--bg-card-solid)), color-mix(in srgb, var(--track) 18%, var(--bg-card-solid)));
}
.tunnel-controls.classroom-panel { padding: clamp(12px, 1.7cqw, 23px); }
.tunnel-sheet :deep(.classroom-head) > div { min-width: 0; }
.tunnel svg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;fill:none;stroke:var(--track);stroke-linejoin:round}.rails{opacity:.34}.gate{opacity:.50;stroke-width:1.6;vector-effect:non-scaling-stroke;transform-origin:0 0}.signal-dots{fill:var(--track);stroke:none}.tunnel-mark{position:absolute;left:14px;bottom:10px;display:flex;align-items:center;gap:3px;font:600 9px/1.2 var(--font-ui);letter-spacing:.14em;color:var(--text-secondary)}.tunnel-mark i{width:3px;height:7px;transform:skewX(-18deg);background:var(--track)}.tunnel-mark i:first-child{margin-left:4px}
.transit .rails path{stroke-dasharray:18 120;animation:rail-flow 1.1s linear infinite}
.transit .gate{animation:jump-gate 1.5s cubic-bezier(.18,.62,.2,1) both}
.warp-streaks{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}
.warp-streaks i{position:absolute;left:50%;top:50%;width:clamp(70px,18vw,230px);height:2px;border-radius:2px;opacity:0;transform-origin:0 50%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--track) 52%,#fff),transparent);animation:warp-streak 1.15s cubic-bezier(.16,.7,.24,1) both;animation-delay:var(--delay)}
@keyframes rail-flow{to{stroke-dashoffset:-138}}
@keyframes warp-streak{0%{opacity:0;transform:rotate(var(--angle)) translateX(0) scaleX(.18)}24%{opacity:.95}100%{opacity:0;transform:rotate(var(--angle)) translateX(46vw) scaleX(2.8)}}
.tunnel-announcement{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.tunnel-display{min-width:0;max-width:100%;display:grid;justify-items:center;gap:6px;padding:13px clamp(12px,2.5cqi,32px);background:var(--bg-card-solid);border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);transition:box-shadow .3s,border-color .3s}
.tunnel-display.has-results{width:min(100%,64rem);padding:clamp(8px,1.35cqi,19px);gap:clamp(6px,1cqi,14px)}
.tunnel-display.has-results.focused-results{width:min(100%,42rem)}
.transit .tunnel-display{border-color:color-mix(in srgb,var(--track) 42%,var(--border-default));box-shadow:0 0 0 1px color-mix(in srgb,var(--track) 24%,transparent),0 0 48px color-mix(in srgb,var(--track) 30%,transparent)}
.tunnel-stage-title,.tunnel-result-footer small{color:var(--text-secondary);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.tunnel-headline,.arrivals strong{min-width:0;font:700 clamp(22px,2.4cqi,36px)/1.2 var(--font-display);overflow-wrap:anywhere}
.tunnel-headline,.arrivals .featured strong{font-size:clamp(31px,5.2cqi,74px)}
.arrivals{list-style:none;display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(5px,.65cqi,10px);width:100%;min-width:0;max-height:clamp(104px,37cqh,400px);overflow:auto;scrollbar-gutter:stable both-edges;margin:0;padding:2px}
.arrivals-group{grid-template-columns:repeat(auto-fit,minmax(min(100%,clamp(128px,16cqi,206px)),1fr))}
.arrivals li{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:5px 8px;padding:clamp(6px,1cqi,14px);background:color-mix(in srgb,var(--track) 8%,var(--bg-card-solid));border:1px solid var(--border-default);border-radius:var(--radius-md)}
.arrivals .arrival-index{justify-self:start;color:var(--text-secondary);font:650 clamp(11px,1.1cqi,15px)/1 var(--font-ui);font-variant-numeric:tabular-nums}
.arrivals .featured{background:color-mix(in srgb,var(--track) 14%,var(--bg-card-solid));border-color:color-mix(in srgb,var(--track) 45%,var(--border-default))}
.arrivals .featured:only-child{grid-template-columns:minmax(0,1fr)}
.arrivals .new-arrival strong{animation:arrival-pop .55s cubic-bezier(.2,1.25,.4,1) both}
.tunnel-result-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;width:100%;padding-inline:2px}
.tunnel-controls{display:grid;gap:12px}.tunnel-copy{max-width:100%;width:100%}
@keyframes jump-gate{0%{transform:scale(.62);opacity:0}38%{opacity:.78}74%{opacity:.34}100%{transform:scale(1.72);opacity:0}}
@keyframes arrival-pop{0%{opacity:0;transform:translateY(12px) scale(.84);filter:blur(7px)}55%{opacity:1;transform:translateY(0) scale(1.06);filter:blur(0)}100%{transform:none;filter:none}}
@container roller-panel (max-width: 560px) {
  .tunnel { min-height: clamp(150px, 36cqh, 315px); }
}
@container roller-panel (max-height: 420px) {
  .tunnel-sheet.classroom-sheet { padding-block: 12px; gap: 12px; }
  .tunnel { min-height: clamp(132px, 36cqh, 176px); }
}
@media(prefers-reduced-motion:reduce){.transit .gate,.transit .rails path,.transit .warp-streaks i,.arrivals .new-arrival strong,.tunnel-display{animation:none;transition:none}.warp-streaks{display:none}}
:global(.perf-no-anim) .transit .gate,:global(.perf-no-anim) .transit .rails path,:global(.perf-no-anim) .transit .warp-streaks i,:global(.perf-no-anim) .arrivals .new-arrival strong{animation:none}
:global(.perf-no-anim) .warp-streaks{display:none}
</style>
