import type { Connection, GameState, PlayersFile, Puzzle, RostersFile } from './types'

// nflverse used these codes for 2002–2015 and the standard ones afterwards; seasons never overlap.
const TEAM_ALIASES: Record<string, string> = { ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', SL: 'STL' }

export function displayTeam(code: string): string {
  return TEAM_ALIASES[code] ?? code
}

/** Teammate checks by intersecting each player's sorted roster-week memberships; no pair list is built. */
export class TeammateGraph {
  private indexes = new Map<string, number>()
  private rosters: RostersFile

  constructor(players: PlayersFile, rosters: RostersFile) {
    this.rosters = rosters
    if (rosters.playerMemberships.length !== players.players.length) {
      throw new Error('Roster memberships do not match the player list')
    }
    players.players.forEach((player, index) => this.indexes.set(player.id, index))
  }

  connection(first: string, second: string): Connection[] | undefined {
    const firstIndex = this.indexes.get(first)
    const secondIndex = this.indexes.get(second)
    if (firstIndex === undefined || secondIndex === undefined || first === second) return undefined
    const a = this.rosters.playerMemberships[firstIndex]
    const b = this.rosters.playerMemberships[secondIndex]
    const weeks = new Map<string, Connection>()
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] < b[j]) i++
      else if (a[i] > b[j]) j++
      else {
        const [teamIndex, season] = this.rosters.rosterKeys[a[i]]
        const team = displayTeam(this.rosters.teams[teamIndex].id)
        const key = `${season}:${team}`
        const connection = weeks.get(key) ?? { team, season, weeks: 0 }
        connection.weeks++
        weeks.set(key, connection)
        i++
        j++
      }
    }
    if (!weeks.size) return undefined
    return [...weeks.values()].sort((x, y) => x.season - y.season || x.team.localeCompare(y.team))
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