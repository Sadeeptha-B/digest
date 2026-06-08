// Smart, slightly adventurous greetings for the library banner. The greeting
// reflects the time of day; the tagline is chosen from context-aware pools
// (day of week, time, library state) with a touch of randomness so it stays
// fresh without being noisy.

export function timeGreeting(date: Date): string {
  const h = date.getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Winding down'
}

const GENERAL = [
  'Pick one thing. Go deep.',
  'Less feed, more focus.',
  'Small blocks, big momentum.',
  'The algorithm doesn’t get a vote here.',
  'Trade the scroll for something that compounds.',
  'One playlist, full attention.',
  'Future you is taking notes.',
]

const MORNING = [
  'The first block is the hardest — start anyway.',
  'Make the morning count.',
  'Quiet hours, clear mind.',
]

const LATE_NIGHT = [
  'One more block, then rest.',
  'Late, but worth it. Keep it gentle.',
  'The world’s asleep — perfect for deep work.',
]

const MONDAY = ['Set the week’s tone.', 'Fresh week, clean slate.']
const FRIDAY = ['Finish what you started.', 'Land the week strong.']
const WEEKEND = ['Learning, on your own terms.', 'No deadlines today — just curiosity.']

/** Deterministic-ish pick: one line per page load, weighted toward context. */
export function pickTagline(date: Date, unwatchedCount = 0): string {
  const h = date.getHours()
  const day = date.getDay() // 0 Sun … 6 Sat

  const contextual: string[] = []
  if (day === 1) contextual.push(...MONDAY)
  if (day === 5) contextual.push(...FRIDAY)
  if (day === 0 || day === 6) contextual.push(...WEEKEND)
  if (h < 9) contextual.push(...MORNING)
  if (h >= 22 || h < 5) contextual.push(...LATE_NIGHT)
  if (unwatchedCount > 0) {
    contextual.push(
      `${unwatchedCount} video${unwatchedCount === 1 ? '' : 's'} waiting for your focus.`,
    )
  }

  // ~60% chance to use a contextual line when one applies, else fall back to general.
  const pool = contextual.length > 0 && Math.random() < 0.6 ? contextual : GENERAL
  return pool[Math.floor(Math.random() * pool.length)]
}
