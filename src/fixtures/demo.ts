// Synthetic test fixture in the generated-data file format. Not real NFL roster data.
import { buildGameData } from '../data'
import type { Manifest, Player, PlayersFile, PuzzlesFile, RosterKey, RostersFile } from '../types'

const player = (id: string, name: string, number: number | null, position: string, firstSeason: number, lastSeason: number): Player => ({
  id: `demo-${id}`, name, number, position, firstSeason, lastSeason, teams: [], rosterWeeks: 0,
})

const version = 'synthetic-v1'

export const playersFile: PlayersFile = {
  version,
  players: [
    player('brady', 'Tom Brady', 12, 'QB', 2000, 2022),
    player('mahomes', 'Patrick Mahomes', 15, 'QB', 2017, 2025),
    player('gronk', 'Rob Gronkowski', 87, 'TE', 2010, 2021),
    player('mccoy', 'LeSean McCoy', 25, 'RB', 2009, 2020),
    player('moss', 'Randy Moss', 84, 'WR', 1998, 2012),
    player('welker', 'Wes Welker', 83, 'WR', 2004, 2015),
    player('thomas', 'Demaryius Thomas', 88, 'WR', 2010, 2019),
    player('manning', 'Peyton Manning', 18, 'QB', 1998, 2015),
    player('wayne', 'Reggie Wayne', 87, 'WR', 2001, 2014),
    player('kelce', 'Travis Kelce', 87, 'TE', 2013, 2025),
    player('hill', 'Tyreek Hill', 10, 'WR', 2016, 2025),
    player('rodgers', 'Aaron Rodgers', 12, 'QB', 2005, 2025),
    player('williams-sea', 'Mike Williams', 17, 'WR', 2005, 2011),
    player('williams-lac', 'Mike Williams', null, 'WR', 2017, 2025),
  ],
}

// Each pair shares `weeks` regular-season weeks on its own team-season, so no unintended links appear.
const links: [string, string, string, number, number][] = [
  ['brady', 'gronk', 'NE', 2015, 16], ['gronk', 'mccoy', 'TB', 2020, 17], ['mccoy', 'mahomes', 'KC', 2019, 16],
  ['brady', 'moss', 'NE', 2007, 16], ['moss', 'welker', 'NE', 2008, 16], ['welker', 'thomas', 'DEN', 2013, 16],
  ['thomas', 'mccoy', 'ARZ', 2014, 8], ['thomas', 'manning', 'DEN', 2014, 16], ['manning', 'wayne', 'IND', 2009, 16],
  ['mahomes', 'kelce', 'KC', 2022, 18], ['kelce', 'hill', 'KC', 2021, 18],
]

function buildRosters(): RostersFile {
  const teams = [...new Set(links.map(link => link[2]))].sort()
  const rosterKeys: RosterKey[] = []
  const memberships = playersFile.players.map(() => [] as number[])
  const indexOf = (id: string) => playersFile.players.findIndex(candidate => candidate.id === `demo-${id}`)
  for (const [first, second, team, season, weeks] of links) {
    for (let week = 1; week <= weeks; week++) {
      const key = rosterKeys.push([teams.indexOf(team), season, 'REG', week]) - 1
      memberships[indexOf(first)].push(key)
      memberships[indexOf(second)].push(key)
    }
  }
  memberships.forEach(row => row.sort((a, b) => a - b))
  return { version, teams: teams.map(id => ({ id, name: id })), rosterKeys, playerMemberships: memberships }
}

export const rostersFile = buildRosters()

const ids = (...names: string[]) => names.map(name => `demo-${name}`)
const record = (number: number, path: string[]) => ({ number, start: path[0], end: path.at(-1)!, par: path.length - 2, path })

export const puzzlesFile: PuzzlesFile = {
  version,
  puzzles: {
    '2026-10-06': record(1, ids('brady', 'gronk', 'mccoy', 'mahomes')),
    '2026-10-07': record(2, ids('wayne', 'manning', 'thomas', 'welker')),
    '2026-10-08': record(3, ids('moss', 'brady', 'gronk', 'mccoy', 'mahomes', 'kelce')),
  },
}

export const manifest: Manifest = {
  version, source: 'synthetic', license: 'none', licenseUrl: '', seasons: { first: 2002, last: 2025 },
}

export const demo = buildGameData(manifest, playersFile, rostersFile, puzzlesFile)
