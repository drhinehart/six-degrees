import { TeammateGraph } from './game'
import type { Manifest, Player, PlayersFile, Puzzle, PuzzlesFile, RostersFile } from './types'

export interface GameData {
  version: string
  manifest: Manifest
  players: Player[]
  playersById: Map<string, Player>
  graph: TeammateGraph
  puzzles: PuzzlesFile['puzzles']
  firstDate: string
  lastDate: string
  search: (query: string, limit?: number) => Player[]
  exactMatches: (query: string) => Player[]
}

export type PuzzleLookup =
  | { kind: 'puzzle'; puzzle: Puzzle }
  | { kind: 'before'; firstDate: string }
  | { kind: 'after'; lastDate: string }
  | { kind: 'missing' }

type Fetcher = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export async function loadGameData(base = import.meta.env.BASE_URL, fetcher: Fetcher = url => fetch(url)): Promise<GameData> {
  const get = async <T>(name: string): Promise<T> => {
    const response = await fetcher(`${base}data/${name}.json`)
    if (!response.ok) throw new Error(`Could not load ${name}.json (HTTP ${response.status})`)
    return response.json() as Promise<T>
  }
  const [manifest, players, rosters, puzzles] = await Promise.all([
    get<Manifest>('manifest'), get<PlayersFile>('players'), get<RostersFile>('rosters'), get<PuzzlesFile>('puzzles'),
  ])
  return buildGameData(manifest, players, rosters, puzzles)
}

export function buildGameData(manifest: Manifest, players: PlayersFile, rosters: RostersFile, puzzles: PuzzlesFile): GameData {
  const versions = new Set([manifest.version, players.version, rosters.version, puzzles.version])
  if (versions.size !== 1) throw new Error('Game data files are from different builds. Reload to try again.')
  const playersById = new Map(players.players.map(player => [player.id, player]))
  const dates = Object.keys(puzzles.puzzles).sort()
  if (!dates.length) throw new Error('No puzzles are available.')
  for (const date of dates) {
    const { start, end, path } = puzzles.puzzles[date]
    if (![start, end, ...path].every(id => playersById.has(id))) throw new Error(`Puzzle ${date} references an unknown player.`)
  }
  const index = players.players.map(player => ({ player, name: normalize(player.name) }))
  return {
    version: manifest.version,
    manifest,
    players: players.players,
    playersById,
    graph: new TeammateGraph(players, rosters),
    puzzles: puzzles.puzzles,
    firstDate: dates[0],
    lastDate: dates.at(-1)!,
    search: (query, limit = 8) => searchPlayers(index, query, limit),
    exactMatches: query => {
      const name = normalize(query)
      return name ? index.filter(entry => entry.name === name).map(entry => entry.player) : []
    },
  }
}

export function puzzleFor(data: Pick<GameData, 'puzzles' | 'firstDate' | 'lastDate'>, date: string): PuzzleLookup {
  const record = data.puzzles[date]
  if (record) {
    const { path, ...rest } = record
    return { kind: 'puzzle', puzzle: { date, ...rest, optimalPath: path } }
  }
  if (date < data.firstDate) return { kind: 'before', firstDate: data.firstDate }
  if (date > data.lastDate) return { kind: 'after', lastDate: data.lastDate }
  return { kind: 'missing' }
}

/** Lowercase, strip accents and punctuation so "Ja'Marr" matches "jamarr" and "A.J." matches "aj". */
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, ' ').trim()
}

function searchPlayers(index: { player: Player; name: string }[], query: string, limit: number): Player[] {
  const needle = normalize(query)
  if (!needle) return []
  const ranked: { player: Player; rank: number }[] = []
  for (const entry of index) {
    const position = entry.name.indexOf(needle)
    if (position === -1) continue
    const rank = entry.name === needle ? 0 : position === 0 ? 1 : entry.name[position - 1] === ' ' ? 2 : 3
    ranked.push({ player: entry.player, rank })
  }
  // Within a rank, favor players with longer careers: they are the ones people are most likely typing.
  ranked.sort((a, b) => a.rank - b.rank || b.player.rosterWeeks - a.player.rosterWeeks || a.player.name.localeCompare(b.player.name))
  return ranked.slice(0, limit).map(entry => entry.player)
}
