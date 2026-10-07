import type { Connection, Dataset, GameState, Puzzle } from './types'

export class TeammateGraph {
  private neighbors = new Map<string, Map<string, Connection[]>>()

  constructor(dataset: Dataset) {
    for (const player of dataset.players) this.neighbors.set(player.id, new Map())
    for (const edge of dataset.edges) {
      const [first, second] = edge.players
      if (!this.neighbors.has(first) || !this.neighbors.has(second)) {
        throw new Error('Connection references an unknown player')
      }
      this.neighbors.get(first)!.set(second, edge.connections)
      this.neighbors.get(second)!.set(first, edge.connections)
    }
  }

  connection(first: string, second: string): Connection[] | undefined {
    return this.neighbors.get(first)?.get(second)
  }

  shortestPath(start: string, end: string): string[] | undefined {
    const queue = [start]
    const previous = new Map<string, string | null>([[start, null]])
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      if (current === end) {
        const path: string[] = []
        let cursor: string | null = end
        while (cursor !== null) {
          path.unshift(cursor)
          cursor = previous.get(cursor)!
        }
        return path
      }
      for (const neighbor of this.neighbors.get(current)?.keys() ?? []) {
        if (!previous.has(neighbor)) {
          previous.set(neighbor, current)
          queue.push(neighbor)
        }
      }
    }
    return undefined
  }
}

export function newGame(): GameState {
  return { chain: [], misses: 0, status: 'playing' }
}

export function enterPlayer(state: GameState, playerId: string, puzzle: Puzzle, graph: TeammateGraph): { state: GameState; message: string } {
  if (state.status !== 'playing') return { state, message: 'This puzzle is finished.' }
  if (playerId === puzzle.start || playerId === puzzle.end || state.chain.includes(playerId)) {
    return { state, message: 'Choose a new intermediate player.' }
  }
  const previous = state.chain.at(-1) ?? puzzle.start
  if (!graph.connection(previous, playerId)) {
    const misses = state.misses + 1
    return { state: { ...state, misses, status: misses === 3 ? 'lost' : 'playing' }, message: 'No shared roster. That counts as a miss.' }
  }
  const won = Boolean(graph.connection(playerId, puzzle.end))
  return {
    state: { ...state, chain: [...state.chain, playerId], status: won ? 'won' : 'playing' },
    message: won ? 'Connected! Puzzle solved.' : 'Shared roster confirmed.',
  }
}

export function undo(state: GameState): GameState {
  if (state.status !== 'playing' || !state.chain.length) return state
  return { ...state, chain: state.chain.slice(0, -1) }
}

export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'gave-up' } : state
}

export function golfScore(strokes: number, par: number): string {
  const difference = strokes - par
  if (difference === 0) return 'Par'
  if (difference === -1) return 'Birdie'
  if (difference === -2) return 'Eagle'
  if (difference < -2) return `${difference} under par`
  return ['Bogey', 'Double Bogey', 'Triple Bogey'][difference - 1] ?? `${difference} over par`
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}