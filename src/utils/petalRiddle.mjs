const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const graphemes = text => segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text)
const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()

export function createPetalRiddle(person, people = [], english = false) {
  const name = String(person.name || '').trim()
  const alias = String(person.englishName || '').trim()
  const display = (english && alias) || name || alias
  const letters = graphemes(display)
  const positions = letters.flatMap((letter, index) => /\S/u.test(letter) ? [index] : [])
  const aliasLetters = graphemes(alias).filter(letter => /\S/u.test(letter))
  return {
    letters, positions, display, name, alias,
    // A one-letter alias is an accepted answer itself, so it can't serve as a clue.
    initial: aliasLetters.length > 1 ? aliasLetters[0].toUpperCase() : '',
    rosterNumber: people.findIndex(item => item.id === person.id) + 1,
    answers: [name, alias].map(normalize).filter(Boolean)
  }
}

export function matchesPetalGuess(riddle, input) {
  return Boolean(riddle?.answers.includes(normalize(input)))
}

export function nextPetal(riddle, revealed) {
  const hidden = riddle.positions.filter(i => !revealed.includes(i))
  // Always leave one unknown until the player chooses to solve or open the note.
  return hidden.length > 1 ? hidden[0] : null
}
