import { useSyncExternalStore } from "react";
import {
  type Command,
  type RunInput,
} from "@incident-commander/contracts";
import {
  applyCommand,
  createCampaign,
  restoreCampaign,
  selectPlayerView,
  toRunOutcome,
  type CampaignState,
  type EncounterDefinition,
  type GameData,
  type PlayerView,
} from "@incident-commander/cards";
import { encounterOrder } from "@incident-commander/scenarios";
import * as api from "../lib/api";
import { ApiClientError } from "../lib/api";
import { getLocalRun, putLocalRun, type InFlightBatch, type LocalRun } from "../lib/idb";

export type SaveStatus = "saved" | "saving" | "waiting-sync" | "error" | "conflict";

export type CommitResult = { ok: true } | { ok: false; reason: string; message: string };

export type SessionSnapshot = {
  view: PlayerView;
  saveStatus: SaveStatus;
  conflict: boolean;
  revision: number;
};

const SYNC_INTERVAL_MS = 10_000;

export type SessionConfig = {
  runId: string;
  guestId: string | null;
  data: GameData;
  state: CampaignState;
  inputs: RunInput[];
  lastAckedRevision: number;
  lastSyncedSeq: number;
  inFlight: InFlightBatch | null;
  createdAt: string;
};

export class RunSession {
  private readonly runId: string;
  private guestId: string | null;
  private readonly data: GameData;
  private readonly createdAt: string;
  private state: CampaignState;
  private inputs: RunInput[];
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot;
  private lastAckedRevision: number;
  private lastSyncedSeq: number;
  private inFlight: InFlightBatch | null;
  private saveStatus: SaveStatus = "saved";
  private conflict = false;
  private syncing = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(config: SessionConfig) {
    this.runId = config.runId;
    this.guestId = config.guestId;
    this.data = config.data;
    this.createdAt = config.createdAt;
    this.state = config.state;
    this.inputs = config.inputs;
    this.lastAckedRevision = config.lastAckedRevision;
    this.lastSyncedSeq = config.lastSyncedSeq;
    this.inFlight = config.inFlight;
    this.snapshot = this.buildSnapshot();
  }

  get id(): string {
    return this.runId;
  }

  get currentState(): CampaignState {
    return this.state;
  }

  get allInputs(): RunInput[] {
    return this.inputs;
  }

  getData(): GameData {
    return this.data;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  private buildSnapshot(): SessionSnapshot {
    return {
      view: selectPlayerView(this.state, this.data),
      saveStatus: this.saveStatus,
      conflict: this.conflict,
      revision: this.lastAckedRevision,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private setSaveStatus(status: SaveStatus): void {
    if (this.saveStatus === status) return;
    this.saveStatus = status;
    this.emit();
  }

  async commit(command: Command): Promise<CommitResult> {
    if (this.state.phase === "complete" || this.state.phase === "failed") {
      return { ok: false, reason: "RUN_TERMINAL", message: "This run has ended." };
    }
    const result = applyCommand(this.state, command, this.data);
    if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
    const input = {
      ...command,
      inputId: crypto.randomUUID(),
      seq: this.inputs.length + 1,
      tick: this.inputs.length + 1,
      source: "button",
    } as RunInput;
    this.state = result.state;
    this.inputs.push(input);
    this.emit();
    await this.persist();
    if (this.state.phase === "complete" || this.state.phase === "failed") {
      await this.flush(true);
    } else if (this.unackedInputs().length >= 4) {
      void this.flush();
    }
    this.emit();
    return { ok: true };
  }

  async save(): Promise<void> {
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.setSaveStatus("saving");
    const record: LocalRun = {
      runId: this.runId,
      guestId: this.guestId,
      scenarioId: this.state.encounterIds[0] ?? "",
      scenarioVersion: "1.0.0",
      engineVersion: this.state.engineVersion,
      seed: this.state.seed,
      checkpoint: {
        tick: this.inputs.length,
        throughSeq: this.inputs.length,
        state: this.state,
      },
      inputs: this.inputs,
      lastAckedRevision: this.lastAckedRevision,
      lastSyncedSeq: this.lastSyncedSeq,
      inFlight: this.inFlight,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
    };
    try {
      await putLocalRun(record);
      if (this.saveStatus === "saving") this.setSaveStatus("saved");
    } catch {
      this.setSaveStatus("error");
    }
  }

  start(): void {
    if (this.syncTimer || this.destroyed) return;
    this.syncTimer = setInterval(() => void this.flush(), SYNC_INTERVAL_MS);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  private unackedInputs(): RunInput[] {
    return this.inputs.filter((input) => input.seq > this.lastSyncedSeq);
  }

  async flush(finalize = false): Promise<void> {
    if (this.syncing || this.destroyed) return;
    const terminal = this.state.phase === "complete" || this.state.phase === "failed";
    if (!terminal && this.unackedInputs().length === 0) return;
    this.syncing = true;
    try {
      const inputs = this.unackedInputs();
      let batch: InFlightBatch;
      if (this.inFlight) {
        batch = this.inFlight;
      } else {
        batch = {
          batchId: crypto.randomUUID(),
          baseRevision: this.lastAckedRevision,
          inputs,
          checkpoint: {
            tick: this.inputs.length,
            throughSeq: this.inputs.length,
            state: this.state,
          },
        };
        this.inFlight = batch;
        await this.persist();
      }
      const body = {
        batchId: batch.batchId,
        baseRevision: batch.baseRevision,
        inputs: batch.inputs,
        checkpoint: {
          tick: batch.checkpoint.tick,
          throughSeq: batch.checkpoint.throughSeq,
          state: batch.checkpoint.state,
        },
      };
      const response =
        finalize && terminal
          ? await api.finalizeRun(this.runId, { ...body, outcome: toRunOutcome(this.state) })
          : await api.syncRun(this.runId, body);
      this.lastAckedRevision = response.revision;
      this.lastSyncedSeq = response.lastInputSeq;
      this.inFlight = null;
      this.setSaveStatus("saved");
      await this.persist();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "REVISION_CONFLICT") {
        this.conflict = true;
        this.setSaveStatus("conflict");
      } else {
        this.setSaveStatus("waiting-sync");
      }
    } finally {
      this.syncing = false;
    }
  }

  setGuestId(guestId: string | null): void {
    this.guestId = guestId;
  }

  clearConflict(): void {
    this.conflict = false;
    this.emit();
  }
}

export function useSessionSnapshot(session: RunSession): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

export async function startNewSession(options: {
  encounter: EncounterDefinition;
  guestId: string | null;
  data: GameData;
}): Promise<RunSession> {
  const encounterIds = encounterOrder(options.encounter.id);
  const state = createCampaign(encounterIds, options.encounter.seed, options.data);
  let runId: string = crypto.randomUUID();
  let revision = 0;
  try {
    const created = await api.createRun({
      createKey: crypto.randomUUID(),
      scenarioId: options.encounter.id,
      scenarioVersion: options.encounter.version,
      engineVersion: options.encounter.engineVersion,
      seed: options.encounter.seed,
    });
    runId = created.runId;
    revision = created.revision;
  } catch {
    // Offline mode: play locally and retry syncing later.
  }
  const session = new RunSession({
    runId,
    guestId: options.guestId,
    data: options.data,
    state,
    inputs: [],
    lastAckedRevision: revision,
    lastSyncedSeq: 0,
    inFlight: null,
    createdAt: new Date().toISOString(),
  });
  await session.save();
  return session;
}

export async function resumeSession(
  runId: string,
  guestId: string | null,
  data: GameData,
): Promise<RunSession | null> {
  const local = await getLocalRun(runId);
  if (!local) return null;
  const restored = restoreCampaign(local.checkpoint.state, data);
  if (!restored.ok) return null;
  return new RunSession({
    runId,
    guestId,
    data,
    state: restored.state,
    inputs: local.inputs,
    lastAckedRevision: local.lastAckedRevision,
    lastSyncedSeq: local.lastSyncedSeq,
    inFlight: local.inFlight,
    createdAt: local.createdAt,
  });
}
