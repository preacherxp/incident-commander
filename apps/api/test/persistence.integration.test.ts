import { afterAll, describe, expect, test } from "bun:test";
import type { RunInput } from "@incident-commander/contracts";
import {
  CARD_CATALOG,
  applyCommand,
  createCampaign,
  selectPlayerView,
  toRunOutcome,
  type CampaignState,
  type GameData,
} from "@incident-commander/cards";
import { FRIDAY_1658, ENCOUNTER_REGISTRY, encounterOrder } from "@incident-commander/scenarios";
import { createFallbackVoice } from "@incident-commander/ai";
import { createDatabase, type Database } from "@incident-commander/db";
import { createApp } from "../src/app";
import { loadEnv } from "../src/env";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const data: GameData = { catalog: CARD_CATALOG, encounters: ENCOUNTER_REGISTRY };

let db: Database | null = null;
let close: (() => Promise<void>) | null = null;

function getDb(): Database {
  if (!db) {
    const handle = createDatabase(process.env.DATABASE_URL as string, { max: 4 });
    db = handle.db;
    close = handle.close;
  }
  return db;
}

afterAll(async () => {
  if (close) await close();
});

type CallOptions = {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string;
};

async function call(app: ReturnType<typeof createApp>, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers["cookie"] = options.cookie;
  if (options.origin) headers["origin"] = options.origin;
  const response = await app.request(path, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : undefined;
  let json: unknown = null;
  try {
    json = await response.clone().json();
  } catch {
    json = null;
  }
  return { status: response.status, json: json as Record<string, unknown>, cookie };
}

function inputFor(state: CampaignState, seq: number): RunInput {
  if (state.phase === "draft") {
    return {
      type: "draft_pick",
      cardId: state.draft?.[0] as string,
      inputId: crypto.randomUUID(),
      seq,
      tick: seq,
      source: "button",
    };
  }
  const view = selectPlayerView(state, data);
  const playable = view.hand.find((card) => card.playable);
  if (playable) {
    const handIndex = view.hand.findIndex((card) => card.id === playable.id);
    return {
      type: "play_card",
      cardId: playable.id,
      handIndex,
      inputId: crypto.randomUUID(),
      seq,
      tick: seq,
      source: "button",
    };
  }
  return {
    type: "end_turn",
    inputId: crypto.randomUUID(),
    seq,
    tick: seq,
    source: "button",
  };
}

function advance(state: CampaignState, input: RunInput): CampaignState {
  const command =
    input.type === "play_card"
      ? { type: "play_card" as const, cardId: input.cardId, handIndex: input.handIndex }
      : input.type === "draft_pick"
        ? { type: "draft_pick" as const, cardId: input.cardId }
        : { type: "end_turn" as const };
  const result = applyCommand(state, command, data);
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
  return result.state;
}

suite("api persistence integration", () => {
  test(
    "create, sync, finalize, replay, and ownership isolation",
    async () => {
      const env = loadEnv({ ...process.env, APP_ORIGIN: "http://localhost:5173", AI_PROVIDER: "disabled" });
      const app = createApp({ env, db: getDb(), voice: createFallbackVoice() });

      const guestA = await call(app, "/api/v1/guest-session", { body: {}, origin: env.APP_ORIGIN });
      expect(guestA.status).toBe(200);
      expect(guestA.cookie).toBeTruthy();
      const cookieA = guestA.cookie as string;

      const scenarios = await call(app, "/api/v1/scenarios");
      expect(scenarios.status).toBe(200);
      const manifest = scenarios.json as Array<{ id: string; version: string; engineVersion: number }>;
      const entry = manifest.find((item) => item.id === FRIDAY_1658.id);
      expect(entry?.version).toBe(FRIDAY_1658.version);
      expect(entry?.engineVersion).toBe(FRIDAY_1658.engineVersion);

      const createBody = {
        createKey: crypto.randomUUID(),
        scenarioId: FRIDAY_1658.id,
        scenarioVersion: FRIDAY_1658.version,
        engineVersion: FRIDAY_1658.engineVersion,
        seed: FRIDAY_1658.seed,
      };
      const created = await call(app, "/api/v1/runs", { body: createBody, cookie: cookieA, origin: env.APP_ORIGIN });
      expect(created.status).toBe(201);
      const runId = created.json.runId as string;
      expect(typeof runId).toBe("string");

      const retried = await call(app, "/api/v1/runs", { body: createBody, cookie: cookieA, origin: env.APP_ORIGIN });
      expect(retried.status).toBe(201);
      expect(retried.json.runId).toBe(runId);
      expect(retried.json.created).toBe(false);

      const conflict = await call(app, "/api/v1/runs", {
        body: { ...createBody, seed: 1 },
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(conflict.status).toBe(409);
      expect((conflict.json.error as { code: string }).code).toBe("IDEMPOTENCY_KEY_REUSED");

      // Play one move locally, sync it, then play out the rest of the run.
      let state = createCampaign(encounterOrder(FRIDAY_1658.id), FRIDAY_1658.seed, data);
      const first = inputFor(state, 1);
      state = advance(state, first);
      expect(state.phase).toBe("battle");
      const midCheckpoint = { tick: 1, throughSeq: 1, state };

      const syncBody = {
        batchId: crypto.randomUUID(),
        baseRevision: 0,
        inputs: [first],
        checkpoint: midCheckpoint,
      };
      const synced = await call(app, `/api/v1/runs/${runId}/sync`, {
        body: syncBody,
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(synced.status).toBe(200);
      expect(synced.json.revision).toBe(1);

      const syncRetry = await call(app, `/api/v1/runs/${runId}/sync`, {
        body: syncBody,
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(syncRetry.status).toBe(200);
      expect(syncRetry.json.revision).toBe(1);

      const tail: RunInput[] = [];
      let guard = 0;
      while (state.phase !== "complete" && state.phase !== "failed" && guard < 400) {
        const input = inputFor(state, first.seq + tail.length + 1);
        tail.push(input);
        state = advance(state, input);
        guard += 1;
      }
      expect(["complete", "failed"]).toContain(state.phase);
      const finalCheckpoint = { tick: 1 + tail.length, throughSeq: 1 + tail.length, state };

      const staleRevision = await call(app, `/api/v1/runs/${runId}/sync`, {
        body: { ...syncBody, batchId: crypto.randomUUID(), inputs: [] },
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(staleRevision.status).toBe(409);
      expect((staleRevision.json.error as { code: string }).code).toBe("REVISION_CONFLICT");

      const outcome = toRunOutcome(state);
      const finalized = await call(app, `/api/v1/runs/${runId}/finalize`, {
        body: {
          batchId: crypto.randomUUID(),
          baseRevision: 1,
          inputs: tail,
          checkpoint: finalCheckpoint,
          outcome,
        },
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(finalized.status).toBe(200);
      expect(finalized.json.revision).toBe(2);
      expect(finalized.json.status).toBe(outcome.status);

      const afterFinal = await call(app, `/api/v1/runs/${runId}/sync`, {
        body: { ...syncBody, batchId: crypto.randomUUID(), baseRevision: 2, inputs: [] },
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(afterFinal.status).toBe(409);
      expect((afterFinal.json.error as { code: string }).code).toBe("RUN_FINALIZED");

      const detail = await call(app, `/api/v1/runs/${runId}`, { cookie: cookieA });
      expect(detail.status).toBe(200);
      expect(detail.json.status).toBe(outcome.status);

      const inputs = await call(app, `/api/v1/runs/${runId}/inputs?afterSeq=0&limit=500`, { cookie: cookieA });
      expect(inputs.status).toBe(200);
      expect((inputs.json.inputs as unknown[]).length).toBe(1 + tail.length);

      const replay = await call(app, `/api/v1/runs/${runId}/replay`, { cookie: cookieA });
      expect(replay.status).toBe(200);
      expect(replay.json.inputCount).toBe(1 + tail.length);
      expect(replay.json.finalSnapshotHash).toBeTruthy();
      expect((replay.json.outcome as { status: string }).status).toBe(outcome.status);

      const guestB = await call(app, "/api/v1/guest-session", { body: {}, origin: env.APP_ORIGIN });
      expect(guestB.cookie).toBeTruthy();
      const foreign = await call(app, `/api/v1/runs/${runId}`, { cookie: guestB.cookie as string });
      expect(foreign.status).toBe(404);
      expect((foreign.json.error as { code: string }).code).toBe("RUN_NOT_FOUND");

      const badOrigin = await call(app, "/api/v1/runs", {
        body: createBody,
        cookie: cookieA,
        origin: "https://evil.example",
      });
      expect(badOrigin.status).toBe(403);

      const voice = await call(app, "/api/v1/jev/voice", {
        body: {
          requestId: crypto.randomUUID(),
          runId,
          cue: "threat_revealed",
          encounterTitle: FRIDAY_1658.title,
          round: 2,
          stability: 30,
          stabilityTarget: 100,
          harm: 15,
          harmBudget: 110,
          lastJevCard: "traffic-surge",
          lastPlayerCard: "restart",
        },
        cookie: cookieA,
        origin: env.APP_ORIGIN,
      });
      expect(voice.status).toBe(200);
      expect(typeof voice.json.line).toBe("string");
      expect((voice.json.line as string).length).toBeGreaterThan(0);
    },
    120_000,
  );
});
