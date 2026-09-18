export const CARDS_ENGINE_VERSION = 2;
export const CAMPAIGN_STATE_VERSION = 2;
export const JEV_HAND_SIZE = 3;

export const THREAT_TAGS = ["load", "deploy", "infra", "people", "sudden"] as const;
export type ThreatTag = (typeof THREAT_TAGS)[number];

export type PlayerCardKind = "contain" | "communicate" | "respond" | "recover";

export type PlayerCard = {
  id: string;
  kind: PlayerCardKind;
  name: string;
  glyph: string;
  cost: number;
  text: string;
  rarity: "starter" | "common" | "rare";
  stability?: number;
  harmReduce?: number;
  draw?: number;
  focusNext?: number;
  shield?: number;
  negateTag?: ThreatTag;
  negateBonusStability?: number;
  warRoom?: boolean;
  selfHarm?: number;
  comboTag?: { tag: ThreatTag; stability: number };
};

export type ChaosCard = {
  id: string;
  kind: "chaos";
  name: string;
  glyph: string;
  text: string;
  tag: ThreatTag;
  harm: number;
  stabilityDamage: number;
  sudden?: boolean;
  drainFocus?: number;
  discard?: number;
  drawPenalty?: number;
  dot?: { harm: number; stabilityDamage: number; rounds: number };
  priority: number;
};

export type CardDefinition = PlayerCard | ChaosCard;
export type CardCatalog = Record<string, CardDefinition>;

export type EncounterDefinition = {
  id: string;
  version: string;
  engineVersion: number;
  title: string;
  summary: string;
  difficulty: string;
  seed: number;
  stabilityTarget: number;
  harmBudget: number;
  focusPerTurn: number;
  handSize: number;
  maxRounds: number;
  startingDeck: string[];
  rewards: string[];
  jevDeck: string[];
  briefing: {
    objective: string;
    steps: string[];
    thresholds: string[];
    impactLimit: string;
  };
};

export type GameData = {
  catalog: CardCatalog;
  encounters: Record<string, EncounterDefinition>;
};

export type ThreatState = {
  cardId: string;
  revealedRound: number;
  mitigated: number;
  negated: boolean;
};

export type DotState = {
  cardId: string;
  roundsLeft: number;
  harm: number;
  stabilityDamage: number;
};

export type BattleStats = {
  cardsPlayed: number;
  threatsBlocked: number;
  damagePrevented: number;
  jevCardsPlayed: number;
};

export type BattleState = {
  encounterId: string;
  round: number;
  phase: "player" | "won" | "lost";
  stability: number;
  harm: number;
  focus: number;
  focusNext: number;
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  threat: ThreatState | null;
  ward: number;
  dots: DotState[];
  warRoom: boolean;
  drawPenalty: number;
  jevHand: string[];
  jevDrawPile: string[];
  jevDiscardPile: string[];
  lastJevCardId: string | null;
  stats: BattleStats;
};

export type EncounterResult = {
  encounterId: string;
  outcome: "won" | "lost";
  rounds: number;
  harm: number;
  stability: number;
};

export type CampaignState = {
  stateVersion: number;
  engineVersion: number;
  seed: number;
  cursor: number;
  encounterIds: string[];
  index: number;
  deck: string[];
  phase: "battle" | "draft" | "complete" | "failed";
  battle: BattleState;
  draft: string[] | null;
  results: EncounterResult[];
  totalHarm: number;
  log: LogEntry[];
};

export type Command =
  | { type: "play_card"; cardId: string; handIndex: number }
  | { type: "end_turn" }
  | { type: "draft_pick"; cardId: string };

export type CommandResult =
  | { ok: true; state: CampaignState }
  | { ok: false; reason: string; message: string };

export type LogTone = "you" | "jev" | "system" | "good" | "bad";

export type LogEntry = { round: number; tone: LogTone; text: string };

export type ThreatView = {
  cardId: string;
  name: string;
  glyph: string;
  tag: ThreatTag;
  text: string;
  harm: number;
  stabilityDamage: number;
  mitigated: number;
  ward: number;
  projectedHarm: number;
  projectedStability: number;
  negated: boolean;
  drainFocus: number;
};

export type HandCardView = PlayerCard & { playable: boolean; reason: string | null };

export type PlayerView = {
  encounterId: string;
  encounterTitle: string;
  encounterSummary: string;
  encounterDifficulty: string;
  encounterIndex: number;
  encounterCount: number;
  round: number;
  maxRounds: number;
  phase: CampaignState["phase"];
  battlePhase: BattleState["phase"];
  stability: number;
  stabilityTarget: number;
  harm: number;
  harmBudget: number;
  focus: number;
  focusNext: number;
  warRoom: boolean;
  hand: HandCardView[];
  drawCount: number;
  discardCount: number;
  deckCount: number;
  threat: ThreatView | null;
  ward: number;
  dots: Array<{ cardId: string; name: string; roundsLeft: number; harm: number }>;
  lastJevCardId: string | null;
  jevDeckCount: number;
  stats: BattleStats;
  draft: string[] | null;
  results: EncounterResult[];
  totalHarm: number;
  log: LogEntry[];
};
