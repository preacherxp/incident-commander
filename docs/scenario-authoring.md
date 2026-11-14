# Authoring encounters

An encounter is one incident: a player deck, a Jev deck, two budgets, a round limit, and a briefing.
Encounters live in `packages/scenarios/src/encounters.ts` and reference cards by id from
`packages/cards/src/cards.ts`.

## Shape

```ts
{
  id: "friday-1658",
  version: "1.0.0",            // immutable once seeded
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Friday, 16:58",
  summary: "One or two sentences shown on the shift screen.",
  difficulty: "Guided · about three minutes",
  seed: 90210,                 // fixed per encounter: openings are identical every run
  stabilityTarget: 100,        // player wins at this stability
  harmBudget: 110,             // player loses at this harm
  focusPerTurn: 3,
  handSize: 5,
  maxRounds: 10,               // losing the SLA if the round counter passes this
  startingDeck: [...],         // ids of player cards; repeats are allowed
  rewards: [...],              // ids offered as the draft after the previous incident
  jevDeck: [...],              // ids of chaos cards; repeats are allowed
  briefing: { objective, steps, thresholds, impactLimit },
}
```

Encounters run in the order they appear in `ENCOUNTERS`. The live product currently lists only
`friday-1658`. Later incidents may exist in the same file as unpublished drafts.

## Authoring rules

- **Budgets set the rank.** Per-incident grades are relative to `harmBudget` (S at ≤20%, A at ≤45%,
  B at ≤70%, C otherwise). A budget of 110 makes an S rank cost 22 harm or fewer.
- **Round limits are the real clock.** `maxRounds` should be tight enough that a deck which drafts
  badly cannot out-heal the encounter. `Monday` is deliberately not survivable by healing alone.
- **Jev's deck should include at least one `sudden` card** as the incident escalates; decks without
  one can be fully solved by reactive shielding. Put the densest sudden pile on the last incident,
  not the middle one. Keep sudden cards out of the opening hand — the engine excludes them from the
  opening reveal, so an all-sudden deck falls back to a telegraph. The player view's surprise cap
  is the max sudden in that encounter's deck; the table adds it to the forecast.
- **Reward pools feed the *next* incident's draft.** A run that starts at Monday never drafts, so
  Monday's balance assumes the starter deck only.
- **The starter deck is part of the design.** If you change it, every encounter's balance changes.
  It carries one counter per fault mode (deploy, load, infra) so the first incident can teach
  negation, and players may hold one leftover card into the next round.

## Fault modes

Two flags define the archetypes, and probes cover both:

- Chaos cards can set `pierce: true`, which ignores the player's shield pool (ward and mitigation)
  while still consuming it. Negation still works. Use it to make rate-limiting the wrong answer.
- Player cards can set `purge: "all"` or `purge: "infra" | "deploy" | "load" | "people" | "sudden"`,
  which removes active bleeds. Use it to give removal decks an answer to damage-over-time.

## Adding a card

1. Add the definition to `PLAYER_CARDS` or `CHAOS_CARDS` in `packages/cards/src/cards.ts`.
2. Bump `CARDS_ENGINE_VERSION` in `packages/cards/src/types.ts`. This invalidates in-flight saves on
   purpose: a card that changes behaviour is a new engine.
3. Reference the id from an encounter's `startingDeck`, `rewards`, or `jevDeck`.
4. Run `bun run --filter @incident-commander/scenarios balance`. It plays every start with a greedy
   bot and a passive bot and fails if any start becomes unwinnable or stops punishing passivity.

## Publishing

```sh
bun run db:generate        # only if the database schema changed
bun run db:migrate
bun run db:seed            # registers new id@version rows; refuses to mutate a published version
```

Content changes to a published encounter must ship as a new `version`. The seed compares the
canonical content hash and aborts if a published `id@version` changed, which keeps old runs
replayable.
