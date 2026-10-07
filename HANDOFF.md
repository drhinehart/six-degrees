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
- Par means the shortest number of intermediate players: shortest graph edge distance minus two. Scoring is golf-style.
- On loss or give-up, reveal one shortest path. Save daily progress, stats, and streaks locally. Share result spoiler-free.

## Build Plan and Status

1. **Playable UI with fake data: complete.** Responsive dark prototype, keyboard autocomplete, route display, misses, undo, auto-solve, give-up confirmation/reveal, local-date demo puzzle, and localStorage persistence. Fixture data is explicitly labeled synthetic.
2. **Python data pipeline: implemented; real data generated.** Uses nflverse weekly-roster CSVs from complete seasons 2002–2025 and Python standard library only. Source CSV cache is ignored under `pipeline/.cache/`. Generates compact JSON in `public/data/`. Python unit tests passed (8 tests). A separate integrity walk over the final full production JSON was skipped at the user's request; do not claim it passed.
3. **Wire generated data into the game: not started.** This is the next phase, but stop at the user's phase check-in before beginning it unless they authorize continuation.
4. **Polish: pending.** Add stats/streaks, spoiler-free clipboard sharing, and how-to-play modal.
5. **GitHub Pages deployment: pending.** Add Actions workflow and configure Vite base path after confirming repository name.

## Current Data Artifacts

Generated date range: 2026-10-06 through 2027-10-05. Counts: 14,660 players, 39 team codes, 365 distinct endpoint pairs. The current default endpoint pool (at least 32 roster weeks, top 800) only yielded par 2 candidates. A targeted scan of the top 1,600 by roster weeks also found no par 3 or 4 endpoint pairs. Thus current calendar is 365 par-2 puzzles; the generator reports availability and balances difficulty bands only when present. Do not fabricate non-shortest par values. Discuss a broader pool or other difficulty criteria with the user if par diversity is needed.

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

The current frontend's `TeammateGraph` accepts expanded edges and its `Puzzle` type uses `optimalPath`; adapt the data layer for membership indexes and map `path` to the existing runtime shape without expanding all pairs. Update `Player.number` to allow `null` if necessary. Load through Vite's `import.meta.env.BASE_URL` so the eventual Pages subpath works. Handle dates outside the generated calendar explicitly; do not silently substitute another puzzle.

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
python3 pipeline/build_data.py --start-season 2002 --end-season 2025 --start-date 2026-10-06
```

Regeneration command reuses the local ignored cache; `--offline` requires all seasons cached. Latest known checks: all 8 Python tests passed after switching to membership-index output. The 12 frontend tests and production build passed before that last data-format change; no TS/UI files changed afterward. Full production JSON integrity validation remains explicitly unrun.

## Workspace State

- README contains the project setup, data pipeline, license, output sizes, and par limitation.
- The dev server previously ran at `http://localhost:5173/` but exited; restart with `npm run dev` when needed.
- `git status` reported that this workspace is not inside a Git repository. GitHub Pages deployment will require a repository and a project-name base path.
- User's latest explicit request was to write this handoff summary. Do not start Phase 3 in response to that request; wait for the user to ask to proceed.