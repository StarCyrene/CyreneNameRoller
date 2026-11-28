const queues = new Map()
const emptyTray = () => ({ used: [], history: [] })
export const cardSessionKey = listId => 'cardTray:' + listId

// A view can unmount while the desktop core is committing. A later mount
// reading the same list must see that commit before it offers another card.
export function withCardSession(listId, task) {
  const pending = (queues.get(listId) || Promise.resolve()).catch(() => {}).then(task)
  queues.set(listId, pending)
  const finish = () => { if (queues.get(listId) === pending) queues.delete(listId) }
  pending.then(finish, finish)
  return pending
}

export async function readCardTray(storage, listId, lists) {
  const saved = await storage.load(cardSessionKey(listId))
  if (Array.isArray(saved?.used) && Array.isArray(saved?.history)) return saved
  const [used, history] = await Promise.all([storage.load('cardUsedNames'), storage.load('cardTrayHistory')])
  if (!Array.isArray(used) || !used.length || !Array.isArray(history)) return emptyTray()
  // Old trays didn't store a list ID. Migrate only if every saved person can
  // be assigned to one list unambiguously.
  const owners = lists.filter(list => {
    const keys = new Set(list.names.flatMap(person => [person.id, person.cn]))
    return used.every(id => keys.has(id))
  })
  if (owners.length !== 1 || owners[0].id !== listId) return emptyTray()
  const tray = { used: [...new Set(used)], history }
  await storage.save(cardSessionKey(listId), tray)
  return tray
}

export function cardDisplayName(result, english) {
  // Older trays stored only the chosen display name.
  return (english && result?.englishName) || result?.name || ''
}

export function appendCardReceipt(previous, receipt) {
  const entries = receipt.results.map((p, i) => ({
    id: receipt.operationId + ':' + i,
    name: p.name,
    englishName: p.englishName || ''
  }))
  return {
    used: [...new Set([...previous.used, ...receipt.results.map(p => p.id)])],
    history: [...entries.reverse(), ...previous.history]
  }
}
