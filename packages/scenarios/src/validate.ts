import { CARD_CATALOG, type EncounterDefinition } from "@incident-commander/cards";
import { canonicalJsonStringify, sha256Hex } from "@incident-commander/contracts";

type Candidate = Record<string, unknown>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateEncounter(value: unknown): { ok: true; encounter: EncounterDefinition } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["Encounter must be an object."] };
  const candidate = value as Candidate;
  const requiredStrings = ["id", "version", "title", "summary", "difficulty"];
  for (const key of requiredStrings) {
    if (!isNonEmptyString(candidate[key])) errors.push(`${key} must be a non-empty string.`);
  }
  if (!isPositiveInt(candidate.engineVersion)) errors.push("engineVersion must be a positive integer.");
  for (const key of ["seed", "stabilityTarget", "harmBudget", "focusPerTurn", "handSize", "maxRounds"]) {
    if (!isPositiveInt(candidate[key])) errors.push(`${key} must be a positive integer.`);
  }
  for (const key of ["startingDeck", "rewards", "jevDeck"]) {
    if (!isStringArray(candidate[key])) errors.push(`${key} must be an array of card ids.`);
  }
  const briefing = candidate.briefing;
  if (typeof briefing !== "object" || briefing === null) {
    errors.push("briefing is required.");
  } else {
    const brief = briefing as Candidate;
    if (!isNonEmptyString(brief.objective)) errors.push("briefing.objective is required.");
    if (!isStringArray(brief.steps)) errors.push("briefing.steps must be an array.");
    if (!isStringArray(brief.thresholds)) errors.push("briefing.thresholds must be an array.");
    if (!isNonEmptyString(brief.impactLimit)) errors.push("briefing.impactLimit is required.");
  }
  if (isStringArray(candidate.startingDeck)) {
    for (const cardId of candidate.startingDeck) {
      const card = CARD_CATALOG[cardId];
      if (!card) errors.push(`startingDeck references unknown card ${cardId}.`);
      else if (card.kind === "chaos") errors.push(`startingDeck cannot contain chaos card ${cardId}.`);
    }
  }
  if (isStringArray(candidate.rewards)) {
    for (const cardId of candidate.rewards) {
      const card = CARD_CATALOG[cardId];
      if (!card) errors.push(`rewards references unknown card ${cardId}.`);
      else if (card.kind === "chaos") errors.push(`rewards cannot contain chaos card ${cardId}.`);
    }
  }
  if (isStringArray(candidate.jevDeck)) {
    for (const cardId of candidate.jevDeck) {
      const card = CARD_CATALOG[cardId];
      if (!card) errors.push(`jevDeck references unknown card ${cardId}.`);
      else if (card.kind !== "chaos") errors.push(`jevDeck must only contain chaos cards (${cardId}).`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, encounter: value as EncounterDefinition };
}

export function assertValidEncounter(value: unknown): EncounterDefinition {
  const result = validateEncounter(value);
  if (!result.ok) throw new Error(`Invalid encounter: ${result.errors.join(" ")}`);
  return result.encounter;
}

export async function encounterContentHash(encounter: EncounterDefinition): Promise<string> {
  return sha256Hex(canonicalJsonStringify(encounter));
}
