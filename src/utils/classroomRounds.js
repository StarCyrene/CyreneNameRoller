import { secureRandom } from './cyrene-balance.js'

export function boundCount(value, maximum, fallback) {
  return Math.min(maximum, Math.max(1, Math.trunc(Number(value)) || fallback))
}

// Deal a shuffled roster round-robin. No one is lost to rounding, and team
// sizes differ by at most one. This does not change anyone's saved group.
export function formTeams(people, requestedCount, random = secureRandom) {
  if (!people.length) return []
  const ordered = people.slice()
  for (let end = ordered.length - 1; end > 0; end--) {
    const index = Math.floor(random() * (end + 1))
    ;[ordered[index], ordered[end]] = [ordered[end], ordered[index]]
  }
  const teams = Array.from({ length: boundCount(requestedCount, people.length, 2) }, () => [])
  ordered.forEach((person, i) => teams[i % teams.length].push(person))
  return teams
}
