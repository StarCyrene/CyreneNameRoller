import { MAX_COLUMNS, orderedSeats } from './seatPlan.mjs'

function splitTable(text) {
  const delimiter = text.includes('\t') ? '\t' : ','
  const rows = [[]]
  let value = '', quoted = false, closed = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') value += c
      else if (text[i + 1] === '"') { value += '"'; i++ }
      else { quoted = false; closed = true }
    } else if (c === delimiter || c === '\n') {
      rows.at(-1).push(value.trim())
      value = ''; closed = false
      if (c === '\n') rows.push([])
    } else if (c === '"' && !value && !closed) quoted = true
    else if (c === '"' || (closed && c.trim())) return null
    else value += c
  }
  if (quoted) return null
  rows.at(-1).push(value.trim())
  return rows
}

export function previewSeatPaste(source, names) {
  // Strip only the clipboard's final line break: tabs and empty cells are seats.
  const text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n$/, '')
  const out = { columns: 0, rows: 0, order: [], empty: 0, errors: [], valid: false }
  const fail = (kind, value = '', row = 0, col = 0) => out.errors.push({ kind, value, row, col })
  if (!text.trim()) { fail('empty'); return out }
  if (text.length > 250000) { fail('large'); return out }
  const rows = splitTable(text)
  if (!rows) { fail('format'); return out }
  out.columns = rows.reduce((max,row) => Math.max(max,row.length), 0)
  out.rows = rows.length
  if (out.columns > MAX_COLUMNS) { fail('wide', String(out.columns)); return out }
  if (out.rows * out.columns > 10000) { fail('large'); return out }
  const people = orderedSeats(names)
  const byId = new Map(people.map(p => [p.id, p]))
  const byName = new Map()
  for (const p of people) for (const label of new Set([p.cn?.trim(), p.en?.trim()].filter(Boolean))) {
    if (!byName.has(label)) byName.set(label, [])
    byName.get(label).push(p)
  }
  const seen = new Set()
  rows.forEach((cells, row) => {
    for (let col = 0; col < out.columns; col++) {
      const token = cells[col] || ''
      if (!token) { out.order.push(null); out.empty++; continue }
      const matches = byId.has(token) ? [byId.get(token)] : byName.get(token) || []
      if (matches.length !== 1 || seen.has(matches[0].id)) {
        fail(matches.length > 1 ? 'ambiguous' : matches.length === 0 ? 'unknown' : 'duplicate', token, row + 1, col + 1)
        out.order.push(null)
      } else {
        seen.add(matches[0].id)
        out.order.push(matches[0].id)
      }
    }
  })
  const missing = people.filter(p => !seen.has(p.id))
  if (missing.length) fail('missing', missing.slice(0, 6).map(p => p.cn).join('、') + (missing.length > 6 ? '…' : ''))
  out.valid = !out.errors.length && !!seen.size
  return out
}
