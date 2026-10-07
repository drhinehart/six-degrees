import datetime as dt
import unittest

from build_data import build_graph, make_puzzles


def roster(player_id, name, team, week, *, season=2024, game_type="REG", status="ACT", number=10, position="WR"):
    return {
        "gsis_id": player_id, "full_name": name, "team": team, "week": week,
        "season": season, "game_type": game_type, "status": status,
        "jersey_number": number, "position": position,
    }


class RosterGraphTests(unittest.TestCase):
    def test_shared_roster_requires_same_team_season_phase_and_week(self):
        rows = [
            roster("a", "First Player", "NE", 1), roster("b", "Second Player", "NE", 1),
            roster("a", "First Player", "NE", 2), roster("c", "Third Player", "NE", 3),
            roster("b", "Second Player", "NE", 3), roster("c", "Third Player", "NE", 4),
            roster("a", "First Player", "NE", 4, game_type="WC"),
            roster("b", "Second Player", "NYJ", 1),
            roster("a", "First Player", "NE", 1, season=2023),
            roster("a", "First Player", "NE", 1, game_type="PRE"),
        ]
        players, teams, graph = build_graph(rows)
        lookup = {player["id"]: index for index, player in enumerate(players)}
        roster_keys = graph["rosterKeys"]
        team_indexes = {team["id"]: index for index, team in enumerate(teams)}
        def connections(first_id, second_id):
            common = set(graph["memberships"][lookup[first_id]]) & set(graph["memberships"][lookup[second_id]])
            counts = {}
            for roster_index in common:
                team_index, season, _game_type, _week = roster_keys[roster_index]
                key = (team_index, season)
                counts[key] = counts.get(key, 0) + 1
            return counts
        a, b, c = (lookup[player_id] for player_id in ("a", "b", "c"))
        self.assertEqual(connections("a", "b"), {(team_indexes["NE"], 2024): 1})
        self.assertEqual(connections("a", "c"), {})
        self.assertEqual(len(teams), 2)
        self.assertEqual(graph["players"][lookup["a"]]["rosterWeeks"], 4)

    def test_roster_statuses_are_not_used_to_drop_weekly_members(self):
        rows = [
            roster("a", "Player A", "NE", 1, status="TRD"),
            roster("b", "Player B", "NE", 1, status="CUT"),
            roster("c", "Player C", "NE", 1, status="RES"),
            roster("d", "Player D", "NE", 1, status="DEV"),
        ]
        players, _teams, graph = build_graph(rows)
        self.assertEqual(len(players), 4)
        self.assertEqual(len(graph["edges"]), 6)
        self.assertEqual(graph["membershipCount"], 4)

    def test_duplicate_rows_count_as_one_week_and_jersey_uses_frequency(self):
        rows = [
            roster("a", "Player A", "NE", 1, number=10),
            roster("a", "Player A", "NE", 1, number=10, status="CUT"),
            roster("a", "Player A", "NE", 1, number=10, status="TRD"),
            roster("a", "Player A", "NE", 2, number=11),
            roster("a", "Player A", "NE", 3, number=11),
            roster("b", "Player B", "NE", 1), roster("b", "Player B", "NE", 1, status="RES"),
        ]
        players, _teams, graph = build_graph(rows)
        self.assertEqual(players[0]["rosterWeeks"], 3)
        self.assertEqual(players[0]["number"], 11)
        self.assertEqual(graph["membershipCount"], 4)

    def test_missing_gsis_rows_are_excluded(self):
        players, _teams, graph = build_graph([roster("", "Unknown", "NE", 1)])
        self.assertEqual(players, [])
        self.assertEqual(graph["edges"], [])
        self.assertEqual(graph["missing_gsis_id"], 1)

    def test_jersey_ties_choose_lower_number_and_positions_choose_common_value(self):
        rows = [
            roster("a", "Player A", "NE", 1, number=12, position="QB"),
            roster("a", "Player A", "NE", 2, number=10, position="WR"),
        ]
        players, _teams, _graph = build_graph(rows)
        self.assertEqual(players[0]["number"], 10)
        self.assertEqual(players[0]["position"], "QB")


class PuzzleTests(unittest.TestCase):
    def test_puzzles_use_shortest_paths_and_report_intermediate_par(self):
        players = [
            {"id": str(index), "rosterWeeks": 40} for index in range(5)
        ]
        edges = [[index, index + 1, []] for index in range(4)]
        puzzles = make_puzzles(players, edges, dt.date(2026, 10, 6), days=1, min_roster_weeks=1)
        self.assertEqual(puzzles[0]["par"], len(puzzles[0]["path"]) - 2)
        self.assertIn(puzzles[0]["par"], (2, 3, 4))
        self.assertEqual(puzzles[0]["date"], "2026-10-06")

    def test_generation_is_reproducible_and_dates_are_consecutive(self):
        players = [{"id": str(index), "rosterWeeks": 50} for index in range(8)]
        edges = [[first, second, []] for first in range(8) for second in range(first + 1, 8) if second - first <= 2]
        first = make_puzzles(players, edges, dt.date(2026, 1, 1), days=2, seed=12, min_roster_weeks=1)
        second = make_puzzles(players, edges, dt.date(2026, 1, 1), days=2, seed=12, min_roster_weeks=1)
        self.assertEqual(first, second)
        self.assertEqual([puzzle["date"] for puzzle in first], ["2026-01-01", "2026-01-02"])

    def test_available_difficulty_bands_are_balanced(self):
        players = [{"id": str(index), "rosterWeeks": 50} for index in range(12)]
        edges = [[first, second, []] for first in range(12) for second in range(first + 1, 12) if second - first <= 2]
        puzzles = make_puzzles(players, edges, dt.date(2026, 1, 1), days=9, seed=12, min_roster_weeks=1)
        counts = {par: sum(puzzle["par"] == par for puzzle in puzzles) for par in (2, 3, 4)}
        self.assertLessEqual(max(counts.values()) - min(count for count in counts.values() if count), 1)


if __name__ == "__main__":
    unittest.main()