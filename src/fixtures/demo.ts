import { dayNumber, localDate, TeammateGraph } from '../game'
import type { Dataset, Player, Puzzle } from '../types'

const player = (id: string, name: string, number: number, position: string, firstSeason: number, lastSeason: number): Player => ({
  id: `demo-${id}`, name, number, position, firstSeason, lastSeason, teams: [],
})

export const demo: Dataset = {
  version: 'synthetic-v1',
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
    player('williams-lac', 'Mike Williams', 81, 'WR', 2017, 2025),
  ],
  edges: [
    { players: ['demo-brady', 'demo-gronk'], connections: [{ team: 'Patriots', season: 2015, weeks: 16 }] },
    { players: ['demo-gronk', 'demo-mccoy'], connections: [{ team: 'Buccaneers', season: 2020, weeks: 17 }] },
    { players: ['demo-mccoy', 'demo-mahomes'], connections: [{ team: 'Chiefs', season: 2019, weeks: 16 }] },
    { players: ['demo-brady', 'demo-moss'], connections: [{ team: 'Patriots', season: 2007, weeks: 16 }] },
    { players: ['demo-moss', 'demo-welker'], connections: [{ team: 'Patriots', season: 2008, weeks: 16 }] },
    { players: ['demo-welker', 'demo-thomas'], connections: [{ team: 'Broncos', season: 2013, weeks: 16 }] },
    { players: ['demo-thomas', 'demo-mccoy'], connections: [{ team: 'Demo roster', season: 2014, weeks: 8 }] },
    { players: ['demo-thomas', 'demo-manning'], connections: [{ team: 'Broncos', season: 2014, weeks: 16 }] },
    { players: ['demo-manning', 'demo-wayne'], connections: [{ team: 'Colts', season: 2009, weeks: 16 }] },
    { players: ['demo-mahomes', 'demo-kelce'], connections: [{ team: 'Chiefs', season: 2022, weeks: 18 }] },
    { players: ['demo-kelce', 'demo-hill'], connections: [{ team: 'Chiefs', season: 2021, weeks: 18 }] },
  ],
}

export const graph = new TeammateGraph(demo)

const endpoints = [
  ['brady', 'mahomes'], ['wayne', 'welker'], ['manning', 'mahomes'],
  ['moss', 'kelce'], ['gronk', 'manning'], ['wayne', 'mccoy'], ['brady', 'hill'],
]

export function dailyDemo(date = localDate()): Puzzle {
  const offset = dayNumber(date) - dayNumber('2026-10-06')
  const [startName, endName] = endpoints[((offset % endpoints.length) + endpoints.length) % endpoints.length]
  const start = `demo-${startName}`
  const end = `demo-${endName}`
  const optimalPath = graph.shortestPath(start, end)!
  return { date, number: offset + 1, start, end, par: optimalPath.length - 2, optimalPath }
}