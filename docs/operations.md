# Local operations guide

## Prerequisites

Bun 1.4+, Docker (Compose), and a WebGL-capable browser for the 3D board.

## First run

```sh
bun install --frozen-lockfile
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and DATABASE_URL (host process uses localhost).
docker compose --env-file .env -f infra/compose.yaml up -d db
bun run db:migrate
bun run db:seed
bun run dev
```

The API reads `.env` from the repository root explicitly (`--env-file=../../.env`), so package
scripts behave the same whether launched from the root or a workspace.

## Command interpretation

`AI_PROVIDER=disabled` is the default and requires no credential. Every core action has a button,
and text commands report that interpretation is unavailable.

To enable the OpenRouter adapter:

```sh
# .env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL_ID=typesafe/jev-1.13
```

Then `bun run ai:smoke` to send a small labeled command set to the real provider. This makes paid
external calls; run it only when you intend to. The API logs the returned model identifier and
prompt version; raw command text is not logged.

## Database lifecycle

- Migrations: `bun run db:generate` (after schema edits) then `bun run db:migrate`. Migrations are
  applied explicitly and never on application startup.
- Seed: `bun run db:seed` registers immutable scenario versions.
- Reset (destroys all saves): `CONFIRM_DB_RESET=1 bun run db:reset`.
- Ordinary container restarts preserve the named volume and therefore runs.

## Backup and restore (runbook)

A Docker volume is persistence, not a backup.

```sh
# Back up
docker compose --env-file .env -f infra/compose.yaml exec db \
  pg_dump -U incident_dev -d incident_commander -Fc > backup-$(date +%Y%m%d).dump

# Restore into a separate database and verify before trusting it
docker compose --env-file .env -f infra/compose.yaml exec -T db \
  createdb -U incident_dev incident_commander_restore
docker compose --env-file .env -f infra/compose.yaml exec -T db \
  pg_restore -U incident_dev -d incident_commander_restore < backup-YYYYMMDD.dump
```

Production credentials should be distinct from migration privileges, and the database should not be
publicly reachable.

## Troubleshooting

- `DATABASE_URL is required` — the shell/package script did not load the root `.env`; use the root
  scripts, which pass `--env-file=../../.env`.
- `Paused while interpreting command` never clears — a request was abandoned; use Cancel or retry.
  The server ignores late responses after cancellation.
- "Saved on this device; waiting to sync" — the API is unreachable. Gameplay continues; retries
  resume automatically every 10 seconds and on pause/terminal transitions.
- A revision conflict pauses and preserves the local branch. Choose a recovery path explicitly; the
  client never merges input histories.
