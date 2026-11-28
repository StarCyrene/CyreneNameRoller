import { computeCyreneBalanceProbability, personKey } from './cyrene-balance.js'

const MIN_LABEL_WIDTH = 12
const LABEL_RADIUS = 103
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null

function fitName(name, maxWidth) {
  const units = segmenter ? Array.from(segmenter.segment(name), part => part.segment) : Array.from(name)
  const widths = units.map(unit => /^[\x20-\x7e]$/.test(unit) ? 6.6 : 11)
  if (widths.reduce((sum, width) => sum + width, 0) <= maxWidth) return name
  let used = 8 // Leave room for the ellipsis.
  let end = 0
  while (end < units.length && used + widths[end] <= maxWidth) used += widths[end++]
  return end >= 2 ? units.slice(0, end).join('') + '…' : ''
}

export function wheelSectors(people, { english = false, counts, balance } = {}) {
  const probabilities = computeCyreneBalanceProbability(people, people.filter(person => person.isWhiteList), counts, balance ?? { enabled: false })
  let start = 0
  const sectors = people.map((person, index) => {
    const probability = probabilities[personKey(person)]
    const end = index === people.length - 1 ? 360 : start + probability * 3.6
    const span = end - start
    const angle = start + span / 2
    const position = person.position ?? index + 1
    const sector = { person, position, start, end, span, angle, probability }
    start = end
    return sector
  })
  return nameWheelSectors(sectors, english)
}

export function wheelPersonName(person, english) {
  return String((english && person.en) || person.cn)
}

export function nameWheelSectors(sectors, english) {
  return sectors.map(sector => {
    const { person, position, span } = sector
    const name = wheelPersonName(person, english)
    if (name === sector.name) return sector
    const maxWidth = Math.min(76, 2 * LABEL_RADIUS * Math.tan(Math.min(span, 90) * Math.PI / 360) - 5)
    const number = String(position)
    const label = (sectors.length <= 20 && maxWidth >= MIN_LABEL_WIDTH && fitName(name, maxWidth))
      || (maxWidth >= Math.max(MIN_LABEL_WIDTH, number.length * 7) ? number : '')
    return { ...sector, name, label }
  })
}

export function wheelHeading(angle) {
  return (angle % 360 + 360) % 360
}

export function wheelSectorAt(sectors, rotation) {
  const heading = wheelHeading(-rotation)
  let low = 0
  let high = sectors.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (heading < sectors[middle].end) high = middle
    else low = middle + 1
  }
  return sectors[low]
}

export function wheelLanding(current, sector) {
  return current + 360 * 3 + wheelHeading(-sector.angle - current)
}

export function wheelLabelTransform(sector) {
  // A label at twelve o'clock has its feet toward the hub. Rotate it with the sector.
  return 'rotate(' + sector.angle + ' 150 150)'
}
