import { CARDS_ENGINE_VERSION, type EncounterDefinition } from "@incident-commander/cards";

export const FRIDAY_1658: EncounterDefinition = {
  id: "friday-1658",
  version: "1.0.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Friday, 16:58",
  summary:
    "The v43 deploy is leaking database sessions and checkout is failing at the start of the weekend rush.",
  difficulty: "Guided · about three minutes",
  seed: 90210,
  stabilityTarget: 100,
  harmBudget: 110,
  focusPerTurn: 3,
  handSize: 5,
  maxRounds: 10,
  startingDeck: [
    "rollback",
    "scale-out",
    "restart",
    "restart",
    "restart",
    "diagnose",
    "diagnose",
    "status-page",
    "status-page",
    "throttle",
    "throttle",
    "page-oncall",
    "runbook",
  ],
  rewards: [
    "failover",
    "all-hands",
    "blameless-retro",
    "load-shedder",
    "on-call-swap",
    "capacity-buffer",
  ],
  jevDeck: [
    "traffic-surge",
    "traffic-surge",
    "retry-storm",
    "cache-stampede",
    "bad-deploy",
    "bad-deploy",
    "memory-leak",
    "db-lock",
    "pager-storm",
    "alert-fatigue",
  ],
  briefing: {
    objective: "Hold checkout together long enough to get stability back to 100.",
    steps: [
      "Each round you get 3 focus. Spend it on cards, then end the round.",
      "Jev telegraphs its next play. Block it, counter it, or race past it.",
      "Every 4 harm you take is a customer who could not check out.",
    ],
    thresholds: [
      "Stability reaches 100 — the incident is contained.",
      "You survive every round Jev throws at you.",
      "Customer harm stays under 100.",
    ],
    impactLimit: "Lose at 110 harm or when the tenth round closes.",
  },
};

export const SATURDAY_0214: EncounterDefinition = {
  id: "saturday-0214",
  version: "1.0.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Saturday, 02:14",
  summary:
    "Express checkout is already off, but the connection pool is still full and the graph is all red.",
  difficulty: "Standard · about four minutes",
  seed: 41194,
  stabilityTarget: 100,
  harmBudget: 90,
  focusPerTurn: 3,
  handSize: 5,
  maxRounds: 10,
  startingDeck: [
    "rollback",
    "scale-out",
    "restart",
    "restart",
    "restart",
    "diagnose",
    "diagnose",
    "status-page",
    "status-page",
    "throttle",
    "throttle",
    "page-oncall",
    "runbook",
  ],
  rewards: [
    "exec-air-cover",
    "deploy-freeze",
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
    "db-lock",
    "noisy-neighbor",
    "noisy-neighbor",
    "dns-flap",
    "config-drift",
    "vendor-outage",
    "alert-fatigue",
    "pager-storm",
  ],
  briefing: {
    objective: "Bring stability to 100 while the overnight batch keeps stealing capacity.",
    steps: [
      "The fix that worked on Friday will not work here. Read the telegraphs.",
      "Infrastructure threats are frequent: failover and rate-limits pay off.",
      "Quiet hands cost you. Jev never stops.",
    ],
    thresholds: [
      "Stability reaches 100 before the tenth round ends.",
      "You keep customer harm under 90.",
      "No sudden plays catch you without a plan.",
    ],
    impactLimit: "Lose at 90 harm or when the tenth round closes.",
  },
};

export const MONDAY_0912: EncounterDefinition = {
  id: "monday-0912",
  version: "1.0.0",
  engineVersion: CARDS_ENGINE_VERSION,
  title: "Monday, 09:12",
  summary:
    "The executive demo is live in forty minutes and Jev has saved its worst plays for the finale.",
  difficulty: "Brutal · about five minutes",
  seed: 77123,
  stabilityTarget: 100,
  harmBudget: 90,
  focusPerTurn: 3,
  handSize: 5,
  maxRounds: 11,
  startingDeck: [
    "rollback",
    "scale-out",
    "restart",
    "restart",
    "restart",
    "diagnose",
    "diagnose",
    "status-page",
    "status-page",
    "throttle",
    "throttle",
    "page-oncall",
    "runbook",
  ],
  rewards: [
    "trace",
    "exec-air-cover",
    "chaos-monkey",
    "failover",
    "war-room",
    "all-hands",
  ],
  jevDeck: [
    "traffic-surge",
    "traffic-surge",
    "bad-deploy",
    "config-drift",
    "db-lock",
    "noisy-neighbor",
    "vendor-outage",
    "vendor-outage",
    "sla-clock",
    "sla-clock",
    "data-corruption",
    "data-corruption",
    "alert-fatigue",
  ],
  briefing: {
    objective: "Reach 100 stability in eleven rounds with the executive demo watching.",
    steps: [
      "Sudden plays resolve the turn Jev reveals them. Budget for the unblockable hits.",
      "Your deck carried over. Drafting well on Friday and Saturday is what saves you here.",
      "You cannot out-last this deck. You have to out-play it.",
    ],
    thresholds: [
      "Stability reaches 100 before round eleven closes.",
      "You keep customer harm under 90.",
      "The demo goes ahead on a working checkout.",
    ],
    impactLimit: "Lose at 90 harm or when the eleventh round closes.",
  },
};

export const ENCOUNTERS: EncounterDefinition[] = [FRIDAY_1658, SATURDAY_0214, MONDAY_0912];

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
