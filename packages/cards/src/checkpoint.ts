import { z } from "zod";
import { CAMPAIGN_STATE_VERSION, CARDS_ENGINE_VERSION, type CampaignState, type GameData } from "./types";

const cardId = z.string().min(1).max(64);

const threatSchema = z
  .object({
    cardId,
    revealedRound: z.number().int().min(1).max(99),
    mitigated: z.number().int().min(0).max(9999),
    negated: z.boolean(),
  })
  .strict();

const dotSchema = z
  .object({
    cardId,
    roundsLeft: z.number().int().min(0).max(20),
    harm: z.number().int().min(0).max(999),
    stabilityDamage: z.number().int().min(0).max(999),
  })
  .strict();

const statsSchema = z
  .object({
    cardsPlayed: z.number().int().min(0).max(9999),
    threatsBlocked: z.number().int().min(0).max(9999),
    damagePrevented: z.number().int().min(0).max(99999),
    jevCardsPlayed: z.number().int().min(0).max(9999),
  })
  .strict();

const battleSchema = z
  .object({
    encounterId: z.string().min(1).max(64),
    round: z.number().int().min(1).max(99),
    phase: z.enum(["player", "won", "lost"]),
    stability: z.number().int().min(0).max(9999),
    harm: z.number().int().min(0).max(99999),
    focus: z.number().int().min(0).max(99),
    focusNext: z.number().int().min(0).max(99),
    hand: z.array(cardId).max(24),
    drawPile: z.array(cardId).max(300),
    discardPile: z.array(cardId).max(300),
    threat: threatSchema.nullable(),
    ward: z.number().int().min(0).max(9999),
    dots: z.array(dotSchema).max(24),
    warRoom: z.boolean(),
    drawPenalty: z.number().int().min(0).max(9),
    jevHand: z.array(cardId).max(12),
    jevDrawPile: z.array(cardId).max(300),
    jevDiscardPile: z.array(cardId).max(300),
    lastJevCardId: cardId.nullable(),
    stats: statsSchema,
  })
  .strict();

const resultSchema = z
  .object({
    encounterId: z.string().min(1).max(64),
    outcome: z.enum(["won", "lost"]),
    rounds: z.number().int().min(0).max(99),
    harm: z.number().int().min(0).max(99999),
    stability: z.number().int().min(0).max(9999),
  })
  .strict();

const logSchema = z
  .object({
    round: z.number().int().min(0).max(99),
    tone: z.enum(["you", "jev", "system", "good", "bad"]),
    text: z.string().max(400),
  })
  .strict();

export const campaignStateSchema = z
  .object({
    stateVersion: z.number().int().min(1),
    engineVersion: z.number().int().min(1),
    seed: z.number().int().min(0).max(4294967295),
    cursor: z.number().int().min(0).max(1000000),
    encounterIds: z.array(z.string().min(1).max(64)).min(1).max(8),
    index: z.number().int().min(0).max(7),
    deck: z.array(cardId).min(1).max(200),
    phase: z.enum(["battle", "draft", "complete", "failed"]),
    battle: battleSchema,
    draft: z.array(cardId).max(3).nullable(),
    results: z.array(resultSchema).max(8),
    totalHarm: z.number().int().min(0).max(999999),
    log: z.array(logSchema).max(120),
  })
  .strict();

export type RestoreResult =
  | { ok: true; state: CampaignState }
  | { ok: false; reason: string };

export function restoreCampaign(value: unknown, data: GameData): RestoreResult {
  const parsed = campaignStateSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "Saved state failed validation." };
  const state = parsed.data as CampaignState;
  if (state.stateVersion !== CAMPAIGN_STATE_VERSION) {
    return { ok: false, reason: "Saved state uses an incompatible schema." };
  }
  if (state.engineVersion !== CARDS_ENGINE_VERSION) {
    return { ok: false, reason: "Saved state was created by a different engine build." };
  }
  for (const id of state.encounterIds) {
    if (!data.encounters[id]) return { ok: false, reason: `Encounter ${id} is unavailable.` };
  }
  if (state.battle.encounterId !== state.encounterIds[state.index]) {
    return { ok: false, reason: "Saved state points at the wrong encounter." };
  }
  const battle = state.battle;
  const referenced = [
    ...state.deck,
    ...battle.hand,
    ...battle.drawPile,
    ...battle.discardPile,
    ...battle.jevHand,
    ...battle.jevDrawPile,
    ...battle.jevDiscardPile,
    ...battle.dots.map((dot) => dot.cardId),
    ...(battle.threat ? [battle.threat.cardId] : []),
    ...(battle.lastJevCardId ? [battle.lastJevCardId] : []),
    ...(state.draft ?? []),
  ];
  for (const id of referenced) {
    if (!data.catalog[id]) return { ok: false, reason: `Card ${id} is unavailable.` };
  }
  return { ok: true, state };
}
