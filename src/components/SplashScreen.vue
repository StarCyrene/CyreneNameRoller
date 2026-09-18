<template>
  <div class="splash-root" :class="{ fading }" ref="stage">
    <div class="splash-stage">
      <div class="brand" ref="brand">
        <div class="logo-shift" ref="ls">
          <div class="logo-wrap">
            <img class="logo" :src="LOGO" alt="Logo" @error="onLogoError" />
          </div>
          <div class="text-clip">
            <div class="brand-text" ref="bt">
              <span class="text-main" ref="t1">Cyrene</span>
              <span class="text-sub" ref="t2">{{ subText }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="splash-footer">
      <div class="splash-footer-main">
        <div class="footer-creator">
          <img src="/avatars/Cyrene2008.png" alt="Cyrene2008" class="footer-avatar" />
          <div class="footer-creator-info">
            <div class="footer-creator-name-row">
              <span class="footer-creator-name">Cyrene2008</span>
              <span class="footer-role">{{ lang === 'en' ? 'Author' : '作者' }}</span>
            </div>
          </div>
        </div>
        <div class="footer-creator-sep" />
        <div class="footer-org">
          <img src="/starcyrene.ico" alt="StarCyrene" class="footer-org-icon" />
          <div class="footer-org-copy">
            <span class="footer-org-name">星海昔涟 StarCyrene</span>
            <span class="footer-org-slogan">{{ lang === 'en' ? 'Made with Love, Starlight Ripples On♪' : '「以爱为因，星光成涟」♪' }}</span>
          </div>
        </div>
      </div>
      <div class="footer-copy">
        Copyright &copy; 2025-2026 Cyrene2008 · All Rights Reserved.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'

const emit = defineEmits(['done'])

const settingsStore = useSettingsStore()
const lang = computed(() => settingsStore.settings.language)
const subText = computed(() => t('splashSub', lang.value))

const stage = ref(null)
const brand = ref(null)
const ls = ref(null)
const bt = ref(null)
const t1 = ref(null)
const t2 = ref(null)
const fading = ref(false)

const LOGO = '/icon.png'
const FALLBACK_LOGO =
  'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20128%20128%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ff9ecf%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23e0438b%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%22112%22%20height%3D%22112%22%20rx%3D%2228%22%20fill%3D%22url(%23g)%22%2F%3E%3Cpath%20d%3D%22M64%2092%20C44%2076%2036%2060%2044%2050%20C50%2042%2060%2044%2064%2052%20C68%2044%2078%2042%2084%2050%20C92%2060%2084%2076%2064%2092%20Z%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E'

let timers = []
function at(ms, fn) {
  timers.push(setTimeout(fn, ms))
}

function onLogoError(e) {
  const img = e.target
  if (img.src !== FALLBACK_LOGO) img.src = FALLBACK_LOGO
}

function measure() {
  const s = stage.value
  if (!s || !ls.value || !bt.value || !t1.value || !t2.value) return
  ls.value.style.transition = 'none'
  bt.value.style.transition = 'none'
  const tw = Math.max(t1.value.offsetWidth, t2.value.offsetWidth)
  s.style.setProperty('--shift', (29 + tw) / 2 + 'px')
  s.style.setProperty('--clip-w', 29 + tw + 14 + 'px')
  void ls.value.offsetHeight
  ls.value.style.transition = ''
  bt.value.style.transition = ''
  void ls.value.offsetHeight
}

onMounted(() => {
  const s = stage.value
  const logoEl = s.querySelector('.logo')
  if (logoEl && logoEl.complete && logoEl.naturalWidth === 0) logoEl.src = FALLBACK_LOGO

  measure()

  watch(lang, () => nextTick(measure))

  at(48, () => brand.value.classList.add('enter-pop'))
  at(760, () => brand.value.classList.add('expanded'))
  at(1840, () => {
    fading.value = true
  })
  at(1840 + 320, () => emit('done'))
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  timers = []
})
</script>

<style scoped>
.splash-root {
  position: fixed;
  inset: 0;
  z-index: 2147483647; /* 始终位于最前 */
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fdf5fa;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.32s ease;
}
.splash-root.fading {
  opacity: 0;
}
/* 底部 75% Alpha 作者 + 组织信息（作者在前），Copyright 位于最底部 */
.splash-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 24px 16px;
  font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  opacity: 0.75;
  pointer-events: none;
  user-select: none;
  color: #8f2d5f;
}
.splash-footer-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  flex-wrap: wrap;
}
.splash-footer .footer-creator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.splash-footer .footer-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(143, 45, 95, 0.25);
}
.splash-footer .footer-creator-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.splash-footer .footer-creator-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.splash-footer .footer-creator-name {
  font-size: 13px;
  font-weight: 600;
}
.splash-footer .footer-role {
  font-size: 11px;
  opacity: 0.7;
}
.splash-footer .footer-creator-sep {
  width: 1px;
  height: 30px;
  background: rgba(143, 45, 95, 0.25);
}
.splash-footer .footer-org {
  display: flex;
  align-items: center;
  gap: 10px;
}
.splash-footer .footer-org-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.splash-footer .footer-org-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.splash-footer .footer-org-name {
  font-size: 13px;
  font-weight: 600;
}
.splash-footer .footer-org-slogan {
  font-size: 11px;
  opacity: 0.7;
}
.splash-footer .footer-copy {
  font-size: 11px;
  opacity: 0.7;
  line-height: 1.6;
}
/* 启动动画整体基准缩放 150%（独立于全局 --ui-scale） */
.splash-stage {
  transform: scale(1.5);
  transform-origin: center;
  will-change: transform;
}
.brand {
  display: flex;
  align-items: center;
  transform: translateX(calc(var(--shift, 0px) * -1));
}
.logo-shift {
  position: relative;
  flex: none;
  transform: translateX(var(--shift, 0px));
  transition: transform 960ms cubic-bezier(0.8, 0, 0.2, 1);
}
.brand.expanded .logo-shift {
  transform: translateX(0);
}
.logo-wrap {
  position: relative;
  z-index: 2;
  width: 128px;
  height: 128px;
  opacity: 0;
}
.logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.text-clip {
  position: absolute;
  z-index: 1;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  width: var(--clip-w, 400px);
  overflow: hidden;
  font-size: 42px;
  padding: 0.18em 0;
  margin: -0.18em 0 0 0;
}
.brand-text {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.06em;
  font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #8f2d5f;
  margin-left: 29px;
  transform: translateX(calc(-100% - 29px - 2px));
  transition: transform 960ms cubic-bezier(0.8, 0, 0.2, 1);
  line-height: 1.15;
}
.brand.expanded .brand-text {
  transform: translateX(0);
}
.text-main,
.text-sub {
  white-space: nowrap;
}
.text-sub {
  font-size: 36px;
  opacity: 0.58;
  letter-spacing: 0.06em;
  font-weight: 500;
}
@keyframes enter-pop {
  0% {
    opacity: 0;
    transform: scale(0.15);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.brand.enter-pop .logo-wrap {
  animation: enter-pop 640ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
</style>
