# Incident Commander

A deterministic, single-player card game about running an outage while an adversarial AI — **Jev** —
throws the incident at you. Jev telegraphs its next play; you spend focus on cards to contain the
damage, counter the play, or push stability back up. Clear **Friday, 16:58** without burning the
customer-harm budget. It is playable one-handed on a phone and scales up to a desktop war room.

The battlefield is rendered in **Three.js**: a floating server city with live attack routes,
shield domes, bloom lighting, and card-triggered energy bursts. Drag to orbit, reset the camera,
or pause motion. The renderer loads separately, respects reduced-motion settings, and stops
rendering offscreen. Cards and saves remain usable if WebGL is unavailable.

The twist is the opponent: Jev is not a hint system, it is the thing breaking production. It reacts
to how well you are doing, saves its worst plays for when you are ahead, and talks trash while it
does it.

## How a shift plays

1. **Read.** Every round Jev reveals its next card. Tags (`load`, `deploy`, `infra`, `people`,
   `sudden`) tell you what counters it.
2. **Play.** You have 3 focus and a five-card hand. Contain cards add stability, communicate cards
   cut harm, respond cards block or negate the incoming play, recover cards draw and ramp focus.
3. **End the round.** Jev strikes. You may keep one unplayed card; the rest are discarded and you
   draw a fresh hand. Focus refills each round. Sudden cards ignore the telegraph entirely. The
   forecast includes surprise damage, so an empty telegraph is a defensive turn.
4. **Finish.** Reach 100 stability to contain the incident. Lose at 80 harm or when the ninth round
   closes. The debrief ranks the shift.

Matching counters cancel the entire incoming play, including its bleed and disruption effects. The
table highlights counters and combos, forecasts known damage plus the surprise cap, and shows the
result of each play. A shift briefing appears once at the start. **Run it again** starts a fresh
shuffle; its seed is saved, so that run still replays exactly.

Selected threats disrupt contain gains until fully shielded or countered. *Open the runbook*
sets up +12 stability on your next contain this round; *Read the logs* draws two cards and sets
up +4. Setup bonuses expire at round end. Surprise is included in the forecast number, and named impacts
remain visible afterward. Rank rewards speed, counters, and damage prevented; healing reduces
current harm but cannot erase damage taken. Debrief statistics cover the whole run. The starter
deck includes *Fail over the region* so an infra telegraph is a choice, not a draw check.

On phones, tap a compact card to inspect it, then tap **Play**. Optional synthesized sound cues
are controlled by **Sound on/off** in the header. Motion controls and reduced-motion support
remain available.

The live product is one polished shift: **Friday, 16:58**. Later incidents remain in the repo as
unpublished drafts. Older saves remain on the device but cannot be resumed under the new rules.

## Fault modes

Friday mixes both answers so the one shift teaches the whole table:

- **Deploy faults** leak and drift. Bleeds keep ticking until they expire, and *Roll back* or
  *Freeze the pipeline* shut them down.
- **Load faults** can **pierce shields**: rate-limiting does nothing, so you negate the play with
  *Trip the circuit breaker*. *Fail over the region* answers infra. One sudden card can land with
  no telegraph; the forecast already includes it.

## Determinism and replay

The game engine (`packages/cards`) is pure TypeScript. Every shuffle and every opponent choice is
derived from the run seed and a single monotonic cursor, so the same command log always produces the
same state. Only commands change outcomes; the presentation layer cannot shortcut one. Runs persist
as an immutable input log plus checkpoints, on the device (IndexedDB) and on the server, and a full
run can be reconstructed from it.

Jev's dialogue is the one non-deterministic part, and it is deliberately outside the simulation: it
is fetched from OpenRouter for flavour, with deterministic canned lines as the fallback. It never
affects a card, a draw, or a result.

## Repository layout

| Path | Responsibility |
|---|---|
| `packages/contracts` | Zod DTOs, command vocabulary, canonical JSON + SHA-256 |
| `packages/cards` | Card catalog, deterministic engine, campaign/draft, ranking, checkpoints |
| `packages/scenarios` | The four authored incidents (decks, budgets, briefings) |
| `packages/db` | Drizzle schema, migrations, run repository, seed |
| `packages/ai` | Jev's OpenRouter chat voice plus deterministic fallback lines |
| `apps/api` | Hono API: guest ownership, run persistence, Jev voice |
| `apps/web` | Three.js arena with a React card HUD, threat forecasts, log, and debrief |
| `tests/e2e` | Playwright card flows |
| `docs` | Decisions, encounter authoring, operations, verification, deployment |

## Quickstart

```sh
bun install
cp .env.example .env
docker compose --env-file .env -f infra/compose.yaml up -d db
bun run db:migrate && bun run db:seed
bun run dev            # API on :3000, web on :5173
```

Open http://localhost:5173. The game is fully playable with `AI_PROVIDER=disabled`; set it to
`openrouter` with a key to hear Jev improvise.

## Checks

```sh
bun run lint           # import boundaries, determinism, then typecheck
bun test packages apps/api
bun run test:e2e
bun run --filter @incident-commander/scenarios balance   # every start winnable, none passive-safe
```

The Playwright suite includes a phone-sized project (`mobile.spec.ts`) that plays a full round with
touch input, so the layout is verified rather than assumed.

Deployment (Docker + Caddy) is documented in `docs/deployment.md`.
