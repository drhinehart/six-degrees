# Six Degrees: Agent Handoff

## Product Goal

Build **Six Degrees**, a free, fully static daily NFL browser game (Wordle/Immaculate Grid spirit) hosted on GitHub Pages. Stack: Vite + vanilla TypeScript, no backend or runtime API. Keep the interface mobile-first, dark, accessible, and playable without an account. The user requested implementation in phases and a check-in after each phase; do not roll multiple phases together.

## Agreed Game Rules

- Daily puzzle has a START and END NFL player. Every player sees the same puzzle for a given local date; puzzle number is displayed.
- A connection means both players appear on the same team roster during at least one matching regular-season or postseason week. Both team, season, game type, and week must overlap. They do not need to have played in a game.
- Practice squad, injured reserve, and inactive players count. Offseason/camp rosters do not. Data coverage starts in 2002.
- Use GSIS player IDs for identity. Suggestions must expose name, most-worn jersey number, and active years, but not teams.
- A wrong teammate entry is a miss and is not added. Three misses lose. Undo removes the last valid intermediate for free and does not refund misses.
- The game auto-solves when the last accepted intermediate shares a roster week with END. END itself is not an intermediate.
- Par means the shortest number of intermediate players: shortest graph edge distance minus one (path length in players minus two). Scoring is golf-style.
- On loss or give-up, reveal one shortest path. Save daily progress, stats, and streaks locally. Share result spoiler-free.

## Build Plan and Status

1. **Playable UI with fake data: complete.** Responsive dark prototype, keyboard autocomplete, route display, misses, undo, auto-solve, give-up confirmation/reveal, local-date demo puzzle, and localStorage persistence. Fixture data is explicitly labeled synthetic.
2. **Python data pipeline: implemented; real data generated.** Uses nflverse weekly-roster CSVs from complete seasons 2002–2025 and Python standard library only. Source CSV cache is ignored under `pipeline/.cache/`. Generates compact JSON in `public/data/`. `pipeline/validate_data.py` independently checks the production JSON (structure, edge count, every puzzle incl. a BFS proof of par, and a full rebuild from the cached source CSVs); it **passed** on 2026-10-07. 13 Python tests pass.
3. **Wire generated data into the game: complete (2026-10-07).** `src/data.ts` loads/cross-checks the four files via `BASE_URL`; `TeammateGraph` intersects sorted membership rows (no all-pairs map); out-of-calendar and missing dates show explicit no-puzzle screens; search ranks exact > prefix > word-start > substring, then by roster weeks. Legacy nflverse codes ARZ/BLT/CLV/HST/SL (2002–2015, never overlapping the standard codes) display as ARI/BAL/CLE/HOU/STL. Give-up reveal shows active years to disambiguate same-name players. 22 frontend tests pass, including `src/realData.test.ts`, which plays all 365 real puzzles through the browser code. Verified in headless Chromium against the production build: miss, undo, ambiguous name, solve, reload persistence, give-up, 390px width, before/after-calendar, and midnight rollover past the calendar; no console errors.
4. **Polish: pending.** Add stats/streaks, spoiler-free clipboard sharing, and how-to-play modal.
5. **GitHub Pages deployment: pending.** Add Actions workflow and configure Vite base path after confirming repository name.

## Current Data Artifacts

Generated date range: 2026-10-06 through 2027-10-05. Counts: 14,660 players, 39 team codes, 365 distinct endpoint pairs. The current default endpoint pool (at least 32 roster weeks, top 800) only yielded par 2 candidates. A targeted scan of the top 1,600 by roster weeks also found no par 3 or 4 endpoint pairs. Thus current calendar is 365 par-2 puzzles; the generator reports availability and balances difficulty bands only when present. Do not fabricate non-shortest par values. The user chose to keep the current pool for now (2026-10-07) and may revisit difficulty later. When regenerating, keep already-published dates unchanged and only replace future dates (the pipeline needs an option for this).

| File | Uncompressed JSON | gzip estimate |
|---|---:|---:|
| `public/data/players.json` | 2,161,611 B | 309,567 B |
| `public/data/rosters.json` | 4,868,683 B | 795,553 B |
| `public/data/puzzles.json` | 49,951 B | 8,066 B |
| `public/data/manifest.json` | 743 B | 439 B |
| **Total** | **7,080,988 B** | **1,113,625 B** |

The 2,029,205 all-pairs edges are used internally by the Python BFS generator but are not shipped. Avoid reconstructing them into a giant JavaScript Map in the browser.

### JSON Schema Notes

- `players.json`: `{version, players}`; each player has `id` (GSIS), `name`, `position`, `number` (can be null), `firstSeason`, `lastSeason`, `teams` (team abbreviations), and `rosterWeeks`.
- `rosters.json`: `{version, teams, rosterKeys, playerMemberships, membershipFormat}`. A roster key is `[teamIndex, season, gameType, week]`. `playerMemberships` is aligned with player array order; each element is a sorted, deduplicated list of roster-key indexes for that player. Intersect two membership lists to verify a teammate connection; group matching keys by team index + season to report shared roster weeks. Map team indexes through `teams`.
- `puzzles.json`: `{version, puzzles}` keyed by ISO local date. Puzzle record contains `number`, `start`, `end`, `par`, and `path` (GSIS IDs, including both endpoints).
- `manifest.json` has source/license, seasons, puzzle settings, generated counts, and file list.

The frontend maps each record's `path` to the runtime `Puzzle.optimalPath`. `Player.number` may be `null` (113 players) and displays as `#—`.

## Data Source and Caveats

- Source: [nflverse-data weekly rosters](https://github.com/nflverse/nflverse-data), [loader documentation](https://nflreadr.nflverse.com/reference/load_rosters_weekly.html); documented weekly coverage begins in 2002.
- Data license: CC BY 4.0, attribution required. README and generated manifest include attribution and license links.
- Preseason/other out-of-season game types are excluded. Membership keys preserve game type and week. Duplicate player/team/season/type/week records are deduplicated. Historical `status` fields can report CUT/TRD for past teams/weeks, so the pipeline does not blanket-filter them. Rows missing GSIS IDs are excluded.
- UI evidence should say shared roster **weeks**, not games played.
- This project is not affiliated with the NFL or nflverse. Answers and optimal paths are in public static assets; the site cannot make them secret.

## Useful Commands

```sh
npm install
npm run dev
npm test
npm run build
python3 -m unittest discover -s pipeline -v
python3 pipeline/validate_data.py
python3 pipeline/build_data.py --start-season 2002 --end-season 2025 --start-date 2026-10-06
```

Regeneration command reuses the local ignored cache; `--offline` requires all seasons cached. Latest checks (2026-10-07): 13 Python tests, `python3 pipeline/validate_data.py` (about 16 s), 22 frontend tests, `tsc`, and `npm run build` all pass.

## Workspace State

- README contains the project setup, data pipeline, license, output sizes, and par limitation.
- The dev server previously ran at `http://localhost:5173/` but exited; restart with `npm run dev` when needed.
- Git repo initialized on `main` with remote `origin` = https://github.com/drhinehart/six-degrees.git. Nothing has been pushed; `git ls-remote` failed for lack of credentials (repo private or not yet created), so pushing in Phase 5 needs the user's GitHub auth. Pages base path will be `/six-degrees/`.
- Next phase is 4 (polish). Wait for the user to ask before starting it.
