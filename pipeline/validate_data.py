#!/usr/bin/env python3
"""Independently check the generated Six Degrees JSON against itself and the cached nflverse source."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable

GAME_TYPES = {"REG", "WC", "DIV", "CON", "SB", "POST", "POSTSEASON"}
MAX_REPORTED = 20


class Report:
    def __init__(self) -> None:
        self.errors: dict[str, list[str]] = defaultdict(list)
        self.passed: list[str] = []

    def fail(self, check: str, message: str) -> None:
        self.errors[check].append(message)

    def check(self, name: str, errors_before: int) -> None:
        if self.error_count() == errors_before:
            self.passed.append(name)

    def error_count(self) -> int:
        return sum(map(len, self.errors.values()))


def load(data_dir: Path) -> dict[str, dict]:
    return {name: json.loads((data_dir / f"{name}.json").read_text(encoding="utf-8")) for name in ("players", "rosters", "puzzles", "manifest")}


def check_structure(data: dict[str, dict], report: Report) -> None:
    before = report.error_count()
    players = data["players"]["players"]
    rosters = data["rosters"]
    manifest = data["manifest"]
    versions = {name: data[name].get("version") for name in data}
    if len(set(versions.values())) != 1:
        report.fail("structure", f"version mismatch: {versions}")

    ids = [player["id"] for player in players]
    if ids != sorted(ids) or len(set(ids)) != len(ids):
        report.fail("structure", "player ids are not sorted and unique")
    if len(rosters["playerMemberships"]) != len(players):
        report.fail("structure", f"{len(rosters['playerMemberships'])} membership rows for {len(players)} players")

    keys = [tuple(key) for key in rosters["rosterKeys"]]
    if len(set(keys)) != len(keys):
        report.fail("structure", "duplicate roster keys")
    first, last = manifest["seasons"]["first"], manifest["seasons"]["last"]
    for index, (team, season, game_type, week) in enumerate(keys):
        if not 0 <= team < len(rosters["teams"]) or not first <= season <= last or game_type not in GAME_TYPES or week < 1:
            report.fail("structure", f"roster key {index} is invalid: {keys[index]}")

    used = set()
    for player, row in zip(players, rosters["playerMemberships"]):
        if not row:
            report.fail("structure", f"{player['id']} has no roster weeks")
            continue
        if row != sorted(set(row)) or row[0] < 0 or row[-1] >= len(keys):
            report.fail("structure", f"{player['id']} membership row is not sorted, unique, and in range")
            continue
        used.update(row)
        seasons = [keys[index][1] for index in row]
        teams = sorted({rosters["teams"][keys[index][0]]["id"] for index in row})
        if player["rosterWeeks"] != len(row):
            report.fail("structure", f"{player['id']} rosterWeeks {player['rosterWeeks']} != {len(row)}")
        if (player["firstSeason"], player["lastSeason"]) != (min(seasons), max(seasons)):
            report.fail("structure", f"{player['id']} active years do not match memberships")
        if player["teams"] != teams:
            report.fail("structure", f"{player['id']} teams {player['teams']} != {teams}")
        if not player["name"].strip():
            report.fail("structure", f"{player['id']} has an empty name")
        if player["number"] is not None and not 0 <= player["number"] <= 99:
            report.fail("structure", f"{player['id']} has jersey number {player['number']}")
    if len(used) != len(keys):
        report.fail("structure", f"{len(keys) - len(used)} roster keys have no members")

    counts = manifest["counts"]
    if counts["players"] != len(players) or counts["teams"] != len(rosters["teams"]):
        report.fail("structure", f"manifest counts {counts} do not match files")
    report.check("structure: versions, ordering, memberships, derived player fields, manifest counts", before)


def source_memberships(rows: Iterable[dict]) -> tuple[set[tuple], dict[str, dict[str, set]]]:
    """Rebuild (gsis, team, season, game_type, week) memberships and observed attributes from raw rows."""
    memberships = set()
    observed: dict[str, dict[str, set]] = defaultdict(lambda: {"names": set(), "numbers": set(), "positions": set()})
    for row in rows:
        game_type = (row.get("game_type") or "").strip().upper()
        player_id = (row.get("gsis_id") or "").strip()
        team = (row.get("team") or "").strip().upper()
        name = " ".join((row.get("full_name") or "").split()) or " ".join(
            part for part in ((row.get("first_name") or "").strip(), (row.get("last_name") or "").strip()) if part)
        try:
            season, week = int(row["season"]), int(row["week"])
        except (KeyError, TypeError, ValueError):
            continue
        if game_type not in GAME_TYPES or not player_id or not team or not name:
            continue
        memberships.add((player_id, team, season, game_type, week))
        attributes = observed[player_id]
        attributes["names"].add(name)
        if (row.get("position") or "").strip():
            attributes["positions"].add(row["position"].strip().upper())
        try:
            number = int(row.get("jersey_number") or "")
            if 0 <= number <= 99:
                attributes["numbers"].add(number)
        except ValueError:
            pass
    return memberships, observed


def check_source(data: dict[str, dict], rows: Iterable[dict], report: Report) -> None:
    before = report.error_count()
    expected, observed = source_memberships(rows)
    players = data["players"]["players"]
    rosters = data["rosters"]
    teams = [team["id"] for team in rosters["teams"]]
    keys = rosters["rosterKeys"]
    actual = {
        (player["id"], teams[keys[index][0]], keys[index][1], keys[index][2], keys[index][3])
        for player, row in zip(players, rosters["playerMemberships"]) for index in row
    }
    for label, difference in (("missing from JSON", expected - actual), ("not in source", actual - expected)):
        if difference:
            report.fail("source", f"{len(difference)} memberships {label}, e.g. {sorted(difference)[:3]}")
    if {player["id"] for player in players} != set(observed):
        report.fail("source", "player id set differs from source")
    for player in players:
        seen = observed.get(player["id"])
        if not seen:
            continue
        if player["name"] not in seen["names"]:
            report.fail("source", f"{player['id']} name {player['name']!r} not in source names {seen['names']}")
        if (player["number"] is None) != (not seen["numbers"]) or (player["number"] is not None and player["number"] not in seen["numbers"]):
            report.fail("source", f"{player['id']} number {player['number']} not consistent with source {seen['numbers']}")
        if player["position"] and player["position"] not in seen["positions"]:
            report.fail("source", f"{player['id']} position {player['position']} not in source")
    print(f"  source rows rebuilt into {len(expected):,} memberships")
    report.check("source: every membership, player id, name, number, and position matches the nflverse CSVs", before)


def edge_count(rosters: dict) -> int:
    members: dict[int, list[int]] = defaultdict(list)
    for player_index, row in enumerate(rosters["playerMemberships"]):
        for key in row:
            members[key].append(player_index)
    pairs = set()
    total = len(rosters["playerMemberships"])
    for group in members.values():
        group.sort()
        for position, first in enumerate(group):
            base = first * total
            pairs.update(base + second for second in group[position + 1:])
    return len(pairs)


def distance(start: int, end: int, memberships: list[list[int]], members: dict[int, list[int]], limit: int) -> int | None:
    """Breadth-first distance in player edges, searching no deeper than limit."""
    if start == end:
        return 0
    seen_players = {start}
    seen_keys: set[int] = set()
    frontier = [start]
    for depth in range(1, limit + 1):
        next_frontier = []
        for player in frontier:
            for key in memberships[player]:
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                for neighbor in members[key]:
                    if neighbor == end:
                        return depth
                    if neighbor not in seen_players:
                        seen_players.add(neighbor)
                        next_frontier.append(neighbor)
        frontier = next_frontier
    return None


def check_puzzles(data: dict[str, dict], report: Report) -> None:
    before = report.error_count()
    players = data["players"]["players"]
    memberships = data["rosters"]["playerMemberships"]
    indexes = {player["id"]: index for index, player in enumerate(players)}
    members: dict[int, list[int]] = defaultdict(list)
    for player_index, row in enumerate(memberships):
        for key in row:
            members[key].append(player_index)
    settings = data["manifest"]["puzzles"]
    puzzles = data["puzzles"]["puzzles"]
    start_date = dt.date.fromisoformat(settings["startDate"])
    expected_dates = [(start_date + dt.timedelta(days=offset)).isoformat() for offset in range(settings["days"])]
    if list(puzzles) != expected_dates:
        report.fail("puzzles", f"dates are not the {settings['days']} consecutive days from {settings['startDate']}")

    pairs = set()
    by_par: dict[int, int] = defaultdict(int)
    for number, (date, puzzle) in enumerate(puzzles.items(), start=1):
        path = puzzle["path"]
        label = f"{date} #{puzzle['number']}"
        if puzzle["number"] != number:
            report.fail("puzzles", f"{label} should be number {number}")
        if any(player_id not in indexes for player_id in path):
            report.fail("puzzles", f"{label} references unknown players")
            continue
        if path[0] != puzzle["start"] or path[-1] != puzzle["end"] or len(set(path)) != len(path):
            report.fail("puzzles", f"{label} path endpoints or uniqueness are wrong")
        if puzzle["par"] != len(path) - 2:
            report.fail("puzzles", f"{label} par {puzzle['par']} != path intermediates {len(path) - 2}")
        for first, second in zip(path, path[1:]):
            if not set(memberships[indexes[first]]) & set(memberships[indexes[second]]):
                report.fail("puzzles", f"{label} path link {first} -> {second} shares no roster week")
        shortest = distance(indexes[puzzle["start"]], indexes[puzzle["end"]], memberships, members, len(path) - 1)
        if shortest != len(path) - 1:
            report.fail("puzzles", f"{label} shortest distance is {shortest}, path implies {len(path) - 1}")
        pair = frozenset((puzzle["start"], puzzle["end"]))
        if pair in pairs:
            report.fail("puzzles", f"{label} repeats an earlier endpoint pair")
        pairs.add(pair)
        by_par[puzzle["par"]] += 1
    if dict(by_par) != {int(par): count for par, count in data["manifest"]["counts"]["puzzlesByPar"].items()}:
        report.fail("puzzles", f"par counts {dict(by_par)} do not match manifest")
    report.check(f"puzzles: {len(puzzles)} dates, numbering, valid links, unique pairs, par is the true shortest", before)


def read_source(cache_dir: Path, first: int, last: int) -> Iterable[dict]:
    for season in range(first, last + 1):
        with (cache_dir / f"roster_weekly_{season}.csv").open("r", encoding="utf-8-sig", newline="") as source:
            yield from csv.DictReader(source)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("public/data"))
    parser.add_argument("--cache-dir", type=Path, default=Path("pipeline/.cache"))
    parser.add_argument("--skip-source", action="store_true", help="Skip the comparison with cached nflverse CSVs")
    args = parser.parse_args()

    data = load(args.data_dir)
    report = Report()
    print("Checking structure")
    check_structure(data, report)
    if report.errors:
        print("Structure errors prevent deeper checks")
    else:
        print("Checking edge count")
        before = report.error_count()
        edges = edge_count(data["rosters"])
        if edges != data["manifest"]["counts"]["edges"]:
            report.fail("edges", f"{edges:,} connected pairs, manifest says {data['manifest']['counts']['edges']:,}")
        report.check(f"edges: {edges:,} connected player pairs match manifest", before)
        print("Checking puzzles")
        check_puzzles(data, report)
        if not args.skip_source:
            print("Checking against nflverse source cache")
            seasons = data["manifest"]["seasons"]
            check_source(data, read_source(args.cache_dir, seasons["first"], seasons["last"]), report)

    for name in report.passed:
        print(f"PASS {name}")
    for check, messages in report.errors.items():
        print(f"FAIL {check}: {len(messages)} problem(s)")
        for message in messages[:MAX_REPORTED]:
            print(f"  - {message}")
    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
