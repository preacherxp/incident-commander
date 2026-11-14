# Implementation decisions

This document records the decisions that shape the game, in the order they were made.

## Replacing the tick simulation with a card game

The first build of this repository was a real-time incident simulator: a fixed 100 ms tick, a
deterministic 4-action catalogue, and an LLM analyst that recommended actions. It worked, it was
verified, and it was not fun: the loop collapsed into two foregone decisions, and the analyst
effectively printed the answer.

The rebuild keeps the parts that were genuinely good and replaces the game:

- **Kept:** the Bun workspace, Hono API, guest-cookie ownership, Postgres run storage with
  idempotent sync/finalize, IndexedDB offline play, canonical hashing, the migration/seed discipline,
  and the Docker/Caddy deployment.
- **Replaced:** the tick engine, action catalogue, interpretation and assessment endpoints, player
  view, and every screen. `packages/sim` is gone; `packages/cards` is the new engine.
- **Reused as data:** the incidents became encounter decks. `friday-1658`, `saturday-0214`, and a new
  `monday-0912` are now hand-authored card lists with budgets, round limits, and briefings.
  `tuesday-1130` was added with the second fault mode.

The database schema kept its shape (`runs`, `run_inputs`, `run_checkpoints`, `run_batches`). One
migration widens the `run_inputs.type` check constraint to the new command vocabulary. The old
tick-based "pending inputs must target the next tick" rule in `syncRun` was removed: it encoded
wall-clock semantics that a turn-based game does not have. Contiguous sequence numbers and the
`throughSeq` correspondence are still enforced, so a checkpoint can never claim input it did not
process.

## One deterministic engine, one LLM voice

The engine is pure: `createCampaign`, `applyCommand`, `selectPlayerView`, `restoreCampaign`. All
randomness comes from a seed plus a monotonic cursor (`packages/cards/src/rng.ts`), including Jev's
plays. Jev's policy scores its hand with situational bonuses (a sudden card is worth much more when
the player is ahead; repeated tags are worth less) and breaks ties from the seed, so the opponent is
varied but exactly replayable.

This is why the design picked "deterministic core, LLM voice": the interesting guarantee of the
repository — a run can be replayed from its sealed log — must not depend on a provider being up or
on a model behaving the same way twice. Jev's dialogue is a side channel. If the provider is
disabled or fails, `packages/ai` returns a canned line chosen from the same `(runId, cue, round)`
hash, and the game does not notice.

## The card game rules

The design goal was a legible tug-of-war with a real opponent-read, not a second job.

- **Two meters.** Stability (0 → target) is the player's win; customer harm (0 → budget) is Jev's.
  Both are per-incident, so each shift starts clean and the run's score is accumulated harm.
- **Telegraph.** Jev reveals its play one round ahead. A pending threat can be *mitigated* (shields
  absorb harm first, then stability damage) or *negated* (a matching counter zeroes the play
  entirely). Anything unresolved lands when the player ends the round.
- **Counters are riders.** Cards like *Freeze the pipeline* grant stability and negate a `deploy`
  threat if one is pending. This avoids dead cards in the opening hand while keeping counterplay
  meaningful.
- **Sudden plays.** A small set of cards skips the telegraph, so banking shields and holding a
  defensive card is a real decision rather than a dominant strategy.
- **Focus ramp.** *Read the logs*, *Call all hands*, and the risky *Controlled chaos* trade short-term
  tempo for later turns, which keeps the drafting decision from collapsing into "take the biggest
  number".
- **Draft.** Each won incident offers three cards from the next encounter's reward pool. The deck
  persists across the run; encounters reset the meters but not the deck.
- **Ranking.** Per-incident ranks are budget-relative (S at ≤20%, A at ≤45%, B at ≤70%, otherwise C;
  a loss is F). The run rank aggregates total harm against the sum of budgets, and is deliberately
  stricter (S at ≤15%, A at ≤35%, B otherwise) so a perfect run means something.

Balance was set with a scripted greedy bot rather than vibes. The bot plays the best-scoring card
each turn and drafts the first offer. Current reference results:

| Start | Bot | Outcome | Harm |
|---|---|---|---|
| Friday, 16:58 | greedy | clears 4/4 | 98 / 365 total budget |
| Friday, 16:58 | do nothing | loses in incident 1 | 106 |
| Saturday, 02:14 | greedy | clears 3/3 | 64 / 255 |
| Monday, 09:12 | greedy | clears 2/2 | 46 / 165 |
| Tuesday, 11:30 | greedy | clears 1/1 | 26 / 85 |

`bun run --filter @incident-commander/scenarios balance` runs this probe and fails if any start is
unwinnable or any start tolerates passivity. The bot is intentionally mediocre: it lands in the A
band (15–35% of budget) everywhere but not S (≤15%), which is the headroom left for a human who
counters threats instead of healing through them.

The starter deck includes one counter per fault mode (*Freeze the pipeline* for deploy, *Trip the
circuit breaker* for load, *Fail over the region* for infra) so the first incident teaches
negation; without it, players learned shielding and never discovered the counter layer until their
second run. Unplayed cards may keep one into the next round so a counter can be a plan instead of a
draw.

## The second fault mode

One failure archetype meant one memorised answer, so the catalogue now has two that demand different
plays:

- **Deploy faults** (bleeds, `bad-deploy`, `memory-leak`) are about removal. Damage-over-time cards
  keep ticking until they expire, so the answer is *purge* or counter.
- **Load faults** (`thundering-herd`, `circuit-trip`, `hot-partition`, `retry-amplifier`) add
  `pierce`: the shield pool is ignored entirely, and the shields are still consumed. Rate-limiting —
  the instinct the first mode teaches — does nothing, so the answer is negation or raw stability.

Two small engine flags carry it: `pierce` on chaos cards, and `purge` ("all" or a threat tag) on
player cards. Jev's policy also scores piercing plays higher when the player is sitting on a big
ward, so the opponent punishes turtling. Both flags are covered by engine tests, and the balance
probe fails if the new mode is unwinnable (or if it ever becomes safe to ignore).

## Mobile first

The table was rebuilt so the base layout is a phone and the desktop war room is the enhancement:

- Base markup is a single column with a pinned bottom pane: focus pips, a horizontally snapping hand,
  and a full-width *End round* button inside thumb reach, with safe-area padding.
- The desktop three-column layout (Jev rail, incident map, log) is applied at `lg:` and up. The
  incident map and the log collapse into `<details>` on phones.
- Card faces are 9.5rem wide on phones and 10.5rem from `sm:` up; disabled cards now print *why*
  they are disabled because tooltips do not exist on touch.
- `h-[100dvh]` and `viewport-fit=cover` keep the pinned pane above mobile browser chrome and the
  home indicator.

This was verified with a Playwright project that emulates a 390×844 touch device and plays a full
round by tapping, not by asserting CSS.

## Tick is a command ordinal

`RunInput.tick` survives from the old schema, but it now means "the Nth command of the run" and is
identical to `seq`. This came out of a real bug: with tick meaning "round", a draft pick at round 10
followed by the next incident's round 1 produced a decreasing sequence, which the storage layer
correctly rejected. A single global counter makes checkpoints, sync races, and the input log
monotonic across incident boundaries.

## Rendering

The 3D (react-three-fiber) board was removed with the tick simulation. It was expensive to ship and
harder to read than the game needed; the centrepiece is now the cards. The incident map is a plain
SVG whose coordinates are computed from a measured container — deliberately not `viewBox`-scaled,
because headless Chromium failed to apply the viewBox transform for a percentage-sized SVG inside a
flex column, which is exactly the kind of bug that only shows up in screenshots and CI. The web
bundle dropped `three`, `@react-three/fiber`, `@react-three/drei`, and `motion` along with it.

## Versioning

`CARDS_ENGINE_VERSION` (currently 5) is stamped on campaigns and encounters. A stored checkpoint
whose engine version does not match is rejected with a readable error instead of being replayed
under different rules. Published encounter versions are immutable: `bun run db:seed` refuses to
overwrite a version whose content hash changed, so balance changes always ship as a new version
(`friday-1658` went `1.0.0 → 1.1.0` when the starter deck gained a counter and Monday's budget
tightened).

Superseded versions stay in `scenario_versions` because runs reference them by foreign key, and
deleting them would either cascade into saves or be blocked. The API therefore resolves *new* runs
and the scenario manifest from the version in the code's registry, while an existing run still
resolves its own historic version for validation.

## Rules version 5 — the loop the table taught

Playtests showed Friday teaching telegraph-and-counter, then Monday invalidating it with a sudden
pile while the forecast still printed +0. Version 5 keeps the 3-focus turn and changes the wrap:

- **Honest forecast.** Known harm plus the encounter's surprise cap is the big number. A countered
  telegraph is not "safe" if a sudden card can still land. An empty telegraph is labelled a
  defensive turn, because that is the only moment ward applies to a surprise.
- **One-card hold.** `end_turn` may name a leftover card. It stays in hand; the rest discard; draw
  fills around it. Optional, so old logs still replay.
- **Infra in the starter deck.** *Fail over the region* replaces *Page a second engineer*, so a
  database lock is a choice on Friday.
- **Briefing once per incident.** The authored `briefing` is shown at round 1 before any play, then
  not again until the next shift.
- **Tuesday is the climax.** Most sudden cards moved off Monday onto Tuesday, which already had
  pierce and bleeds. Monday still telegraphs, with one surprise as spice.

Encounter versions went to `1.5.0`. In-flight saves from engine 4 cannot resume.

## One live shift

The four-incident campaign taught the round well and then spent three more shifts repeating it. The
live product is now a single polished encounter: Friday, 16:58, version `1.7.0`. Winning completes
the run. Saturday, Monday, and Tuesday stay in source as unpublished drafts and are not in
`ENCOUNTERS`. Version 1.7.0 raises the target to 100 and prefers pierce after you shield, and
sudden from round 3, so the shift does not end before those rules appear.
