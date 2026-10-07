import { enterPlayer, newGame } from './game'
import type { TeammateGraph } from './game'
import { loadResults } from './stats'
import type { GameState, Puzzle } from './types'

// Completed results outlive data versions so stats and streaks survive regenerated data.
export const RESULTS_KEY = 'six-degrees:results'

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

export function progressKey(puzzle: Puzzle, version: string): string {
  return `six-degrees:${version}:${puzzle.date}`
}

export function loadProgress(puzzle: Puzzle, version: string, graph: TeammateGraph, storage: StorageAccess): GameState {
  try {
    const raw = storage.getItem(progressKey(puzzle, version))
    if (!raw) return newGame()
    const saved = JSON.parse(raw)
    if (saved.start !== puzzle.start || saved.end !== puzzle.end || saved.par !== puzzle.par) return newGame()
    const state = saved.state
    if (!state || !Array.isArray(state.chain) || !Number.isInteger(state.misses) || state.misses < 0 || state.misses > 3) return newGame()
    let replay = newGame()
    for (const id of state.chain) {
      if (typeof id !== 'string') return newGame()
      const next = enterPlayer(replay, id, puzzle, graph).state
      if (next.chain.length !== replay.chain.length + 1) return newGame()
      replay = next
    }
    if (state.status === 'won' && replay.status !== 'won') return newGame()
    if (state.status !== 'won' && replay.status === 'won') return newGame()
    if (state.status === 'lost' && state.misses !== 3) return newGame()
    if (state.status !== 'lost' && state.misses === 3) return newGame()
    if (!['playing', 'won', 'lost', 'gave-up'].includes(state.status)) return newGame()
    return { chain: replay.chain, misses: state.misses, status: state.status }
  } catch {
    return newGame()
  }
}

export function saveProgress(state: GameState, puzzle: Puzzle, version: string, storage: StorageAccess): boolean {
  try {
    storage.setItem(progressKey(puzzle, version), JSON.stringify({ start: puzzle.start, end: puzzle.end, par: puzzle.par, state }))
    if (state.status !== 'playing') {
      const results = loadResults(storage.getItem(RESULTS_KEY))
      results[puzzle.date] = {
        date: puzzle.date, number: puzzle.number, par: puzzle.par,
        strokes: state.chain.length, misses: state.misses, status: state.status,
      }
      storage.setItem(RESULTS_KEY, JSON.stringify(results))
    }
    return true
  } catch {
    return false
  }
}