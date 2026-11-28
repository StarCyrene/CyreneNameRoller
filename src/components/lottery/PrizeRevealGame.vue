<template>
  <div class="reveal-game" :class="'game-'+mode" :aria-busy="busy">
    <template v-if="mode === 'box'">
      <p class="game-caption">{{ opened ? tr('花信已拆封', 'Unsealed') : ready ? tr('花信已到，拆开看看吧。','Your box is ready to open.') : tr('选一封花信，拆开看看里面的礼物。','Choose a box to see what is inside.') }}</p>
      <div class="bloom-boxes" role="group" :aria-label="tr('选择盲盒','Choose a box')">
        <button v-for="(flower,i) in flowers" :key="flower.en" type="button"
          class="bloom-box" :class="{chosen:chosen===i,opened:opened && chosen===i}" :style="{'--petal':flower.color}"
          :disabled="opened || busy || (ready ? chosen!==i : disabled)"
          :aria-label="ready && chosen===i ? tr('拆开花信','Open your box') : tr('选择','Choose ')+tr(flower.zh,flower.en)"
          @click="chooseBox(i)">
          <svg viewBox="0 0 96 88" aria-hidden="true">
            <path d="M13 43h70v35l-35 7-35-7z" fill="var(--box-fill)" stroke="currentColor" stroke-width="2"/>
            <path d="M44 48l8 0v35l-4 1-4-1z" fill="var(--petal)"/>
            <g class="box-lid"><path d="M8 34l40-8 40 8v12l-40 8-40-8z" fill="var(--box-fill)" stroke="currentColor" stroke-width="2"/>
              <path d="M8 34l40 9 40-9M48 43v11" stroke="currentColor" opacity=".55" fill="none"/>
              <g transform="translate(48 29)" fill="var(--petal)">
                <ellipse v-for="turn in 5" :key="turn" cy="-9" rx="5" ry="10" :transform="'rotate('+turn*72+')'"/><circle r="4" fill="var(--bg-card-solid)"/>
              </g>
            </g>
          </svg>
          <span>{{ tr(flower.zh,flower.en) }}</span>
        </button>
      </div>
      <button v-if="ready && !opened" class="reveal-action" type="button" @click="reveal">{{ tr('拆开花信','Open your box') }}</button>
    </template>
    <template v-else>
      <p class="game-caption">{{ opened ? tr('好运已揭晓','Your prize is revealed') : ready ? tr('用手指或鼠标刮开银层','Rub away the foil with a finger or mouse') : tr('把这一轮的好运，藏进一张刮刮卡。','Seal this round inside a scratch card.') }}</p>
      <div class="scratch-ticket" :class="{ready,opened}">
        <span class="ticket-top">{{ tr('好运花签','LUCKY TICKET') }}</span>
        <div class="scratch-field">
          <strong aria-hidden="true" translate="no">{{ ready ? prizes[0]?.name : '✧　✧　✧' }}</strong>
          <canvas v-if="ready && !opened" ref="foil" width="480" height="144" aria-hidden="true"
            @pointerdown="startStroke" @pointermove="moveStroke" @pointerup="endStroke" @pointercancel="endStroke" @lostpointercapture="endStroke" />
        </div>
      </div>
      <button v-if="!opened" class="reveal-action" type="button" :disabled="busy || (!ready && disabled)"
        @click="ready ? reveal() : request()">{{ ready ? tr('直接揭晓','Reveal without scratching') : tr('领取刮刮卡','Draw a ticket') }}</button>
    </template>
    <small v-if="!opened" class="game-hint">{{ busy ? tr('正在抽取…','Drawing…') : tr('领取时记一次抽奖，揭晓不会重复扣库存。','Drawing reserves your prize. Revealing it uses no extra stock.') }}</small>
  </div>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
const props = defineProps({ mode:String, prizes:{type:Array, default:()=>[]}, busy:Boolean, disabled:Boolean, english:Boolean })
const emit = defineEmits(['request','reveal'])
const tr = (zh,en) => props.english ? en : zh
const flowers = [{zh:'铃兰',en:'Lily',color:'#64a596'},{zh:'山茶',en:'Camellia',color:'#d28095'},{zh:'鸢尾',en:'Iris',color:'#9486c7'}]
const chosen=ref(-1), opened=ref(false), foil=ref(null)
const ready=computed(()=>props.prizes?.length>0)
let pointer=null, last=null, swept=new Set()
function request() { if (!props.busy && !props.disabled && !ready.value && !opened.value) emit('request') }
function chooseBox(i) {
  if (ready.value) { if (chosen.value===i) reveal(); return }
  if (props.busy || props.disabled || opened.value) return
  chosen.value=i
  request()
}
function reveal() {
  if (!ready.value || opened.value) return
  opened.value=true
  pointer=null; last=null
  emit('reveal')
}
watch([ready,()=>props.mode],async ([hasPrize,mode])=>{
  if (!hasPrize || mode!=='scratch') return
  await nextTick()
  const canvas=foil.value, ctx=canvas?.getContext('2d')
  if (!ctx) return
  const ink=ctx.createLinearGradient(0,0,480,144)
  ink.addColorStop(0,'#9099ad'); ink.addColorStop(.48,'#d7dce6'); ink.addColorStop(1,'#9aa6bb')
  ctx.fillStyle=ink; ctx.fillRect(0,0,480,144)
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2
  for (let x=-144;x<480;x+=14){ctx.beginPath();ctx.moveTo(x,144);ctx.lineTo(x+144,0);ctx.stroke()}
  ctx.fillStyle='#303b50';ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.textBaseline='middle'
  ctx.fillText(tr('刮 开 好 运','SCRATCH HERE'),240,72)
},{immediate:true})
function startStroke(event) {
  if (pointer!==null || event.button!==0) return
  pointer=event.pointerId; event.currentTarget.setPointerCapture(pointer); last=null; moveStroke(event)
}
function moveStroke(event) {
  if (event.pointerId!==pointer || opened.value) return
  const canvas=foil.value, ctx=canvas?.getContext('2d')
  if (!ctx) return
  const rect=canvas.getBoundingClientRect()
  const x=(event.clientX-rect.left)*480/rect.width, y=(event.clientY-rect.top)*144/rect.height
  const [px,py]=last || [x,y]
  ctx.globalCompositeOperation='destination-out'
  ctx.lineWidth=34;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x+.01,y);ctx.stroke()
  // Count only cells whose centres were actually brushed; no canvas readback per move.
  for(let row=0;row<6;row++) for(let col=0;col<20;col++) {
    const cx=col*24+12,cy=row*24+12,dx=x-px,dy=y-py
    const t=Math.max(0,Math.min(1, ((cx-px)*dx+(cy-py)*dy)/(dx*dx+dy*dy||1)))
    if ((cx-px-t*dx)**2+(cy-py-t*dy)**2<=17**2) swept.add(row*20+col)
  }
  last=[x,y]
  if (swept.size>=48) reveal()
}
function endStroke(e) { if (pointer===e.pointerId){pointer=null;last=null} }
</script>
<style scoped>
.reveal-game{display:grid;justify-items:center;align-content:center;gap:12px;width:100%;min-width:0;padding:16px 4px;color:var(--text-primary);text-align:center}
.game-caption{margin:0;font-weight:600;font-size:15px}.game-hint{color:var(--text-secondary);font-size:12px}
.bloom-boxes{width:min(100%,430px);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.bloom-box{--box-fill:color-mix(in srgb,var(--petal) 14%,var(--bg-card-solid));color:color-mix(in srgb,var(--petal) 68%,var(--text-primary));font:inherit;background:transparent;border:1px solid transparent;border-radius:var(--radius-lg);padding:6px 4px;display:grid;justify-items:center;gap:4px;cursor:pointer}
.bloom-box svg{width:min(100%,102px);overflow:visible}.bloom-box span{color:var(--text-secondary);font-size:13px}.bloom-box.chosen,.bloom-box:enabled:hover{background:var(--bg-card-solid);border-color:var(--border-strong)}.bloom-box:disabled:not(.chosen){opacity:.55;cursor:default}
.box-lid{transform-origin:50% 45%;transition:transform .25s}.bloom-box:enabled:hover .box-lid{transform:translateY(-3px)}.bloom-box.opened .box-lid{transform:translateY(-9px) rotate(-9deg)}
.reveal-action{border:0;border-radius:var(--radius-md);background:var(--accent-hover);color:var(--text-on-accent);font:inherit;font-weight:600;padding:8px 18px;cursor:pointer}.reveal-action:disabled{opacity:.5;cursor:default}.reveal-game button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.scratch-ticket{width:min(100%,330px);padding:12px 20px 14px;background:var(--bg-card-solid);border:1px solid var(--border-strong);border-radius:12px;box-shadow:var(--shadow-2)}.ticket-top{display:block;font-size:11px;letter-spacing:.18em;color:var(--text-secondary);margin-bottom:8px}
.scratch-field{position:relative;display:grid;place-items:center;border:1px dashed var(--border-strong);border-radius:7px;overflow:hidden;aspect-ratio:10/3;background:var(--bg-hover)}.scratch-field strong{max-width:100%;overflow-wrap:anywhere;font-size:clamp(14px,2.7vw,25px);line-height:1.12}.scratch-field canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
@media(prefers-reduced-motion:reduce){.box-lid{transition:none}}:global(.perf-no-anim) .box-lid{transition:none}
</style>
