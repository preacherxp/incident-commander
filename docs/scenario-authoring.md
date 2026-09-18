# Scenario authoring notes

Scenarios are immutable, versioned JSON definitions validated by `packages/scenarios`. The server
owns the canonical definition; the browser bundles the same definition because it is
browser-authoritative. A definition is hashed with the shared canonical serializer; the hash is
copied into run metadata and checkpoints.

## Rules

- Never mutate a published `(id, version)`. Change any tuning value and increment the version.
  `db:seed` registers a new version, no-ops on an identical hash, and errors on a changed hash at
  the same version.
- Preserving a JSON definition does not preserve the simulation code needed for replay. Keep
  historical engine builds available separately.
- All values are authored playtest defaults, not measured production behavior.

## Schema bounds (rejected, never clamped)

- rates: integer 1–32 requests/s per class
- deadlines: 10–100 ticks · queue caps: 1–256
- session allowance: 1–256 · checkout instances: 1–3 · workers: 1–16 per instance/service
- action durations: 1–600 ticks · credits: 0–8
- exactly two engineer slots in the first release
- `maxAllowance >= allowance`; expansion headroom needs a positive `expandAmount`
- idle reservations must not exceed the allowance on their own
- `cohortTailTicks >= deadlineTicks + 300`

## Recovery model

Recovery is evaluated once per simulated second on a **matured arrival cohort**
`[T − (300 + deadline), T − deadline)`. Metrics become ready at tick `300 + deadline`; before that
the UI reports "Collecting 30-second window" rather than extrapolating.

All conditions must hold: minimum cohort size per class, ≥98% technically resolved, nearest-rank p95
within target, backlog ≤ 8, database and every checkout instance online, the faulty path inactive
(express disabled or every instance on v42), zero leaked sessions, and no mutating operation in
flight. `stableSinceTick` resets on any failed metric evaluation and immediately on a structural
breach. A win requires `T − stableSinceTick >= recovery.stabilityTicks` (150 ticks, 15 seconds, for
the first shift).

Valid payment declines count as technically resolved. Disabling express reroutes demand through
ordinary checkout and is tracked separately; it is a disclosed residual restriction, not a failure.

## Teaching scenario: Friday, 16:58

Seed `42043`; 16 checkout/s and 8 catalog/s; two v43 checkout instances; allowance 84 with 36 leaked
sessions per instance (72 total, 80/84 committed at open). Declined express requests on v43 retain
their database session; v42 releases it. Two recovery routes are intended: rolling rollback to v42,
or disable express and recycle every instance. Recycling alone relapses because the leak source
remains active. Database expansion buys bounded headroom but is not a fix.

## Adding a scenario

1. Add a definition to `packages/scenarios`.
2. Ensure the scenario and engine `engineVersion` agree.
3. Add fixture manifests and a genesis checkpoint under the tests that prove conservation,
   determinism, and both recovery routes.
4. Run `bun run db:seed` to register the immutable version.
