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

## Session Update (2026-10-06)
- Dashboard: added "Pts ±" and "Pos ±" columns showing points/ranking delta since the last distinct match date ("journée"), not match_number (multiple matches can happen same day). Backend: `_rank_by_trueskill()` helper + delta logic in `GET /api/stats/players` (server.py). Values are `null` (shown as "–") if there's no previous journée to compare against.
- Podium: added "Meilleur duo" card — best teammate pair by win-rate when playing together, within the selected rolling window. Backend: `best_duos()` in stats.py, wired into `GET /api/stats/podium` → `podiums.best_duo`. Added a "365 jours" option to the Podium date-range select for visibility with older seed data.
- Tested via testing_agent (iteration_5.json): 100% pass, no regressions on existing Dashboard sort/stats or other Podium categories.
