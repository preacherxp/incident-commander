# Verification report

This report covers the card-game rebuild. Everything below was run in this workspace unless marked
otherwise.

## Environment

- Bun 1.4.0, Node v22.15.1, Docker 29.7, PostgreSQL 17 (container), macOS (darwin).
- Dev database reset and re-seeded after the schema migration; all runs from the previous simulator
  were discarded deliberately (`CONFIRM_DB_RESET=1 bun run db:reset`).

## Checks

| Check | Command | Result |
|---|---|---|
| Typecheck + import boundaries + determinism | `bun run lint` | pass |
| Domain + API tests | `bun test packages apps/api` | 30 pass, 0 fail |
| Card engine tests | included above (`packages/cards`) | 21 pass |
| Jev voice tests (mocked provider) | included above (`packages/ai`) | 3 pass |
| API persistence integration (real Postgres) | `bun --env-file=.env test apps/api` | pass: create → sync → finalize → replay, idempotency, revision conflict, ownership isolation, origin guard |
| End-to-end card flows | `bun run test:e2e` | 8 passed (7 desktop + 1 touch/mobile) |
| Production builds | `bun run build` | pass; web 331 kB (98 kB gzip), no three.js chunk |

The e2e suite covers: shift selection lists all three incidents; the table shows Jev, a telegraphed
threat and a five-card hand; playing a card spends focus and is logged; ending a round resolves the
telegraph and advances the round; a run resumes from the local checkpoint after reload; a scripted
greedy session wins Friday, opens the draft, and advances to Saturday; doing nothing loses the run
and the debrief records it.

## Balance probe

A greedy bot (best-scoring playable card each turn, first draft offer) was run headlessly against
every start:

| Start | Bot | Outcome | Harm |
|---|---|---|---|
| Friday, 16:58 | greedy | clears 4/4 | 98 |
| Friday, 16:58 | do nothing | loses | 106 at loss |
| Saturday, 02:14 | greedy | clears 3/3 | 64 |
| Saturday, 02:14 | do nothing | loses | 94 at loss |
| Monday, 09:12 | greedy | clears 2/2 | 46 |
| Monday, 09:12 | do nothing | loses | 99 at loss |
| Tuesday, 11:30 | greedy | clears 1/1 | 26 |
| Tuesday, 11:30 | do nothing | loses | 90 at loss |

Passive play loses in every configuration, and the mediocre bot clears every configuration at A or
below — the intended headroom for a human who counters instead of healing. This is enforced by
`bun run --filter @incident-commander/scenarios balance`, which exits non-zero if a start stops
being winnable or starts tolerating passivity.

## Manual verification

- Played Friday end-to-end in a real browser, including the draft into Saturday: the threat card
  telegraphs, shields absorb the next hit, a counter negates a matching deploy, and the log records
  every resolution.
- Jev's OpenRouter voice returned live lines in the browser ("Another incident. I do enjoy watching
  you triage."). With the provider disabled the same cue renders a canned line and play is
  unaffected.
- Screenshots were captured for the shift screen, table, draft, and second incident; the SVG
  incident map renders correctly after the container-measurement fix described in
  `implementation-decisions.md`.
- The touch layout was driven end-to-end on an emulated 390×844 device: card tap, pinned *End round*,
  both collapsible panels, and the draft, all by tapping.
- The second fault mode was played on desktop: *Circuit trip* showed `pierces shields` and ignored a
  banked ward, while *Trip the circuit breaker* negated it.

## Deployment

The Docker/Caddy packaging from the previous build still applies and still builds; only the
environment variables changed (`OPENROUTER_VOICE_MODEL_ID`, `OPENROUTER_CHAT_URL`,
`VOICE_TIMEOUT_MS`, `VOICE_PROMPT_VERSION` replacing the interpreter set). The production compose
file and Dockerfile were not rebuilt as part of this rebuild, and `incident.purecode.sh` remains
undeployed from this session.

## Not measured

- Cross-device sync of an in-progress run (the API path is covered by the integration test; two
  browsers open on the same guest were not exercised).
- Long-run input volume against `MAX_INPUTS_PER_RUN` (10,000 commands), which is far above a normal
  run of ~120 commands.
- Mobile layouts. The table is designed for a desktop viewport; the grid collapses but was not
  tuned for phones.
- LLM dialogue quality or cost under load; the rate limiter is 60 voice requests per guest per
  minute and the provider is optional.
