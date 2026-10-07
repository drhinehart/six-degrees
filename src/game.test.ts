import { describe, expect, it } from 'vitest'
import { demo, dailyDemo, graph } from './fixtures/demo'
import { enterPlayer, giveUp, golfScore, localDate, newGame, TeammateGraph, undo } from './game'

const puzzle = dailyDemo('2026-10-06')

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

  it('finds undirected shortest paths and handles disconnected players', () => {
    expect(graph.shortestPath(puzzle.end, puzzle.start)?.length).toBe(4)
    expect(graph.shortestPath('demo-brady', 'demo-rodgers')).toBeUndefined()
    expect(() => new TeammateGraph({ ...demo, edges: [{ players: ['missing', puzzle.start], connections: [] }] })).toThrow()
  })

  it('selects deterministic local-date puzzles with par 2-4', () => {
    expect(localDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06')
    expect(dailyDemo(puzzle.date)).toEqual(puzzle)
    for (let day = 6; day < 13; day++) {
      const daily = dailyDemo(`2026-10-${String(day).padStart(2, '0')}`)
      expect(daily.par).toBeGreaterThanOrEqual(2)
      expect(daily.par).toBeLessThanOrEqual(4)
    }
  })
})