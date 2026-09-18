import { z } from "zod";
import { runInputSchema } from "./commands";
import { MAX_COMMAND_CHARS, MAX_SYNC_INPUTS } from "./versions";

export const scenarioManifestEntrySchema = z
  .object({
    id: z.string().min(1).max(64),
    version: z.string().min(1).max(32),
    engineVersion: z.number().int().positive(),
    contentHash: z.string().min(8).max(128),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(400),
    difficulty: z.string().min(1).max(120),
    playable: z.boolean(),
  })
  .strict();
export type ScenarioManifestEntry = z.infer<typeof scenarioManifestEntrySchema>;

export const createRunRequestSchema = z
  .object({
    createKey: z.string().uuid(),
    scenarioId: z.string().min(1).max(64),
    scenarioVersion: z.string().min(1).max(32),
    engineVersion: z.number().int().positive(),
    seed: z.number().int().min(0).max(4294967295),
  })
  .strict();
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const runStatusSchema = z.enum(["active", "won", "lost"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSummarySchema = z
  .object({
    id: z.string().uuid(),
    scenarioId: z.string(),
    scenarioVersion: z.string(),
    engineVersion: z.number().int(),
    seed: z.number().int(),
    status: runStatusSchema,
    revision: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    throughSeq: z.number().int().nonnegative(),
    lastInputSeq: z.number().int().nonnegative(),
    harm: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
    finalizedAt: z.string().nullable(),
  })
  .strict();
export type RunSummary = z.infer<typeof runSummarySchema>;

export const checkpointEnvelopeSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    throughSeq: z.number().int().nonnegative(),
    state: z.record(z.unknown()),
  })
  .strict();
export type CheckpointEnvelope = z.infer<typeof checkpointEnvelopeSchema>;

export const runDetailSchema = runSummarySchema
  .extend({
    latestCheckpointId: z.string().uuid().nullable(),
    checkpoint: checkpointEnvelopeSchema.nullable(),
    pendingInputs: z.array(runInputSchema),
  })
  .strict();
export type RunDetail = z.infer<typeof runDetailSchema>;

export const syncRequestSchema = z
  .object({
    batchId: z.string().uuid(),
    baseRevision: z.number().int().nonnegative(),
    inputs: z.array(runInputSchema).max(MAX_SYNC_INPUTS),
    checkpoint: checkpointEnvelopeSchema,
  })
  .strict();
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const runOutcomeSchema = z
  .object({
    status: z.enum(["won", "lost"]),
    encountersCleared: z.number().int().nonnegative(),
    encounterCount: z.number().int().positive(),
    totalHarm: z.number().int().nonnegative(),
    rounds: z.number().int().nonnegative(),
    deckSize: z.number().int().nonnegative(),
    finalEncounterId: z.string().min(1).max(64),
  })
  .strict();
export type RunOutcome = z.infer<typeof runOutcomeSchema>;

export const finalizeRequestSchema = syncRequestSchema
  .extend({ outcome: runOutcomeSchema })
  .strict();
export type FinalizeRequest = z.infer<typeof finalizeRequestSchema>;

export const syncResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    revision: z.number().int(),
    checkpointId: z.string().uuid().nullable(),
    tick: z.number().int(),
    throughSeq: z.number().int(),
    lastInputSeq: z.number().int(),
    status: runStatusSchema,
  })
  .strict();
export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const VOICE_CUES = [
  "opening",
  "threat_revealed",
  "threat_resolved",
  "threat_blocked",
  "player_ahead",
  "jev_ahead",
  "draft",
  "victory",
  "defeat",
] as const;
export type VoiceCue = (typeof VOICE_CUES)[number];

export const VOICE_MESSAGE_CODES = ["VOICE_READY", "VOICE_UNAVAILABLE"] as const;
export type VoiceMessageCode = (typeof VOICE_MESSAGE_CODES)[number];

export const provenanceSchema = z
  .object({
    provider: z.string().max(64),
    model: z.string().max(128),
    promptVersion: z.string().max(64),
  })
  .strict();
export type Provenance = z.infer<typeof provenanceSchema>;

export const voiceRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    runId: z.string().uuid(),
    cue: z.enum(VOICE_CUES),
    encounterTitle: z.string().min(1).max(120),
    round: z.number().int().nonnegative().max(99),
    stability: z.number().int().nonnegative().max(9999),
    stabilityTarget: z.number().int().positive().max(9999),
    harm: z.number().int().nonnegative().max(99999),
    harmBudget: z.number().int().positive().max(99999),
    lastJevCard: z.string().max(64).nullable(),
    lastPlayerCard: z.string().max(64).nullable(),
    context: z.string().max(MAX_COMMAND_CHARS).optional(),
  })
  .strict();
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;

export const voiceResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    line: z.string().min(1).max(400),
    messageCode: z.enum(VOICE_MESSAGE_CODES),
    provenance: provenanceSchema.optional(),
  })
  .strict();
export type VoiceResponse = z.infer<typeof voiceResponseSchema>;

export const guestSessionResponseSchema = z
  .object({
    guestId: z.string().uuid(),
    expiresAt: z.string(),
  })
  .strict();
export type GuestSessionResponse = z.infer<typeof guestSessionResponseSchema>;

export const runListResponseSchema = z
  .object({
    runs: z.array(runSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type RunListResponse = z.infer<typeof runListResponseSchema>;

export const replayResponseSchema = z
  .object({
    runId: z.string().uuid(),
    scenarioId: z.string(),
    scenarioVersion: z.string(),
    engineVersion: z.number().int(),
    seed: z.number().int(),
    outcome: runOutcomeSchema.nullable(),
    genesis: checkpointEnvelopeSchema,
    inputCount: z.number().int().nonnegative(),
    finalSnapshotHash: z.string().nullable(),
  })
  .strict();
export type ReplayResponse = z.infer<typeof replayResponseSchema>;
