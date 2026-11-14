export type RunRecord = {
  grade: string;
  score: number;
  totalHarm: number;
  encountersCleared: number;
  outcome: "won" | "lost";
  at: string;
};

const PREFIX = "ic:best:";
const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, F: 4 };

function key(scenarioId: string, version: string): string {
  return `${PREFIX}${scenarioId}@${version}`;
}

export function readRecord(scenarioId: string, version: string): RunRecord | null {
  try {
    const raw = localStorage.getItem(key(scenarioId, version));
    return raw ? (JSON.parse(raw) as RunRecord) : null;
  } catch {
    return null;
  }
}

export function isBetter(candidate: RunRecord, current: RunRecord | null): boolean {
  if (!current) return true;
  const candidateGrade = GRADE_ORDER[candidate.grade] ?? 9;
  const currentGrade = GRADE_ORDER[current.grade] ?? 9;
  if (candidateGrade !== currentGrade) return candidateGrade < currentGrade;
  if (candidate.encountersCleared !== current.encountersCleared) {
    return candidate.encountersCleared > current.encountersCleared;
  }
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.totalHarm < current.totalHarm;
}

export function purgeStaleRecords(live: Array<{ id: string; version: string }>): void {
  try {
    const keep = new Set(live.map((entry) => key(entry.id, entry.version)));
    const remove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const item = localStorage.key(index);
      if (item?.startsWith(PREFIX) && !keep.has(item)) remove.push(item);
    }
    for (const item of remove) localStorage.removeItem(item);
  } catch {
    /* Best scores are optional. */
  }
}

export function writeRecordIfBest(
  scenarioId: string,
  version: string,
  record: RunRecord,
): { isBest: boolean; best: RunRecord } {
  const current = readRecord(scenarioId, version);
  if (!isBetter(record, current)) return { isBest: false, best: current ?? record };
  try {
    localStorage.setItem(key(scenarioId, version), JSON.stringify(record));
  } catch {
    return { isBest: false, best: current ?? record };
  }
  return { isBest: true, best: record };
}
