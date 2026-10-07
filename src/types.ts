export interface Player {
  id: string
  name: string
  position: string
  number: number | null
  firstSeason: number
  lastSeason: number
  teams: string[]
  rosterWeeks: number
}

export interface Connection {
  team: string
  season: number
  weeks: number
}

export type RosterKey = [teamIndex: number, season: number, gameType: string, week: number]

export interface PlayersFile {
  version: string
  players: Player[]
}

export interface RostersFile {
  version: string
  teams: { id: string; name: string }[]
  rosterKeys: RosterKey[]
  playerMemberships: number[][]
}

export interface PuzzleRecord {
  number: number
  start: string
  end: string
  par: number
  path: string[]
}

export interface PuzzlesFile {
  version: string
  puzzles: Record<string, PuzzleRecord>
}

export interface Manifest {
  version: string
  source: string
  license: string
  licenseUrl: string
  seasons: { first: number; last: number }
}

export interface Puzzle {
  date: string
  number: number
  start: string
  end: string
  par: number
  optimalPath: string[]
}

export interface GameState {
  chain: string[]
  misses: number
  status: 'playing' | 'won' | 'lost' | 'gave-up'
}
