# Deployment

Production runs three containers on one host: **Caddy** (TLS + reverse proxy), the **Bun app**
(API + built SPA), and **PostgreSQL**. Migrations run once as a separate one-shot service before the
app starts.

```
Internet ──443──> Caddy ──> app:3000 (Bun: /api/* and the SPA)
                              └──> db:5432 (private network, no published port)
```

Public hostname: **incident.purecode.sh**.

## Prerequisites

- A host with Docker and Docker Compose v2.
- Ports 80 and 443 reachable from the internet (Caddy needs 80 for the ACME HTTP challenge and 443
  for TLS).
- A DNS **A** (and/or **AAAA**) record: `incident.purecode.sh` → the host's public IP. Caddy issues
  and renews the certificate automatically once DNS resolves.

## First deploy

```sh
cp .env.production.example .env.production
# Edit .env.production: set a strong POSTGRES_PASSWORD, the matching DATABASE_URL,
# APP_ORIGIN=https://incident.purecode.sh, and provider settings.

bun run deploy:build      # build the app image
bun run deploy:up         # start db, run migrations, start app + caddy
bun run deploy:logs       # follow caddy + app logs
```

Then open https://incident.purecode.sh. `GET /api/v1/health` checks the database; `GET /api/v1/live`
is liveness only (no database).

Subsequent code changes:

```sh
git pull
bun run deploy:build
bun run deploy:up
```

`deploy:up` re-runs the `migrate` service; applying an already-applied migration set is a no-op.

## Environment

| Variable | Purpose |
|---|---|
| `APP_DOMAIN` | Hostname Caddy serves and gets a certificate for. |
| `APP_ORIGIN` | Exact origin enforced on state-changing requests; must be `https://<APP_DOMAIN>`. |
| `POSTGRES_PASSWORD` | Initializes the PostgreSQL data directory; irrelevant on an existing volume. |
| `DATABASE_URL` | App/migrate connection string; host is `db` inside Compose. |
| `AI_PROVIDER` | `openrouter` or `disabled`. Disabled keeps every action button working. |
| `OPENROUTER_API_KEY` | Backend-only credential. Never exposed to the browser bundle. |
| `WEB_DIST_PATH` | Points the API at the built SPA. Set to `/app/apps/web/dist` in Compose. |

Never put a secret in a `VITE_` variable. `.env.production` is gitignored.

## Safety notes

- The database has **no published port**; it is only reachable on the internal Compose network.
- The app binds `0.0.0.0:3000` inside the network and is not published to the host; only Caddy is.
- Caddy sets HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`, and removes
  the `Server` header.
- Guest sessions are `HttpOnly; Secure; SameSite=Lax` cookies in production (the app sets `Secure`
  when `NODE_ENV=production`).
- Migrations are applied explicitly and never on app startup.

## Backups

The Docker volume is persistence, not a backup.

```sh
# Back up
docker compose --env-file .env.production -f infra/compose.prod.yaml exec db \
  pg_dump -U incident_dev -d incident_commander -Fc > backup-$(date +%Y%m%d).dump

# Verify a restore into a throwaway database before trusting it
docker compose --env-file .env.production -f infra/compose.prod.yaml exec -T db \
  createdb -U incident_dev incident_commander_restore
docker compose --env-file .env.production -f infra/compose.prod.yaml exec -T db \
  pg_restore -U incident_dev -d incident_commander_restore < backup-YYYYMMDD.dump
```

Automate the dump to off-host storage and schedule it. Production runtime credentials should be
distinct from migration privileges.

## Upgrade and rollback

- **App rollback:** check out the previous commit, `bun run deploy:build && bun run deploy:up`. The
  app is stateless; the database is untouched.
- **Scenario changes:** never mutate a published scenario version. Bump the version, run
  `deploy:up` (the migrate service does not seed), then register it once:

  ```sh
  docker compose --env-file .env.production -f infra/compose.prod.yaml run --rm app \
    bun packages/db/dist/migrate.js   # migrations only
  # seed is intentionally not automatic; register new scenario versions deliberately
  ```

  Seed via the built bundle or a one-off node with the `db:seed` source when adding a scenario.
- **Database major upgrade:** PostgreSQL 18+ images use a different data layout. Changing the image
  tag alone is not an upgrade; review the official image notes and migrate the data.

## Troubleshooting

- **No certificate:** confirm DNS resolves to the host and ports 80/443 are open; check
  `bun run deploy:logs`. Caddy must complete the ACME challenge before issuing.
- **`ORIGIN_REJECTED` in the browser:** `APP_ORIGIN` does not match the address you are using.
- **App unhealthy:** `GET /api/v1/health` requires the database; check the `db` service and
  `DATABASE_URL`.
- **Migrations failed:** the app will not start (`service_completed_successfully` gate). Inspect the
  `migrate` service logs, fix forward with a new migration file, and redeploy.
