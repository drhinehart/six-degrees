import { enterPlayer, newGame } from './game'
import type { TeammateGraph } from './game'
import type { GameState, Puzzle } from './types'

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
      let results: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(storage.getItem(`six-degrees:${version}:results`) ?? '{}')
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) results = parsed
      } catch {
        results = {}
      }
      results[puzzle.date] = {
        date: puzzle.date, number: puzzle.number, par: puzzle.par,
        strokes: state.chain.length, misses: state.misses, status: state.status,
      }
      storage.setItem(`six-degrees:${version}:results`, JSON.stringify(results))
    }
    return true
  } catch {
    return false
  }
}