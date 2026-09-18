export type RunRecord = {
  grade: string;
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
  return candidate.totalHarm < current.totalHarm;
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
