import { describe, expect, it } from 'vitest'
import { buildGameData, puzzleFor } from './data'
import { demo, manifest, playersFile, puzzlesFile, rostersFile } from './fixtures/demo'
import { enterPlayer, giveUp, golfScore, localDate, newGame, TeammateGraph, undo } from './game'
import type { Puzzle } from './types'

const graph = demo.graph
const daily = (date: string): Puzzle => {
  const lookup = puzzleFor(demo, date)
  if (lookup.kind !== 'puzzle') throw new Error(`no fixture puzzle for ${date}`)
  return lookup.puzzle
}
const puzzle = daily('2026-10-06')

describe('roster chain rules', () => {
  it('solves automatically when the new intermediate is a teammate of END', () => {
    const first = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    const solved = enterPlayer(first, 'demo-mccoy', puzzle, graph).state
    expect(solved.status).toBe('won')
    expect(solved.chain).toEqual(['demo-gronk', 'demo-mccoy'])
    expect(puzzle.par).toBe(2)
  })

  it('keeps invalid entries out of the chain and loses on the third miss', () => {
    let state = newGame()
    for (let attempt = 0; attempt < 3; attempt++) state = enterPlayer(state, 'demo-rodgers', puzzle, graph).state
    expect(state).toEqual({ chain: [], misses: 3, status: 'lost' })
    expect(enterPlayer(state, 'demo-gronk', puzzle, graph).state).toBe(state)
  })

  it('undo is free but does not erase a miss', () => {
    let state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    state = enterPlayer(state, 'demo-rodgers', puzzle, graph).state
    expect(undo(state)).toEqual({ chain: [], misses: 1, status: 'playing' })
  })

  it('rejects repeated players and endpoints without charging a miss', () => {
    const state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    for (const id of [puzzle.start, puzzle.end, 'demo-gronk']) expect(enterPlayer(state, id, puzzle, graph).state).toBe(state)
  })

  it('supports a longer solution and golf scoring', () => {
    let state = newGame()
    for (const id of ['demo-moss', 'demo-welker', 'demo-thomas', 'demo-mccoy']) state = enterPlayer(state, id, puzzle, graph).state
    expect(state.status).toBe('won')
    expect(golfScore(state.chain.length, puzzle.par)).toBe('Double Bogey')
    expect(golfScore(3, 2)).toBe('Bogey')
    expect(golfScore(2, 2)).toBe('Par')
  })

  it('freezes completed games and permits give-up', () => {
    const state = giveUp(newGame())
    expect(state.status).toBe('gave-up')
    expect(undo(state)).toBe(state)
    expect(giveUp(state)).toBe(state)
  })
})

describe('roster-week membership graph', () => {
  it('reports shared team-seasons symmetrically with week counts', () => {
    expect(graph.connection('demo-brady', 'demo-gronk')).toEqual([{ team: 'NE', season: 2015, weeks: 16 }])
    expect(graph.connection('demo-gronk', 'demo-brady')).toEqual(graph.connection('demo-brady', 'demo-gronk'))
  })

  it('shows legacy nflverse team codes under the standard abbreviation', () => {
    expect(graph.connection('demo-thomas', 'demo-mccoy')).toEqual([{ team: 'ARI', season: 2014, weeks: 8 }])
  })

  it('returns nothing for non-teammates, unknown players, and the same player', () => {
    expect(graph.connection('demo-brady', 'demo-rodgers')).toBeUndefined()
    expect(graph.connection('demo-brady', 'nobody')).toBeUndefined()
    expect(graph.connection('demo-brady', 'demo-brady')).toBeUndefined()
  })

  it('rejects membership rows that do not line up with the player list', () => {
    expect(() => new TeammateGraph(playersFile, { ...rostersFile, playerMemberships: [] })).toThrow()
  })
})

describe('daily puzzle data', () => {
  it('maps the stored path to the runtime puzzle shape', () => {
    expect(puzzle).toEqual({
      date: '2026-10-06', number: 1, start: 'demo-brady', end: 'demo-mahomes', par: 2,
      optimalPath: ['demo-brady', 'demo-gronk', 'demo-mccoy', 'demo-mahomes'],
    })
    expect(daily('2026-10-08').par).toBe(4)
    expect(localDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06')
  })

  it('reports dates outside the calendar instead of substituting a puzzle', () => {
    expect(puzzleFor(demo, '2026-10-05')).toEqual({ kind: 'before', firstDate: '2026-10-06' })
    expect(puzzleFor(demo, '2026-10-09')).toEqual({ kind: 'after', lastDate: '2026-10-08' })
    const gap = buildGameData(manifest, playersFile, rostersFile, {
      ...puzzlesFile, puzzles: { '2026-10-06': puzzlesFile.puzzles['2026-10-06'], '2026-10-08': puzzlesFile.puzzles['2026-10-08'] },
    })
    expect(puzzleFor(gap, '2026-10-07')).toEqual({ kind: 'missing' })
  })

  it('refuses mismatched builds and puzzles with unknown players', () => {
    expect(() => buildGameData(manifest, playersFile, { ...rostersFile, version: 'other' }, puzzlesFile)).toThrow(/different builds/)
    const broken = { ...puzzlesFile, puzzles: { '2026-10-06': { ...puzzlesFile.puzzles['2026-10-06'], end: 'nobody' } } }
    expect(() => buildGameData(manifest, playersFile, rostersFile, broken)).toThrow(/unknown player/)
  })
})

describe('player search', () => {
  it('ranks exact, prefix, then word matches and ignores punctuation and case', () => {
    expect(demo.search('tom brady').map(p => p.id)).toEqual(['demo-brady'])
    expect(demo.search('ma').map(p => p.name)).toEqual(['Patrick Mahomes', 'Peyton Manning', 'Demaryius Thomas'])
    expect(demo.search('r').map(p => p.name).slice(0, 3)).toEqual(['Randy Moss', 'Reggie Wayne', 'Rob Gronkowski'])
    expect(demo.search("LE'SEAN").map(p => p.id)).toEqual(['demo-mccoy'])
    expect(demo.search('   ')).toEqual([])
  })

  it('finds every same-name player for disambiguation', () => {
    expect(demo.exactMatches('mike williams').map(p => p.id).sort()).toEqual(['demo-williams-lac', 'demo-williams-sea'])
  })
})
