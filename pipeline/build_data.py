#!/usr/bin/env python3
"""Build the static Six Degrees roster graph and daily puzzle files."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import itertools
import json
import random
import shutil
import urllib.request
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Iterable


DATA_URL = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.csv"
LICENSE_URL = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md"
SOURCE_URL = "https://github.com/nflverse/nflverse-data"
ROSTER_DOCS_URL = "https://nflreadr.nflverse.com/reference/load_rosters_weekly.html"
REGULAR_SEASON = {"REG"}
POSTSEASON = {"WC", "DIV", "CON", "SB", "POST", "POSTSEASON"}
IN_SEASON_GAME_TYPES = REGULAR_SEASON | POSTSEASON
PAR_EDGE_RANGE = range(3, 6)

TEAM_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills", "CAR": "Carolina Panthers", "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns", "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAC": "Jacksonville Jaguars",
    "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs", "LA": "Los Angeles Rams",
    "LAC": "Los Angeles Chargers", "LAR": "Los Angeles Rams", "LV": "Las Vegas Raiders",
    "MIA": "Miami Dolphins", "MIN": "Minnesota Vikings", "NE": "New England Patriots",
    "NO": "New Orleans Saints", "NYG": "New York Giants", "NYJ": "New York Jets",
    "OAK": "Oakland Raiders", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers",
    "SD": "San Diego Chargers", "SEA": "Seattle Seahawks", "SF": "San Francisco 49ers",
    "STL": "St. Louis Rams", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders", "WSH": "Washington Commanders",
}

ROSTER_COLUMNS = {
    "season", "team", "position", "jersey_number", "full_name", "first_name",
    "last_name", "gsis_id", "week", "game_type", "status",
}


def _integer(value: object) -> int | None:
    try:
        return int(value) if value is not None and str(value).strip() else None
    except (TypeError, ValueError):
        return None


def _name(row: dict) -> str:
    name = str(row.get("full_name") or "").strip()
    if name:
        return " ".join(name.split())
    return " ".join(part for part in (str(row.get("first_name") or "").strip(), str(row.get("last_name") or "").strip()) if part)


def build_graph(rows: Iterable[dict]) -> tuple[list[dict], list[dict], dict[str, int]]:
    """Normalize in-season weekly roster records into players and shared-week edges."""
    records: dict[str, dict] = {}
    weekly_rosters: dict[tuple[str, int, str, int], set[str]] = defaultdict(set)
    skipped = Counter()

    for row in rows:
        game_type = str(row.get("game_type") or "").strip().upper()
        if game_type not in IN_SEASON_GAME_TYPES:
            skipped["out_of_season_game_type"] += 1
            continue
        player_id = str(row.get("gsis_id") or "").strip()
        team = str(row.get("team") or "").strip().upper()
        season = _integer(row.get("season"))
        week = _integer(row.get("week"))
        name = _name(row)
        if not player_id:
            skipped["missing_gsis_id"] += 1
            continue
        if not team or season is None or week is None or not name:
            skipped["incomplete_roster_record"] += 1
            continue

        roster_key = (team, season, game_type, week)
        weekly_rosters[roster_key].add(player_id)
        player = records.setdefault(player_id, {
            "id": player_id, "name": name, "firstSeason": season, "lastSeason": season,
            "teams": set(), "rosterWeeks": set(), "weekAttributes": {},
        })
        player["firstSeason"] = min(player["firstSeason"], season)
        player["lastSeason"] = max(player["lastSeason"], season)
        player["teams"].add(team)
        player["rosterWeeks"].add(roster_key)
        attributes = player["weekAttributes"].setdefault(roster_key, {"positions": set(), "numbers": set()})
        position = str(row.get("position") or "").strip().upper()
        if position:
            attributes["positions"].add(position)
        number = _integer(row.get("jersey_number"))
        if number is not None and 0 <= number <= 99:
            attributes["numbers"].add(number)

    player_ids = sorted(records)
    player_indexes = {player_id: index for index, player_id in enumerate(player_ids)}
    players = []
    for player_id in player_ids:
        record = records[player_id]
        positions = Counter()
        numbers = Counter()
        for attributes in record["weekAttributes"].values():
            if attributes["positions"]:
                positions[min(attributes["positions"])] += 1
            if attributes["numbers"]:
                numbers[min(attributes["numbers"])] += 1
        position = min(positions, key=lambda item: (-positions[item], item)) if positions else ""
        number = min(numbers, key=lambda item: (-numbers[item], item)) if numbers else None
        players.append({
            "id": player_id,
            "name": record["name"],
            "position": position,
            "number": number,
            "firstSeason": record["firstSeason"],
            "lastSeason": record["lastSeason"],
            "teams": sorted(record["teams"]),
            "rosterWeeks": len(record["rosterWeeks"]),
        })

    shared_weeks: dict[tuple[int, int, str, int], int] = Counter()
    for (team, season, _game_type, _week), members in weekly_rosters.items():
        indexes = sorted(player_indexes[player_id] for player_id in members)
        for first, second in itertools.combinations(indexes, 2):
            shared_weeks[(first, second, team, season)] += 1

    teams = sorted({team for team, _season, _game_type, _week in weekly_rosters})
    team_indexes = {team: index for index, team in enumerate(teams)}
    roster_keys = sorted(weekly_rosters)
    roster_indexes = {key: index for index, key in enumerate(roster_keys)}
    memberships = [[] for _ in player_ids]
    for key, members in weekly_rosters.items():
        roster_index = roster_indexes[key]
        for player_id in members:
            memberships[player_indexes[player_id]].append(roster_index)
    for player_memberships in memberships:
        player_memberships.sort()

    by_pair: dict[tuple[int, int], list[list[int]]] = defaultdict(list)
    for (first, second, team, season), weeks in sorted(shared_weeks.items()):
        by_pair[(first, second)].append([team_indexes[team], season, weeks])
    edges = [[first, second, connections] for (first, second), connections in sorted(by_pair.items())]
    return players, [dict(id=team, name=TEAM_NAMES.get(team, team)) for team in teams], {
        "players": players,
        "edges": edges,
        "teams": teams,
        "rosterKeys": [[team_indexes[team], season, game_type, week] for team, season, game_type, week in roster_keys],
        "memberships": memberships,
        "membershipCount": sum(map(len, memberships)),
        **skipped,
    }


def _bfs_paths(adjacency: list[set[int]], start: int, maximum_depth: int = 5) -> dict[int, list[int]]:
    previous: dict[int, int | None] = {start: None}
    distance = {start: 0}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        if distance[current] == maximum_depth:
            continue
        for neighbor in sorted(adjacency[current]):
            if neighbor not in previous:
                previous[neighbor] = current
                distance[neighbor] = distance[current] + 1
                queue.append(neighbor)
    paths = {}
    for target, target_distance in distance.items():
        if target_distance not in PAR_EDGE_RANGE:
            continue
        path = [target]
        while path[-1] != start:
            path.append(previous[path[-1]])
        paths[target] = list(reversed(path))
    return paths


def make_puzzles(
    players: list[dict],
    edges: list[list],
    start_date: dt.date,
    days: int = 365,
    seed: int = 6_202_610,
    min_roster_weeks: int = 32,
    max_endpoints: int = 800,
) -> list[dict]:
    """Choose reproducible par-2-to-4 puzzles, balancing player appearances."""
    adjacency = [set() for _ in players]
    for first, second, _connections in edges:
        adjacency[first].add(second)
        adjacency[second].add(first)

    notable = [index for index, player in enumerate(players) if player["rosterWeeks"] >= min_roster_weeks]
    notable.sort(key=lambda index: (-players[index]["rosterWeeks"], players[index]["id"]))
    notable = notable[:max_endpoints]
    notable_set = set(notable)
    candidates = []
    for first in notable:
        for second, path in _bfs_paths(adjacency, first).items():
            if second in notable_set and second > first:
                candidates.append((first, second, path))
    if len(candidates) < days:
        raise ValueError(
            f"Only {len(candidates)} unique par-2-to-4 endpoint pairs found; {days} puzzles requested. "
            "Try lowering --min-roster-weeks or increasing --max-endpoints."
        )

    rng = random.Random(seed)
    pools = {par: [] for par in (2, 3, 4)}
    for candidate in candidates:
        pools[len(candidate[2]) - 2].append(candidate)
    for pool in pools.values():
        rng.shuffle(pool)
    print(f"Candidate endpoint pairs by par: { {par: len(pool) for par, pool in pools.items()} }")
    quotas = {par: 0 for par in pools}
    while sum(quotas.values()) < days:
        available = [par for par, pool in pools.items() if quotas[par] < len(pool)]
        if not available:
            raise ValueError("Not enough unique endpoint pairs to fill the requested puzzle calendar")
        selected_par = min(available, key=lambda par: (quotas[par], -len(pools[par]), par))
        quotas[selected_par] += 1

    endpoint_uses = Counter()
    path_uses = Counter()
    puzzles = []
    used_by_par = Counter()
    for day_offset in range(days):
        eligible_pars = [par for par, quota in quotas.items() if used_by_par[par] < quota]
        selected_par = min(eligible_pars, key=lambda par: (used_by_par[par] / quotas[par], -quotas[par], par))
        remaining = pools[selected_par]
        selected_position = min(
            range(len(remaining)),
            key=lambda index: (
                4 * (endpoint_uses[remaining[index][0]] + endpoint_uses[remaining[index][1]])
                + sum(path_uses[player] for player in remaining[index][2][1:-1]),
                index,
            ),
        )
        first, second, path = remaining.pop(selected_position)
        used_by_par[selected_par] += 1
        endpoint_uses[first] += 1
        endpoint_uses[second] += 1
        path_uses.update(path[1:-1])
        date = start_date + dt.timedelta(days=day_offset)
        puzzles.append({
            "date": date.isoformat(),
            "number": day_offset + 1,
            "start": players[first]["id"],
            "end": players[second]["id"],
            "par": len(path) - 2,
            "path": [players[index]["id"] for index in path],
        })
    return puzzles


def load_season(season: int, cache_dir: Path, offline: bool = False) -> Iterable[dict]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    source = cache_dir / f"roster_weekly_{season}.csv"
    if not source.exists():
        if offline:
            raise FileNotFoundError(f"Cached roster file not found: {source}")
        request = urllib.request.Request(DATA_URL.format(season=season), headers={"User-Agent": "six-degrees-data-builder/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, source.open("wb") as target:
                shutil.copyfileobj(response, target)
        except Exception:
            source.unlink(missing_ok=True)
            raise
    with source.open("r", encoding="utf-8-sig", newline="") as roster_file:
        reader = csv.DictReader(roster_file)
        missing_columns = ROSTER_COLUMNS - set(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Roster file {source} is missing columns: {', '.join(sorted(missing_columns))}")
        yield from reader


def write_json(path: Path, value: object) -> bytes:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded)
    return encoded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-season", type=int, default=2002)
    parser.add_argument("--end-season", type=int, default=dt.date.today().year - 1)
    parser.add_argument("--start-date", type=dt.date.fromisoformat, default=dt.date.today())
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--seed", type=int, default=6_202_610)
    parser.add_argument("--min-roster-weeks", type=int, default=32)
    parser.add_argument("--max-endpoints", type=int, default=800)
    parser.add_argument("--output-dir", type=Path, default=Path("public/data"))
    parser.add_argument("--cache-dir", type=Path, default=Path("pipeline/.cache"))
    parser.add_argument("--offline", action="store_true", help="Use only previously cached season files")
    args = parser.parse_args()
    if args.start_season < 2002 or args.end_season < args.start_season or args.days < 1:
        parser.error("seasons must be ordered and begin no earlier than 2002; --days must be positive")
    if args.min_roster_weeks < 1 or args.max_endpoints < 2:
        parser.error("--min-roster-weeks must be positive and --max-endpoints at least 2")

    def all_rows():
        for season in range(args.start_season, args.end_season + 1):
            print(f"Loading {season} roster data")
            yield from load_season(season, args.cache_dir, args.offline)

    players, teams, graph = build_graph(all_rows())
    edges = graph["edges"]
    print(f"Normalized {len(players):,} players, {len(edges):,} player pairs, {len(teams)} team codes")

    puzzles = make_puzzles(
        players, edges, args.start_date, args.days, args.seed,
        args.min_roster_weeks, args.max_endpoints,
    )
    par_distribution = dict(sorted(Counter(puzzle["par"] for puzzle in puzzles).items()))
    version = f"nflverse-roster-{args.start_season}-{args.end_season}-v1"
    manifest = {
        "schemaVersion": 1,
        "version": version,
        "source": SOURCE_URL,
        "sourceDocumentation": ROSTER_DOCS_URL,
        "license": "CC BY 4.0",
        "licenseUrl": LICENSE_URL,
        "attribution": "Data from nflverse. Weekly roster records filtered to regular/postseason weeks, deduplicated, and aggregated into shared-roster-week edges; player details and puzzles derived by Six Degrees.",
        "seasons": {"first": args.start_season, "last": args.end_season},
        "puzzles": {"startDate": args.start_date.isoformat(), "days": args.days, "seed": args.seed},
        "counts": {"players": len(players), "edges": len(edges), "teams": len(teams), "puzzlesByPar": par_distribution},
        "files": ["players.json", "rosters.json", "puzzles.json"],
    }
    payloads = {
        "players.json": {"version": version, "players": players},
        "rosters.json": {
            "version": version,
            "teams": teams,
            "rosterKeys": graph["rosterKeys"],
            "playerMemberships": graph["memberships"],
            "membershipFormat": "rosterKeys entries are [teamIndex,season,gameType,week]; playerMemberships is in players.json order and each row contains sorted rosterKeys indexes. Intersect two membership rows to establish connections and group by team/season for shared-week counts.",
        },
        "puzzles.json": {"version": version, "puzzles": {puzzle["date"]: {key: value for key, value in puzzle.items() if key != "date"} for puzzle in puzzles}},
        "manifest.json": manifest,
    }
    sizes = []
    for filename, payload in payloads.items():
        data = write_json(args.output_dir / filename, payload)
        compressed_size = len(gzip.compress(data, compresslevel=9))
        sizes.append((filename, len(data), compressed_size))
    print(f"Generated {len(puzzles)} puzzles from {puzzles[0]['date']} through {puzzles[-1]['date']}; par range 2-4")
    print(f"Puzzle counts by par: {par_distribution}")
    print("File sizes (JSON / gzip):")
    for filename, raw_size, compressed_size in sizes:
        print(f"  {filename}: {raw_size:,} / {compressed_size:,} bytes")
    print(f"  TOTAL: {sum(size for _, size, _ in sizes):,} / {sum(size for _, _, size in sizes):,} bytes")
    endpoint_appearances = Counter(player_id for puzzle in puzzles for player_id in (puzzle["start"], puzzle["end"]))
    print(f"Max endpoint appearances: {max(endpoint_appearances.values())}")


if __name__ == "__main__":
    main()