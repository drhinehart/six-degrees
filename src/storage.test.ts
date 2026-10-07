import { beforeEach, describe, expect, it } from 'vitest'
import { dailyDemo, demo, graph } from './fixtures/demo'
import { enterPlayer, newGame } from './game'
import { loadProgress, progressKey, saveProgress } from './storage'

const puzzle = dailyDemo('2026-10-06')
const values = new Map<string, string>()
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }

beforeEach(() => values.clear())

describe('local progress', () => {
  it('restores a chain and its misses after a refresh', () => {
    let state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    state = enterPlayer(state, 'demo-rodgers', puzzle, graph).state
    expect(saveProgress(state, puzzle, demo.version, storage)).toBe(true)
    expect(loadProgress(puzzle, demo.version, graph, storage)).toEqual(state)
    expect(loadProgress(dailyDemo('2026-10-07'), demo.version, graph, storage)).toEqual(newGame())
  })

  it('keeps one completion per day for future statistics', () => {
    let state = enterPlayer(newGame(), 'demo-gronk', puzzle, graph).state
    state = enterPlayer(state, 'demo-mccoy', puzzle, graph).state
    saveProgress(state, puzzle, demo.version, storage)
    saveProgress(state, puzzle, demo.version, storage)
    expect(loadProgress(puzzle, demo.version, graph, storage)).toEqual(state)
    expect(Object.keys(JSON.parse(values.get(`six-degrees:${demo.version}:results`)!))).toEqual([puzzle.date])
  })

  it('recovers from corrupt JSON and impossible saved chains', () => {
    const key = progressKey(puzzle, demo.version)
    values.set(key, '{broken')
    expect(loadProgress(puzzle, demo.version, graph, storage)).toEqual(newGame())
    values.set(key, JSON.stringify({ ...puzzle, state: { chain: ['demo-rodgers'], misses: 0, status: 'playing' } }))
    expect(loadProgress(puzzle, demo.version, graph, storage)).toEqual(newGame())
  })

  it('reports unavailable storage without blocking play', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadProgress(puzzle, demo.version, graph, blocked)).toEqual(newGame())
    expect(saveProgress(newGame(), puzzle, demo.version, blocked)).toBe(false)
  })
})