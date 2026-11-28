<template>
  <section class="qr-sender">
    <div class="qr-display">
      <img v-if="url" :src="url" :alt="en ? 'Animated roster QR code' : '名单传输二维码'" width="512" height="512">
      <span v-else>{{ error ? (en ? 'Unable to send' : '无法发送') : (en ? 'Preparing QR code…' : '正在生成二维码…') }}</span>
    </div>
    <p>{{ en ? 'Point your phone camera at the screen in good light.' : '请将手机摄像头对准屏幕，保持光线充足。' }}</p>
    <p class="qr-status">{{ en ? 'Use Scan to receive in Name Roller to transfer the list. Other cameras open the official download guide.' : '请用点名器内的「扫码接收」同步名单。使用其他相机扫码会打开官方下载指南。' }}</p>
    <p v-if="error" class="qr-error" role="alert">{{ error }}</p>
    <div class="qr-controls">
      <FluentButton variant="primary" :disabled="!encoderReady" @click="running ? pause() : play()">
        {{ running ? (en ? 'Pause' : '暂停传输') : (en ? 'Start' : '开始传输') }}
      </FluentButton>
      <label>{{ en ? 'Speed' : '帧率' }}
        <select v-model.number="fps">
          <option v-for="rate in [3, 5, 10, 15, 20, 30]" :key="rate" :value="rate">{{ rate }} FPS</option>
        </select>
      </label>
    </div>
    <p class="qr-status">
      {{ running ? (en ? 'Sending' : '正在发送') : (en ? 'Paused' : '已暂停') }} ·
      {{ en ? 'Frames sent:' : '已发送帧数：' }}<span translate="no">{{ sent }}</span>
      <template v-if="framesPerPass && sent < framesPerPass"> · {{ en ? 'First pass remaining:' : '首轮预计剩余：' }}{{ remaining }} s</template>
      <template v-else-if="framesPerPass"> · {{ en ? 'Repeating; pause when the phone finishes.' : '正在循环发送，手机提示完成后即可暂停。' }}</template>
    </p>
    <p v-if="framesPerPass > 30" class="qr-status">
      {{ en ? 'If scanning is steady, try 15–20 FPS. Slow down if the phone stops making progress.' : '如果手机扫码稳定，可以试试 15–20 FPS。如果接收进度停滞，请降低帧率。' }}
    </p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { useSettingsStore } from '../../stores/settings'
import { encodeData } from '../../utils/dataCodec.ts'
import { createFrameEncoder } from '../../utils/qrFountain.ts'
import { loadRaptorQ } from '../../utils/qrRaptor.ts'
import { frameToProductUrl } from '../../utils/qrFrameUrl.ts'

const props = defineProps({ payload: { type: Object, required: true }, english: { type: Boolean, default: undefined } })
const settings = useSettingsStore()
const en = computed(() => props.english ?? (settings.settings.language === 'en'))
const url = ref('')
const fps = ref(10)
const framesPerPass = ref(0)
const sent = ref(0)
const running = ref(false)
const error = ref('')
const encoderReady = ref(false)
const remaining = computed(() => Math.ceil(Math.max(0, framesPerPass.value - sent.value) / fps.value * 10) / 10)
let encoder, timer, epoch = 0, disposed = false

function pause() {
  running.value = false
  ++epoch
  clearTimeout(timer)
}

function play() {
  if (running.value || !encoder || disposed) return
  running.value = true
  error.value = ''
  const id = ++epoch
  async function tick() {
    const start = performance.now()
    try {
      const dataUrl = await QRCode.toDataURL(frameToProductUrl(encoder.next()), { errorCorrectionLevel: 'M', margin: 4, scale: 8 })
      if (id !== epoch) return
      url.value = dataUrl
      sent.value++
      timer = setTimeout(tick, Math.max(0, 1000 / fps.value - (performance.now() - start)))
    } catch (err) {
      if (id !== epoch) return
      pause()
      error.value = en.value ? 'Could not render the QR code. Try again or export the list as a file.' : '二维码生成失败，请重试或通过文件导出名单。'
    }
  }
  tick()
}

onMounted(async () => {
  try {
    const bytes = encodeData(props.payload)
    const codec = await loadRaptorQ()
    if (disposed) return
    encoder = createFrameEncoder(bytes, codec)
    framesPerPass.value = encoder.framesPerPass
    encoderReady.value = true
    play()
  } catch (err) {
    if (!disposed) error.value = en.value ? 'This list cannot be encoded. Try exporting it as a file.' : String(err?.message || '名单无法编码，请尝试文件导出。')
  }
})
onBeforeUnmount(() => { disposed = true; pause(); encoder?.close?.(); encoder = undefined })
</script>

<style scoped>
.qr-sender { display: grid; justify-items: center; gap: .85rem; text-align: center; }
.qr-display { display: grid; place-items: center; width: min(100%, 52vh, 30rem); aspect-ratio: 1; background: #fff; color: #323232; border: 1px solid var(--border-subtle); }
.qr-display img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
.qr-controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: center; }
.qr-controls label, .qr-status { color: var(--text-secondary); }
.qr-controls select { min-height: 36px; margin-inline-start: .4rem; padding-inline: .45rem; color: var(--text-primary); background: var(--bg-card-solid); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
.qr-status { font-size: .9rem; font-variant-numeric: tabular-nums; }
.qr-error { color: var(--danger, #ad243e); }
</style>
