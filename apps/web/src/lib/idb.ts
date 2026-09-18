import type { CampaignState } from "@incident-commander/cards";
import type { RunInput } from "@incident-commander/contracts";

export type LocalCheckpoint = { tick: number; throughSeq: number; state: CampaignState };

export type InFlightBatch = {
  batchId: string;
  baseRevision: number;
  inputs: RunInput[];
  checkpoint: LocalCheckpoint;
};

export type LocalRun = {
  runId: string;
  guestId: string | null;
  scenarioId: string;
  scenarioVersion: string;
  engineVersion: number;
  seed: number;
  checkpoint: LocalCheckpoint;
  inputs: RunInput[];
  lastAckedRevision: number;
  lastSyncedSeq: number;
  inFlight: InFlightBatch | null;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "incident-commander";
const STORE = "runs";
const VERSION = 1;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "runId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function putLocalRun(record: LocalRun): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  await withStore("readwrite", (store) => store.put(record));
}

export async function getLocalRun(runId: string): Promise<LocalRun | undefined> {
  if (!isIndexedDbAvailable()) return undefined;
  return withStore<LocalRun | undefined>("readonly", (store) => store.get(runId));
}

export async function listLocalRuns(): Promise<LocalRun[]> {
  if (!isIndexedDbAvailable()) return [];
  return withStore<LocalRun[]>("readonly", (store) => store.getAll());
}

export async function deleteLocalRun(runId: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  await withStore("readwrite", (store) => store.delete(runId));
}

export { isIndexedDbAvailable };
