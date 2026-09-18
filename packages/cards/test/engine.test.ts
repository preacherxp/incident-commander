import { describe, expect, test } from "bun:test";
import {
  CARD_CATALOG,
  CARDS_ENGINE_VERSION,
  applyCommand,
  createCampaign,
  rankEncounter,
  rankRun,
  restoreCampaign,
  selectPlayerView,
  type CampaignState,
  type CommandResult,
  type EncounterDefinition,
  type GameData,
} from "../src/index";

function encounter(id: string, overrides: Partial<EncounterDefinition> = {}): EncounterDefinition {
  return {
    id,
    version: "1.0.0",
    engineVersion: CARDS_ENGINE_VERSION,
    title: `Incident ${id}`,
    summary: "summary",
    difficulty: "standard",
    seed: 7,
    stabilityTarget: 100,
    harmBudget: 100,
    focusPerTurn: 3,
    handSize: 5,
    maxRounds: 10,
    startingDeck: [
      "restart",
      "restart",
      "restart",
      "diagnose",
      "status-page",
      "throttle",
      "rollback",
      "scale-out",
      "page-oncall",
      "runbook",
    ],
    rewards: ["failover", "all-hands", "exec-air-cover"],
    jevDeck: ["traffic-surge", "db-lock", "bad-deploy"],
    briefing: { objective: "objective", steps: [], thresholds: [], impactLimit: "limit" },
    ...overrides,
  };
}

function dataFor(...encounters: EncounterDefinition[]): GameData {
  return {
    catalog: CARD_CATALOG,
    encounters: Object.fromEntries(encounters.map((item) => [item.id, item])),
  };
}

function must(result: CommandResult): CampaignState {
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
  return result.state;
}

function playWith(state: CampaignState, cardId: string, data: GameData): CampaignState {
  const handIndex = state.battle.hand.indexOf(cardId);
  if (handIndex < 0) throw new Error(`Card ${cardId} is not in hand.`);
  return must(applyCommand(state, { type: "play_card", cardId, handIndex }, data));
}

function endTurn(state: CampaignState, data: GameData): CampaignState {
  return must(applyCommand(state, { type: "end_turn" }, data));
}

describe("campaign setup", () => {
  test("opening hand, focus and telegraphed threat are deterministic", () => {
    const data = dataFor(encounter("a"), encounter("b"));
    const first = createCampaign(["a", "b"], 1234, data);
    const second = createCampaign(["a", "b"], 1234, data);
    expect(first).toEqual(second);
    const view = selectPlayerView(first, data);
    expect(view.hand).toHaveLength(5);
    expect(view.focus).toBe(3);
    expect(view.round).toBe(1);
    expect(view.threat).not.toBeNull();
    expect(first.phase).toBe("battle");
  });

  test("different seeds produce different openings", () => {
    const data = dataFor(encounter("a"));
    const first = createCampaign(["a"], 1, data);
    const second = createCampaign(["a"], 2, data);
    expect(JSON.stringify(first.battle.hand)).not.toBe(JSON.stringify(second.battle.hand));
  });
});

describe("playing cards", () => {
  test("restart adds stability and moves the card to the discard pile", () => {
    const data = dataFor(encounter("a"));
    let state = createCampaign(["a"], 9, data);
    // Fill stability so the win does not fire; play restart first.
    const view = selectPlayerView(state, data);
    expect(view.stability).toBe(0);
    state = playWith(state, "restart", data);
    expect(state.battle.stability).toBe(8);
    expect(state.battle.focus).toBe(2);
    expect(state.battle.discardPile).toContain("restart");
  });

  test("rejects a card that costs more focus than you have", () => {
    const data = dataFor(
      encounter("a", { startingDeck: ["rollback", "scale-out", "restart"], handSize: 3 }),
    );
    let state = createCampaign(["a"], 9, data);
    state = playWith(state, "rollback", data);
    const result = applyCommand(
      state,
      { type: "play_card", cardId: "scale-out", handIndex: state.battle.hand.indexOf("scale-out") },
      data,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INSUFFICIENT_FOCUS");
  });

  test("rejects a card that is not in hand", () => {
    const data = dataFor(encounter("a"));
    const state = createCampaign(["a"], 9, data);
    const result = applyCommand(state, { type: "play_card", cardId: "failover", handIndex: 0 }, data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("CARD_NOT_IN_HAND");
  });

  test("rollback gains its combo bonus against an incoming deploy", () => {
    const data = dataFor(encounter("a", { jevDeck: ["bad-deploy"], startingDeck: ["rollback", "restart"] }));
    let state = createCampaign(["a"], 3, data);
    expect(state.battle.threat?.cardId).toBe("bad-deploy");
    state = playWith(state, "rollback", data);
    expect(state.battle.stability).toBe(22);
  });
});

describe("Jev's turn", () => {
  test("an unmitigated threat lands and a new one is telegraphed", () => {
    const data = dataFor(encounter("a", { jevDeck: ["traffic-surge"] }));
    let state = createCampaign(["a"], 5, data);
    state = endTurn(state, data);
    expect(state.battle.harm).toBe(14);
    expect(state.battle.threat?.cardId).toBe("traffic-surge");
    expect(state.battle.round).toBe(2);
    expect(state.battle.focus).toBe(3);
    expect(state.battle.hand).toHaveLength(5);
  });

  test("a shield reduces the incoming harm", () => {
    const data = dataFor(encounter("a", { jevDeck: ["traffic-surge"] }));
    let state = createCampaign(["a"], 5, data);
    state = playWith(state, "throttle", data);
    expect(state.battle.threat?.mitigated).toBe(10);
    state = endTurn(state, data);
    expect(state.battle.harm).toBe(4);
    expect(state.battle.stats.damagePrevented).toBe(10);
  });

  test("a matching counter negates the threat entirely", () => {
    const data = dataFor(
      encounter("a", { jevDeck: ["bad-deploy"], startingDeck: ["deploy-freeze", "restart"] }),
    );
    let state = createCampaign(["a"], 3, data);
    state = playWith(state, "deploy-freeze", data);
    expect(state.battle.threat?.negated).toBe(true);
    state = endTurn(state, data);
    expect(state.battle.harm).toBe(0);
    expect(state.battle.stability).toBe(6);
    expect(state.battle.stats.threatsBlocked).toBe(1);
  });

  test("memory leak keeps bleeding every round", () => {
    const data = dataFor(
      encounter("a", { jevDeck: ["memory-leak"], stabilityTarget: 1000, harmBudget: 1000, maxRounds: 8 }),
    );
    let state = createCampaign(["a"], 5, data);
    state = endTurn(state, data);
    expect(state.battle.dots.length).toBeGreaterThan(0);
    const first = state.battle.harm;
    state = endTurn(state, data);
    expect(state.battle.harm).toBeGreaterThan(first);
  });

  test("a sudden card resolves the turn it is played", () => {
    const data = dataFor(
      encounter("a", {
        jevDeck: ["vendor-outage"],
        startingDeck: ["restart", "restart", "restart", "restart", "restart"],
        stabilityTarget: 1000,
      }),
    );
    const state = createCampaign(["a"], 5, data);
    // The opening telegraph cannot be sudden, so round one is telegraphed and the next is a blind hit.
    const afterFirst = endTurn(state, data);
    expect(afterFirst.battle.harm).toBe(24);
    expect(afterFirst.battle.threat).toBeNull();
    const afterSecond = endTurn(afterFirst, data);
    expect(afterSecond.battle.harm).toBe(36);
  });
});

describe("winning and losing", () => {
  test("reaching the stability target wins and opens a draft", () => {
    const data = dataFor(
      encounter("a", {
        stabilityTarget: 25,
        startingDeck: ["rollback", "restart"],
        handSize: 2,
        jevDeck: ["alert-fatigue"],
      }),
      encounter("b"),
    );
    let state = createCampaign(["a", "b"], 11, data);
    state = playWith(state, "rollback", data);
    expect(state.battle.phase).toBe("player");
    state = playWith(state, "restart", data);
    expect(state.phase).toBe("draft");
    expect(state.draft).toHaveLength(3);
    expect(state.results).toHaveLength(1);
    expect(state.results[0]?.outcome).toBe("won");
  });

  test("drafting a card advances to the next incident with a bigger deck", () => {
    const data = dataFor(
      encounter("a", {
        stabilityTarget: 25,
        startingDeck: ["rollback", "restart"],
        handSize: 2,
        jevDeck: ["alert-fatigue"],
      }),
      encounter("b"),
    );
    let state = createCampaign(["a", "b"], 11, data);
    state = playWith(state, "rollback", data);
    state = playWith(state, "restart", data);
    const pick = state.draft?.[0] as string;
    state = must(applyCommand(state, { type: "draft_pick", cardId: pick }, data));
    expect(state.phase).toBe("battle");
    expect(state.index).toBe(1);
    expect(state.deck).toContain(pick);
    expect(state.battle.encounterId).toBe("b");
    expect(selectPlayerView(state, data).hand).toHaveLength(3);
  });

  test("exhausting the harm budget loses the run", () => {
    const data = dataFor(encounter("a", { harmBudget: 10, jevDeck: ["traffic-surge"] }));
    let state = createCampaign(["a"], 5, data);
    state = endTurn(state, data);
    expect(state.phase).toBe("failed");
    expect(state.battle.phase).toBe("lost");
  });

  test("running out of rounds loses the run", () => {
    const data = dataFor(encounter("a", { maxRounds: 1, stabilityTarget: 1000, jevDeck: ["traffic-surge"] }));
    let state = createCampaign(["a"], 5, data);
    state = endTurn(state, data);
    expect(state.phase).toBe("failed");
  });

  test("the final incident completes the run", () => {
    const data = dataFor(
      encounter("a", {
        stabilityTarget: 25,
        startingDeck: ["rollback", "restart"],
        handSize: 2,
        jevDeck: ["alert-fatigue"],
      }),
    );
    let state = createCampaign(["a"], 11, data);
    state = playWith(state, "rollback", data);
    state = playWith(state, "restart", data);
    expect(state.phase).toBe("complete");
    expect(rankRun(state, data).grade).not.toBe("F");
  });

  test("commands are rejected once the run is over", () => {
    const data = dataFor(encounter("a", { harmBudget: 10, jevDeck: ["traffic-surge"] }));
    const state = endTurn(createCampaign(["a"], 5, data), data);
    const result = applyCommand(state, { type: "end_turn" }, data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("RUN_TERMINAL");
  });
});

describe("replay and restore", () => {
  test("the same command log always produces the same state", () => {
    const data = dataFor(encounter("a"), encounter("b"));
    const script = (seed: number) => {
      let state = createCampaign(["a", "b"], seed, data);
      for (let round = 0; round < 4; round += 1) {
        state = endTurn(state, data);
      }
      return JSON.stringify(state);
    };
    expect(script(77)).toBe(script(77));
    expect(script(77)).not.toBe(script(78));
  });

  test("a stored campaign round-trips through restore", () => {
    const data = dataFor(encounter("a"));
    const state = createCampaign(["a"], 5, data);
    const snapshot = JSON.parse(JSON.stringify(state));
    const restored = restoreCampaign(snapshot, data);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state).toEqual(state);
  });

  test("restore rejects a snapshot with unknown cards", () => {
    const data = dataFor(encounter("a"));
    const state = createCampaign(["a"], 5, data);
    const snapshot = JSON.parse(JSON.stringify(state)) as CampaignState;
    snapshot.deck.push("not-a-card");
    const restored = restoreCampaign(snapshot, data);
    expect(restored.ok).toBe(false);
  });
});

describe("ranking", () => {
  test("an efficient win earns an S and a loss earns an F", () => {
    const definition = encounter("a");
    const won = rankEncounter(
      { encounterId: "a", outcome: "won", rounds: 3, harm: 10, stability: 100 },
      definition,
    );
    expect(won.grade).toBe("S");
    const costly = rankEncounter(
      { encounterId: "a", outcome: "won", rounds: 9, harm: 80, stability: 100 },
      definition,
    );
    expect(costly.grade).toBe("C");
    const lost = rankEncounter(
      { encounterId: "a", outcome: "lost", rounds: 4, harm: 100, stability: 40 },
      definition,
    );
    expect(lost.grade).toBe("F");
  });
});
