export const ROWS_PER_PAGE = 6
export const MIN_COLUMNS = 1
export const MAX_COLUMNS = 12
export const DEFAULT_COLUMNS = 6
export const MAX_SEAT_SLOTS = 10000
export const seatColumns = value => Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.trunc(Number(value)) || DEFAULT_COLUMNS))

export function orderedSeats(names, savedOrder = [], keepGaps = false) {
  const remaining = new Map(names.filter(p => p?.id && p.cn && p.cn !== '再来一次').map(p => [p.id, p]))
  const seats = []
  for (const id of Array.isArray(savedOrder) ? savedOrder : []) {
    if (!remaining.has(id)) { if (keepGaps) seats.push(null); continue }
    seats.push(remaining.get(id))
    remaining.delete(id)
  }
  return seats.concat([...remaining.values()])
}
export function seatOrder(seats) { return seats.map(person => person?.id || null) }

const validSlot = (order, index) => Number.isInteger(index) && index >= 0 && index < order.length

export function swapSeatSlots(order, from, to) {
  if (from === to || !validSlot(order, from) || !validSlot(order, to) || order[from] === order[to]) return order
  const next = [...order]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function addEmptySeat(order) {
  return order.length < MAX_SEAT_SLOTS ? [...order, null] : order
}

export function removeEmptySeat(order, at) {
  if (!validSlot(order, at) || order[at] !== null) return order
  return order.filter((_, index) => index !== at)
}

export function swapSeats(people, first, second) {
  const ids = seatOrder(people)
  return swapSeatSlots(ids, ids.indexOf(first), ids.indexOf(second))
}
export function seatAddress(index, columns) {
  if (index < 0) return null
  const width = seatColumns(columns)
  return { row: Math.floor(index / width) + 1, seat: index % width + 1, page: Math.floor(index / (width * ROWS_PER_PAGE)) }
}

// Store writes on desktop are async. A quick tool/list switch must wait for
// the latest change to this list, even if the previous view has unmounted.
const pending = new Map()
const storageKey = listId => 'seatPlan:' + listId
export async function readSeatPlan(storage, listId) {
  await pending.get(listId)?.catch(() => {})
  const raw = await storage.load(storageKey(listId))
  return { columns: seatColumns(raw?.columns), order: Array.isArray(raw?.order) ? raw.order : [], mapped: raw?.mapped === true }
}
export function writeSeatPlan(storage, listId, plan) {
  const snapshot = { columns: seatColumns(plan.columns), order: [...plan.order], mapped: plan.mapped === true }
  const task = (pending.get(listId) || Promise.resolve()).catch(() => {}).then(() => storage.save(storageKey(listId), snapshot))
  pending.set(listId, task)
  const done = () => { if (pending.get(listId) === task) pending.delete(listId) }
  task.then(done, done)
  return task
}
