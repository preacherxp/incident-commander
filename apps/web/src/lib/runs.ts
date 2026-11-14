import { CARD_CATALOG, restoreCampaign, type GameData } from "@incident-commander/cards";
import { ENCOUNTER_REGISTRY } from "@incident-commander/scenarios";
import { deleteLocalRun, listLocalRuns, type LocalRun } from "./idb";

export const GAME_DATA: GameData = { catalog: CARD_CATALOG, encounters: ENCOUNTER_REGISTRY };

export function isPlayableRun(record: LocalRun | null | undefined): boolean {
  if (!record || typeof record !== "object") return false;
  const checkpoint = record.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return false;
  try {
    return restoreCampaign(checkpoint.state, GAME_DATA).ok;
  } catch {
    return false;
  }
}

export async function purgeUnplayableLocalRuns(): Promise<LocalRun[]> {
  const runs = await listLocalRuns();
  const playable: LocalRun[] = [];
  for (const run of runs) {
    if (isPlayableRun(run)) playable.push(run);
    else await deleteLocalRun(run.runId);
  }
  return playable;
}
