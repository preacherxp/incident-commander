import { CARD_CATALOG } from "./cards";
import { pickIndex, shuffle } from "./rng";
import {
  CAMPAIGN_STATE_VERSION,
  CARDS_ENGINE_VERSION,
  JEV_HAND_SIZE,
  type BattleState,
  type CampaignState,
  type ChaosCard,
  type Command,
  type CommandResult,
  type DotState,
  type EncounterDefinition,
  type GameData,
  type LogEntry,
  type LogTone,
  type PlayerCard,
  type PlayerView,
  type ThreatState,
  type ThreatView,
} from "./types";

export const DEFAULT_DATA: GameData = { catalog: CARD_CATALOG, encounters: {} };

function requireEncounter(data: GameData, encounterId: string): EncounterDefinition {
  const encounter = data.encounters[encounterId];
  if (!encounter) throw new Error(`Unknown encounter: ${encounterId}`);
  return encounter;
}

function log(entries: LogEntry[], round: number, tone: LogTone, text: string): void {
  entries.push({ round, tone, text });
  if (entries.length > 80) entries.splice(0, entries.length - 80);
}

function chaosCard(data: GameData, cardId: string): ChaosCard {
  const card = data.catalog[cardId];
  if (!card || card.kind !== "chaos") throw new Error(`Not a chaos card: ${cardId}`);
  return card;
}

function playerCard(data: GameData, cardId: string): PlayerCard {
  const card = data.catalog[cardId];
  if (!card || card.kind === "chaos") throw new Error(`Not a player card: ${cardId}`);
  return card;
}

function drawCards(battle: BattleState, count: number, seed: number, cursor: number): number {
  let state = cursor;
  for (let index = 0; index < count; index += 1) {
    if (battle.drawPile.length === 0) {
      if (battle.discardPile.length === 0) return state;
      const shuffled = shuffle(seed, state, battle.discardPile);
      battle.drawPile = shuffled.items;
      state = shuffled.cursor;
      battle.discardPile = [];
    }
    const card = battle.drawPile.shift();
    if (card) battle.hand.push(card);
  }
  return state;
}

function drawJevHand(battle: BattleState, encounter: EncounterDefinition, seed: number, cursor: number): number {
  let state = cursor;
  while (battle.jevHand.length < JEV_HAND_SIZE) {
    if (battle.jevDrawPile.length === 0) {
      if (battle.jevDiscardPile.length === 0) {
        const reshuffled = shuffle(seed, state, encounter.jevDeck);
        battle.jevDrawPile = reshuffled.items;
        state = reshuffled.cursor;
      } else {
        const shuffled = shuffle(seed, state, battle.jevDiscardPile);
        battle.jevDrawPile = shuffled.items;
        state = shuffled.cursor;
        battle.jevDiscardPile = [];
      }
    }
    const card = battle.jevDrawPile.shift();
    if (!card) break;
    battle.jevHand.push(card);
  }
  return state;
}

function chooseJevCard(
  battle: BattleState,
  encounter: EncounterDefinition,
  data: GameData,
  seed: number,
  cursor: number,
  excludeSudden: boolean,
): { cardId: string; cursor: number } {
  const candidates = battle.jevHand.filter((cardId) => {
    if (!excludeSudden) return true;
    return !chaosCard(data, cardId).sudden;
  });
  const pool = candidates.length > 0 ? candidates : battle.jevHand;
  const lastTag = battle.lastJevCardId ? chaosCard(data, battle.lastJevCardId).tag : null;
  const playerAhead = battle.stability / encounter.stabilityTarget >= 0.7;
  let best = pool[0] as string;
  let bestScore = -Infinity;
  let state = cursor;
  for (const cardId of pool) {
    const card = chaosCard(data, cardId);
    let score = card.priority * 10;
    if (playerAhead && card.sudden) score += 24;
    if (playerAhead && card.harm >= 12) score += 10;
    if (card.tag === lastTag) score -= 8;
    if (card.dot && battle.dots.some((dot) => dot.cardId === card.id)) score -= 14;
    const jitter = pickIndex(seed, state, 1000);
    state = jitter.cursor;
    score += jitter.index / 200;
    if (score > bestScore) {
      bestScore = score;
      best = cardId;
    }
  }
  return { cardId: best, cursor: state };
}

function applyChaos(
  battle: BattleState,
  card: ChaosCard,
  threat: ThreatState | null,
  seed: number,
  cursor: number,
): number {
  const mitigation = (threat?.mitigated ?? 0) + battle.ward;
  const negated = threat?.negated ?? false;
  const harmTaken = negated ? 0 : Math.max(0, card.harm - mitigation);
  const overflow = Math.max(0, mitigation - card.harm);
  const stabilityTaken = negated ? 0 : Math.max(0, card.stabilityDamage - overflow);
  battle.harm += harmTaken;
  battle.stability = Math.max(0, battle.stability - stabilityTaken);
  if (negated) battle.stats.threatsBlocked += 1;
  else battle.stats.damagePrevented += Math.min(mitigation, card.harm);
  battle.ward = 0;

  let state = cursor;
  if (card.drainFocus) battle.focusNext = Math.max(0, battle.focusNext - card.drainFocus);
  if (card.drawPenalty) battle.drawPenalty += card.drawPenalty;
  if (card.discard && battle.hand.length > 0) {
    for (let index = 0; index < card.discard && battle.hand.length > 0; index += 1) {
      const pick = pickIndex(seed, state, battle.hand.length);
      state = pick.cursor;
      const removed = battle.hand.splice(pick.index, 1)[0];
      if (removed) battle.discardPile.push(removed);
    }
  }
  if (card.dot) {
    battle.dots.push({
      cardId: card.id,
      roundsLeft: card.dot.rounds,
      harm: card.dot.harm,
      stabilityDamage: card.dot.stabilityDamage,
    });
  }
  return state;
}

function createBattle(
  encounter: EncounterDefinition,
  deck: string[],
  seed: number,
  startCursor: number,
  data: GameData,
): { battle: BattleState; cursor: number } {
  let cursor = startCursor;
  const playerShuffle = shuffle(seed, cursor, deck);
  cursor = playerShuffle.cursor;
  const jevShuffle = shuffle(seed, cursor, encounter.jevDeck);
  cursor = jevShuffle.cursor;
  const battle: BattleState = {
    encounterId: encounter.id,
    round: 1,
    phase: "player",
    stability: 0,
    harm: 0,
    focus: encounter.focusPerTurn,
    focusNext: 0,
    hand: [],
    drawPile: playerShuffle.items,
    discardPile: [],
    threat: null,
    ward: 0,
    dots: [],
    warRoom: false,
    drawPenalty: 0,
    jevHand: [],
    jevDrawPile: jevShuffle.items,
    jevDiscardPile: [],
    lastJevCardId: null,
    stats: { cardsPlayed: 0, threatsBlocked: 0, damagePrevented: 0, jevCardsPlayed: 0 },
  };
  cursor = drawCards(battle, encounter.handSize, seed, cursor);
  cursor = drawJevHand(battle, encounter, seed, cursor);
  const choice = chooseJevCard(battle, encounter, data, seed, cursor, true);
  cursor = choice.cursor;
  const opening = battle.jevHand.indexOf(choice.cardId);
  if (opening >= 0) battle.jevHand.splice(opening, 1);
  battle.jevDiscardPile.push(choice.cardId);
  battle.lastJevCardId = choice.cardId;
  battle.stats.jevCardsPlayed += 1;
  battle.threat = { cardId: choice.cardId, revealedRound: 1, mitigated: 0, negated: false };
  return { battle, cursor };
}

function pickRewards(
  encounter: EncounterDefinition,
  seed: number,
  startCursor: number,
  count: number,
): { items: string[]; cursor: number } {
  const pool = [...encounter.rewards];
  const items: string[] = [];
  let cursor = startCursor;
  while (items.length < count && pool.length > 0) {
    const pick = pickIndex(seed, cursor, pool.length);
    cursor = pick.cursor;
    const cardId = pool.splice(pick.index, 1)[0];
    if (cardId) items.push(cardId);
  }
  return { items, cursor };
}

export function createCampaign(
  encounterIds: string[],
  seed: number,
  data: GameData,
): CampaignState {
  const firstId = encounterIds[0];
  if (!firstId) throw new Error("A run needs at least one encounter.");
  const first = requireEncounter(data, firstId);
  const created = createBattle(first, first.startingDeck, seed, 0, data);
  return {
    stateVersion: CAMPAIGN_STATE_VERSION,
    engineVersion: CARDS_ENGINE_VERSION,
    seed,
    cursor: created.cursor,
    encounterIds: [...encounterIds],
    index: 0,
    deck: [...first.startingDeck],
    phase: "battle",
    battle: created.battle,
    draft: null,
    results: [],
    totalHarm: 0,
    log: [{ round: 1, tone: "system", text: `${first.title} — incident declared.` }],
  };
}

function finishLost(state: CampaignState, reason: string): CampaignState {
  const battle = state.battle;
  battle.phase = "lost";
  state.phase = "failed";
  state.results.push({
    encounterId: battle.encounterId,
    outcome: "lost",
    rounds: battle.round,
    harm: battle.harm,
    stability: battle.stability,
  });
  log(state.log, battle.round, "bad", reason);
  return state;
}

function completeEncounter(state: CampaignState, data: GameData): CampaignState {
  const battle = state.battle;
  battle.phase = "won";
  state.results.push({
    encounterId: battle.encounterId,
    outcome: "won",
    rounds: battle.round,
    harm: battle.harm,
    stability: battle.stability,
  });
  state.totalHarm += battle.harm;
  const nextId = state.encounterIds[state.index + 1];
  if (!nextId) {
    state.phase = "complete";
    state.draft = null;
    log(state.log, battle.round, "good", "All incidents contained. You are clear.");
    return state;
  }
  const nextEncounter = requireEncounter(data, nextId);
  const picks = pickRewards(nextEncounter, state.seed, state.cursor, 3);
  state.cursor = picks.cursor;
  state.phase = "draft";
  state.draft = picks.items;
  log(state.log, battle.round, "good", "Incident contained. Pick one card for the next shift.");
  return state;
}

function playCard(state: CampaignState, command: Extract<Command, { type: "play_card" }>, data: GameData): CommandResult {
  const encounter = requireEncounter(data, state.battle.encounterId);
  if (state.phase !== "battle" || state.battle.phase !== "player") {
    return { ok: false, reason: "WRONG_PHASE", message: "It is not your turn." };
  }
  const next = structuredClone(state);
  const battle = next.battle;
  const cardId = battle.hand[command.handIndex];
  if (!cardId || cardId !== command.cardId) {
    return { ok: false, reason: "CARD_NOT_IN_HAND", message: "That card is not in your hand." };
  }
  const card = playerCard(data, cardId);
  if (card.cost > battle.focus) {
    return { ok: false, reason: "INSUFFICIENT_FOCUS", message: `Needs ${card.cost} focus.` };
  }
  battle.focus -= card.cost;
  battle.hand.splice(command.handIndex, 1);
  battle.discardPile.push(cardId);
  battle.stats.cardsPlayed += 1;

  let cursor = next.cursor;
  let stabilityGain = card.stability ?? 0;
  if (battle.warRoom && card.kind === "contain" && !card.warRoom) stabilityGain += 4;
  if (card.warRoom) battle.warRoom = true;
  if (card.comboTag && battle.threat) {
    const incoming = data.catalog[battle.threat.cardId];
    if (incoming?.kind === "chaos" && incoming.tag === card.comboTag.tag) {
      stabilityGain += card.comboTag.stability;
      log(next.log, battle.round, "good", `${card.name}: +${card.comboTag.stability} against the ${incoming.tag} play.`);
    }
  }
  battle.stability += stabilityGain;
  if (card.harmReduce) battle.harm = Math.max(0, battle.harm - card.harmReduce);
  if (card.selfHarm) battle.harm += card.selfHarm;
  if (card.focusNext) battle.focusNext += card.focusNext;
  if (card.draw) cursor = drawCards(battle, card.draw, next.seed, cursor);
  if (card.shield) {
    if (battle.threat) battle.threat.mitigated += card.shield;
    else battle.ward += card.shield;
  }
  if (card.negateTag && battle.threat) {
    const incoming = data.catalog[battle.threat.cardId];
    if (incoming?.kind === "chaos" && incoming.tag === card.negateTag) {
      battle.threat.negated = true;
      log(next.log, battle.round, "good", `${card.name} counters ${incoming.name}.`);
    }
  }
  log(next.log, battle.round, "you", `${card.name}.`);
  next.cursor = cursor;

  if (battle.stability >= encounter.stabilityTarget) return { ok: true, state: completeEncounter(next, data) };
  if (battle.harm >= encounter.harmBudget) {
    return { ok: true, state: finishLost(next, "Customer harm budget exhausted.") };
  }
  return { ok: true, state: next };
}

function endTurn(state: CampaignState, data: GameData): CommandResult {
  const encounter = requireEncounter(data, state.battle.encounterId);
  if (state.phase !== "battle" || state.battle.phase !== "player") {
    return { ok: false, reason: "WRONG_PHASE", message: "It is not your turn." };
  }
  const next = structuredClone(state);
  const battle = next.battle;
  let cursor = next.cursor;

  for (let index = battle.dots.length - 1; index >= 0; index -= 1) {
    const dot = battle.dots[index] as DotState;
    battle.harm += dot.harm;
    battle.stability = Math.max(0, battle.stability - dot.stabilityDamage);
    dot.roundsLeft -= 1;
    if (dot.roundsLeft <= 0) {
      battle.dots.splice(index, 1);
      log(next.log, battle.round, "bad", `${chaosCard(data, dot.cardId).name} stopped spreading.`);
    }
  }

  if (battle.threat) {
    const card = chaosCard(data, battle.threat.cardId);
    cursor = applyChaos(battle, card, battle.threat, next.seed, cursor);
    log(
      next.log,
      battle.round,
      battle.threat.negated ? "good" : "jev",
      battle.threat.negated ? `${card.name} was fully countered.` : `${card.name} lands.`,
    );
    battle.threat = null;
  }

  if (battle.harm >= encounter.harmBudget) {
    return { ok: true, state: finishLost(next, "Customer harm budget exhausted.") };
  }

  cursor = drawJevHand(battle, encounter, next.seed, cursor);
  const choice = chooseJevCard(battle, encounter, data, next.seed, cursor, false);
  cursor = choice.cursor;
  const jevIndex = battle.jevHand.indexOf(choice.cardId);
  if (jevIndex >= 0) battle.jevHand.splice(jevIndex, 1);
  battle.jevDiscardPile.push(choice.cardId);
  battle.lastJevCardId = choice.cardId;
  battle.stats.jevCardsPlayed += 1;
  const played = chaosCard(data, choice.cardId);
  if (played.sudden) {
    cursor = applyChaos(battle, played, null, next.seed, cursor);
    log(next.log, battle.round, "jev", `${played.name} hits with no warning.`);
    if (battle.harm >= encounter.harmBudget) {
      return { ok: true, state: finishLost(next, "Customer harm budget exhausted.") };
    }
  } else {
    battle.threat = { cardId: played.id, revealedRound: battle.round + 1, mitigated: 0, negated: false };
    log(next.log, battle.round, "jev", `${played.name} is coming next round.`);
  }

  battle.round += 1;
  if (battle.round > encounter.maxRounds) {
    return { ok: true, state: finishLost(next, "The SLA window closed.") };
  }
  battle.focus = Math.max(0, encounter.focusPerTurn + battle.focusNext);
  battle.focusNext = 0;
  cursor = drawCards(battle, Math.max(0, encounter.handSize - battle.hand.length - battle.drawPenalty), next.seed, cursor);
  battle.drawPenalty = 0;
  next.cursor = cursor;
  log(next.log, battle.round, "system", `Round ${battle.round}.`);
  return { ok: true, state: next };
}

function draftPick(state: CampaignState, command: Extract<Command, { type: "draft_pick" }>, data: GameData): CommandResult {
  if (state.phase !== "draft" || !state.draft) {
    return { ok: false, reason: "WRONG_PHASE", message: "No card choice is open." };
  }
  if (!state.draft.includes(command.cardId)) {
    return { ok: false, reason: "NOT_IN_DRAFT", message: "That card is not on offer." };
  }
  const next = structuredClone(state);
  next.deck.push(command.cardId);
  next.index += 1;
  next.draft = null;
  const encounterId = next.encounterIds[next.index];
  if (!encounterId) {
    next.phase = "complete";
    return { ok: true, state: next };
  }
  const encounter = requireEncounter(data, encounterId);
  const created = createBattle(encounter, next.deck, next.seed, next.cursor, data);
  next.battle = created.battle;
  next.cursor = created.cursor;
  next.phase = "battle";
  log(next.log, 1, "system", `${encounter.title} — incident declared.`);
  return { ok: true, state: next };
}

export function applyCommand(state: CampaignState, command: Command, data: GameData): CommandResult {
  if (state.phase === "complete" || state.phase === "failed") {
    return { ok: false, reason: "RUN_TERMINAL", message: "This run has ended." };
  }
  switch (command.type) {
    case "play_card":
      return playCard(state, command, data);
    case "end_turn":
      return endTurn(state, data);
    case "draft_pick":
      return draftPick(state, command, data);
    default:
      return { ok: false, reason: "UNKNOWN_COMMAND", message: "Unknown command." };
  }
}

export function isTerminal(state: CampaignState): boolean {
  return state.phase === "complete" || state.phase === "failed";
}

export function toRunOutcome(state: CampaignState) {
  return {
    status: state.phase === "complete" ? ("won" as const) : ("lost" as const),
    encountersCleared: state.results.filter((result) => result.outcome === "won").length,
    encounterCount: state.encounterIds.length,
    totalHarm: state.totalHarm,
    rounds: state.results.reduce((sum, result) => sum + result.rounds, 0),
    deckSize: state.deck.length,
    finalEncounterId: state.results[state.results.length - 1]?.encounterId ?? state.encounterIds[0] ?? "",
  };
}

function threatView(data: GameData, state: CampaignState, threat: ThreatState): ThreatView {
  const card = chaosCard(data, threat.cardId);
  const mitigation = threat.mitigated + state.battle.ward;
  const overflow = Math.max(0, mitigation - card.harm);
  return {
    cardId: card.id,
    name: card.name,
    glyph: card.glyph,
    tag: card.tag,
    text: card.text,
    harm: card.harm,
    stabilityDamage: card.stabilityDamage,
    mitigated: threat.mitigated,
    ward: state.battle.ward,
    projectedHarm: threat.negated ? 0 : Math.max(0, card.harm - mitigation),
    projectedStability: threat.negated ? 0 : Math.max(0, card.stabilityDamage - overflow),
    negated: threat.negated,
    drainFocus: card.drainFocus ?? 0,
  };
}

export function selectPlayerView(state: CampaignState, data: GameData): PlayerView {
  const encounter = requireEncounter(data, state.battle.encounterId);
  const battle = state.battle;
  const yourTurn = state.phase === "battle" && battle.phase === "player";
  return {
    encounterId: encounter.id,
    encounterTitle: encounter.title,
    encounterSummary: encounter.summary,
    encounterDifficulty: encounter.difficulty,
    encounterIndex: state.index,
    encounterCount: state.encounterIds.length,
    round: battle.round,
    maxRounds: encounter.maxRounds,
    phase: state.phase,
    battlePhase: battle.phase,
    stability: battle.stability,
    stabilityTarget: encounter.stabilityTarget,
    harm: battle.harm,
    harmBudget: encounter.harmBudget,
    focus: battle.focus,
    focusNext: battle.focusNext,
    warRoom: battle.warRoom,
    hand: battle.hand.map((cardId) => {
      const card = playerCard(data, cardId);
      const affordable = yourTurn && card.cost <= battle.focus;
      return {
        ...card,
        playable: affordable,
        reason: affordable ? null : yourTurn ? `Needs ${card.cost} focus.` : "Not your turn.",
      };
    }),
    drawCount: battle.drawPile.length,
    discardCount: battle.discardPile.length,
    deckCount: battle.drawPile.length + battle.discardPile.length + battle.hand.length,
    threat: battle.threat ? threatView(data, state, battle.threat) : null,
    ward: battle.ward,
    dots: battle.dots.map((dot) => ({
      cardId: dot.cardId,
      name: chaosCard(data, dot.cardId).name,
      roundsLeft: dot.roundsLeft,
      harm: dot.harm,
    })),
    lastJevCardId: battle.lastJevCardId,
    jevDeckCount: battle.jevDrawPile.length + battle.jevHand.length + battle.jevDiscardPile.length,
    stats: battle.stats,
    draft: state.draft,
    results: state.results,
    totalHarm: state.totalHarm,
    log: state.log.slice(-30),
  };
}
