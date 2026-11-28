<template>
  <div class="qr-sync-page">
    <div class="qr-sync-body">
      <header>
        <h1>{{ sending ? tr('同步到手机', 'Sync to phone') : tr('扫码接收', 'Scan to receive') }}</h1>
        <p>{{ sending ? tr('在接收设备上打开「扫码接收」。两台设备无需连接同一网络。', 'Open Scan to receive on the other device. No shared network is needed.') : tr('可接收人员名单、奖品单或完整的程序备份。', 'Receive a people list, a prize list, or a full app backup.') }}</p>
      </header>

      <FluentButton v-if="!sending && !['saving','done'].includes(state)" class="qr-send-from-device"
        variant="primary" @click="router.push({ name: 'QRSend' })">
        <FluentIcon icon="arrow-upload-20-regular" :width="20" />
        {{ tr('从此设备发送', 'Send from this device') }}
      </FluentButton>

      <nav v-if="sending" class="qr-kinds" :aria-label="tr('发送内容', 'What to send')">
        <RouterLink v-for="item in choices" :key="item.id" :to="{ name: 'QRSend', query: { kind: item.id } }"
          replace :aria-current="kind === item.id ? 'true' : 'false'" :class="{ selected: kind === item.id }">{{ item.name }}</RouterLink>
      </nav>
      <template v-if="state === 'sending'">
        <p v-if="kind !== 'backup'" class="qr-list-info"><strong translate="no">{{ payload.data.name }}</strong>
          · {{ kind === 'names' ? tr(`${payload.data.names.length} 人`, `${payload.data.names.length} people`) : tr(`${payload.data.prizes.length} 项奖品`, `${payload.data.prizes.length} prizes`) }}</p>
        <QRStreamSender :payload="payload" :english="english" />
      </template>
      <QRStreamReceiver v-else-if="state === 'scan'" :english="english" @success="received" />

      <form v-else-if="state === 'password'" class="qr-panel" @submit.prevent="submitBackup">
        <h2>{{ sending ? tr('发送完整备份', 'Send a full backup') : tr('替换此设备的全部数据？', 'Replace all data on this device?') }}</h2>
        <p>{{ sending ? tr('备份包含全部名单、奖品、记录和设置。请只向自己的设备展示二维码。', 'The backup includes all lists, prizes, history and settings. Show the code only to your own device.') : tr('本机名单、奖品、记录、设置和数据操作密码将被备份中的内容替换。仅在信任发送设备时继续。', 'All local lists, prizes, history, settings and the data password will be replaced by the backup. Continue only if you trust the sender.') }}</p>
        <label>{{ setPassword ? tr('首次使用，请设置本机数据操作密码', 'Set a local data password for first use') : tr('本机数据操作密码', 'Local data password') }}
          <input v-model="password" type="password" :autocomplete="setPassword ? 'new-password' : 'current-password'" required />
        </label>
        <p v-if="error" class="qr-error" role="alert">{{ error }}</p>
        <div class="qr-actions">
          <button class="qr-submit" :class="{ destructive: !sending }" type="submit" :disabled="!password">
            {{ sending ? tr('开始发送备份', 'Start sending backup') : tr('确认替换并重新载入', 'Replace data and reload') }}
          </button>
          <button v-if="!sending" type="button" @click="begin()">{{ tr('取消', 'Cancel') }}</button>
        </div>
      </form>

      <div v-else-if="state === 'done'" class="qr-panel qr-success" role="status">
        <span aria-hidden="true">✓</span><strong>{{ tr('同步完成', 'Sync complete') }}</strong>
        <p>{{ tr('已保存到此设备。', 'Saved on this device.') }}</p>
      </div>
      <div v-else-if="state === 'error'" class="qr-panel" role="alert">
        <h2>{{ tr('同步未完成', 'Sync did not finish') }}</h2>
        <p>{{ error }}</p><button type="button" @click="begin()">{{ tr('重试', 'Try again') }}</button>
      </div>
      <p v-else role="status">{{ state === 'saving' ? tr('正在保存…', 'Saving…') : tr('正在准备…', 'Preparing…') }}</p>

      <RouterLink v-if="sending && !compactNavigation && !['saving','done'].includes(state)" class="qr-link desktop-scan-entry" :to="{ name: 'QRReceive' }">
        {{ tr('在此设备扫码接收', 'Scan to receive on this device') }}
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { dataBridge } from '../utils/dataBridge.js'
import { createQRPayload, importQRPayload, validateQRPayload } from '../utils/qrPayload.js'
import QRStreamSender from '../components/qr/QRStreamSender.vue'
import QRStreamReceiver from '../components/qr/QRStreamReceiver.vue'

const props = defineProps({ mode: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const compactNavigation = inject('compactNavigation', false)
const settings = useSettingsStore()
const english = computed(() => settings.settings.language === 'en')
const tr = (zh, en) => english.value ? en : zh
const sending = computed(() => props.mode === 'send')
const kind = computed(() => route.query.kind ?? 'names')
const choices = computed(() => [
  { id: 'names', name: tr('人员名单', 'People list') },
  { id: 'prizes', name: tr('奖品单', 'Prize list') },
  { id: 'backup', name: tr('全部程序数据', 'Full backup') }
])
const state = ref('loading')
const error = ref('')
const password = ref('')
const setPassword = ref(false)
const payload = shallowRef(null)
let turn = 0
let redirectTimer

function fail(problem, attempt) {
  if (attempt !== turn) return
  error.value = problem?.message || String(problem)
  state.value = 'error'
}

async function askForPassword(attempt) {
  const saved = await dataBridge.loadDataPassword()
  if (attempt !== turn) return
  setPassword.value = !saved
  state.value = 'password'
}

async function begin() {
  const attempt = ++turn
  clearTimeout(redirectTimer)
  error.value = ''
  password.value = ''
  payload.value = null
  if (!sending.value) { state.value = 'scan'; return }
  state.value = 'loading'
  try {
    if (kind.value === 'backup') { await askForPassword(attempt); return }
    const value = await createQRPayload(kind.value)
    if (attempt === turn) { payload.value = value; state.value = 'sending' }
  } catch (e) { fail(e, attempt) }
}

async function received(value) {
  if (state.value !== 'scan') return
  const attempt = turn
  state.value = 'saving'
  try {
    payload.value = validateQRPayload(value)
    if (value.kind === 'backup') await askForPassword(attempt)
    else await save(attempt)
  } catch (e) { fail(e, attempt) }
}

async function submitBackup() {
  if (state.value !== 'password' || !password.value) return
  const access = { password: password.value, setPassword: setPassword.value, replace: !sending.value }
  const attempt = turn
  password.value = ''
  error.value = ''
  state.value = sending.value ? 'loading' : 'saving'
  try {
    if (!sending.value) { await save(attempt, access); return }
    const value = await createQRPayload('backup', access)
    if (turn === attempt) { payload.value = value; state.value = 'sending' }
  } catch (e) {
    if (attempt === turn) {
      // A first-time password may have been saved even if export later failed.
      try { await askForPassword(attempt) } catch (readError) { fail(readError, attempt); return }
      error.value = e?.message || String(e)
    }
  }
}

async function save(attempt, access) {
  const result = await importQRPayload(payload.value, access)
  if (attempt !== turn) return
  state.value = 'done'
  redirectTimer = setTimeout(async () => {
    if (attempt !== turn) return
    if (result.reload) {
      // The restored settings, draw history and plugin state are loaded on boot.
      window.history.replaceState(window.history.state, '', router.resolve(result.route).href)
      window.location.reload()
    } else await router.replace(result.route)
  }, 450)
}

watch([() => props.mode, () => route.query.kind], begin, { immediate: true })
onBeforeUnmount(() => { ++turn; clearTimeout(redirectTimer); password.value = ''; payload.value = null })
</script>

<style scoped>
.qr-sync-page { height: 100%; overflow-y: auto; padding: clamp(12px, 4vw, 32px); color: var(--text-primary); }
.qr-sync-body { display: grid; gap: 14px; margin: 0 auto; max-width: 44rem; min-width: 0; }
h1, h2, p { margin: 0; }
h1 { font-family: var(--font-display); font-size: 1.5rem; }
h2 { font-size: 1.15rem; }
header p, .qr-panel p, .qr-list-info { margin-top: .35rem; color: var(--text-secondary); line-height: 1.5; }
.qr-kinds, .qr-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.qr-kinds a, .qr-panel button { padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); font: inherit; font-size: 14px; background: var(--bg-card-solid); color: var(--text-primary); cursor: pointer; text-decoration: none; }
.qr-kinds .selected, .qr-submit { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.qr-submit.destructive { color: #b42332; border-color: currentColor; }
:global(.dark) .destructive { color: #ff9caa; }
button:disabled { opacity: .55; cursor: default; }
.qr-panel { display: grid; gap: 12px; padding: clamp(16px, 4vw, 28px); background: var(--bg-card-solid); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.qr-panel label { display: grid; gap: 6px; font-size: 14px; }
.qr-panel input { width: 100%; max-width: 25rem; font: inherit; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-card-solid); color: inherit; }
.qr-error { color: var(--text-primary); }
.qr-success { justify-items: center; text-align: center; }
.qr-success span { font-size: 2rem; color: var(--accent); }
.qr-link { justify-self: start; color: var(--accent); }
.qr-send-from-device {
  justify-content: center;
  width: min(100%, 20rem);
  min-height: max(44px, calc(44px / var(--app-user-scale, 1)));
}
@media (prefers-reduced-motion: no-preference) {
  .qr-success span { animation: qr-arrive .32s ease-out; }
  @keyframes qr-arrive { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
}
</style>
