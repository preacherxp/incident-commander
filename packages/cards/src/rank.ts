import type { CampaignState, EncounterDefinition, EncounterResult, GameData } from "./types";

export type Grade = "S" | "A" | "B" | "C" | "F";
export type Rank = { grade: Grade; score: number; headline: string; reasons: string[] };

function gradeFor(score: number): Grade {
  return score >= 75 ? "S" : score >= 60 ? "A" : score >= 45 ? "B" : "C";
}
const HEADLINES: Record<Grade, string> = {
  S: "Textbook response", A: "Clean recovery", B: "Recovered, but costly", C: "Barely contained", F: "Incident escaped",
};

export function rankEncounter(result: EncounterResult, encounter: EncounterDefinition): Rank {
  const reasons = [
    `${result.rounds} rounds · ${result.stats.damageTaken} damage taken · ${result.stats.threatsBlocked} counters.`,
    "Score rewards speed and prevention. Healing keeps you alive; it does not erase damage taken.",
  ];
  const score = result.outcome === "lost" ? 0 : Math.round(Math.max(0, Math.min(100,
    100 - result.stats.damageTaken / Math.max(1, encounter.harmBudget) * 50
    - Math.max(0, result.rounds - 3) * 5
    + Math.min(3, result.stats.threatsBlocked) * 5 + Math.min(30, result.stats.damagePrevented) * .3,
  )));
  const grade = result.outcome === "lost" ? "F" : gradeFor(score);
  return { grade, score, headline: HEADLINES[grade], reasons };
}

export function rankRun(state: CampaignState, data: GameData): Rank {
  const cleared = state.results.filter((result) => result.outcome === "won").length;
  const score = Math.round(state.results.reduce((sum, result) => {
    const encounter = data.encounters[result.encounterId];
    return sum + (encounter ? rankEncounter(result, encounter).score : 0);
  }, 0) / Math.max(1, state.encounterIds.length));
  const grade = state.phase === "complete" ? gradeFor(score) : "F";
  return {
    grade, score,
    headline: grade === "F" ? "Run over" : HEADLINES[grade],
    reasons: [`${cleared} of ${state.encounterIds.length} incidents contained.`, `${state.totalHarm} damage taken across the run.`, "Score rewards speed, counters, and damage prevented."],
  };
}
