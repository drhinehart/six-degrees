import { describe, expect, it } from 'vitest'
import { computeStats, loadResults, outcome, shareText } from './stats'
import type { ResultRecord } from './stats'
import type { Puzzle } from './types'

const record = (date: string, status: ResultRecord['status'], strokes = 2, par = 2): ResultRecord =>
  ({ date, number: 1, par, strokes, misses: status === 'lost' ? 3 : 0, status })
const results = (...records: ResultRecord[]) => Object.fromEntries(records.map(r => [r.date, r]))

describe('statistics', () => {
  it('counts consecutive daily wins and breaks streaks on losses and skipped days', () => {
    const history = results(
      record('2026-10-01', 'won'), record('2026-10-02', 'won'), record('2026-10-03', 'won'),
      record('2026-10-04', 'lost'),
      record('2026-10-05', 'won'), // 10-06 skipped
      record('2026-10-07', 'won', 3), record('2026-10-08', 'won', 4),
    )
    const stats = computeStats(history, '2026-10-08')
    expect(stats).toMatchObject({ played: 7, wins: 6, winRate: 86, currentStreak: 2, maxStreak: 3 })
    expect(stats.distribution).toEqual([
      { label: 'Par', count: 4 }, { label: 'Bogey', count: 1 }, { label: 'Double', count: 1 },
      { label: 'Triple+', count: 0 }, { label: 'Out of misses', count: 1 }, { label: 'Gave up', count: 0 },
    ])
  })

  it("keeps the streak alive until today's puzzle is finished", () => {
    const history = results(record('2026-10-06', 'won'), record('2026-10-07', 'won'))
    expect(computeStats(history, '2026-10-08').currentStreak).toBe(2)
    expect(computeStats({ ...history, ...results(record('2026-10-08', 'gave-up')) }, '2026-10-08').currentStreak).toBe(0)
    expect(computeStats(history, '2026-10-09').currentStreak).toBe(0)
  })

  it('crosses month and year boundaries and ignores future-dated records', () => {
    const history = results(record('2026-12-31', 'won'), record('2027-01-01', 'won'), record('2027-03-01', 'won'))
    expect(computeStats(history, '2027-01-01')).toMatchObject({ played: 2, currentStreak: 2, maxStreak: 2 })
    expect(computeStats({}, '2027-01-01')).toMatchObject({ played: 0, winRate: 0, currentStreak: 0, maxStreak: 0 })
  })

  it('buckets long solves as Triple+', () => {
    expect(outcome(record('2026-10-01', 'won', 9))).toBe('Triple+')
  })

  it('drops malformed saved results', () => {
    const raw = JSON.stringify({ ...results(record('2026-10-01', 'won')), '2026-10-02': { date: '2026-10-02', status: 'won' }, bad: 1 })
    expect(Object.keys(loadResults(raw))).toEqual(['2026-10-01'])
    expect(loadResults('{nope')).toEqual({})
    expect(loadResults('[]')).toEqual({})
  })
})

describe('share text', () => {
  const puzzle: Puzzle = { date: '2026-10-07', number: 2, start: 'a', end: 'b', par: 2, optimalPath: ['a', 'x', 'y', 'b'] }
  const url = 'https://example.test/six-degrees/'

  it('summarizes a win without naming players', () => {
    const text = shareText(puzzle, { chain: ['x', 'z', 'y'], misses: 1, status: 'won' }, url)
    expect(text).toBe('Six Degrees #2 · Par 2\n🟢🟩🟩🟩🏁 Bogey · 3 links\nMisses ✖️▫️▫️\nhttps://example.test/six-degrees/')
    expect(text).not.toMatch(/\bx\b|\by\b|\bz\b/)
  })

  it('marks losses and give-ups', () => {
    expect(shareText(puzzle, { chain: ['x'], misses: 3, status: 'lost' }, url).split('\n')[1]).toBe('🟢🟩❌ Out of misses')
    expect(shareText(puzzle, { chain: [], misses: 0, status: 'gave-up' }, url).split('\n')[1]).toBe('🟢🏳️ Gave up')
  })
})
