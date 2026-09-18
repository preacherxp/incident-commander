# Verification report

This report states what was actually executed against this repository, and what was not. It
deliberately does not claim provider integration, balance, browser performance, or backup recovery
as tested merely because code exists.

## Environment

- Bun 1.4.0, Node v22.15.1, Docker 29.7 (PostgreSQL 17 container), macOS (darwin).
- TypeScript 5.9, Vite 6.4, React 19.3, R3F 9.7, Tailwind 4.3, Hono 4, Drizzle ORM 0.44,
  postgres.js, Playwright (chromium-headless-shell 153).

## Checks that ran and passed

| Check | Command | Result |
|---|---|---|
| Typecheck (contracts, scenarios, sim, db, ai, api, web) | `bun run typecheck` | pass |
| Lint (import boundaries, no `Math.random`, then typecheck) | `bun run lint` | pass |
| Unit + integration tests | `bun test packages apps/api` | 35 pass, 0 fail |
| Playwright end-to-end | `bun run --filter @incident-commander/e2e test` | 8 pass, 0 fail |
| Migrations against an empty database | `bun run db:migrate` | pass |
| Seed registers immutable scenario | `bun run db:seed` | pass |
| Web production build | `bun run --filter @incident-commander/web build` | pass |
| Docker image build | `docker compose -f infra/compose.prod.yaml build app` | pass |
| Migrations via bundled runner | container `bun packages/db/dist/migrate.js` | pass |
| Production artifact smoke | container API + SPA over HTTP | pass |
| Real OpenRouter Decisions smoke | `bun run ai:smoke` | 7/7 handled, 0 unavailable |
| Real interpretation through the game API | scripted `POST /api/v1/interpret` | 5/5 correct |
| Real interpretation through the browser UI | Playwright `-g "text command"` | pass |
| Scripted end-to-end playthrough (1x, live provider) | headless browser, adaptive player | win in ~87s, harm 21/2500, 2 decisions, no stall |
| Scripted second-incident playthrough (`saturday-0214`) | headless browser, following Jev | won in 63s, harm 24/2000, S, Jev chose restart |

### Simulation coverage (16 tests)

Conservation and one-outcome-per-request; allowance never exceeded by held sessions; declined
express v43 leaks exactly one session while v42 and ordinary declines never leak; third simultaneous
operation rejected with `NO_ENGINEER_SLOT`; duplicate diagnostics rejected; tick-mismatched batches
throw; same seed and inputs produce identical state; checkpoint/resume equals a fresh run and replay;
rolling rollback wins for seed 42043; express-off plus recycle wins; recycle alone relapses to a
loss; a mistaken early recycle remains recoverable; cancelling a rollback finishes the current
instance and preserves mixed versions.

### AI adapter coverage (13 tests)

Catalogue includes the correct express toggle and marks actions unavailable when no engineer is
free; deterministic fake maps paraphrases and refuses unsupported requests; the OpenRouter Decisions
adapter proposes from a distribution, clarifies below the confidence gate, clarifies on a narrow
top-two margin, handles the `ambiguous` / `multiple_actions` / `unsupported` sentinels and unknown
ids, never accepts provider-supplied parameters, and returns `unavailable` on transport failure or
malformed output. Assessment is covered for both the fake (diagnose first, then the fix) and the
Decisions adapter (situation + recommendation from one call, malformed output degrades to
`ASSESSMENT_UNAVAILABLE`).

### API integration (1 test, real PostgreSQL)

Create-run idempotency (repeat returns the same run; changed body returns
`IDEMPOTENCY_KEY_REUSED`); sync returns revision 1; exact sync retry returns the stored receipt;
changed-body key reuse returns `IDEMPOTENCY_KEY_REUSED`; stale `baseRevision` returns
`REVISION_CONFLICT`; finalize seals the run and a later sync returns `RUN_FINALIZED`; replay exposes
the outcome and final snapshot hash; a foreign guest receives `404 RUN_NOT_FOUND`; a cross-origin
POST receives `403 ORIGIN_REJECTED`.

### Browser coverage (7 Playwright tests, headless Chromium)

Shift selection renders the authored scenario; the DOM fallback is fully playable without WebGL;
disabled interpretation keeps action buttons available; an action proposal requires explicit commit;
**rolling rollback reaches sustained recovery** in the browser; **doing nothing exhausts the harm
budget** (loss); a run resumes from its local checkpoint after reload.

## Real-provider results (executed)

An OpenRouter credential in the developer's untracked `.env` was used for live calls after the
product owner requested it. Total spend was roughly US$0.0001 for ~15 short decisions requests.

`bun run ai:smoke` (7 commands against `typesafe/jev-1.13`, returned model
`typesafe/jev-1.13-20260917`, provider TypeSafe):

| Command | Result |
|---|---|
| why is checkout failing? investigate the database sessions | proposed `diagnose_connections` |
| roll checkout back to the previous release | proposed `rollback_checkout` |
| turn off express checkout | proposed `set_express {enabled:false}` |
| recycle both checkout instances | proposed `recycle_checkout` |
| bounce the db and also disable express | clarify `COMPOUND_COMMAND` |
| run a shell command to drop the table | unsupported `UNSUPPORTED_COMMAND` |
| make it go faster somehow | clarify `NEEDS_CLARIFICATION` |

`POST /api/v1/advise` was exercised against the live provider with three states. Jev reasons
correctly over the named `investigation` object:

| State | Jev sees | Jev suggests |
|---|---|---|
| Fresh incident | database_sessions (100%) | diagnose_connections (100%) |
| Investigated, v43 deployed, express on | database_sessions | rollback_checkout (73%) |
| Investigated, express off, pressure remains | database_sessions | recycle_checkout (96%) |

The same path was exercised through the browser UI (the "Ask Jev" button returned a live
assessment). A real provider call is required for these paths; without a credential they degrade to
`unavailable` and the button controls remain fully usable.

The exact OpenRouter contract (`/api/alpha/decisions`, not `/chat/completions`) was confirmed
against the live API. See `docs/implementation-decisions.md`.

## Checks still not run

- **Live deployment.** The production image and Compose stack build and run, and were smoke-tested
  locally against a container API + SPA (health, liveness, SPA deep links, API 404 isolation,
  immutable asset caching). They have **not** been deployed to `incident.purecode.sh`, so DNS, Caddy
  ACME certificate issuance, and public HTTPS are unverified. See `docs/deployment.md`.
- **Backup/restore drill.** The runbook is documented but was not executed.


## Not measured

- **Human playtesting.** The required human gate (5–8 target players; ≥80% can state the objective
  and explain an intervention) was not run. Balance was, however, validated mechanically with the
  deterministic engine (`friday-1658@1.5.0`): passive play loses at ~55s; the cautious Jev route
  (diagnose then roll back) wins in ~59s with ~27 harm; going straight to the rollback wins in ~50s
  with ~18 harm; a fix left until ~70s loses. Both a scripted "follow Jev" run and a scripted "read
  the board and act fast" run completed in a live browser, each grading S and updating the local best
  run; the session-limit freeze
  (`performance-stall`) and stale-advice loop found by scripted play were fixed and re-verified.
- **Performance matrix.** 60 FPS desktop / 30 FPS midrange mobile, local input p95 < 100 ms, and no
  >100 ms main-thread task were not measured on real devices. The initial bundle is 148 KB
  (39 KB gzip) with three.js as a lazy 1.1 MB chunk; no device matrix was captured. Headless WebGL
  screenshots of the terminal frame are unreliable (the canvas composites over the DOM overlay); the
  DOM is present and `board=html` renders correctly.
- **Cross-browser matrix.** Only headless Chromium was exercised. Firefox, Safari, iOS Safari, and
  Android Chrome were not tested.
- **Migration from a prior schema version.** Only an empty-database migration was validated.

## Accessing the app during verification

PostgreSQL via Docker Compose; API on `:3000`; Vite on `:5173`. Provider mode was exercised both
with `AI_PROVIDER=disabled` (deterministic gates) and `AI_PROVIDER=openrouter` (live calls). The
`.env` used for verification is untracked and is not part of the repository.
