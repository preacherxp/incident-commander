# Implementation decisions

This file records deliberate deviations from and additions to the implementation handoff, so a
future reader can tell what is authoritative.

## Interpretation provider: OpenRouter Decisions endpoint

The handoff specifies the native TypeSafe adapter for Jev, with OpenRouter as an optional
follow-up. The product owner directed that **OpenRouter** be the provider, and a credentialed
conformance test showed that `typesafe/jev-1.13` is a **decisions** model: the OpenAI-compatible
`/chat/completions` endpoint rejects it with "Use the /api/alpha/decisions endpoint instead".

The adapter therefore calls the OpenRouter Decisions API directly, which matches the handoff's
native request shape (`state` + typed `questions` with a `choice` answer):

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer <OPENROUTER_API_KEY>
{
  "model": "typesafe/jev-1.13",
  "state": { "command": ..., "selectedService": ..., "context": <bounded visible context> },
  "questions": {
    "requested_operation": {
      "type": "choice",
      "instructions": "...",
      "criteria": { "<candidateId>": "<description>", ...,
                    "ambiguous": "...", "unsupported": "...", "multiple_actions": "..." }
    }
  }
}
```

The response's `answers.requested_operation` is a choice answer carrying `choice`, `confidence`,
and `probabilities`. The server reconstructs the catalogue from the versioned scenario and accepts
**only** candidate IDs; provider-supplied parameters are impossible because the intent (including
target and params) comes from the catalogue, never from the model.

- Endpoint override: `OPENROUTER_DECISIONS_URL` (default `https://openrouter.ai/api/alpha/decisions`).
- Model: `OPENROUTER_MODEL_ID` (default `typesafe/jev-1.13`). `OPENCODE_API_KEY` is accepted as an
  alias for `OPENROUTER_API_KEY`.
- Gates: top probability `>= 0.75` and top-two margin `>= 0.20` from the returned distribution,
  otherwise `clarify` with ranked alternatives. A missing distribution falls back to
  `confidence` without a margin check. These remain provisional.
- No credential, or `AI_PROVIDER=disabled`, yields `status: "unavailable"`, never a fake result.
- A real-provider smoke run (`bun run ai:smoke`) and a browser UI call were executed successfully;
  see `docs/verification-report.md`.


## Jev-first interface and a four-action catalogue

The first build exposed nine actions and a dense inspector. Player feedback was that it was too
much and that Jev, the most interesting part, was invisible. The UI is now built around Jev and the
catalogue is cut to four actions:

| Action | Purpose |
|---|---|
| `diagnose_connections` | Diagnostic. Reports the session ledger and points at the released code path responsible. |
| `set_express` | Disable express checkout, stopping new leaks. |
| `rollback_checkout` | Rolling replacement of checkout to v42 (removes the leak source). |
| `recycle_checkout` | Rolling restart that releases each instance's leaked sessions. |

Emergency credits and the `sample_trace`, `compare_release`, `expand_database`, `scale_checkout`,
and `restart_database` actions were removed. The release finding now folds into the single
diagnostic. Scenario `friday-1658` was bumped to `1.1.0`; existing `1.0.0` rows remain but report
`VERSION_UNAVAILABLE` rather than being reinterpreted.

### Playability pass (`1.2.0`)

Player feedback was blunt: the game made no sense and was not fun. The mechanics were sound; the
presentation leaked engineering internals and never stated a goal a person could hold in their head.
`friday-1658` is bumped to `1.2.0` with a plain-language rewrite (old versions still resolve for
saved runs):

- The briefing leads with one sentence and three steps instead of seven recovery thresholds.
- Actions use human names ("Check the sessions", "Restart checkout") and descriptions that admit
  trade-offs; the UI no longer renders raw `action_id` strings.
- Jev is the default loop: it assesses automatically when the incident starts. Manual actions are
  demoted behind "Fix it yourself".
- A persistent status line states the goal and the live recovery hold; harm is restated as failed
  checkout requests.
- The debrief opens with a rank (S/A/B/F) and explains it, so runs are worth replaying.

### Playability and stability pass (`1.3.0`)

Playing the game end-to-end exposed a freeze, stale advice, and a harm budget that never mattered
(perfect play cost 27 of 18,000). `friday-1658` is bumped to `1.3.0`:

- **No more freeze.** `performance-stall` now clears on the next healthy frame instead of latching
  forever (`apps/web/src/engine/session.ts`), and returning to the tab auto-resumes instead of
  waiting for a manual resume. Pause reasons render in plain language.
- **Jev is live.** The panel re-assesses automatically whenever the world materially changes and no
  job is running, so advice cannot go stale. If the suggested action is unavailable, the UI promotes
  an available alternative rather than showing a dead button.
- **The loop can't throttle itself.** The interpretation limiter moved from 20 to 60 requests/min
  and the assess criteria choose `hold` whenever an operation is already in flight.
- **Real stakes.** The database allowance dropped 96 → 84 (sessions start at 80/84) and the harm
  budget 18,000 → 2,500. Measured: a fast correct fix wins at ~90s with ~190 harm; a slow fix still
  wins around 1,700; doing nothing now loses in ~55s instead of ~350s.

### Fun pass (`1.4.0`, reissued as `1.5.0`)

The result was playable but not fun: two foregone decisions, a 30-second hold, and a diagnosis that
printed the answer. `friday-1658` is bumped to `1.5.0` (the `1.4.0` content differed only by its
difficulty label, which was corrected after seeding):

- **Faster loop.** Diagnose 6s → 3s, express 3s → 1.5s, rollback 20s → 9s, recycle 12s → 6s, and the
  hold 30s → 15s. A run is now about a minute, not three.
- **The diagnosis reports facts, not the fix.** It states the release difference and the leak trend;
  it no longer says "disable express or remove v43". Connecting the dots is the player's job.
- **Doubting Jev is a skill.** The cautious Jev path (diagnose, then roll back) wins in ~59s with
  ~27 harm. Going straight to the rollback, reading the board yourself, wins in ~50s with ~18 harm —
  the free diagnostic costs real seconds. Both are legible in the debrief.
- **A score to chase.** The best run per scenario version is stored locally and shown on the debrief
  (new best) and the shift screen (`S · 00:50 · 18 harm`). Rank now rewards harm/time, so mastering
  the fastest safe route beats following instructions.
- **Fixed a click-blocker.** The board's floating labels used drei's default portal z-index and could
  intercept clicks on the approval dialog; they are now capped below the UI overlays.

### Second incident and selection (`saturday-0214@1.0.0`)

One scenario meant one memorised answer, which caps replay value. A second incident now ships:

- **`saturday-0214`** opens with express checkout **already off** and the session pool at 96/96. The
  habit that saves you on Friday — disabling express — is a no-op here, so the right first move is to
  release the held sessions (restart) or replace the release. Passive play loses at ~41s versus
  Friday's ~55s.
- **Selection** is real: the shift screen lists every locally playable scenario with its own best
  run, and the chosen scenario drives run creation. Resumed and debriefed runs resolve their
  definition from the stored `scenarioId`/`scenarioVersion`, so mixing incidents on one device works.
- **Shared catalogue.** Actions and topology moved to `packages/scenarios/src/actions.ts` and
  `topology.ts`; `registry.ts` owns `SCENARIOS`, `getScenario`, and `scenarioLabel`. Friday's content
  is byte-identical apart from the reissued label, so its behaviour is unchanged.
- **The engine still has one root cause** (the v43 session leak). The incidents differ in opening
  pressure and in which fix applies, not in the underlying failure mode. A second *cause* would need
  engine and catalogue work.

### Jev "explain + propose"

Jev is a decisions model, so it cannot generate prose. The UI asks it two structured questions in
one request (a second decisions question alongside the existing command classifier):

- `situation` — a `choice` over bottleneck codes (`database_sessions`, `checkout_capacity`, …).
- `recommendation` — a `choice` over the action catalogue plus `hold`.

The request carries a named `investigation` object (`sessions_investigated`, `express_enabled`,
`checkout_versions`, `database_alert`) so Jev can reason over explicit booleans rather than parsing
evidence keys. The UI renders readable sentences from the returned codes; Jev never writes copy.
The engine remains the only thing that executes an action, and only after the player approves.

Endpoint: `POST /api/v1/advise` (bounded to one decisions call, same 60/minute limiter as
interpretation). The player client re-assesses automatically when the world materially changes and no
job is running, so advice is never stale; while a job is in flight the panel disables its suggestion
rather than letting a completed action be re-committed.

## Persistence schema


- `runs.latest_checkpoint_id` from the handoff table was **removed**. The latest checkpoint is
  derived by `MAX(revision)` per run, which avoids a circular foreign key between `runs` and
  `run_checkpoints`. The handoff explicitly permits this alternative.
- `runs.seed` is `bigint` (mapped to a safe JS number) because PostgreSQL signed `integer` cannot
  hold the full uint32 range.
- The snapshot stored in `run_checkpoints.snapshot` is the engine state; the `(tick, throughSeq)`
  envelope is stored in dedicated columns and reconstructed on read.

## Engine-level idempotency

Full-run input-id deduplication is owned by the browser coordinator and the API, which persist and
index inputs by `(run_id, input_id)` before sequence assignment. The engine additionally tracks a
bounded recent-input-id ring to make an accidental duplicate deterministic inside a tick. The
engine never receives an input without an assigned contiguous sequence; a gap or a wrong tick is a
programming error and throws.

## Test-only driver affordances

- `?speed=N` (persisted to `sessionStorage`) multiplies how many fixed ticks the browser driver
  advances per frame, up to 20x. Simulation semantics are unchanged; this only lets end-to-end
  tests reach terminal states quickly.
- `?board=html` forces the DOM board fallback. It does not change gameplay.

Both are presentation/driver concerns and cannot alter simulation outcomes.

## Tooling

- Bun workspace monorepo; `bun test` for unit/integration; Playwright for e2e.
- Tailwind CSS v4 via the Vite plugin, Motion for React for a few transitions, R3F 9 / drei 10 /
  three for the board. Reduced motion, low-graphics mode, and the DOM fallback are first-class.
- One shared canonical JSON serializer and SHA-256 hashing live in `packages/contracts` and are used
  by both the browser and the API.

## Known gaps

- **Deployment is packaged but not launched.** `Dockerfile`, `infra/compose.prod.yaml`, and
  `infra/Caddyfile` produce a working production image (verified: migrations, API, SPA deep links,
  asset caching). DNS and Caddy TLS for `incident.purecode.sh` have not been exercised on the real
  host.
- `db:seed` is idempotent for identical definitions and errors on a changed hash at the same
  version, as specified. No `db:seed:force` exists by design.
- The revision-conflict flow currently preserves the local branch and pauses with a dismissible
  notice. The full "load saved run / keep as a separate run" fork described in the handoff is not
  built; the local branch is never merged or overwritten.
- Cross-browser testing covers Chromium; Firefox/Safari and real-device performance are unverified.

