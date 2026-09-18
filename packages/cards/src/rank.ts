import type { CampaignState, EncounterDefinition, EncounterResult, GameData } from "./types";

export type Grade = "S" | "A" | "B" | "C" | "F";
export type Rank = { grade: Grade; headline: string; reasons: string[] };

export function rankEncounter(result: EncounterResult, encounter: EncounterDefinition): Rank {
  const reasons = [
    result.outcome === "won"
      ? `Contained in ${result.rounds} rounds with ${result.harm} harm.`
      : `Lost after ${result.rounds} rounds with ${result.harm} harm.`,
  ];
  if (result.outcome !== "won") {
    return { grade: "F", headline: "Incident escaped", reasons: [...reasons, "The harm budget ran out."] };
  }
  const ratio = encounter.harmBudget > 0 ? result.harm / encounter.harmBudget : 1;
  if (ratio <= 0.2) return { grade: "S", headline: "Textbook response", reasons };
  if (ratio <= 0.45) return { grade: "A", headline: "Clean recovery", reasons };
  if (ratio <= 0.7) return { grade: "B", headline: "Recovered, but costly", reasons };
  return { grade: "C", headline: "Barely contained", reasons };
}

export function rankRun(state: CampaignState, data: GameData): Rank {
  const cleared = state.results.filter((result) => result.outcome === "won").length;
  const reasons = [
    `${cleared} of ${state.encounterIds.length} incidents contained.`,
    `Total customer harm: ${state.totalHarm}.`,
    `Final deck: ${state.deck.length} cards.`,
  ];
  if (state.phase !== "complete") {
    const failed = [...state.results].reverse().find((result) => result.outcome === "lost");
    reasons.push(failed ? `${failed.encounterId} escaped containment.` : "The run ended early.");
    return { grade: "F", headline: "Run over", reasons };
  }
  const totalBudget = state.encounterIds.reduce(
    (sum, id) => sum + (data.encounters[id]?.harmBudget ?? 0),
    0,
  );
  const ratio = totalBudget > 0 ? state.totalHarm / totalBudget : 1;
  if (ratio <= 0.25) return { grade: "S", headline: "Flawless on-call", reasons };
  if (ratio <= 0.45) return { grade: "A", headline: "Command performance", reasons };
  return { grade: "B", headline: "You held the line", reasons };
}
