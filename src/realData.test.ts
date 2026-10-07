import { describe, expect, it } from 'vitest'
import manifestJson from '../public/data/manifest.json?raw'
import playersJson from '../public/data/players.json?raw'
import puzzlesJson from '../public/data/puzzles.json?raw'
import rostersJson from '../public/data/rosters.json?raw'
import { buildGameData, puzzleFor } from './data'
import { enterPlayer, newGame } from './game'

// Plays every generated puzzle through the same code the browser runs. Python's validate_data.py separately
// checks the files against the nflverse source and proves each par is a true shortest path.
const data = buildGameData(JSON.parse(manifestJson), JSON.parse(playersJson), JSON.parse(rostersJson), JSON.parse(puzzlesJson))
const dates = Object.keys(data.puzzles).sort()

describe('generated production data', () => {
  it(`solves all ${dates.length} puzzles at exactly par by following the stored path`, () => {
    expect(dates.length).toBe(365)
    for (const date of dates) {
      const lookup = puzzleFor(data, date)
      if (lookup.kind !== 'puzzle') throw new Error(`${date}: ${lookup.kind}`)
      const { puzzle } = lookup
      let state = newGame()
      for (const [index, id] of puzzle.optimalPath.slice(1, -1).entries()) {
        state = enterPlayer(state, id, puzzle, data.graph).state
        expect(state.misses, `${date} link ${index + 1}`).toBe(0)
        expect(state.status, `${date} after link ${index + 1}`).toBe(index === puzzle.par - 1 ? 'won' : 'playing')
      }
      for (const [first, second] of puzzle.optimalPath.slice(1).map((id, i) => [puzzle.optimalPath[i], id])) {
        expect(data.graph.connection(first, second)?.every(c => c.weeks > 0), `${date} ${first}->${second}`).toBe(true)
      }
    }
  })

  it('never shows legacy team codes and reports dates outside the calendar', () => {
    const shown = new Set<string>()
    for (const { path } of Object.values(data.puzzles)) {
      for (let i = 1; i < path.length; i++) data.graph.connection(path[i - 1], path[i])!.forEach(c => shown.add(c.team))
    }
    expect([...shown].filter(team => ['ARZ', 'BLT', 'CLV', 'HST', 'SL'].includes(team))).toEqual([])
    expect(shown.size).toBeGreaterThan(20)
    expect(puzzleFor(data, '2026-10-05').kind).toBe('before')
    expect(puzzleFor(data, '2027-10-06').kind).toBe('after')
  })

  it('finds well-known players by name', () => {
    expect(data.search('tom brady')[0]?.name).toBe('Tom Brady')
    expect(data.search('mahomes')[0]?.name).toBe('Patrick Mahomes')
  })
})
