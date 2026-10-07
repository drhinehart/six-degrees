import copy
import unittest

from build_data import build_graph
from test_build_data import roster
from validate_data import Report, check_puzzles, check_source, check_structure


ROWS = [
    roster("a", "Alpha", "NE", 1), roster("b", "Bravo", "NE", 1),
    roster("b", "Bravo", "NYJ", 1), roster("c", "Charlie", "NYJ", 1),
    roster("c", "Charlie", "MIA", 1), roster("d", "Delta", "MIA", 1),
]


def dataset(rows, path):
    players, teams, graph = build_graph(rows)
    version = "test-v1"
    return {
        "players": {"version": version, "players": players},
        "rosters": {"version": version, "teams": teams, "rosterKeys": graph["rosterKeys"], "playerMemberships": graph["memberships"]},
        "puzzles": {"version": version, "puzzles": {"2026-10-06": {"number": 1, "start": path[0], "end": path[-1], "par": len(path) - 2, "path": path}}},
        "manifest": {
            "version": version, "seasons": {"first": 2024, "last": 2024},
            "puzzles": {"startDate": "2026-10-06", "days": 1},
            "counts": {"players": len(players), "teams": len(teams), "edges": len(graph["edges"]), "puzzlesByPar": {str(len(path) - 2): 1}},
        },
    }


def errors(data, rows=ROWS):
    report = Report()
    check_structure(data, report)
    check_puzzles(data, report)
    check_source(data, rows, report)
    return report.errors


class ValidateDataTests(unittest.TestCase):
    def test_consistent_data_passes(self):
        self.assertEqual(errors(dataset(ROWS, ["a", "b", "c", "d"])), {})

    def test_detects_par_that_is_not_shortest(self):
        shortcut = ROWS + [roster("a", "Alpha", "MIA", 1)]
        self.assertIn("puzzles", errors(dataset(shortcut, ["a", "b", "c", "d"]), shortcut))

    def test_detects_broken_path_link(self):
        data = dataset(ROWS, ["a", "b", "c", "d"])
        data["puzzles"]["puzzles"]["2026-10-06"]["path"] = ["a", "c", "b", "d"]
        self.assertIn("puzzles", errors(data))

    def test_detects_membership_missing_from_json(self):
        data = dataset(ROWS, ["a", "b", "c", "d"])
        self.assertIn("source", errors(data, ROWS + [roster("a", "Alpha", "NE", 2)]))

    def test_detects_inconsistent_player_fields(self):
        data = dataset(ROWS, ["a", "b", "c", "d"])
        broken = copy.deepcopy(data)
        broken["players"]["players"][0]["rosterWeeks"] = 9
        self.assertIn("structure", errors(broken))
        broken = copy.deepcopy(data)
        broken["players"]["players"][0]["number"] = 42
        self.assertIn("source", errors(broken))


if __name__ == "__main__":
    unittest.main()
