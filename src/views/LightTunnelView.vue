<template>
  <ClassroomSheet :title="tr('光轨穿梭','Light Tunnel')" :locked="locked"
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
      <div v-if="flying" class="flybys" aria-hidden="true">
        <span v-for="(name,i) in passengers" :key="i" :class="'lane-'+i">{{ name }}</span>
      </div>
      <div class="tunnel-display" :class="{ arrived: arrival > 0 }" role="status" aria-live="polite" aria-atomic="true">
        <span>{{ flying ? tr('光轨穿行中','In transit') : round ? tr('已经抵达','Arrived') : tr('等待出发','Ready to launch') }}</span>
        <strong class="tunnel-headline" :key="arrival">{{ flying ? '···' : round ? headline : tr('下一站，是谁？','Who arrives next?') }}</strong>
        <small v-if="round && !flying">{{ round.shown }} / {{ round.results.length }}</small>
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
      <p v-if="tunnel.error" role="alert">{{ tunnel.error }}</p>
    </div>
    <div v-if="round && !flying" class="classroom-panel">
      <header class="classroom-actions"><h2>{{ tr('本轮点名','This draw') }}</h2>
        <FluentButton variant="secondary" :disabled="pending" @click="copy">{{ copied ? tr('已复制','Copied') : tr('复制名单','Copy names') }}</FluentButton></header>
      <textarea v-if="manualCopy" ref="copyBox" class="tunnel-copy" readonly :value="summary" :aria-label="tr('选中并复制姓名','Select and copy names')" />
      <ol class="arrivals"><li v-for="(person,i) in visible" :key="person.id"><span>{{ String(i+1).padStart(2,'0') }}</span>{{ display(person) }}</li></ol>
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
const style=ref('all'), requested=ref(1), flying=ref(false), passengers=ref([]), copied=ref(false), manualCopy=ref(false), copyBox=ref(null)
const arrival=ref(0)
const FLIGHT_MS=1500, REVEAL_MS=720
const listId=computed(()=>names.currentList.id), maxCount=computed(()=>Math.min(100,classroom.people.length))
const count=computed(()=>boundCount(requested.value,maxCount.value,1))
const round=computed(()=>tunnel.rounds[listId.value]), pending=computed(()=>round.value && round.value.shown<round.value.results.length)
const visible=computed(()=>round.value?.results.slice(0,round.value.shown) || [])
const display=p=>settings.settings.englishMode && p.englishName || p.name
const summary=computed(()=>visible.value.map(display).join('\n'))
const headline=computed(()=>round.value?.inSteps ? display(visible.value.at(-1)) : visible.value.length<=4 ? visible.value.map(display).join(' · ') : tr('共 '+visible.value.length+' 位',visible.value.length+' names'))
const locked=computed(()=>tunnel.busy || flying.value)
let timer, version=0
function setCount(value){requested.value=boundCount(value,maxCount.value,1)}
function stopFlight(){version++;clearTimeout(timer);flying.value=false}
function canFly(){return settings.settings.perfAnimations!==false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden}
async function launch(){
  if (locked.value || !count.value) return
  const stamp=++version, start=performance.now()
  copied.value=false;manualCopy.value=false;flying.value=canFly()
  if(flying.value){
    const pool=classroom.people, offset=Math.floor(Math.random()*pool.length)
    passengers.value=Array.from({length:Math.min(4,pool.length)},(_,i)=>{
      const person=pool[(offset+i)%pool.length]
      return settings.settings.englishMode && person.en || person.cn
    })
  }
  const ok=await tunnel.draw(listId.value,count.value,style.value==='steps')
  if (stamp!==version) return
  if (ok && flying.value) timer=setTimeout(()=>{flying.value=false;arrival.value++},Math.max(0,FLIGHT_MS-(performance.now()-start)))
  else { flying.value=false; if (ok) arrival.value++ }
}
function uncover(all){ if(locked.value)return; tunnel.reveal(listId.value,all); if(canFly()&&!all){flying.value=true;timer=setTimeout(()=>{flying.value=false;arrival.value++},REVEAL_MS)} }
function onVisibility(){if(document.hidden)stopFlight()}
watch(listId,()=>{stopFlight();copied.value=false;manualCopy.value=false})
onMounted(()=>document.addEventListener('visibilitychange',onVisibility))
onBeforeUnmount(()=>{stopFlight();document.removeEventListener('visibilitychange',onVisibility)})
async function copy(){try{await navigator.clipboard.writeText(summary.value);copied.value=true}catch{manualCopy.value=true;await nextTick();copyBox.value?.select()}}
</script>
<style scoped>
.tunnel{--track:color-mix(in srgb,var(--accent) 58%,#5499bd);position:relative;isolation:isolate;overflow:hidden;display:grid;place-items:center;text-align:center;min-height:clamp(180px,30vh,290px);border:1px solid var(--border-strong);border-radius:var(--radius-xl);background:radial-gradient(ellipse at 50% 55%,var(--bg-card-solid) 13%,transparent 66%),linear-gradient(120deg,color-mix(in srgb,var(--accent) 13%,var(--bg-card-solid)),color-mix(in srgb,var(--track) 18%,var(--bg-card-solid)))}
.tunnel svg{position:absolute;inset:0;width:100%;height:100%;z-index:-1;fill:none;stroke:var(--track);stroke-linejoin:round}.rails{opacity:.34}.gate{opacity:.50;stroke-width:1.6;vector-effect:non-scaling-stroke;transform-origin:0 0}.signal-dots{fill:var(--track);stroke:none}.tunnel-mark{position:absolute;left:14px;bottom:10px;display:flex;align-items:center;gap:3px;font:600 9px/1.2 var(--font-ui);letter-spacing:.14em;color:var(--text-secondary)}.tunnel-mark i{width:3px;height:7px;transform:skewX(-18deg);background:var(--track)}.tunnel-mark i:first-child{margin-left:4px}
.transit .rails path{stroke-dasharray:18 120;animation:rail-flow 1.1s linear infinite}
.transit .gate{animation:jump-gate 1.5s cubic-bezier(.18,.62,.2,1) both}
.warp-streaks{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}
.warp-streaks i{position:absolute;left:50%;top:50%;width:clamp(70px,18vw,230px);height:2px;border-radius:2px;opacity:0;transform-origin:0 50%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--track) 52%,#fff),transparent);animation:warp-streak 1.15s cubic-bezier(.16,.7,.24,1) both;animation-delay:var(--delay)}
.flybys{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:-1}.flybys span{position:absolute;left:48%;top:46%;font-weight:650;max-width:35%;overflow:hidden;white-space:nowrap;color:var(--text-secondary);animation:fly-by 1.15s cubic-bezier(.16,.65,.3,1) both}.lane-0{--x:-36cqw;--y:-86px}.lane-1{--x:36cqw;--y:76px;animation-delay:110ms!important}.lane-2{--x:-31cqw;--y:94px;animation-delay:55ms!important}.lane-3{--x:31cqw;--y:-98px;animation-delay:170ms!important}
@keyframes fly-by{0%{opacity:0;transform:scale(.26)}20%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(2.15)}}
@keyframes rail-flow{to{stroke-dashoffset:-138}}
@keyframes warp-streak{0%{opacity:0;transform:rotate(var(--angle)) translateX(0) scaleX(.18)}24%{opacity:.95}100%{opacity:0;transform:rotate(var(--angle)) translateX(46vw) scaleX(2.8)}}
.tunnel-display{background:var(--bg-card-solid);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:13px clamp(12px,2.5vw,32px);max-width:82%;display:grid;gap:4px;box-shadow:var(--shadow-2);transition:box-shadow .3s,border-color .3s}
.transit .tunnel-display{border-color:color-mix(in srgb,var(--track) 42%,var(--border-default));box-shadow:0 0 0 1px color-mix(in srgb,var(--track) 24%,transparent),0 0 48px color-mix(in srgb,var(--track) 30%,transparent)}
.tunnel-display span,.tunnel-display small{color:var(--text-secondary);font-size:12px;font-weight:500}.tunnel-display strong{font:700 clamp(23px,4vw,48px)/1.2 var(--font-display);overflow-wrap:anywhere}
.tunnel-display.arrived strong{animation:arrival-pop .62s cubic-bezier(.2,1.35,.4,1) both}
.tunnel-controls{display:grid;gap:12px}.tunnel-copy{max-width:100%;width:100%}.arrivals{list-style:none;padding:0;margin:12px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(155px,100%),1fr));gap:8px}.arrivals li{display:flex;align-items:center;gap:10px;background:var(--bg-card-solid);border:1px solid var(--border-default);border-radius:var(--radius-md);color:inherit;padding:9px 12px;font-weight:600;overflow-wrap:anywhere}.arrivals span{color:var(--text-secondary);font-variant-numeric:tabular-nums;font-size:12px}.classroom-actions h2{margin:0}
@keyframes jump-gate{0%{transform:scale(.62);opacity:0}38%{opacity:.78}74%{opacity:.34}100%{transform:scale(1.72);opacity:0}}
@keyframes arrival-pop{0%{opacity:0;transform:translateY(12px) scale(.84);filter:blur(7px)}55%{opacity:1;transform:translateY(0) scale(1.06);filter:blur(0)}100%{transform:none;filter:none}}
@media(prefers-reduced-motion:reduce){.transit .gate,.flybys span,.transit .rails path,.transit .warp-streaks i,.tunnel-display.arrived strong,.tunnel-display{animation:none;transition:none}.flybys,.warp-streaks{display:none}}:global(.perf-no-anim) .transit .gate,:global(.perf-no-anim) .transit .rails path,:global(.perf-no-anim) .transit .warp-streaks i,:global(.perf-no-anim) .tunnel-display.arrived strong{animation:none}:global(.perf-no-anim) .flybys,:global(.perf-no-anim) .warp-streaks{display:none}
</style>
