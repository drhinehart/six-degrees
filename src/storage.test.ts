import { beforeEach, describe, expect, it } from 'vitest'
import { puzzleFor } from './data'
import { demo } from './fixtures/demo'
import { enterPlayer, newGame } from './game'
import { loadProgress, progressKey, RESULTS_KEY, saveProgress } from './storage'
import type { Puzzle } from './types'

const daily = (date: string): Puzzle => {
  const lookup = puzzleFor(demo, date)
  if (lookup.kind !== 'puzzle') throw new Error(`no fixture puzzle for ${date}`)
  return lookup.puzzle
}
const { graph, version } = demo
const puzzle = daily('2026-10-06')
const values = new Map<string, string>()
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }

beforeEach(() => values.clear())

describe('local progress', () => {
  it('restores a chain and its misses after a refresh', () => {
    let state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    state = enterPlayer(state, 'demo-rodgers', puzzle, graph).state
    expect(saveProgress(state, puzzle, version, storage)).toBe(true)
    expect(loadProgress(puzzle, version, graph, storage)).toEqual(state)
    expect(loadProgress(daily('2026-10-07'), version, graph, storage)).toEqual(newGame())
  })

  it('keeps one completion per day for future statistics', () => {
    let state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    state = enterPlayer(state, 'demo-mccoy', puzzle, graph).state
    saveProgress(state, puzzle, version, storage)
    saveProgress(state, puzzle, version, storage)
    expect(loadProgress(puzzle, version, graph, storage)).toEqual(state)
    expect(Object.keys(JSON.parse(values.get(RESULTS_KEY)!))).toEqual([puzzle.date])
  })

  it('recovers from corrupt JSON and impossible saved chains', () => {
    const key = progressKey(puzzle, version)
    values.set(key, '{broken')
    expect(loadProgress(puzzle, version, graph, storage)).toEqual(newGame())
    values.set(key, JSON.stringify({ ...puzzle, state: { chain: ['demo-rodgers'], misses: 0, status: 'playing' } }))
    expect(loadProgress(puzzle, version, graph, storage)).toEqual(newGame())
  })

  it('reports unavailable storage without blocking play', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadProgress(puzzle, version, graph, blocked)).toEqual(newGame())
    expect(saveProgress(newGame(), puzzle, version, blocked)).toBe(false)
  })
})
