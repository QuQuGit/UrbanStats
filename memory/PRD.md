# Football 5v5 Statistics Platform — PRD

## Original Problem Statement (verbatim)
Track statistics for recurring amateur 5v5 football matches for a group of ~40 players.
From only (Team A composition, Team B composition, final score), automatically compute all
individual stats: matches, W/D/L, win%, goals, ELO, streaks, rankings. Includes a balanced
team generator and player profiles with charts. Original spec also lists analytics (best
duo/trio, MVP, nemesis), import wizard, future enhancements.

## User Choices (locked-in by user)
- Stack: FastAPI + MongoDB
- Auth: Classic Email/Password JWT (admin-only writes, public reads)
- Rating system: TrueSkill (replaced ELO)
- Theme: dark + simple, Volt Green accent #CCFF00
- Language: French (fr-FR)

## Architecture
- **Backend** (`/app/backend`)
  - `server.py` — FastAPI app, `/api` prefix. Mongo collections: `users`, `user_sessions`, `players`, `matches`.
  - `stats.py` — pure replay engine: deterministic ELO (K=32, init=1500) + aggregates + teammate/opponent maps + balanced team generator (3 strategies).
- **Frontend** (`/app/frontend/src`)
  - `App.js` AppRouter detects `session_id=` in URL fragment synchronously to avoid race conditions.
  - `context/AuthContext.jsx`, `components/{AuthCallback,ProtectedRoute,Layout}.jsx`.
  - Pages: Login, Dashboard, Players, Matches, MatchForm (new + edit), TeamGenerator, PlayerProfile.

## What's Been Implemented (2026-02)
- Emergent Google Auth integration (session cookie + Bearer fallback)
- Players CRUD with active/inactive toggle; duplicate names rejected; delete blocked if matches exist
- Matches CRUD with full validation (equal team size, no overlap, non-negative scores) and edit
- Stats engine: matches, W/D/L, win%, goals, GD, points, current/longest streaks
- ELO rating system: init 1500, K=32, history per player, highest/lowest, last-10 change
- Balanced Team Generator: 3 strategies (best, competitive, random_fair) with balance%, predicted P(A win)
- Dashboard: global stats + Top10 Win%, ELO, Goal Diff + 20 recent matches
- Player Profile: 12 summary cells, ELO Recharts line chart, best teammates, tough opponents, match history
- Dark theme (Cabinet Grotesk + Manrope + JetBrains Mono), Volt Green accent #CCFF00

## Testing
- Backend pytest 19/19 passing (`/app/backend/tests/test_backend.py`)
- Frontend E2E covered end-to-end via testing agent (login, dashboard, CRUD, generator, profile, logout)

## Personas
- Group coordinator: enters compositions + score after each session
- Player: checks personal profile, ELO trajectory, teammates synergy
- Curious member: scans rankings and recent matches on dashboard

## Backlog
- **P1** Import wizard (CSV/XLSX → players + matches replay)
- **P1** Best Trio / Nemesis ranking pages (Best Duo done — see Session Update 2026-10-06)
- **P1** MVP composite ranking
- **P2** Configurable min matches threshold in rankings
- **P2** Win-rate evolution chart, goal-diff evolution chart (TrueSkill evolution chart already exists on PlayerProfile)
- **P2** Seasons / championships
- **P3** Individual goals/assists/goalkeepers (architecture future-proof: only team compositions + score persisted today)
- **P3** Mobile PWA
- **P3** Vite migration (CRA deprecated, currently pinned to Node 20 via .nvmrc for Vercel compat)

## Session Update (2026-10-07) — Vercel Node 20 deprecation fix
- Bug reported: Vercel build failing with "Node.js Version 20.x is discontinued... set to 24.x". Vercel deprecated Node 20 for builds (Oct 1, 2026), min supported now 22.x/24.x.
- Fix: `frontend/.nvmrc` changed `20` → `24`; added `"engines": {"node": "24.x"}` to `frontend/package.json` (Vercel honors `engines.node` to override Project Settings on next deploy).
- Verified CRA5/craco build compiles cleanly under both real Node 22.14.0 and Node 24.9.0 binaries (no ajv/ESLintWebpackPlugin errors that caused the original Node-20 pin) — confirmed independently by testing_agent (iteration_6.json). Local sandbox dev still runs on Node 20 (unaffected, only Vercel build process reads `.nvmrc`/`engines`).
- No functional regressions found on Dashboard/Podium/PlayerProfile.
- Dashboard: corrected the delta column — now shows **TrueSkill points gained/lost** since the last journée (renamed "Skill ±", backend field `skill_delta`), not classification points. Moved "Pos ±" (rank_delta) to sit right after the "#" rank column (col 2), before the player name.

## Session Update (2026-10-06, part 2)
- PlayerProfile: match history list now shows the **TrueSkill points gained/lost per match** (not classification points) next to each match row — e.g. "+2.61 skill" / "-1.92 skill", colored green/red (`data-testid="profile-match-skill-change-{match_id}"`). Backend: `stats.py` `replay_matches()` now stores a `change` field (delta vs pre-match skill) in each `trueskill_history` entry; frontend maps `match_id` → `change`.
- Backend: added `GET /api/health` (public, lightweight) for external uptime pinging.
- User confirmed: will set up an external free uptime service (UptimeRobot/cron-job.org) to ping `/api/health` every 10 min and keep the Render free-tier backend from sleeping. Emergent's own `.emergent/crons.yml` cron system cannot target the external Render URL, so it was not used here.
- Dashboard: added "Pts ±" and "Pos ±" columns showing points/ranking delta since the last distinct match date ("journée"), not match_number (multiple matches can happen same day). Backend: `_rank_by_trueskill()` helper + delta logic in `GET /api/stats/players` (server.py). Values are `null` (shown as "–") if there's no previous journée to compare against.
- Podium: added "Meilleur duo" card — best teammate pair by win-rate when playing together, within the selected rolling window. Backend: `best_duos()` in stats.py, wired into `GET /api/stats/podium` → `podiums.best_duo`. Added a "365 jours" option to the Podium date-range select for visibility with older seed data.
- Tested via testing_agent (iteration_5.json): 100% pass, no regressions on existing Dashboard sort/stats or other Podium categories.
