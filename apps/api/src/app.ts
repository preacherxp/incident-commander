import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { z } from "zod";
import {
  MAX_BODY_BYTES,
  canonicalHash,
  createRunRequestSchema,
  finalizeRequestSchema,
  syncRequestSchema,
  voiceRequestSchema,
  type RunInput,
  type ScenarioManifestEntry,
  type SyncResponse,
  type VoiceResponse,
} from "@incident-commander/contracts";
import {
  countInputs,
  createGuest,
  createOrGetRun,
  findGuestByHash,
  findRunBatch,
  getGenesisCheckpoint,
  getLatestCheckpoint,
  getOwnedRun,
  getScenarioVersion,
  isStoreError,
  listInputsAfterSeq,
  listPendingInputs,
  listRunsForGuest,
  listScenarioVersions,
  pingDatabase,
  syncRun,
  type Database,
  type GuestRow,
  type RunCheckpointRow,
  type RunRow,
  type StoreError,
} from "@incident-commander/db";
import {
  CARD_CATALOG,
  createCampaign,
  restoreCampaign,
  toRunOutcome,
  type EncounterDefinition,
  type GameData,
} from "@incident-commander/cards";
import { encounterOrder, validateEncounter } from "@incident-commander/scenarios";
import type { JevVoice } from "@incident-commander/ai";
import { ApiError, errorBody } from "./errors";
import { establishGuest, guestSessionResponse, resolveGuest } from "./auth";
import { SlidingWindowLimiter } from "./rate-limit";
import type { ApiEnv } from "./env";

type Variables = { requestId: string; guest?: GuestRow };
type AppContext = Context<{ Variables: Variables }>;

export type AppDependencies = {
  env: ApiEnv;
  db: Database;
  voice: JevVoice;
  webDistPath?: string;
};

const uuidSchema = z.string().uuid();

function parseUuid(value: string | undefined): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new ApiError("INVALID_REQUEST", 400, "Invalid run identifier.");
  return result.data;
}

async function parseJson<T>(
  c: { req: { json: () => Promise<unknown> } },
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError("INVALID_REQUEST", 400, "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError("INVALID_REQUEST", 400, "Request body failed validation.", {
      issues: result.error.issues.slice(0, 8),
    });
  }
  return result.data;
}

function mapStoreError(error: StoreError): ApiError {
  switch (error.error) {
    case "RUN_NOT_FOUND":
      return new ApiError("RUN_NOT_FOUND", 404, "Run not found.");
    case "RUN_FINALIZED":
      return new ApiError("RUN_FINALIZED", 409, "This run is already sealed.");
    case "REVISION_CONFLICT":
      return new ApiError("REVISION_CONFLICT", 409, "The run changed on the server.", {
        revision: error.revision,
      });
    case "IDEMPOTENCY_KEY_REUSED":
      return new ApiError("IDEMPOTENCY_KEY_REUSED", 409, "That key was already used with a different body.");
    case "RUN_INPUT_LIMIT":
      return new ApiError("RUN_INPUT_LIMIT", 409, "This run reached its input limit.");
    default:
      return new ApiError("INVALID_REQUEST", 400, error.message);
  }
}

function manifestFromDefinition(row: {
  id: string;
  version: string;
  contentHash: string;
  definition: unknown;
}): ScenarioManifestEntry {
  const definition = (row.definition ?? {}) as Record<string, unknown>;
  const asString = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.length > 0 ? value : fallback;
  return {
    id: row.id,
    version: row.version,
    engineVersion: typeof definition.engineVersion === "number" ? definition.engineVersion : 2,
    contentHash: row.contentHash,
    title: asString(definition.title, row.id),
    summary: asString(definition.summary, ""),
    difficulty: asString(definition.difficulty, "standard"),
    playable: true,
  };
}

function snapshotHarm(checkpoint: RunCheckpointRow | undefined): number {
  const snapshot = checkpoint?.snapshot as
    | { totalHarm?: number; battle?: { harm?: number } }
    | undefined;
  return (snapshot?.totalHarm ?? 0) + (snapshot?.battle?.harm ?? 0);
}

function toRunSummary(run: RunRow, checkpoint: RunCheckpointRow | undefined, throughSeq: number) {
  return {
    id: run.id,
    scenarioId: run.scenarioId,
    scenarioVersion: run.scenarioVersion,
    engineVersion: run.engineVersion,
    seed: run.seed,
    status: run.status as "active" | "won" | "lost",
    revision: run.revision,
    tick: checkpoint?.tick ?? 0,
    throughSeq,
    lastInputSeq: run.lastInputSeq,
    harm: snapshotHarm(checkpoint),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    finalizedAt: run.finalizedAt ? run.finalizedAt.toISOString() : null,
  };
}

export function createApp(deps: AppDependencies): Hono<{ Variables: Variables }> {
  const { env, db, voice, webDistPath } = deps;
  const app = new Hono<{ Variables: Variables }>();
  const voiceLimiter = new SlidingWindowLimiter(60, 60_000);
  const writeLimiter = new SlidingWindowLimiter(120, 60_000);

  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
  });

  app.use(
    "/api/v1/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new ApiError("PAYLOAD_TOO_LARGE", 413, "Request body too large.");
      },
    }),
  );

  const originGuard: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = c.req.header("origin");
      if (origin && origin !== env.APP_ORIGIN) {
        throw new ApiError("ORIGIN_REJECTED", 403, "Request origin is not allowed.");
      }
    }
    await next();
  };
  app.use("/api/v1/*", originGuard);

  async function requireGuest(c: AppContext): Promise<GuestRow> {
    const existing = c.get("guest") ?? (await resolveGuest(c, (hash) => findGuestByHash(db, hash)));
    if (!existing) throw new ApiError("GUEST_SESSION_REQUIRED", 401, "A guest session is required.");
    c.set("guest", existing);
    return existing;
  }

  async function requireOwnedRun(guestId: string, runId: string): Promise<RunRow> {
    const run = await getOwnedRun(db, guestId, runId);
    if (!run) throw new ApiError("RUN_NOT_FOUND", 404, "Run not found.");
    return run;
  }

  async function loadGameData(): Promise<GameData> {
    const rows = await listScenarioVersions(db);
    const encounters: Record<string, EncounterDefinition> = {};
    for (const row of rows) {
      const result = validateEncounter(row.definition);
      if (result.ok) encounters[row.id] = result.encounter;
    }
    return { catalog: CARD_CATALOG, encounters };
  }

  async function requireScenario(scenarioId: string, scenarioVersion: string): Promise<EncounterDefinition> {
    const row = await getScenarioVersion(db, scenarioId, scenarioVersion);
    if (!row) throw new ApiError("VERSION_UNAVAILABLE", 409, "That incident version is no longer available.");
    const result = validateEncounter(row.definition);
    if (!result.ok) {
      throw new ApiError(
        "VERSION_UNAVAILABLE",
        409,
        "That incident version uses rules this build cannot replay. Keep the original build to open it.",
      );
    }
    return result.encounter;
  }

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? crypto.randomUUID();
    if (error instanceof ApiError) {
      if (error.code === "RATE_LIMITED" && typeof error.details?.retryAfterSeconds === "number") {
        c.header("Retry-After", String(error.details.retryAfterSeconds));
      }
      return c.json(errorBody(error, requestId), error.status as 400);
    }
    console.error(`[${requestId}]`, error instanceof Error ? error.message : error);
    return c.json(
      errorBody(new ApiError("SERVICE_UNAVAILABLE", 503, "Unexpected server error."), requestId),
      503,
    );
  });

  app.get("/api/v1/health", async (c) => {
    await pingDatabase(db);
    return c.json({ status: "ok", database: "up" });
  });

  app.get("/api/v1/live", (c) => c.json({ status: "ok" }));

  app.get("/api/v1/scenarios", async (c) => {
    const rows = await listScenarioVersions(db);
    return c.json(rows.filter((row) => validateEncounter(row.definition).ok).map(manifestFromDefinition));
  });

  app.post("/api/v1/guest-session", async (c) => {
    const result = await establishGuest(
      c,
      env,
      (params) => createGuest(db, params),
      (hash) => findGuestByHash(db, hash),
    );
    return c.json(guestSessionResponse(result));
  });

  app.get("/api/v1/runs", async (c) => {
    const guest = await requireGuest(c);
    const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 50);
    const cursorRaw = c.req.query("cursor");
    let cursor: { updatedAt: Date; id: string } | undefined;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64url").toString("utf8");
        const [updatedAt, id] = decoded.split("|");
        if (updatedAt && id) cursor = { updatedAt: new Date(updatedAt), id };
      } catch {
        throw new ApiError("INVALID_REQUEST", 400, "Invalid cursor.");
      }
    }
    const rows = await listRunsForGuest(db, guest.id, { limit: limit + 1, cursor });
    const page = rows.slice(0, limit);
    const next = rows[limit];
    const summaries = [];
    for (const run of page) {
      const checkpoint = await getLatestCheckpoint(db, run.id);
      summaries.push(toRunSummary(run, checkpoint, checkpoint?.throughSeq ?? 0));
    }
    return c.json({
      runs: summaries,
      nextCursor: next
        ? Buffer.from(`${next.updatedAt.toISOString()}|${next.id}`).toString("base64url")
        : null,
    });
  });

  app.post("/api/v1/runs", async (c) => {
    const body = await parseJson(c, createRunRequestSchema);
    const guest = await requireGuest(c);
    const runLimit = writeLimiter.check(guest.id);
    if (!runLimit.allowed) {
      throw new ApiError("RATE_LIMITED", 429, "Too many writes.", {
        retryAfterSeconds: runLimit.retryAfterSeconds,
      });
    }
    const row = await getScenarioVersion(db, body.scenarioId, body.scenarioVersion);
    if (!row) throw new ApiError("VERSION_UNAVAILABLE", 409, "That incident version is not available.");
    const parsed = validateEncounter(row.definition);
    if (!parsed.ok) {
      throw new ApiError(
        "VERSION_UNAVAILABLE",
        409,
        "That incident version uses rules this build cannot start. Use the current version.",
      );
    }
    if (parsed.encounter.engineVersion !== body.engineVersion) {
      throw new ApiError("INVALID_REQUEST", 400, "Engine version does not match the incident.");
    }
    const data = await loadGameData();
    const encounterIds = encounterOrder(parsed.encounter.id);
    if (encounterIds.length === 0 || !data.encounters[parsed.encounter.id]) {
      throw new ApiError("VERSION_UNAVAILABLE", 409, "That incident is not available on this server.");
    }
    const createHash = await canonicalHash(body);
    const state = createCampaign(encounterIds, body.seed, data);
    const snapshotHash = await canonicalHash(state);
    const result = await createOrGetRun(db, {
      guestId: guest.id,
      createKey: body.createKey,
      createHash,
      scenarioId: body.scenarioId,
      scenarioVersion: body.scenarioVersion,
      scenarioHash: row.contentHash,
      engineVersion: body.engineVersion,
      snapshotSchemaVersion: state.stateVersion,
      seed: body.seed,
      genesis: { tick: state.battle.round, throughSeq: 0, snapshot: state, snapshotHash },
    });
    if (isStoreError(result)) throw mapStoreError(result);
    return c.json(
      {
        runId: result.run.id,
        revision: 0,
        created: result.created,
        checkpoint: { tick: state.battle.round, throughSeq: 0, state },
      },
      201,
    );
  });

  app.get("/api/v1/runs/:id", async (c) => {
    const guest = await requireGuest(c);
    const runId = parseUuid(c.req.param("id"));
    const run = await requireOwnedRun(guest.id, runId);
    const checkpoint = await getLatestCheckpoint(db, runId);
    const throughSeq = checkpoint?.throughSeq ?? 0;
    const pending = await listPendingInputs(db, runId, throughSeq);
    return c.json({
      ...toRunSummary(run, checkpoint, throughSeq),
      latestCheckpointId: checkpoint?.id ?? null,
      checkpoint: checkpoint
        ? { tick: checkpoint.tick, throughSeq: checkpoint.throughSeq, state: checkpoint.snapshot }
        : null,
      pendingInputs: pending,
    });
  });

  app.get("/api/v1/runs/:id/inputs", async (c) => {
    const guest = await requireGuest(c);
    const runId = parseUuid(c.req.param("id"));
    await requireOwnedRun(guest.id, runId);
    const afterSeq = Math.max(0, Number.parseInt(c.req.query("afterSeq") ?? "0", 10) || 0);
    const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "500", 10) || 500, 1), 500);
    const inputs = await listInputsAfterSeq(db, runId, afterSeq, limit);
    return c.json({
      inputs,
      nextAfterSeq: inputs.length > 0 ? (inputs[inputs.length - 1]?.seq ?? afterSeq) : afterSeq,
    });
  });

  app.post("/api/v1/runs/:id/sync", async (c) => {
    const guest = await requireGuest(c);
    const runId = parseUuid(c.req.param("id"));
    const body = await parseJson(c, syncRequestSchema);
    const run = await requireOwnedRun(guest.id, runId);
    const requestHash = await canonicalHash({ kind: "sync", body });
    const existingBatch = await findRunBatch(db, runId, body.batchId);
    if (existingBatch) {
      if (existingBatch.requestHash !== requestHash) {
        throw new ApiError("IDEMPOTENCY_KEY_REUSED", 409, "That key was already used with a different body.");
      }
      return c.json(existingBatch.receipt as SyncResponse);
    }
    await requireScenario(run.scenarioId, run.scenarioVersion);
    const data = await loadGameData();
    const restored = restoreCampaign(body.checkpoint.state, data);
    if (!restored.ok) throw new ApiError("INVALID_REQUEST", 400, restored.reason);
    if (restored.state.phase === "complete" || restored.state.phase === "failed") {
      throw new ApiError("INVALID_REQUEST", 400, "Use /finalize for a finished run.");
    }
    const checkpointHash = await canonicalHash(restored.state);
    const result = await syncRun(db, {
      guestId: guest.id,
      runId,
      batchId: body.batchId,
      requestHash,
      baseRevision: body.baseRevision,
      inputs: body.inputs as RunInput[],
      checkpoint: {
        tick: body.checkpoint.tick,
        throughSeq: body.checkpoint.throughSeq,
        state: restored.state,
      },
      checkpointHash,
      operation: "sync",
    });
    if (isStoreError(result)) throw mapStoreError(result);
    return c.json(result satisfies SyncResponse);
  });

  app.post("/api/v1/runs/:id/finalize", async (c) => {
    const guest = await requireGuest(c);
    const runId = parseUuid(c.req.param("id"));
    const body = await parseJson(c, finalizeRequestSchema);
    const run = await requireOwnedRun(guest.id, runId);
    const requestHash = await canonicalHash({ kind: "finalize", body });
    const existingBatch = await findRunBatch(db, runId, body.batchId);
    if (existingBatch) {
      if (existingBatch.requestHash !== requestHash) {
        throw new ApiError("IDEMPOTENCY_KEY_REUSED", 409, "That key was already used with a different body.");
      }
      return c.json(existingBatch.receipt as SyncResponse);
    }
    await requireScenario(run.scenarioId, run.scenarioVersion);
    const data = await loadGameData();
    const restored = restoreCampaign(body.checkpoint.state, data);
    if (!restored.ok) throw new ApiError("INVALID_REQUEST", 400, restored.reason);
    const outcome = toRunOutcome(restored.state);
    if (restored.state.phase !== "complete" && restored.state.phase !== "failed") {
      throw new ApiError("INVALID_REQUEST", 400, "Finalize requires a finished run.");
    }
    if (outcome.status !== body.outcome.status) {
      throw new ApiError("INVALID_REQUEST", 400, "Outcome does not match the terminal state.");
    }
    const checkpointHash = await canonicalHash(restored.state);
    const result = await syncRun(db, {
      guestId: guest.id,
      runId,
      batchId: body.batchId,
      requestHash,
      baseRevision: body.baseRevision,
      inputs: body.inputs as RunInput[],
      checkpoint: {
        tick: body.checkpoint.tick,
        throughSeq: body.checkpoint.throughSeq,
        state: restored.state,
      },
      checkpointHash,
      operation: "finalize",
      outcome: body.outcome,
    });
    if (isStoreError(result)) throw mapStoreError(result);
    return c.json(result satisfies SyncResponse);
  });

  app.get("/api/v1/runs/:id/replay", async (c) => {
    const guest = await requireGuest(c);
    const runId = parseUuid(c.req.param("id"));
    const run = await requireOwnedRun(guest.id, runId);
    const genesis = await getGenesisCheckpoint(db, runId);
    const latest = await getLatestCheckpoint(db, runId);
    const inputCount = await countInputs(db, runId);
    if (!genesis) throw new ApiError("SERVICE_UNAVAILABLE", 503, "Genesis checkpoint is missing.");
    return c.json({
      runId,
      scenarioId: run.scenarioId,
      scenarioVersion: run.scenarioVersion,
      engineVersion: run.engineVersion,
      seed: run.seed,
      outcome: run.outcome ?? null,
      genesis: { tick: genesis.tick, throughSeq: genesis.throughSeq, state: genesis.snapshot },
      inputCount,
      finalSnapshotHash: latest?.snapshotHash ?? null,
    });
  });

  app.post("/api/v1/jev/voice", async (c) => {
    const guest = await requireGuest(c);
    const body = await parseJson(c, voiceRequestSchema);
    const limit = voiceLimiter.check(guest.id);
    if (!limit.allowed) {
      throw new ApiError("RATE_LIMITED", 429, "Jev needs a moment.", {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    const response = await voice.speak(body);
    return c.json(response satisfies VoiceResponse);
  });

  if (webDistPath) {
    app.use(
      "*",
      serveStatic({
        root: webDistPath,
        onFound: (path, c) => {
          if (path.includes("/assets/")) {
            c.header("cache-control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.get("*", async (c) => {
      if (c.req.path.startsWith("/api/")) return c.notFound();
      const indexFile = Bun.file(join(webDistPath, "index.html"));
      if (await indexFile.exists()) return c.html(await indexFile.text());
      return c.notFound();
    });
  }

  return app;
}
