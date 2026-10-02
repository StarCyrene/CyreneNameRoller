<template>
  <div
    :class="['floating-ball', style === 'text' ? 'text-style' : 'image-style']"
    :style="{
      borderRadius: `${effectiveRadius}%`,
      opacity: floatingOpacity / 100,
      '--floating-background-color': backgroundColor,
      '--floating-text-color': textColor
    }"
    @contextmenu.prevent
    @pointerdown.prevent="onPointerDown"
    @pointermove.prevent="onPointerMove"
    @pointerup.prevent="onPointerUp"
    @pointercancel.prevent="onPointerCancel"
  >
    <img
      v-if="style !== 'text'"
      class="ball-image"
      :src="floatingWindowImagePath(style, customImage)"
      alt=""
      draggable="false"
      @error="onImageError"
    />
    <span v-else class="ball-text">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { dataBridge } from '../utils/dataBridge'
import { isTauri, tauriAPI } from '../utils/tauriAPI'
import { floatingWindowDragPosition } from '../utils/floatingWindowDrag.mjs'
import { floatingWindowImagePath, normalizeFloatingWindowOpacity, normalizeFloatingWindowStyle, resolveFloatingWindowRadius } from '../utils/floatingWindowStyle'
import { floatingWindowTextSize, normalizeFloatingWindowSize, normalizeFloatingWindowTextSize } from '../utils/floatingWindowSize'
import {
  DEFAULT_FLOATING_WINDOW_BACKGROUND_COLOR,
  DEFAULT_FLOATING_WINDOW_TEXT,
  DEFAULT_FLOATING_WINDOW_TEXT_COLOR,
  normalizeFloatingWindowBackgroundColor,
  normalizeFloatingWindowText,
  normalizeFloatingWindowTextColor
} from '../utils/floatingWindowText'

const DRAG_THRESHOLD = 5
const style = ref('text')
const customImage = ref('')
const text = ref(DEFAULT_FLOATING_WINDOW_TEXT)
const backgroundColor = ref(DEFAULT_FLOATING_WINDOW_BACKGROUND_COLOR)
const textColor = ref(DEFAULT_FLOATING_WINDOW_TEXT_COLOR)
const textSize = ref(null)
const radius = ref(null)
const floatingOpacity = ref(100)
const windowSize = ref(64)
const effectiveRadius = computed(() => resolveFloatingWindowRadius(radius.value, style.value))
let removeNativeListeners

function applyStyle(value) {
  if (value && typeof value === 'object') {
    customImage.value = typeof value.customImage === 'string' ? value.customImage : customImage.value
    text.value = normalizeFloatingWindowText(value.text ?? text.value)
    backgroundColor.value = normalizeFloatingWindowBackgroundColor(value.backgroundColor ?? backgroundColor.value)
    textColor.value = normalizeFloatingWindowTextColor(value.textColor ?? textColor.value)
    if (Object.prototype.hasOwnProperty.call(value, 'textSize')) {
      textSize.value = normalizeFloatingWindowTextSize(value.textSize)
    }
    radius.value = value.radius ?? null
    if (Object.prototype.hasOwnProperty.call(value, 'opacity')) {
      floatingOpacity.value = normalizeFloatingWindowOpacity(value.opacity)
    }
    style.value = normalizeFloatingWindowStyle(value.style)
    applyTextSize()
    return
  }
  style.value = normalizeFloatingWindowStyle(value)
}

function onImageError() {
  style.value = 'text'
}

function applySize(value) {
  windowSize.value = normalizeFloatingWindowSize(value)
  applyTextSize()
}

function applyTextSize() {
  document.documentElement.style.setProperty('--floating-text-size', `${floatingWindowTextSize(windowSize.value, text.value, textSize.value)}px`)
}

onMounted(async () => {
  const saved = await dataBridge.load('settings')
  customImage.value = typeof saved?.floatingWindowCustomImage === 'string' ? saved.floatingWindowCustomImage : ''
  text.value = normalizeFloatingWindowText(saved?.floatingWindowText)
  backgroundColor.value = normalizeFloatingWindowBackgroundColor(saved?.floatingWindowBackgroundColor)
  textColor.value = normalizeFloatingWindowTextColor(saved?.floatingWindowTextColor)
  textSize.value = normalizeFloatingWindowTextSize(saved?.floatingWindowTextSize)
  radius.value = saved?.floatingWindowRadius ?? null
  floatingOpacity.value = normalizeFloatingWindowOpacity(saved?.floatingWindowOpacity)
  applyStyle(saved?.floatingWindowStyle)
  applySize(saved?.floatingWindowSize)
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event')
    const removeStyleListener = await listen('floating-window-style-changed', event => applyStyle(event.payload))
    const removeSizeListener = await listen('floating-window-size-changed', event => applySize(event.payload))
    removeNativeListeners = () => { removeStyleListener(); removeSizeListener() }
  }
})

onBeforeUnmount(() => removeNativeListeners?.())

let pointer = null

function onPointerDown(e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return

  e.currentTarget.setPointerCapture(e.pointerId)
  pointer = {
    id: e.pointerId,
    startClientX: e.clientX,
    startClientY: e.clientY,
    dragged: false,
    moving: false,
    pending: null,
    inFlight: Promise.resolve(),
    drag: null
  }
}

function onPointerMove(e) {
  if (!pointer || e.pointerId !== pointer.id) return

  const dx = e.clientX - pointer.startClientX
  const dy = e.clientY - pointer.startClientY
  if (!pointer.dragged && Math.max(Math.abs(dx), Math.abs(dy)) > DRAG_THRESHOLD) {
    pointer.dragged = true
    pointer.drag = startDrag(pointer.startClientX, pointer.startClientY)
  }

  if (pointer.dragged) movePointer(pointer, e.clientX, e.clientY)
}

async function onPointerUp(e) {
  await finishPointer(e, false)
}

async function onPointerCancel(e) {
  await finishPointer(e, true)
}

async function finishPointer(e, cancelled) {
  if (!pointer || e.pointerId !== pointer.id) return

  const activePointer = pointer
  pointer = null
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  if (activePointer.dragged) {
    movePointer(activePointer, e.clientX, e.clientY)
    await activePointer.inFlight
    const drag = await activePointer.drag
    await drag.end()
  }
  if (!activePointer.dragged && !cancelled) {
    await openMainWindow()
  }
}

async function startDrag(anchorX, anchorY) {
  if (isTauri()) {
    const { getCurrentWindow, PhysicalPosition } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const scaleFactor = await win.scaleFactor()
    return {
      move: async (clientX, clientY) => {
        const position = floatingWindowDragPosition(
          await win.outerPosition(),
          { x: clientX, y: clientY },
          { x: anchorX, y: anchorY },
          scaleFactor
        )
        await win.setPosition(new PhysicalPosition(position.x, position.y))
      },
      end: () => tauriAPI.saveFloatingWindowPosition()
    }
  }

  return { move: () => Promise.resolve(), end: () => Promise.resolve() }
}

function movePointer(activePointer, clientX, clientY) {
  activePointer.pending = { clientX, clientY }
  if (activePointer.moving) return
  activePointer.moving = true
  activePointer.inFlight = (async () => {
    const drag = await activePointer.drag
    while (activePointer.pending) {
      const next = activePointer.pending
      activePointer.pending = null
      await drag.move(next.clientX, next.clientY)
    }
  })().finally(() => { activePointer.moving = false })
}

async function openMainWindow() {
  if (isTauri()) {
    await tauriAPI.invoke('focus_main_window')
  }
}
</script>

<style scoped>
.floating-ball {
  width: min(100vw, 100vh);
  height: min(100vw, 100vh);
  aspect-ratio: 1;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  overflow: hidden;
  touch-action: none;
  -webkit-app-region: no-drag;
}

.floating-ball.text-style {
  background: var(--floating-background-color, var(--accent));
}

.floating-ball.image-style {
  background: transparent;
}

:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent !important;
}

:global(#app) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ball-text {
  max-width: 78%;
  max-height: 78%;
  font-family: var(--font-display);
  font-size: var(--floating-text-size, 14px);
  font-weight: 600;
  line-height: 1.1;
  color: var(--floating-text-color, #fff);
  text-align: center;
  overflow-wrap: anywhere;
  pointer-events: none;
}

.ball-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  pointer-events: none;
}

</style>
