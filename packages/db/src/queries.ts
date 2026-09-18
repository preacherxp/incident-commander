import { and, asc, desc, eq, gt, lt, lte, sql } from "drizzle-orm";
import {
  MAX_INPUTS_PER_RUN,
  canonicalJsonStringify,
  sha256Hex,
  type RunInput,
  type RunOutcome,
} from "@incident-commander/contracts";
import type { Database } from "./client";
import {
  guests,
  runBatches,
  runCheckpoints,
  runInputs,
  runs,
  scenarioVersions,
  type RunCheckpointRow,
  type RunRow,
} from "./schema";

export type RunStatus = "active" | "won" | "lost";

export type SyncReceipt = {
  batchId: string;
  revision: number;
  checkpointId: string;
  tick: number;
  throughSeq: number;
  lastInputSeq: number;
  status: RunStatus;
};

export type StoreError =
  | { error: "RUN_NOT_FOUND" }
  | { error: "RUN_FINALIZED" }
  | { error: "REVISION_CONFLICT"; revision: number }
  | { error: "IDEMPOTENCY_KEY_REUSED" }
  | { error: "INVALID_REQUEST"; message: string }
  | { error: "RUN_INPUT_LIMIT" };

export type StoreResult<T> = T | StoreError;

export function isStoreError<T>(value: StoreResult<T>): value is StoreError {
  return typeof value === "object" && value !== null && "error" in value;
}

export async function canonicalRequestHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonStringify(value));
}

export async function createOrGetRun(
  db: Database,
  params: {
    guestId: string;
    createKey: string;
    createHash: string;
    scenarioId: string;
    scenarioVersion: string;
    scenarioHash: string;
    engineVersion: number;
    snapshotSchemaVersion: number;
    seed: number;
    genesis: { tick: number; throughSeq: number; snapshot: unknown; snapshotHash: string };
  },
): Promise<StoreResult<{ run: RunRow; created: boolean }>> {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(runs)
        .where(and(eq(runs.guestId, params.guestId), eq(runs.createKey, params.createKey)))
        .limit(1);
      const found = existing[0];
      if (found) {
        if (found.createHash !== params.createHash) return { error: "IDEMPOTENCY_KEY_REUSED" } as const;
        return { run: found, created: false } as const;
      }
      const inserted = await tx
        .insert(runs)
        .values({
          guestId: params.guestId,
          createKey: params.createKey,
          createHash: params.createHash,
          scenarioId: params.scenarioId,
          scenarioVersion: params.scenarioVersion,
          scenarioHash: params.scenarioHash,
          engineVersion: params.engineVersion,
          snapshotSchemaVersion: params.snapshotSchemaVersion,
          seed: params.seed,
        })
        .returning();
      const run = inserted[0] as RunRow;
      await tx.insert(runCheckpoints).values({
        runId: run.id,
        revision: 0,
        tick: params.genesis.tick,
        throughSeq: params.genesis.throughSeq,
        snapshot: params.genesis.snapshot,
        snapshotHash: params.genesis.snapshotHash,
      });
      return { run, created: true } as const;
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const existing = await db
        .select()
        .from(runs)
        .where(and(eq(runs.guestId, params.guestId), eq(runs.createKey, params.createKey)))
        .limit(1);
      const found = existing[0];
      if (found && found.createHash === params.createHash) return { run: found, created: false };
      return { error: "IDEMPOTENCY_KEY_REUSED" };
    }
    throw error;
  }
}

export async function getOwnedRun(db: Database, guestId: string, runId: string): Promise<RunRow | undefined> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.guestId, guestId)))
    .limit(1);
  return rows[0];
}

export async function getLatestCheckpoint(db: Database, runId: string): Promise<RunCheckpointRow | undefined> {
  const rows = await db
    .select()
    .from(runCheckpoints)
    .where(eq(runCheckpoints.runId, runId))
    .orderBy(desc(runCheckpoints.revision))
    .limit(1);
  return rows[0];
}

export async function getGenesisCheckpoint(db: Database, runId: string): Promise<RunCheckpointRow | undefined> {
  const rows = await db
    .select()
    .from(runCheckpoints)
    .where(and(eq(runCheckpoints.runId, runId), eq(runCheckpoints.revision, 0)))
    .limit(1);
  return rows[0];
}

export async function listPendingInputs(db: Database, runId: string, throughSeq: number): Promise<RunInput[]> {
  const rows = await db
    .select()
    .from(runInputs)
    .where(and(eq(runInputs.runId, runId), gt(runInputs.seq, throughSeq)))
    .orderBy(asc(runInputs.seq));
  return rows.map((row) => row.payload);
}

export async function listInputsAfterSeq(
  db: Database,
  runId: string,
  afterSeq: number,
  limit: number,
): Promise<RunInput[]> {
  const rows = await db
    .select()
    .from(runInputs)
    .where(and(eq(runInputs.runId, runId), gt(runInputs.seq, afterSeq)))
    .orderBy(asc(runInputs.seq))
    .limit(limit);
  return rows.map((row) => row.payload);
}

export async function countInputs(db: Database, runId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(runInputs)
    .where(eq(runInputs.runId, runId));
  return rows[0]?.count ?? 0;
}

export async function listRunsForGuest(
  db: Database,
  guestId: string,
  options: { limit: number; cursor?: { updatedAt: Date; id: string } },
): Promise<RunRow[]> {
  const limit = Math.min(Math.max(options.limit, 1), 50);
  const cursor = options.cursor;
  const condition = cursor
    ? and(
        eq(runs.guestId, guestId),
        sql`(${runs.updatedAt}, ${runs.id}) < (${cursor.updatedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
      )
    : eq(runs.guestId, guestId);
  return db
    .select()
    .from(runs)
    .where(condition)
    .orderBy(desc(runs.updatedAt), desc(runs.id))
    .limit(limit);
}

export async function syncRun(
  db: Database,
  params: {
    guestId: string;
    runId: string;
    batchId: string;
    requestHash: string;
    baseRevision: number;
    inputs: RunInput[];
    checkpoint: { tick: number; throughSeq: number; state: unknown };
    checkpointHash: string;
    operation: "sync" | "finalize";
    outcome?: RunOutcome;
  },
): Promise<StoreResult<SyncReceipt>> {
  return db.transaction(async (tx) => {
    const runRows = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.id, params.runId), eq(runs.guestId, params.guestId)))
      .for("update");
    const run = runRows[0];
    if (!run) return { error: "RUN_NOT_FOUND" } as const;

    const batchRows = await tx
      .select()
      .from(runBatches)
      .where(and(eq(runBatches.runId, params.runId), eq(runBatches.batchId, params.batchId)))
      .limit(1);
    const existingBatch = batchRows[0];
    if (existingBatch) {
      if (existingBatch.requestHash !== params.requestHash) return { error: "IDEMPOTENCY_KEY_REUSED" } as const;
      return existingBatch.receipt as SyncReceipt;
    }

    if (run.status !== "active") return { error: "RUN_FINALIZED" } as const;
    if (params.baseRevision !== run.revision) {
      return { error: "REVISION_CONFLICT", revision: run.revision } as const;
    }

    let expectedSeq = run.lastInputSeq + 1;
    let previousTick = -1;
    const seenInputIds = new Set<string>();
    for (const input of params.inputs) {
      if (input.seq !== expectedSeq) {
        return { error: "INVALID_REQUEST", message: "Input sequence is not a contiguous suffix." } as const;
      }
      if (input.tick < previousTick) {
        return { error: "INVALID_REQUEST", message: "Input ticks must be nondecreasing." } as const;
      }
      if (seenInputIds.has(input.inputId)) {
        return { error: "INVALID_REQUEST", message: "Duplicate input ID in batch." } as const;
      }
      seenInputIds.add(input.inputId);
      previousTick = input.tick;
      expectedSeq += 1;
    }

    const lastInputSeq = run.lastInputSeq + params.inputs.length;
    if (lastInputSeq > MAX_INPUTS_PER_RUN) return { error: "RUN_INPUT_LIMIT" } as const;

    if (params.inputs.length > 0) {
      await tx.insert(runInputs).values(
        params.inputs.map((input) => ({
          runId: params.runId,
          inputId: input.inputId,
          seq: input.seq,
          tick: input.tick,
          type: input.type,
          payload: input,
          source: input.source,
        })),
      );
    }

    const processedRows = await tx
      .select({ maxSeq: sql<number | null>`max(${runInputs.seq})` })
      .from(runInputs)
      .where(and(eq(runInputs.runId, params.runId), lte(runInputs.tick, params.checkpoint.tick)));
    const processedMax = processedRows[0]?.maxSeq ?? 0;
    if ((processedMax ?? 0) !== params.checkpoint.throughSeq) {
      return {
        error: "INVALID_REQUEST",
        message: "Checkpoint throughSeq does not match processed inputs.",
      } as const;
    }

    const previousCheckpoint = await getLatestCheckpoint(tx as unknown as Database, params.runId);
    if (
      previousCheckpoint &&
      (params.checkpoint.tick < previousCheckpoint.tick ||
        params.checkpoint.throughSeq < previousCheckpoint.throughSeq)
    ) {
      return { error: "INVALID_REQUEST", message: "Checkpoint regressed in tick or throughSeq." } as const;
    }

    let status: RunStatus = "active";
    let finalizedAt: Date | null = null;
    if (params.operation === "finalize") {
      if (!params.outcome) {
        return { error: "INVALID_REQUEST", message: "Finalize requires an outcome." } as const;
      }
      if (params.checkpoint.throughSeq !== lastInputSeq) {
        return {
          error: "INVALID_REQUEST",
          message: "Final checkpoint must have no pending input tail.",
        } as const;
      }
      status = params.outcome.status;
      finalizedAt = new Date();
    }

    const nextRevision = run.revision + 1;
    const insertedCheckpoint = await tx
      .insert(runCheckpoints)
      .values({
        runId: params.runId,
        revision: nextRevision,
        tick: params.checkpoint.tick,
        throughSeq: params.checkpoint.throughSeq,
        snapshot: params.checkpoint.state,
        snapshotHash: params.checkpointHash,
      })
      .returning();
    const checkpointId = insertedCheckpoint[0]?.id ?? "";

    await tx
      .update(runs)
      .set({
        revision: nextRevision,
        lastInputSeq,
        updatedAt: new Date(),
        status,
        outcome: params.outcome ?? null,
        finalizedAt,
      })
      .where(eq(runs.id, params.runId));

    const receipt: SyncReceipt = {
      batchId: params.batchId,
      revision: nextRevision,
      checkpointId,
      tick: params.checkpoint.tick,
      throughSeq: params.checkpoint.throughSeq,
      lastInputSeq,
      status,
    };
    await tx.insert(runBatches).values({
      runId: params.runId,
      batchId: params.batchId,
      requestHash: params.requestHash,
      receipt,
    });
    return receipt;
  });
}

export async function findRunBatch(db: Database, runId: string, batchId: string) {
  const rows = await db
    .select()
    .from(runBatches)
    .where(and(eq(runBatches.runId, runId), eq(runBatches.batchId, batchId)))
    .limit(1);
  return rows[0];
}

export async function getScenarioVersion(db: Database, id: string, version: string) {
  const rows = await db
    .select()
    .from(scenarioVersions)
    .where(and(eq(scenarioVersions.id, id), eq(scenarioVersions.version, version)))
    .limit(1);
  return rows[0];
}

export async function listScenarioVersions(db: Database) {
  return db.select().from(scenarioVersions);
}

export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

export async function createGuest(
  db: Database,
  params: { tokenHash: string; expiresAt: Date },
): Promise<{ id: string; expiresAt: Date }> {
  const inserted = await db
    .insert(guests)
    .values({ tokenHash: params.tokenHash, expiresAt: params.expiresAt })
    .returning();
  const guest = inserted[0];
  return { id: guest?.id ?? "", expiresAt: guest?.expiresAt ?? params.expiresAt };
}

export async function findGuestByHash(db: Database, tokenHash: string) {
  const rows = await db.select().from(guests).where(eq(guests.tokenHash, tokenHash)).limit(1);
  return rows[0];
}

export async function deleteExpiredGuests(db: Database): Promise<void> {
  await db.delete(guests).where(lte(guests.expiresAt, new Date()));
}

export { asc, desc, eq, and, gt, lt, lte };
