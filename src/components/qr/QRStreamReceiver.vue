<template>
  <section class="qr-receiver">
    <div class="camera-frame">
      <video ref="video" autoplay muted playsinline :aria-label="en ? 'Camera preview' : '摄像头预览'" />
      <span v-if="state === 'scanning'" class="camera-guide" aria-hidden="true"></span>
      <span v-else class="camera-caption">{{ status }}</span>
    </div>
    <p>{{ en ? 'Point the rear camera at the QR code on the other screen. Hold it steady and keep the white border in view.' : '将后置摄像头对准另一块屏幕上的二维码，保持平稳，让白色边框完整入镜。' }}</p>
    <div class="receive-meter">
      <label for="qr-receive-progress">
        {{ en ? 'Received' : '已接收' }}
        <span translate="no">{{ received }} / {{ total || '—' }}</span>
        {{ en ? 'source frames' : '个源帧' }}
      </label>
      <progress id="qr-receive-progress" :value="received" :max="total || 1"></progress>
    </div>
    <p v-if="error" class="qr-error" role="alert">{{ error }}</p>
    <div class="camera-controls">
      <FluentButton v-if="state === 'scanning' || state === 'starting'" variant="secondary" @click="pauseByUser">
        {{ en ? 'Pause camera' : '暂停摄像头' }}
      </FluentButton>
      <FluentButton v-else-if="state !== 'complete'" variant="primary" @click="start">
        {{ en ? 'Start camera' : '开启摄像头' }}
      </FluentButton>
      <FluentButton v-if="received && state !== 'complete'" variant="secondary" @click="restart">
        {{ en ? 'Scan another list' : '重新扫码' }}
      </FluentButton>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ReceiverWorker from '../../workers/qrReceiver.worker.ts?worker'
import { useSettingsStore } from '../../stores/settings'
import { getDesktopPlatform } from '../../utils/desktopRuntime'
import { tauriAPI } from '../../utils/tauriAPI'

const props = defineProps({ english: { type: Boolean, default: undefined } })
const emit = defineEmits(['success'])
const settings = useSettingsStore()
const en = computed(() => props.english ?? (settings.settings.language === 'en'))
const video = ref(null)
const state = ref('paused')
const error = ref('')
const received = ref(0)
const total = ref(0)
const isNativeAndroid = getDesktopPlatform().runtime === 'tauri' && getDesktopPlatform().os === 'android'
const status = computed(() => {
  if (state.value === 'starting') return en.value ? 'Opening camera…' : '正在开启摄像头…'
  if (state.value === 'complete') return en.value ? 'Roster received' : '名单已接收'
  return en.value ? 'Camera is off' : '摄像头已关闭'
})
let worker, stream, canvas, context, raf, webWake
let generation = 0, busy = false, disposed = false, resumeWhenVisible = false, lastTime = -1

async function keepAwake(id) {
  try {
    if (isNativeAndroid) await tauriAPI.invokeStrict('set_scan_awake', { enabled: true })
    else if (navigator.wakeLock) {
      const lock = await navigator.wakeLock.request('screen')
      if (id !== generation) await lock.release()
      else webWake = lock
    }
  } catch { /* Camera remains usable if the device disallows a screen lock. */ }
}

function stopCamera() {
  ++generation
  cancelAnimationFrame(raf)
  for (const track of stream?.getTracks() || []) { track.onended = null; track.stop() }
  stream = undefined
  if (video.value) video.value.srcObject = null
  if (webWake) { webWake.release().catch(() => {}); webWake = undefined }
  if (isNativeAndroid) tauriAPI.invokeStrict('set_scan_awake', { enabled: false }).catch(() => {})
}

function resetWorker() {
  worker?.terminate()
  worker = undefined
  busy = false
}

function fail(message, discardDecoder = false) {
  resumeWhenVisible = false
  stopCamera()
  state.value = 'error'
  error.value = message
  if (discardDecoder) { resetWorker(); received.value = 0; total.value = 0 }
}

function ensureWorker() {
  if (worker) return
  const instance = new ReceiverWorker({ name: 'roster-qr-decoder' })
  worker = instance
  instance.onmessage = ({ data }) => {
    if (worker !== instance || disposed) return
    busy = false
    if (data.type === 'idle') return
    if (data.type === 'error') {
      fail(en.value ? 'This stream could not be decoded. Restart the sender and scan again.' : '这段二维码流无法还原，请重新开始发送并扫码。', true)
      return
    }
    received.value = data.received
    total.value = data.total
    if (data.type === 'complete') {
      resumeWhenVisible = false
      stopCamera()
      resetWorker()
      state.value = 'complete'
      emit('success', data.payload)
    }
  }
  instance.onerror = () => {
    if (worker === instance) fail(en.value ? 'The decoder could not start. Retry or import the roster from a file.' : '解码器启动失败，请重试或通过文件导入名单。', true)
  }
  instance.onmessageerror = instance.onerror
}

function capture(id) {
  if (id !== generation) return
  const el = video.value
  if (!busy && el?.readyState >= 2 && el.videoWidth && el.videoHeight && el.currentTime !== lastTime) {
    try {
      lastTime = el.currentTime
      const scale = Math.min(1, 720 / Math.max(el.videoWidth, el.videoHeight))
      const width = Math.max(1, Math.round(el.videoWidth * scale)), height = Math.max(1, Math.round(el.videoHeight * scale))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      context.drawImage(el, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height)
      busy = true
      worker.postMessage({ pixels }, [pixels.data.buffer])
    } catch {
      fail(en.value ? 'The camera frame could not be read. Please try again.' : '无法读取摄像头画面，请重新开启摄像头。', true)
      return
    }
  }
  raf = requestAnimationFrame(() => capture(id))
}

function cameraMessage(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return en.value
    ? 'Camera permission was denied. Allow camera access for this app or site in settings, then tap Start camera. You can also import a roster file.'
    : '摄像头权限未开启。请到系统或浏览器设置中允许本应用使用摄像头，再点“开启摄像头”；也可以通过文件导入名单。'
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return en.value ? 'No available camera was found. Connect a camera or import a roster file.' : '没有找到可用的摄像头，请检查设备或通过文件导入名单。'
  return en.value ? 'Could not start the camera. Close other camera apps and try again.' : '摄像头无法启动，请关闭其他占用摄像头的应用后重试。'
}

async function start() {
  if (disposed || state.value === 'starting' || state.value === 'scanning' || state.value === 'complete') return
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    fail(en.value ? 'Camera access requires the Android app or an HTTPS (or localhost) browser page. You can also import a roster file.' : '请使用安卓客户端，或通过 HTTPS（或 localhost）打开扫码页；也可以通过文件导入名单。')
    return
  }
  const id = ++generation
  state.value = 'starting'
  error.value = ''
  try {
    ensureWorker()
    canvas ??= document.createElement('canvas')
    context ??= canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Camera preview unavailable')
    const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: 'environment' }, width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 }
    } })
    if (id !== generation) { media.getTracks().forEach(track => track.stop()); return }
    stream = media
    for (const track of media.getVideoTracks()) track.onended = () => {
      if (id === generation) fail(en.value ? 'The camera was interrupted. Tap Start camera to continue.' : '摄像头已中断，点“开启摄像头”即可继续。')
    }
    video.value.srcObject = media
    await video.value.play()
    if (id !== generation) return
    lastTime = -1
    state.value = 'scanning'
    if (document.hidden) { onVisibility(); return }
    keepAwake(id)
    capture(id)
  } catch (err) {
    if (id === generation) fail(cameraMessage(err))
  }
}

function pauseByUser() {
  resumeWhenVisible = false
  stopCamera()
  state.value = 'paused'
}
function restart() {
  pauseByUser()
  resetWorker()
  received.value = 0
  total.value = 0
  start()
}
function onVisibility() {
  if (document.hidden && state.value === 'scanning') {
    pauseByUser()
    resumeWhenVisible = true
  } else if (!document.hidden && resumeWhenVisible) {
    resumeWhenVisible = false
    start()
  }
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  if (document.hidden) resumeWhenVisible = true
  else start()
})
onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibility)
  stopCamera()
  resetWorker()
})
</script>

<style scoped>
.qr-receiver { display: grid; gap: .85rem; }
.camera-frame { position: relative; width: 100%; max-width: 36rem; margin-inline: auto; aspect-ratio: 4 / 3; overflow: hidden; background: #171923; color: #fff; border-radius: var(--radius-lg); }
.camera-frame video { display: block; width: 100%; height: 100%; object-fit: contain; }
.camera-guide { position: absolute; left: 50%; top: 50%; width: min(63%, 42vh); aspect-ratio: 1; border: 2px dashed #fff9; border-radius: 8px; transform: translate(-50%, -50%); pointer-events: none; }
.camera-caption { position: absolute; inset: 0; display: grid; place-items: center; }
.receive-meter { display: grid; gap: .3rem; }
.receive-meter span { font-variant-numeric: tabular-nums; }
.receive-meter progress { width: 100%; height: .7rem; accent-color: var(--accent); }
.camera-controls { display: flex; flex-wrap: wrap; gap: .6rem; }
.qr-error { color: var(--danger, #ad243e); }
</style>
