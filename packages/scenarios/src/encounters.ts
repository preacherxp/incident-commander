import { CARDS_ENGINE_VERSION, type EncounterDefinition } from "@incident-commander/cards";

const STARTER_DECK = [
  "rollback",
  "scale-out",
  "restart",
  "restart",
  "diagnose",
  "diagnose",
  "status-page",
  "throttle",
  "throttle",
  "deploy-freeze",
  "deploy-freeze",
  "circuit-breaker",
  "circuit-breaker",
  "failover",
  "runbook",
];

export const FRIDAY_1658: EncounterDefinition = {
  id: "friday-1658",
  version: "1.8.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Friday, 16:58",
  summary:
    "The v43 deploy is leaking database sessions and checkout is failing at the start of the weekend rush.",
  difficulty: "Standard · teaching shift",
  seed: 90210,
  stabilityTarget: 85,
  harmBudget: 80,
  focusPerTurn: 4,
  handSize: 5,
  maxRounds: 9,
  startingDeck: [...STARTER_DECK],
  rewards: [
    "exec-air-cover",
    "load-shedder",
    "on-call-swap",
    "trace",
    "all-hands",
    "war-room",
  ],
  jevDeck: [
    "traffic-surge",
    "bad-deploy",
    "memory-leak",
    "db-lock",
    "thundering-herd",
    "retry-storm",
    "config-drift",
    "vendor-outage",
  ],
  briefing: {
    objective: "Get stability to 85 before checkout falls over. Stay under 80 customer harm.",
    steps: [
      "Each round you get 4 focus. Read the telegraph, spend, then end the round.",
      "Matching counters cancel the whole play: freeze deploy, trip load, fail over infra. Keep one card if the tag is wrong.",
      "If you only shield, Jev starts piercing. A surprise can land with no telegraph — the forecast already includes it.",
    ],
    thresholds: [
      "Stability reaches 85 — the incident is contained.",
      "You survive every round Jev throws at you.",
      "Customer harm stays under 80.",
    ],
    impactLimit: "Lose at 80 harm or when the ninth round closes.",
  },
};

export const SATURDAY_0214: EncounterDefinition = {
  id: "saturday-0214",
  version: "1.6.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Saturday, 02:14",
  summary:
    "Express checkout is already off, but the connection pool is still full and the graph is all red.",
  difficulty: "Standard · recovery focus",
  seed: 41194,
  stabilityTarget: 80,
  harmBudget: 85,
  focusPerTurn: 4,
  handSize: 5,
  maxRounds: 10,
  startingDeck: [...STARTER_DECK],
  rewards: [
    "exec-air-cover",
    "on-call-swap",
    "capacity-buffer",
    "trace",
    "chaos-monkey",
    "load-shedder",
  ],
  jevDeck: [
    "traffic-surge",
    "retry-storm",
    "cache-stampede",
    "db-lock",
    "noisy-neighbor",
    "dns-flap",
    "config-drift",
    "vendor-outage",
    "pager-storm",
  ],
  briefing: {
    objective: "Bring stability to 80 while the overnight batch keeps stealing capacity.",
    steps: [
      "The fix that worked on Friday will not work here. Read the telegraphs.",
      "Database locks reduce contain gains by 6. Fully shield or Fail over the region to restore recovery.",
      "No telegraph is a defensive turn. Shields you play now cover a surprise; counters cannot.",
      "Quiet hands cost you. Jev never stops.",
    ],
    thresholds: [
      "Stability reaches 80 before the tenth round ends.",
      "You keep customer harm under 85.",
      "No sudden plays catch you without a plan.",
    ],
    impactLimit: "Lose at 85 harm or when the tenth round closes.",
  },
};

export const MONDAY_0912: EncounterDefinition = {
  id: "monday-0912",
  version: "1.6.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Monday, 09:12",
  summary:
    "The executive demo is live in forty minutes. Rate limits start failing; you have to counter the telegraph.",
  difficulty: "Hard · high pressure",
  seed: 77123,
  stabilityTarget: 85,
  harmBudget: 80,
  focusPerTurn: 4,
  handSize: 5,
  maxRounds: 11,
  startingDeck: [...STARTER_DECK],
  rewards: [
    "trace",
    "exec-air-cover",
    "drain-the-queue",
    "failover",
    "war-room",
    "all-hands",
  ],
  jevDeck: [
    "traffic-surge",
    "bad-deploy",
    "config-drift",
    "db-lock",
    "noisy-neighbor",
    "thundering-herd",
    "circuit-trip",
    "alert-fatigue",
    "pager-storm",
    "retry-storm",
    "cache-stampede",
    "dns-flap",
  ],
  briefing: {
    objective: "Reach 85 stability in eleven rounds with the executive demo watching.",
    steps: [
      "Mid-incident the failure changes character: rate limits stop working, so counter instead of blocking.",
      "Trip the circuit breaker answers load. Fail over the region answers infra. Hold the one you will need next.",
      "A surprise can still land. The forecast includes it; an empty telegraph is the turn to shield.",
      "You cannot out-last this deck. You have to out-play it.",
    ],
    thresholds: [
      "Stability reaches 85 before round eleven closes.",
      "You keep customer harm under 80.",
      "The demo goes ahead on a working checkout.",
    ],
    impactLimit: "Lose at 80 harm or when the eleventh round closes.",
  },
};

export const TUESDAY_1130: EncounterDefinition = {
  id: "tuesday-1130",
  version: "1.6.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Tuesday, 11:30",
  summary:
    "A flash sale turns every timeout into two more retries. Rate limits are not holding, the bleeds are stacking, and Jev saved the surprises for last.",
  difficulty: "Brutal · finale",
  seed: 52007,
  stabilityTarget: 90,
  harmBudget: 85,
  focusPerTurn: 4,
  handSize: 5,
  maxRounds: 11,
  startingDeck: [...STARTER_DECK],
  rewards: [
    "drain-the-queue",
    "failover",
    "load-shedder",
    "exec-air-cover",
    "trace",
    "capacity-buffer",
  ],
  jevDeck: [
    "retry-amplifier",
    "thundering-herd",
    "circuit-trip",
    "hot-partition",
    "traffic-surge",
    "retry-storm",
    "cache-stampede",
    "db-lock",
    "data-corruption",
    "sla-clock",
    "vendor-outage",
  ],
  briefing: {
    objective: "Break the retry loop before it buries checkout.",
    steps: [
      "Thundering herd cuts contain gains by 8. Counter it to restore recovery; shields cannot help.",
      "Bleeds keep ticking until they run out. Drain the queue when they stack.",
      "Jev's worst surprises live here. The forecast shows known damage plus the surprise cap.",
      "Hold a circuit breaker if the telegraph is the wrong tag. An empty panel is not a rest.",
    ],
    thresholds: [
      "Stability reaches 90 before the eleventh round ends.",
      "You keep customer harm under 85.",
      "You stop the retries at the source, not at the edge.",
    ],
    impactLimit: "Lose at 85 harm or when the eleventh round closes.",
  },
};

export const ENCOUNTERS: EncounterDefinition[] = [FRIDAY_1658, SATURDAY_0214, MONDAY_0912, TUESDAY_1130];

export const ENCOUNTER_REGISTRY: Record<string, EncounterDefinition> = Object.fromEntries(
  ENCOUNTERS.map((encounter) => [encounter.id, encounter]),
);

export function getEncounter(id: string, version?: string): EncounterDefinition | undefined {
  const encounter = ENCOUNTER_REGISTRY[id];
  if (!encounter) return undefined;
  if (version && version !== encounter.version) return undefined;
  return encounter;
}

export function encounterOrder(startId: string): string[] {
  const index = ENCOUNTERS.findIndex((encounter) => encounter.id === startId);
  if (index < 0) return [ENCOUNTERS[0]?.id ?? startId];
  return ENCOUNTERS.slice(index).map((encounter) => encounter.id);
}

export function encounterLabel(encounter: EncounterDefinition): string {
  return `${encounter.title} · ${encounter.difficulty}`;
}
