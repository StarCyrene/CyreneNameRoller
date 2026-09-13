export const ROLL_BASE_INTERVAL_MS = 50
export const ROLL_DECEL_TARGET_MS = 400
export const ROLL_DECEL_DURATION_MS = 1200

function normalizeIntervalMs(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

export function createRollScheduler(options = {}) {
  const baseMs = normalizeIntervalMs(options.baseMs, ROLL_BASE_INTERVAL_MS)
  const targetMs = Math.max(baseMs, normalizeIntervalMs(options.targetMs, ROLL_DECEL_TARGET_MS))
  const decelDurationMs = normalizeIntervalMs(options.decelDurationMs, ROLL_DECEL_DURATION_MS)
  let accumulatedMs = 0
  let decelElapsedMs = 0
  let decelerating = false

  function currentIntervalMs() {
    if (!decelerating) return baseMs
    const progress = Math.min(1, decelElapsedMs / decelDurationMs)
    const eased = 1 - Math.pow(1 - progress, 3)
    return baseMs + (targetMs - baseMs) * eased
  }

  return {
    reset() { accumulatedMs = 0; decelElapsedMs = 0; decelerating = false },
    isDecelerating() { return decelerating },
    beginDeceleration() { decelerating = true; decelElapsedMs = 0 },
    decelerationComplete() { return decelerating && decelElapsedMs >= decelDurationMs },
    currentIntervalMs,
    tick(deltaMs) {
      accumulatedMs += deltaMs
      if (decelerating) decelElapsedMs += deltaMs
      if (accumulatedMs >= currentIntervalMs()) { accumulatedMs = 0; return true }
      return false
    }
  }
}
