# Six Degrees

A fully static daily NFL roster-chain browser game. Built with Vite and vanilla TypeScript, with no backend, accounts, paid services, or runtime API requests.

## Phase 1: playable prototype

The current game uses a small **synthetic** dataset. Player names are familiar, but connections and week counts are illustrative, incomplete, and not verified NFL facts. IDs beginning with `demo-` are fixture IDs, not GSIS IDs. Two same-named Mike Williams entries exercise autocomplete disambiguation. The real pipeline will replace this fixture in later phases.

```sh
npm install
npm run dev
npm test
npm run build
```

The seven demo puzzles repeat on a deterministic local-date schedule anchored to October 6, 2026, puzzle #1. This is not the eventual 365-day production schedule. Players viewing the same local calendar date get the same puzzle. Dates before the prototype launch can have nonpositive puzzle numbers.

## Approved Rules

- Data coverage: 2002 onward.
- A teammate connection requires membership on the same team's roster in the same regular-season or postseason week. Sharing only a team and season is insufficient if the players' roster weeks do not overlap.
- Practice squad, injured reserve, and inactive players count. Offseason/camp rosters do not.
- Enter intermediate players through autocomplete. Suggestions show only name, jersey number, and career years, never teams.
- A non-teammate entry costs one miss and is not added. Three misses end the puzzle.
- Undo removes the most recent accepted intermediate player without charging or refunding misses. Completed puzzles are final.
- The game auto-solves when a newly accepted intermediate player connects to END. END is not counted as an intermediate player.
- Par is the shortest number of intermediate players: BFS edge distance minus one.
- Give-up and losses reveal one optimal path with roster evidence.

Progress and completed results are stored in localStorage by dataset version and local date. Demo records will remain separate from production records. Blocked browser storage does not prevent play, but progress cannot persist. A changed local date is detected on focus, visibility changes, and gameplay actions.

## Structure

- `src/game.ts`: framework-independent rules and BFS.
- `src/fixtures/demo.ts`: synthetic player metadata, edges, and daily fixture selection.
- `src/storage.ts`: saved progress validation and completed-result storage.
- `src/main.ts`: accessible autocomplete, chain display, and give-up confirmation.
- `src/styles.css`: responsive dark theme and self-hosted fonts.
- `src/*.test.ts`: focused game and persistence tests.

## Remaining Phases

3. Load real versioned JSON using Vite's base URL, validate it, and handle unpublished dates without substituting another day's puzzle.
4. Statistics/streaks modal, spoiler-free clipboard sharing, how-to-play modal, and additional accessibility polish. Completed records are already saved for this phase.
5. GitHub Pages Actions deployment, repository base-path configuration, and final regeneration/deployment commands. These are intentionally not implemented before phase approval.

The site will ship its graph and example solutions as public files. It cannot prevent someone inspecting those files for answers. No private data or credentials should be included in static assets.

## Data Sources

- [nflverse-data](https://github.com/nflverse/nflverse-data)
- [Weekly roster documentation](https://nflreadr.nflverse.com/reference/load_rosters_weekly.html): documented coverage begins in 2002.

The former gameday-active/played-together restriction has been removed. Snap counts and play-level participation are not required for the approved roster-membership rule.

## Phase 2: regenerate real data

The local-only pipeline reads nflverse weekly roster CSV releases from 2002 onward and defaults to complete seasons through the previous year. It uses only the Python 3.10+ standard library:

```sh
python3 pipeline/build_data.py --start-season 2002 --end-season 2025 --start-date 2026-10-06
python3 -m unittest discover -s pipeline -v
```

The generator streams season CSVs and caches source files under `pipeline/.cache/`; those source files are not published. Use `--offline` to require all requested seasons to already be cached. `--min-roster-weeks` and `--max-endpoints` control the notable-player pool if a different source range is used. `--seed` makes puzzle selection reproducible. Keep the same `--start-date` and seed when regenerating a published 365-day calendar.

`public/data/players.json` contains GSIS ID, name, position, most-worn number, observed career bounds, team abbreviations, and roster-week count. `rosters.json` stores each unique team/season/game-type/week key once and a sorted list of those key indexes per player. Intersect two players' membership indexes to validate a connection; group matching keys by team and season to report shared roster weeks. This avoids shipping or parsing over two million expanded player-pair edges. The week count is **shared regular/postseason roster weeks**, not games played. Rows with the same player, team, season, game type, and week are deduplicated. Preseason and other non-regular/non-postseason game types are excluded. Roster status values are retained as presence records rather than blanket-filtered: historical weekly rows can label traded/released players while still recording their prior team weeks. Missing-GSIS-ID rows are excluded.

`puzzles.json` maps each date to a stable start/end GSIS ID, par, and one shortest path. Endpoints come from a roster-week notability threshold and a bounded top-player pool; the generator balances prior endpoint and intermediate appearances. `manifest.json` describes schemas, coverage, attribution, counts, and puzzle-generation settings. The generator prints JSON and gzip byte sizes after each run.

Data attribution: nflverse weekly roster data from [nflverse-data](https://github.com/nflverse/nflverse-data), licensed [CC BY 4.0](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md). The generated files filter and deduplicate regular/postseason weekly roster records, index player roster-week memberships, and derive player summaries and puzzles. The project is not affiliated with or endorsed by the NFL or nflverse.

### Generated dataset (2002–2025)

Generated for puzzle dates October 6, 2026 through October 5, 2027: 14,660 players, 39 team codes, and 365 unique endpoint pairs. The generated par distribution is **365 par-2 puzzles**. With the current notability defaults (at least 32 roster weeks; top 800 players), all endpoint pairs with par 2–4 are par 2; a targeted check of the top 1,600 players found the same limitation. The selector balances par bands when the selected pool contains them; it does not mislabel longer-than-shortest routes as par.

| File | JSON | gzip |
|---|---:|---:|
| `players.json` | 2,161,611 B | 309,567 B |
| `rosters.json` | 4,868,683 B | 795,553 B |
| `puzzles.json` | 49,951 B | 8,066 B |
| `manifest.json` | 743 B | 439 B |
| **Total** | **7,080,988 B** | **1,113,625 B** |

The generated graph contains 2,029,205 connected player pairs; those expanded edges are used for BFS puzzle generation but are not shipped. Gzip figures estimate transfer size. `rosters.json` stores membership rows for client intersections; Phase 3 should preserve that compact representation rather than expand an all-pairs graph.