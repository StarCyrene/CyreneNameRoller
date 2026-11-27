const palette = ['#b64989', '#4c75b5', '#2c8173', '#ad742a', '#8260b2', '#ad6056', '#397f99', '#906847']

// Stock determines eligibility; the core weights prize types, not individual units.
export function prizeSegments(prizes) {
  const pool = prizes.map((prize, index) => ({ prize, color: palette[index % palette.length] }))
    .filter(({ prize }) => prize.quantity > 0)
  const total = pool.reduce((sum, { prize }) => sum + prize.weight, 0)
  let start = 0
  return pool.map(({ prize, color }) => {
    const probability = prize.weight / total
    const end = start + probability * 360
    const segment = { prize, color, probability, start, end, center: (start + end) / 2 }
    start = end
    return segment
  })
}

export function landingRotation(rotation, segment, turns = 3) {
  const forward = ((-segment.center - rotation) % 360 + 360) % 360
  return rotation + turns * 360 + forward
}

export function validRoundCount(value, capacity) {
  const count = Number(value)
  return Number.isInteger(count) && count >= 1 && count <= Math.min(capacity, 100)
}

// The receipt is ordered; reconstruct the stock immediately after each item
// from the committed inventory, including repeat wins in the same batch.
export function resultsWithStock(results, committedPrizes) {
  const stock = new Map(committedPrizes.map(prize => [prize.id, prize.quantity]))
  return results.reduceRight((items, prize, index) => {
    const remaining = stock.get(prize.id) ?? 0
    items[index] = { id: prize.id, name: prize.name, quality: prize.quality || '', remaining }
    stock.set(prize.id, remaining + 1)
    return items
  }, new Array(results.length))
}
