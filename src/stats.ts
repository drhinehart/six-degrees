import { dayNumber, golfScore } from './game'
import type { GameState, Puzzle } from './types'

export interface ResultRecord {
  date: string
  number: number
  par: number
  strokes: number
  misses: number
  status: Exclude<GameState['status'], 'playing'>
}

export interface Stats {
  played: number
  wins: number
  winRate: number
  currentStreak: number
  maxStreak: number
  distribution: { label: string; count: number }[]
}

// Par is always the true shortest path, so no result can finish under par.
export const OUTCOMES = ['Par', 'Bogey', 'Double', 'Triple+', 'Out of misses', 'Gave up'] as const

export function outcome(record: Pick<ResultRecord, 'status' | 'strokes' | 'par'>): (typeof OUTCOMES)[number] {
  if (record.status === 'lost') return 'Out of misses'
  if (record.status === 'gave-up') return 'Gave up'
  return OUTCOMES[Math.min(Math.max(record.strokes - record.par, 0), 3)]
}

export function computeStats(results: Record<string, ResultRecord>, today: string): Stats {
  const records = Object.values(results).filter(record => record.date <= today)
  const wins = records.filter(record => record.status === 'won')
  const won = new Set(wins.map(record => dayNumber(record.date)))

  let maxStreak = 0
  for (const day of won) {
    if (won.has(day - 1)) continue
    let length = 1
    while (won.has(day + length)) length++
    maxStreak = Math.max(maxStreak, length)
  }
  // An unfinished today doesn't break the streak; it still counts back from yesterday.
  let cursor = dayNumber(today)
  if (!results[today]) cursor--
  let currentStreak = 0
  while (won.has(cursor)) {
    currentStreak++
    cursor--
  }

  const counts = new Map<string, number>(OUTCOMES.map(label => [label, 0]))
  for (const record of records) counts.set(outcome(record), counts.get(outcome(record))! + 1)
  return {
    played: records.length,
    wins: wins.length,
    winRate: records.length ? Math.round((wins.length / records.length) * 100) : 0,
    currentStreak,
    maxStreak,
    distribution: OUTCOMES.map(label => ({ label, count: counts.get(label)! })),
  }
}

/** Spoiler-free result: link count, outcome, and misses, but no player names. */
export function shareText(puzzle: Puzzle, state: GameState, url: string): string {
  const links = '🟩'.repeat(state.chain.length)
  const route = state.status === 'won' ? `🟢${links}🏁` : `🟢${links}${state.status === 'lost' ? '❌' : '🏳️'}`
  const result = state.status === 'won' ? `${golfScore(state.chain.length, puzzle.par)} · ${state.chain.length} ${state.chain.length === 1 ? 'link' : 'links'}`
    : state.status === 'lost' ? 'Out of misses' : 'Gave up'
  return [
    `Six Degrees #${puzzle.number} · Par ${puzzle.par}`,
    `${route} ${result}`,
    `Misses ${'✖️'.repeat(state.misses)}${'▫️'.repeat(3 - state.misses)}`,
    url,
  ].join('\n')
}

export function loadResults(raw: string | null): Record<string, ResultRecord> {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const valid: Record<string, ResultRecord> = {}
    for (const [date, record] of Object.entries(parsed)) {
      const r = record as Partial<ResultRecord>
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && r.date === date && Number.isInteger(r.strokes) && Number.isInteger(r.par)
        && Number.isInteger(r.misses) && (r.status === 'won' || r.status === 'lost' || r.status === 'gave-up')) {
        valid[date] = r as ResultRecord
      }
    }
    return valid
  } catch {
    return {}
  }
}
