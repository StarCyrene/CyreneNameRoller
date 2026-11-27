<template>
  <section class="riddle-view">
    <div class="paper-stack">
      <article class="flower-note" :class="{ opened: phase === 'solved' }">
        <div class="postmark"><span>{{ en ? 'Petal post' : '花信邮局' }}</span><i></i><b>{{ String(noteNumber || 1).padStart(2, '0') }}</b></div>
        <svg class="botanical" viewBox="0 0 120 174" fill="none" aria-hidden="true">
          <g stroke="currentColor" stroke-width="1.15">
            <path d="M12 173 Q59 109 63 40 M38 133 Q30 102 17 95 M46 115 Q75 102 87 77 M59 70 Q42 66 34 56"/>
            <path d="M39 128 Q42 102 18 95 Q19 116 39 128ZM51 104 Q55 80 88 77 Q77 95 51 104Z" fill="currentColor" fill-opacity=".13"/>
            <path d="M59 72 Q39 72 34 55 Q51 55 59 72Z" fill="currentColor" fill-opacity=".17"/>
          </g>
          <g transform="translate(64 37)" class="ink-flower">
            <path v-for="n in 5" :key="n" d="M0 3C-17 -5 -15 -22 -5 -19Q-1 -19 0 -15Q7 -26 13 -16Q17 -5 0 3Z" :transform="'rotate(' + (n - 1) * 72 + ')'" />
            <circle r="4.5"/>
          </g>
        </svg>
        <div class="note-center">
          <template v-if="!puzzle">
            <svg class="sealed-letter" viewBox="0 0 160 108" fill="none" aria-hidden="true">
              <rect x="7" y="20" width="146" height="80" rx="5" />
              <path d="M9 96L58 58M151 96L102 58M9 24L74 65Q80 70 86 65L151 24" />
              <g transform="translate(81 63)" class="ink-flower">
                <ellipse v-for="n in 5" :key="n" cx="0" cy="-6" rx="4.8" ry="8" :transform="'rotate(' + (n - 1) * 72 + ')'" /><circle r="3"/>
              </g>
            </svg>
            <strong class="note-title">{{ en ? 'A name, sealed in petals' : '花瓣下，藏着谁？' }}</strong>
          </template>
          <template v-else-if="phase === 'playing'">
            <span class="note-to">{{ en ? 'To the one whose name has…' : '寄给一位，名字里有……' }}</span>
            <div class="letter-tiles" :aria-label="en ? 'Hidden name' : '藏起的名字'">
              <template v-for="(letter, i) in puzzle.letters" :key="i">
                <span v-if="!letter.trim()" class="letter-space"> </span>
                <span v-else-if="hints.includes(i)" class="letter-tile lifted">{{ letter }}</span>
                <button v-else type="button" class="letter-tile" :disabled="nextHint === null"
                  :aria-label="(en ? 'Uncover character ' : '揭开第 ') + (i + 1) + (en ? '' : ' 个字')" @click="lift(i)">
                  <i class="petal" aria-hidden="true"></i>
                </button>
              </template>
            </div>
            <p>{{ en ? puzzle.positions.length + ' characters' : '名字共有 ' + puzzle.positions.length + ' 个字' }}<template v-if="puzzle.initial"> · {{ en ? 'English initial: ' : '英文名首字母：' }}{{ puzzle.initial }}</template></p>
          </template>
          <template v-else>
            <span class="note-to">{{ en ? 'Delivered to' : '此笺寄予' }}</span>
            <strong class="note-title recipient"><VerifiedResult :receipt="receipt" :index="0" :presentation="presentation" /></strong>
            <p v-if="otherName">{{ otherName }}</p>
            <p v-if="puzzle.rosterNumber">{{ en ? 'No. ' + puzzle.rosterNumber + ' on this list' : '名单中的第 ' + puzzle.rosterNumber + ' 位' }}</p>
          </template>
        </div>
        <span class="note-foot">{{ en ? 'From' : '来信自' }} · {{ names.currentList?.name || '—' }}</span>
      </article>
    </div>

    <div class="riddle-desk">
      <header><h1>{{ en ? 'Petal Riddle' : '花笺藏名' }}</h1>
        <p>{{ en ? 'Open a note and guess who it is for. Lift a petal for a clue, or read the name at any time.' : '抽一封藏着名字的花笺。猜猜收件人是谁，轻揭花瓣找线索，也可以直接读出谜底。' }}</p>
      </header>
      <div class="list-row">
        <span>{{ en ? 'Name list' : '当前名单' }}</span>
        <FluentSelect :model-value="names.currentListId" :options="listOptions" :disabled="busy" :aria-label="en ? 'Name list' : '当前名单'" @update:model-value="switchList" />
      </div>
      <template v-if="phase === 'playing'">
        <form class="guess-form" @submit.prevent="submitGuess">
          <label for="petal-guess">{{ en ? 'Who is the note for?' : '你猜这封花笺寄给谁？' }}</label>
          <div class="guess-line">
            <input id="petal-guess" ref="guessInput" v-model="guess" autocomplete="off" :placeholder="en ? 'Name or English name' : '输入姓名或英文名'" />
            <button class="ink-button" :disabled="!guess.trim()">{{ en ? 'Guess' : '猜一猜' }}</button>
          </div>
        </form>
        <div class="hint-actions">
          <button type="button" :disabled="nextHint === null" @click="lift(nextHint)"><FluentIcon icon="leaf-one-20-regular" :width="15" />{{ en ? 'Lift a petal' : '揭一瓣' }}</button>
          <button type="button" @click="finish(false)"><FluentIcon icon="eye-20-regular" :width="16" />{{ en ? 'Reveal name' : '直接揭晓' }}</button>
        </div>
      </template>
      <RouterLink v-if="names.isLoaded && !eligibleCount" to="/lists/manage" class="manage-names">{{ en ? 'Add people to this list' : '前往名单添加人员' }} →</RouterLink>
      <button v-else-if="phase !== 'playing'" type="button" class="ink-button open-note" :disabled="busy || !eligibleCount" @click="start">
        <FluentIcon icon="mail-open-person-20-regular" :width="18" />
        {{ busy ? (en ? 'Opening…' : '正在开笺…') : phase === 'solved' ? (en ? 'Draw another note' : '再抽一封花笺') : (en ? 'Draw a note' : '抽一封花笺') }}
      </button>
      <p class="game-status" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
      <p class="record-note">{{ en ? 'Drawing a note records one name immediately. Leaving, guessing and revealing do not change that record.' : '开笺时即记一次点名；猜答、揭晓或离开，都不会改变这条记录。' }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useNamesStore } from '../stores/names'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../plugins/store'
import { dataBridge } from '../utils/dataBridge'
import { normalizeCyreneBalanceSettings } from '../utils/cyrene-balance'
import { createPetalRiddle, matchesPetalGuess, nextPetal } from '../utils/petalRiddle.mjs'
import VerifiedResult from '../components/roller/VerifiedResult.vue'

const names = useNamesStore()
const settings = useSettingsStore()
const plugins = usePluginsStore()
const en = computed(() => settings.settings.language === 'en')
const presentation = computed(() => plugins.resultPresentationForTarget('roller.result'))
const listOptions = computed(() => names.allLists.map(list => ({ value: list.id, label: list.name })))
const eligibleCount = computed(() => names.currentNames.filter(p => p.cn && p.cn !== '再来一次').length)
const busy = ref(false)
const phase = ref('idle')
const receipt = shallowRef(null)
const puzzle = shallowRef(null)
const guess = ref('')
const guessInput = ref(null)
const hints = ref([])
const noteNumber = ref(0)
const attempts = ref(0)
const feedback = ref('')
const error = ref('')
let generation = 0
const nextHint = computed(() => puzzle.value ? nextPetal(puzzle.value, hints.value) : null)
const otherName = computed(() => {
  const p = puzzle.value
  return p && p.alias && p.alias !== p.name ? (settings.settings.englishMode ? p.name : p.alias) : ''
})
const status = computed(() => {
  if (error.value) return error.value
  if (feedback.value === 'correct') return en.value ? 'You found the recipient!' : '猜中了，花笺送到啦！'
  if (feedback.value === 'opened') return en.value ? 'The note is open.' : '花笺已展开，谜底就在笺上。'
  if (feedback.value === 'miss') return en.value ? 'Not quite. Try another name. (' + attempts.value + ')' : '还没猜中，可以再试一次。已试 ' + attempts.value + ' 次。'
  if (phase.value === 'playing' && nextHint.value === null) return en.value ? 'One character remains. Guess or reveal the name.' : '最后一个字留给你猜，也可以直接揭晓。'
  if (phase.value === 'playing') return en.value ? hints.value.length + ' petals lifted. Guess when you’re ready.' : '已揭开 ' + hints.value.length + ' 瓣。想好就写下名字吧。'
  if (!names.isLoaded) return en.value ? 'Loading names…' : '正在载入名单…'
  return ''
})

function reset() {
  generation++
  busy.value = false
  phase.value = 'idle'
  receipt.value = null
  puzzle.value = null
  hints.value = []
  guess.value = feedback.value = error.value = ''
  attempts.value = 0
}
watch(() => names.currentListId, () => { reset(); noteNumber.value = 0 }, { flush: 'sync' })
onBeforeUnmount(reset)
function switchList(id) { if (!busy.value) names.switchList(id) }

async function start() {
  if (busy.value || phase.value === 'playing' || !names.isLoaded || !eligibleCount.value) return
  reset()
  const token = generation
  const listId = names.currentListId
  busy.value = true
  try {
    const balance = normalizeCyreneBalanceSettings(await dataBridge.load('balance'))
    if (token !== generation) return
    const operationId = globalThis.crypto?.randomUUID?.() || 'petal-' + Date.now()
    plugins.dispatchEvent('roller:start', { operationId, listId, target: 'people', count: 1 })
    const draw = await plugins.executeRollerDraw({ operationId, listId, target: 'people', count: 1, gender: 'all', allowDuplicates: false, singleDrawPreviousIds: [], countStatistics: settings.settings.recordCounts || balance.enabled })
    if (token !== generation) return
    receipt.value = draw
    puzzle.value = createPetalRiddle(draw.results[0], names.currentNames, settings.settings.englishMode)
    noteNumber.value++
    phase.value = 'playing'
    await nextTick()
    if (token === generation) guessInput.value?.focus({ preventScroll: true })
  } catch (reason) {
    if (token === generation) error.value = reason?.message || (en.value ? 'Could not open this note. Please try again.' : '开笺失败，请再试一次。')
  } finally {
    if (token === generation) busy.value = false
  }
}
function lift(index) {
  if (phase.value !== 'playing' || nextHint.value === null || !puzzle.value.positions.includes(index) || hints.value.includes(index)) return
  hints.value = [...hints.value, index]
  feedback.value = ''
}
function submitGuess() {
  if (phase.value !== 'playing' || !guess.value.trim()) return
  attempts.value++
  if (matchesPetalGuess(puzzle.value, guess.value)) finish(true)
  else { feedback.value = 'miss'; guessInput.value?.select() }
}
function finish(correct) {
  if (phase.value !== 'playing') return
  phase.value = 'solved'
  feedback.value = correct ? 'correct' : 'opened'
  const draw = receipt.value
  plugins.dispatchEvent('roller:item-result', { ...draw, index: 0, result: draw.results[0] })
  plugins.dispatchEvent('roller:result', draw)
}
</script>

<style scoped>
.riddle-view {
  --paper: color-mix(in srgb, var(--bg-card-solid) 91%, #efcda2);
  --ink: var(--text-primary);
  --rose: color-mix(in srgb, var(--accent-dark) 65%, var(--text-primary));
  --rule: color-mix(in srgb, var(--rose) 24%, transparent);
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(210px, .88fr);
  align-items: center; align-content: center; gap: clamp(28px, 5%, 68px);
  width: min(100%, 1040px); min-height: 85%; margin: auto; padding: clamp(24px, 5%, 62px);
}
.paper-stack { position: relative; isolation: isolate; min-width: 0; }
.paper-stack::before { content: ''; position: absolute; inset: 4px -2px -5px 2px; z-index: -1; transform: rotate(-2deg); background: var(--paper); border: 1px solid var(--rule); box-shadow: var(--shadow-8); }
.flower-note {
  position: relative; display: flex; flex-direction: column; min-height: clamp(275px, 35vw, 415px);
  padding: 20px; overflow: hidden; color: var(--ink); background: linear-gradient(145deg, color-mix(in srgb, var(--accent-light) 12%, transparent), transparent 60%), var(--paper);
  border: 1px solid var(--rule); box-shadow: var(--shadow-2);
}
.flower-note::before { content: ''; position: absolute; inset: 7px; pointer-events: none; border: 1px solid var(--rule); }
.postmark { display: flex; align-items: center; gap: 6px; z-index: 1; align-self: flex-end; color: var(--rose); font: 600 11px/1.3 var(--font-ui); letter-spacing: .07em; }
.postmark i { border-block: 1px solid var(--rule); width: 23px; height: 4px; }
.postmark b { padding: 4px 6px; border: 1px dotted var(--rose); border-radius: 50%; font: italic 15px/1.1 Georgia, serif; }
.botanical { pointer-events: none; position: absolute; bottom: -6%; left: -3%; width: 34%; max-height: 65%; color: color-mix(in srgb, #66886b 70%, var(--text-secondary)); opacity: .65; }
.ink-flower :is(path, ellipse) { stroke: var(--rose); stroke-width: .8; fill: color-mix(in srgb, var(--accent-light) 50%, var(--paper)); }
.ink-flower circle { fill: var(--rose); }
.note-center { z-index: 1; display: flex; flex: 1; flex-direction: column; justify-content: center; align-items: center; gap: 14px; padding: 28px 9px; text-align: center; overflow-wrap: anywhere; }
.sealed-letter { width: min(135px, 52%); color: var(--rose); transform: rotate(-6deg); }
.sealed-letter > :is(rect, path) { stroke: currentColor; stroke-width: 1.3; }
.sealed-letter rect { fill: var(--paper); }
.note-center p, .note-to { font-size: 13px; color: var(--text-secondary); }
.note-title { font: 600 clamp(19px, 2.6vw, 29px)/1.35 Georgia, 'Noto Serif SC', 'SimSun', serif; }
.recipient { color: var(--rose); font-size: clamp(28px, 4vw, 44px); max-width: 100%; }
.note-foot { z-index: 1; align-self: flex-end; max-width: 88%; overflow-wrap: anywhere; font-size: 11px; color: var(--text-secondary); }
.letter-tiles { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; width: 100%; }
.letter-tile { display: grid; place-items: center; width: 36px; height: 45px; background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-bottom: 2px solid var(--rose); border-radius: 4px; font: 600 22px/1.2 Georgia, 'SimSun', serif; }
.letter-space { width: 6px; }
button.letter-tile:not(:disabled) { cursor: pointer; }
.petal { display: block; width: 14px; height: 20px; border-radius: 80% 14% 75% 24%; transform: rotate(18deg); background: linear-gradient(135deg, var(--accent-light), var(--rose)); opacity: .84; }
.riddle-desk { display: grid; align-content: center; min-width: 0; gap: 16px; color: var(--ink); }
.riddle-desk h1 { font: 650 clamp(26px, 3.5vw, 38px)/1.2 Georgia, 'Noto Serif SC', 'SimSun', serif; }
.riddle-desk header p { margin-top: 10px; }
.riddle-desk header p, .record-note, .game-status { color: var(--text-secondary); line-height: 1.65; font-size: 14px; }
.list-row, .guess-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; font: 600 13px var(--font-ui); }
.guess-line { display: flex; gap: 6px; min-width: 0; }
.guess-line input { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--rule); border-radius: var(--radius-md); background: var(--bg-card-solid); color: var(--ink); font: 14px var(--font-ui); }
.ink-button, .hint-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 37px; padding: 6px 13px; border: 1px solid transparent; border-radius: var(--radius-md); cursor: pointer; font: 600 13px var(--font-ui); }
.ink-button { color: var(--paper); background: var(--rose); }
.ink-button:not(:disabled):hover { filter: brightness(1.1); }
.open-note { justify-self: start; min-height: 41px; padding-inline: 17px; }
.hint-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.hint-actions button { border-color: var(--rule); background: var(--bg-card); color: var(--ink); }
.hint-actions button:not(:disabled):hover, button.letter-tile:not(:disabled):hover { background: var(--bg-hover); }
.riddle-desk button:disabled { cursor: default; opacity: .5; }
.riddle-view :is(button, input, a):focus-visible { outline: 2px solid var(--rose); outline-offset: 2px; }
.game-status { color: var(--rose); font-weight: 600; }
.game-status:empty { display: none; }
.record-note { border-top: 1px solid var(--rule); padding-top: 10px; font-size: 12px; }
.manage-names { color: var(--rose); }
@container roller-workspace (max-width: 680px) {
  .riddle-view { grid-template-columns: minmax(0, 1fr); max-width: 490px; gap: 22px; padding: 21px 19px 30px; }
  .flower-note { min-height: 224px; padding: 16px; }
  .note-center { padding: 14px 5px; gap: 9px; }
  .sealed-letter { width: 83px; }
  .riddle-desk { gap: 12px; }
}
@media (prefers-reduced-motion: no-preference) {
  .riddle-view:not(:is(.perf-no-anim *)) .lifted { animation: lift-petal .25s ease-out; }
  @keyframes lift-petal { from { opacity: .35; transform: translateY(3px); } }
}
</style>
