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
  return people.map((person, index) => {
    const probability = probabilities[personKey(person)]
    const end = index === people.length - 1 ? 360 : start + probability * 3.6
    const span = end - start
    const angle = start + span / 2
    const position = person.position ?? index + 1
    const name = String((english && person.en) || person.cn)
    const maxWidth = Math.min(76, 2 * LABEL_RADIUS * Math.tan(Math.min(span, 90) * Math.PI / 360) - 5)
    const number = String(position)
    const label = (people.length <= 20 && maxWidth >= MIN_LABEL_WIDTH && fitName(name, maxWidth))
      || (maxWidth >= Math.max(MIN_LABEL_WIDTH, number.length * 7) ? number : '')
    const sector = { person, position, name, label, start, end, span, angle, probability }
    start = end
    return sector
  })
}

export function wheelHeading(angle) {
  return (angle % 360 + 360) % 360
}

export function wheelLanding(current, sector) {
  return current + 360 * 3 + wheelHeading(-sector.angle - current)
}

export function wheelLabelTransform(sector, rotation) {
  const heading = wheelHeading(sector.angle + rotation)
  return 'rotate(' + sector.angle + ' 150 150)' + (heading > 90 && heading <= 270 ? ' rotate(180 150 47)' : '')
}
