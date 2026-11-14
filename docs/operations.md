# Local operations guide

## Prerequisites

Bun 1.4+, Docker (Compose), and a modern browser. No GPU or WebGL is required; the incident map is
plain SVG.

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

If the database was just (re)created, give it a couple of seconds before migrating — the compose
healthcheck is fast, but the first connection can still race the server's startup.

## Jev's voice

`AI_PROVIDER=disabled` is the default and requires no credential. Jev still speaks: the client and
server both fall back to deterministic canned lines keyed by `(runId, cue, round)`.

To let Jev improvise:

```sh
# .env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_VOICE_MODEL_ID=openai/gpt-4o-mini
```

Voice is flavour only. It is requested after the fact for each cue (`threat_revealed`,
`threat_blocked`, `victory`, …) and can never change a card, a draw, or a result. Requests are rate
limited to 60 per guest per minute; if the provider errors, the canned line is used and play
continues without interruption. Raw run state is summarised (round, meters, last cards) but the
player's own text is never involved.

## Database lifecycle

- Migrations: `bun run db:generate` (after schema edits) then `bun run db:migrate`. Migrations are
  applied explicitly and never on application startup.
- Seed: `bun run db:seed` registers immutable encounter versions and refuses to overwrite a version
  whose content hash changed.
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
- `connection refused` right after `db:reset` — Postgres is still starting; retry the migration.
- "waiting to sync" in the header — the API is unreachable. Play continues offline from IndexedDB;
  the client retries every 10 seconds and always finalizes a terminal run when the API returns.
- A revision conflict shows a banner and preserves the local branch. The client never merges input
  histories; finish or restart the local copy deliberately.
- Jev's bubble shows a `canned` chip — the voice provider is disabled or failed. Nothing else is
  affected.
- A saved run cannot be resumed — it was created under a different engine version. Old runs are
  intentionally rejected rather than replayed under new rules.
