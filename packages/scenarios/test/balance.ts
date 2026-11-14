import {
  CARD_CATALOG,
  applyCommand,
  createCampaign,
  selectPlayerView,
  type CampaignState,
  type Command,
  type GameData,
} from "@incident-commander/cards";
import { ENCOUNTERS, ENCOUNTER_REGISTRY, encounterOrder } from "../src/index";

const data: GameData = { catalog: CARD_CATALOG, encounters: ENCOUNTER_REGISTRY };

type Strategy = { name: string; choose: (state: CampaignState, gameData: GameData) => Command | null };

const passive: Strategy = {
  name: "do nothing",
  choose: (state) =>
    state.phase === "draft"
      ? { type: "draft_pick", cardId: state.draft?.[0] as string }
      : { type: "end_turn" },
};

const greedy: Strategy = {
  name: "greedy",
  choose: (state, gameData) => {
    if (state.phase === "draft") return { type: "draft_pick", cardId: state.draft?.[0] as string };
    const view = selectPlayerView(state, gameData);
    const incoming = view.threat ? gameData.catalog[view.threat.cardId] : null;
    const incomingTag = incoming?.kind === "chaos" ? incoming.tag : null;
    const options = view.hand
      .map((card, index) => ({ card, index }))
      .filter((entry) => entry.card.playable);
    if (options.length === 0) {
      const hold = view.hand
        .map((card, index) => ({ card, index }))
        .filter((entry) => entry.card.negateTag)
        .sort((a, b) => Number(b.card.negateTag === incomingTag) - Number(a.card.negateTag === incomingTag))[0];
      return hold
        ? { type: "end_turn", holdCardId: hold.card.id, holdIndex: hold.index }
        : { type: "end_turn" };
    }
    const score = (entry: (typeof options)[number]): number => {
      const card = entry.card;
      let value = card.stability ?? 0;
      if (incomingTag && card.negateTag === incomingTag) value += 40;
      if (incomingTag && card.shield) value += Math.min(card.shield, view.threat?.projectedHarm ?? 0) + 4;
      if (card.harmReduce) value += card.harmReduce * (view.harm / view.harmBudget > 0.5 ? 1.2 : 0.8);
      if (card.draw) value += card.draw * 4;
      if (card.focusNext) value += card.focusNext * 5;
      if (card.selfHarm) value -= card.selfHarm * 1.4;
      if (view.warRoom && card.kind === "contain") value += 4;
      if (card.comboTag && incomingTag === card.comboTag.tag) value += card.comboTag.stability;
      return value - card.cost * 2;
    };
    const best = options.reduce((a, b) => (score(a) >= score(b) ? a : b));
    return { type: "play_card", cardId: best.card.id, handIndex: best.index };
  },
};

function play(startId: string, strategy: Strategy) {
  const encounter = ENCOUNTER_REGISTRY[startId];
  if (!encounter) throw new Error(`Unknown encounter: ${startId}`);
  let state = createCampaign(encounterOrder(startId), encounter.seed, data);
  let guard = 0;
  while (state.phase !== "complete" && state.phase !== "failed" && guard < 400) {
    const command = strategy.choose(state, data);
    if (!command) break;
    const result = applyCommand(state, command, data);
    if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
    state = result.state;
    guard += 1;
  }
  const lastHarm = state.results[state.results.length - 1]?.harm ?? 0;
  return {
    phase: state.phase,
    cleared: state.results.filter((result) => result.outcome === "won").length,
    count: encounterOrder(startId).length,
    rounds: state.results.reduce((sum, result) => sum + result.rounds, 0),
    harm: state.totalHarm > 0 ? state.totalHarm : lastHarm,
  };
}

const strategies: Strategy[] = [greedy, passive];
const failures: string[] = [];

for (const encounter of ENCOUNTERS) {
  for (const strategy of strategies) {
    const result = play(encounter.id, strategy);
    console.log(
      `${encounter.id.padEnd(14)} ${strategy.name.padEnd(10)} phase=${result.phase.padEnd(8)} cleared=${result.cleared}/${result.count} rounds=${result.rounds} harm=${result.harm}`,
    );
    if (strategy === greedy && result.phase !== "complete") {
      failures.push(`${encounter.id} is not winnable by the greedy bot`);
    }
    if (strategy === passive && result.phase !== "failed") {
      failures.push(`${encounter.id} does not punish passive play`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("balance: every start is winnable and every start punishes passivity");
