export interface Player {
  id: string
  name: string
  position: string
  number: number
  firstSeason: number
  lastSeason: number
  teams: string[]
}

export interface Connection {
  team: string
  season: number
  weeks: number
}

export interface Edge {
  players: [string, string]
  connections: Connection[]
}

export interface Dataset {
  version: string
  players: Player[]
  edges: Edge[]
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