export const MAX_WHEEL_SECTORS = 10

// Use consecutive ranges for large lists: every eligible person still has a
// position, even when individual names would no longer fit on the dial.
export function wheelSectors(people, english = false) {
  const count = Math.min(people.length, MAX_WHEEL_SECTORS)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * people.length / count)
    const end = Math.floor((i + 1) * people.length / count)
    const label = people.length > MAX_WHEEL_SECTORS
      ? (end === start + 1 ? String(end) : `${start + 1}–${end}`)
      : ((english && people[start].en) || people[start].cn)
    return { start, end, label, angle: (i + 0.5) * 360 / count }
  })
}

export function wheelLanding(current, sectors, personIndex) {
  const index = sectors.findIndex(({ start, end }) => personIndex >= start && personIndex < end)
  if (index < 0) return null
  const delta = ((-sectors[index].angle - current) % 360 + 360) % 360
  return current + 360 * 3 + delta
}
