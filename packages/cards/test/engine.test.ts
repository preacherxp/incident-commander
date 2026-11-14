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
      { encounterId: "a", outcome: "won", rounds: 3, harm: 10, stats: { damageTaken: 10, cardsPlayed: 8, threatsBlocked: 1, damagePrevented: 0, jevCardsPlayed: 3 }, stability: 100 },
      definition,
    );
    expect(won.grade).toBe("S");
    const costly = rankEncounter(
      { encounterId: "a", outcome: "won", rounds: 9, harm: 80, stats: { damageTaken: 80, cardsPlayed: 8, threatsBlocked: 1, damagePrevented: 0, jevCardsPlayed: 3 }, stability: 100 },
      definition,
    );
    expect(costly.grade).toBe("C");
    const lost = rankEncounter(
      { encounterId: "a", outcome: "lost", rounds: 4, harm: 100, stats: { damageTaken: 100, cardsPlayed: 8, threatsBlocked: 1, damagePrevented: 0, jevCardsPlayed: 3 }, stability: 40 },
      definition,
    );
    expect(lost.grade).toBe("F");
  });
});

describe("shield-piercing load faults", () => {
  test("a piercing threat ignores shields but still consumes them", () => {
    const data = dataFor(
      encounter("a", { jevDeck: ["thundering-herd"], startingDeck: ["throttle", "restart"], handSize: 2 }),
    );
    let state = createCampaign(["a"], 5, data);
    state = playWith(state, "throttle", data);
    expect(state.battle.threat?.mitigated).toBe(10);
    state = endTurn(state, data);
    expect(state.battle.harm).toBe(12);
    expect(state.battle.stats.damagePrevented).toBe(0);
    expect(state.battle.ward).toBe(0);
  });

  test("after shields land, Jev prefers a piercing follow-up when it has one", () => {
    const data = dataFor(
      encounter("a", {
        jevDeck: ["traffic-surge", "thundering-herd"],
        startingDeck: ["throttle", "restart"],
        handSize: 2,
        stabilityTarget: 1000,
        harmBudget: 1000,
      }),
    );
    let state = createCampaign(["a"], 5, data);
    if (state.battle.threat?.cardId !== "traffic-surge") {
      state.battle.threat = { cardId: "traffic-surge", revealedRound: 1, mitigated: 0, negated: false };
    }
    state = playWith(state, "throttle", data);
    state = endTurn(state, data);
    expect(state.battle.stats.damagePrevented).toBeGreaterThanOrEqual(8);
    expect(state.battle.lastJevCardId).toBe("thundering-herd");
  });

  test("a matching counter still negates a piercing threat", () => {
    const data = dataFor(
      encounter("a", { jevDeck: ["thundering-herd"], startingDeck: ["circuit-breaker", "restart"], handSize: 2 }),
    );
    let state = createCampaign(["a"], 5, data);
    state = playWith(state, "circuit-breaker", data);
    expect(state.battle.threat?.negated).toBe(true);
    state = endTurn(state, data);
    expect(state.battle.harm).toBe(0);
    expect(state.battle.stats.threatsBlocked).toBe(1);
  });

  test("a purge card stops every bleed", () => {
    const data = dataFor(
      encounter("a", {
        jevDeck: ["retry-amplifier"],
        startingDeck: ["restart", "restart", "restart", "restart", "drain-the-queue"],
        stabilityTarget: 1000,
        harmBudget: 1000,
        maxRounds: 8,
      }),
    );
    let state = createCampaign(["a"], 5, data);
    state = endTurn(state, data);
    expect(state.battle.dots.length).toBeGreaterThan(0);
    state = playWith(state, "drain-the-queue", data);
    expect(state.battle.dots).toHaveLength(0);
    expect(state.battle.stability).toBe(4);
  });
});

describe("arcade round loop", () => {
  test("an untouched hand cycles and every player card is conserved", () => {
    const definition = encounter("a", { jevDeck: ["traffic-surge"] });
    const data = dataFor(definition);
    const before = createCampaign(["a"], 5, data);
    const after = endTurn(before, data);
    expect(after.battle.hand).toEqual(before.battle.drawPile);
    expect(after.battle.discardPile).toEqual(before.battle.hand);
    expect([...after.battle.hand, ...after.battle.drawPile, ...after.battle.discardPile].sort())
      .toEqual([...definition.startingDeck].sort());
    expect(after.battle.focus).toBe(3);
  });

  test("ending the round can keep one card and draws around it", () => {
    const definition = encounter("a", { jevDeck: ["traffic-surge"], startingDeck: ["circuit-breaker", "restart", "restart", "restart", "restart"] });
    const data = dataFor(definition);
    const before = createCampaign(["a"], 5, data);
    const holdIndex = before.battle.hand.indexOf("circuit-breaker");
    expect(holdIndex).toBeGreaterThanOrEqual(0);
    const after = must(applyCommand(before, { type: "end_turn", holdCardId: "circuit-breaker", holdIndex }, data));
    expect(after.battle.hand[0]).toBe("circuit-breaker");
    expect(after.battle.hand).toHaveLength(5);
    expect(after.battle.hand.filter((id) => id === "circuit-breaker")).toHaveLength(1);
    expect(after.battle.discardPile).not.toContain("circuit-breaker");
    expect(after.log.some((entry) => entry.text.includes("Held Trip the circuit breaker"))).toBe(true);
    const rejected = applyCommand(before, { type: "end_turn", holdCardId: "circuit-breaker", holdIndex: 99 }, data);
    expect(rejected.ok).toBe(false);
  });

  test("full counters stop bleeds, focus drain and draw penalties", () => {
    const data = dataFor(encounter("a", {
      jevDeck: ["memory-leak"], startingDeck: ["deploy-freeze", "restart"],
    }));
    data.catalog = { ...CARD_CATALOG, "memory-leak": {
      ...CARD_CATALOG["memory-leak"] as import("../src/index").ChaosCard,
      drainFocus: 2, drawPenalty: 1, discard: 1,
    } };
    const state = playWith(createCampaign(["a"], 5, data), "deploy-freeze", data);
    const after = endTurn(state, data);
    expect(after.battle.dots).toHaveLength(0);
    expect(after.battle.harm).toBe(0);
    expect(after.battle.focus).toBe(3);
    expect(after.battle.hand).toHaveLength(2);
    expect(after.battle.stats.threatsBlocked).toBe(1);
    expect(selectPlayerView(state, data).threat?.drainFocus).toBe(0);
  });

  test("uncountered disruption reduces the next hand and base focus", () => {
    const data = dataFor(encounter("a", { jevDeck: ["retry-storm"] }));
    const next = endTurn(createCampaign(["a"], 5, data), data);
    expect(next.battle.hand).toHaveLength(4);
    const focusData = dataFor(encounter("a", { jevDeck: ["noisy-neighbor"] }));
    const drained = endTurn(createCampaign(["a"], 5, focusData), focusData);
    expect(drained.battle.focus).toBe(2);
    expect(restoreCampaign(drained, focusData).ok).toBe(true);
  });

  test("the final round ends before Jev draws again and records actual harm", () => {
    const data = dataFor(encounter("a", { maxRounds: 1, jevDeck: ["traffic-surge"] }));
    const before = createCampaign(["a"], 5, data);
    const after = endTurn(before, data);
    expect(after.phase).toBe("failed");
    expect(after.battle.round).toBe(1);
    expect(after.battle.stats.jevCardsPlayed).toBe(1);
    expect(after.totalHarm).toBe(14);
    expect(after.results[0]?.rounds).toBe(1);
  });

  test("a lethal trade cannot bypass the harm limit by reaching the target", () => {
    const data = dataFor(encounter("a", {
      startingDeck: ["chaos-monkey"], stabilityTarget: 12, harmBudget: 8,
    }));
    const after = playWith(createCampaign(["a"], 5, data), "chaos-monkey", data);
    expect(after.phase).toBe("failed");
    expect(after.totalHarm).toBe(8);
  });
});

describe("counterplay and arcade scoring", () => {
  test("shielding a database lock restores contain gains", () => {
    const data = dataFor(encounter("a", { startingDeck: ["load-shedder", "restart"], jevDeck: ["db-lock"] }));
    const start = createCampaign(["a"], 5, data);
    expect(playWith(start, "restart", data).battle.stability).toBe(2);
    const shielded = playWith(start, "load-shedder", data);
    expect(selectPlayerView(shielded, data).threat?.recoveryPenalty).toBe(0);
    expect(playWith(shielded, "restart", data).battle.stability).toBe(8);
  });

  test("a counter restores recovery and is counted once even on the finishing card", () => {
    const data = dataFor(encounter("a", { startingDeck: ["failover", "failover"], focusPerTurn: 5, jevDeck: ["db-lock"], stabilityTarget: 34 }));
    let state = playWith(createCampaign(["a"], 5, data), "failover", data);
    expect(state.battle.stability).toBe(20);
    state = playWith(state, "failover", data);
    expect(state.phase).toBe("complete");
    expect(state.results[0]?.stats.threatsBlocked).toBe(1);
    expect(state.results[0]?.stats.damagePrevented).toBe(12);
  });

  test("runbook setup is consumed by one contain and expires at round end", () => {
    const data = dataFor(encounter("a", { startingDeck: ["runbook", "restart", "restart"], jevDeck: ["traffic-surge"] }));
    const prepared = playWith(createCampaign(["a"], 5, data), "runbook", data);
    expect(prepared.battle.focus).toBe(2);
    expect(prepared.battle.nextContainBonus).toBe(12);
    const first = playWith(prepared, "restart", data);
    expect(first.battle.stability).toBe(20);
    expect(playWith(first, "restart", data).battle.stability).toBe(28);
    expect(endTurn(prepared, data).battle.nextContainBonus).toBe(0);
    expect(restoreCampaign(prepared, data).ok).toBe(true);
  });

  test("healing cannot erase damage taken or improve the score for an otherwise identical win", () => {
    const data = dataFor(encounter("a", { startingDeck: ["status-page", "restart"], jevDeck: ["traffic-surge"], stabilityTarget: 8 }));
    const hurt = endTurn(createCampaign(["a"], 5, data), data);
    const rush = playWith(hurt, "restart", data);
    const healed = playWith(playWith(hurt, "status-page", data), "restart", data);
    expect(healed.battle.harm).toBe(4);
    expect(healed.totalHarm).toBe(14);
    expect(rankRun(healed, data).score).toBe(rankRun(rush, data).score);
  });

  test("sudden resolution names and actual impact survive snapshot restore", () => {
    const data = dataFor(encounter("a", { jevDeck: ["data-corruption"], startingDeck: ["restart"] }));
    const before = createCampaign(["a"], 5, data);
    before.battle.threat = null;
    before.battle.stability = 5;
    const after = endTurn(before, data);
    expect(after.battle.resolution).toEqual([{ name: "Data corruption", harm: 20, stabilityDamage: 5, countered: false }]);
    expect(after.battle.stats.damageTaken).toBe(20);
    expect(selectPlayerView(after, data).surpriseRisk).toEqual({ harm: 20, stabilityDamage: 10 });
    expect(restoreCampaign(after, data).ok).toBe(true);
  });

  test("completed results preserve each incident's stats for the full debrief", () => {
    const definition = { startingDeck: ["restart"], stabilityTarget: 8, jevDeck: ["traffic-surge"] };
    const data = dataFor(encounter("a", definition), encounter("b", definition));
    let state = playWith(createCampaign(["a", "b"], 5, data), "restart", data);
    state = must(applyCommand(state, { type: "draft_pick", cardId: state.draft![0]! }, data));
    state = playWith(state, "restart", data);
    expect(state.results.reduce((sum, result) => sum + result.stats.cardsPlayed, 0)).toBe(2);
    expect(restoreCampaign(state, data).ok).toBe(true);
  });
});
