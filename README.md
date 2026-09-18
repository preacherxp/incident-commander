# Incident Commander

A deterministic, single-player browser incident-management game. You take an on-call shift during a
checkout outage, work out why it is failing, contain customer impact, restore sustained service, and
read a scored debrief. Two incidents ship: **Friday, 16:58** (express checkout is leaking sessions on
the new release) and **Saturday, 02:14** (express is already off and something else is holding the
connections). Pick a shift, beat your best time, and try not to follow Jev off a cliff.

The simulation is a pure TypeScript engine with fixed 100&nbsp;ms ticks. Only `step` changes game
outcomes. The React/Three.js presentation, the persistence API, and the command interpreter can
neither invent nor shortcut an intervention.

## Repository layout

| Path | Responsibility |
|---|---|
| `packages/contracts` | Shared Zod DTOs, input/action vocabulary, canonical JSON + SHA-256 |
| `packages/scenarios` | Versioned scenario schema, shared actions/topology, and the authored incidents |
| `packages/sim` | Pure deterministic engine: requests, operations, recovery, replay, player view |
| `packages/db` | Drizzle schema, SQL migrations, connection factory, run repository, seed |
| `packages/ai` | Provider-independent interpreter, OpenRouter adapter, deterministic fake |
| `apps/api` | Hono API: guest ownership, persistence transactions, interpretation |
| `apps/web` | React + Vite UI, engine coordinator, IndexedDB outbox, R3F board |
| `tests/e2e` | Playwright scenario flows |
| `infra/compose.yaml` | Local PostgreSQL 17 service |
| `docs` | Decisions, scenario authoring, operations, verification |

## Quickstart

Requires Bun, Docker, and (for the 3D board) a WebGL-capable browser.

```sh
bun install --frozen-lockfile
cp .env.example .env
# Fill in local database settings. Command interpretation is optional:
#   AI_PROVIDER=disabled keeps text commands unavailable but every action button works.
docker compose --env-file .env -f infra/compose.yaml up -d db
bun run db:migrate
bun run db:seed
bun run dev
```

`bun run dev` starts the API (`:3000`) and Vite (`:5173`); Vite proxies `/api`. Open
http://localhost:5173.

## Scripts

`dev` · `dev:web` · `dev:api` · `build` · `typecheck` · `lint` · `test` · `test:e2e` ·
`db:generate` · `db:migrate` · `db:seed` · `db:reset` · `ai:smoke`

## How you play

Ask Jev, the incident analyst, what is happening. Jev reads the live incident, explains the most
likely bottleneck, and suggests one move; nothing runs until you approve it. Four actions are
available, either through Jev's suggestion or as manual buttons:

- **Investigate sessions** — reveals the leak and the release responsible.
- **Turn express off** — stops new leaks.
- **Roll back to v42** — removes the faulty release.
- **Recycle checkout** — releases the sessions already leaked.

Two fixes are valid: roll back to v42, or turn express off and recycle. Recycle alone relapses;
database pressure alone is never a fix. Hold healthy service for 15 seconds to win.

## Deploy

Production runs Caddy (TLS) → Bun app (API + built SPA) → PostgreSQL, with migrations as a one-shot.

```sh
cp .env.production.example .env.production   # set POSTGRES_PASSWORD, DATABASE_URL, APP_ORIGIN
bun run deploy:build
bun run deploy:up
```

Public hostname `incident.purecode.sh`; Caddy issues TLS automatically once DNS points at the host.
Full runbook (DNS, backups, upgrade/rollback, troubleshooting): `docs/deployment.md`.

## Status

Implemented and verified: a pure deterministic engine with both recovery routes, a Jev-first
interface backed by the OpenRouter Decisions API (structured explain + propose, never executes),
guest-owned persistence with exact idempotent retry, replay, factual debrief, and a DOM board
fallback. `AI_PROVIDER=disabled` degrades only text interpretation; the action buttons always work.
See `docs/verification-report.md` for exactly what was and was not exercised.
