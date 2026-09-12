import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

CustomEase.create('cnr-standard', 'M0,0,C0.1,0.9,0.2,1,1,1')
CustomEase.create('cnr-lift', 'M0,0,C0.12,0.85,0.2,1.15,1,1')
CustomEase.create('cnr-glow', 'M0,0,C0.16,0.84,0.3,1,1,1')
CustomEase.create('cnr-deal', 'M0,0,C0.34,1.56,0.64,1,1,1')
CustomEase.create('cnr-out', 'M0,0,C0.55,0,1,0.45,1,1')

export function animationEnabled() {
  if (typeof document !== 'undefined' && document.querySelector('.app-layout')?.classList.contains('perf-no-anim')) return false
  return true
}

function isElement(value) {
  return typeof Element !== 'undefined' && value instanceof Element
}

function revealScaleOf(element) {
  const raw = getComputedStyle(element).getPropertyValue('--reveal-scale')
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function buildRollerSpotlight(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-standard' }, onComplete })
    .set(element, { scale: revealScaleOf(element), opacity: 0, filter: 'brightness(2)' })
    .to(element, { scale: 0.97, opacity: 1, filter: 'brightness(1.08)', duration: 0.36 }, 0)
    .to(element, { scale: 1, filter: 'brightness(1)', duration: 0.14 }, 0.36)
}

function buildRollerLift(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-lift' }, onComplete })
    .set(element, { y: 18, scale: 0.88, opacity: 0, filter: 'blur(5px)' })
    .to(element, { y: -6, scale: 1.05, opacity: 1, filter: 'blur(0px) brightness(1.3)', duration: 0.394 }, 0)
    .to(element, { y: 0, scale: 1, filter: 'blur(0px) brightness(1)', duration: 0.286 }, 0.394)
}

function buildRollerGlow(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-glow' }, onComplete })
    .set(element, { scale: 0.92, opacity: 0, textShadow: '0 0 0 var(--accent)' })
    .to(element, { scale: 1.06, opacity: 1, textShadow: '0 0 32px var(--accent)', duration: 0.4 }, 0)
    .to(element, { scale: 1, textShadow: '0 4px 20px rgba(234, 94, 193, 0.15)', duration: 0.4 }, 0.4)
}

function buildLotterySpotlight(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-standard' }, onComplete })
    .set(element, { scale: 0.84, opacity: 0, filter: 'brightness(2.1) blur(4px)' })
    .to(element, { scale: 1.07, opacity: 1, filter: 'brightness(1.3) blur(0px)', duration: 0.384 }, 0)
    .to(element, { scale: 1, filter: 'brightness(1) blur(0px)', duration: 0.236 }, 0.384)
}

function buildLotteryLift(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-lift' }, onComplete })
    .set(element, { y: 20, scale: 0.9, opacity: 0, filter: 'blur(5px)' })
    .to(element, { y: -6, scale: 1.04, opacity: 1, filter: 'blur(0px)', duration: 0.394 }, 0)
    .to(element, { y: 0, scale: 1, filter: 'blur(0px)', duration: 0.286 }, 0.394)
}

function buildLotteryGlow(element, onComplete) {
  return gsap.timeline({ defaults: { ease: 'cnr-glow' }, onComplete })
    .set(element, { scale: 0.92, opacity: 0, textShadow: '0 0 0 var(--accent)' })
    .to(element, { scale: 1.05, opacity: 1, textShadow: '0 0 34px var(--accent)', duration: 0.4 }, 0)
    .to(element, { scale: 1, textShadow: '0 0 0px var(--accent)', duration: 0.4 }, 0.4)
}

const FINISH_BUILDERS = {
  roller: { spotlight: buildRollerSpotlight, lift: buildRollerLift, glow: buildRollerGlow },
  lottery: { spotlight: buildLotterySpotlight, lift: buildLotteryLift, glow: buildLotteryGlow }
}

export function runFinishAnimation(element, variant = 'spotlight', style = 'roller', onComplete) {
  if (!isElement(element)) { onComplete?.(); return null }
  const builders = FINISH_BUILDERS[style] || FINISH_BUILDERS.roller
  const build = builders[variant] || builders.spotlight
  try {
    return build(element, () => {
      try { gsap.set(element, { clearProps: 'transform,filter,opacity,textShadow' }) } catch {}
      onComplete?.()
    })
  } catch (error) {
    console.warn('[animation] finish animation failed to start', error)
    onComplete?.()
    return null
  }
}

export function runCardDeal(element, onComplete) {
  if (!isElement(element)) { onComplete?.(); return null }
  try {
    return gsap.fromTo(element,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'cnr-deal', overwrite: 'auto', onComplete })
  } catch (error) {
    console.warn('[animation] card deal failed to start', error)
    onComplete?.(); return null
  }
}

export function runSplashPop(element, onComplete) {
  if (!isElement(element)) { onComplete?.(); return null }
  try {
    return gsap.fromTo(element,
      { opacity: 0, scale: 0.15 },
      { opacity: 1, scale: 1, duration: 0.64, ease: 'cnr-deal', overwrite: 'auto', onComplete })
  } catch (error) {
    console.warn('[animation] splash pop failed to start', error)
    onComplete?.(); return null
  }
}
