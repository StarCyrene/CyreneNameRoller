export const POINTER_DRAWING_SPEEDS = Object.freeze([1, 1.25, 1.5, 1.75, 2])

export function normalizePointerDrawingSpeed(value) {
  const speed = typeof value === 'string' ? Number(value) : value
  return POINTER_DRAWING_SPEEDS.includes(speed) ? speed : POINTER_DRAWING_SPEEDS[0]
}
