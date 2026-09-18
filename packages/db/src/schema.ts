import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RunInput, RunOutcome } from "@incident-commander/contracts";

export const guests = pgTable("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const scenarioVersions = pgTable(
  "scenario_versions",
  {
    id: text("id").notNull(),
    version: text("version").notNull(),
    contentHash: text("content_hash").notNull(),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    createKey: uuid("create_key").notNull(),
    createHash: text("create_hash").notNull(),
    scenarioId: text("scenario_id").notNull(),
    scenarioVersion: text("scenario_version").notNull(),
    scenarioHash: text("scenario_hash").notNull(),
    engineVersion: integer("engine_version").notNull(),
    snapshotSchemaVersion: integer("snapshot_schema_version").notNull(),
    seed: bigint("seed", { mode: "number" }).notNull(),
    status: text("status").notNull().default("active"),
    revision: integer("revision").notNull().default(0),
    lastInputSeq: integer("last_input_seq").notNull().default(0),
    outcome: jsonb("outcome").$type<RunOutcome | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runs_guest_create_key_unique").on(table.guestId, table.createKey),
    index("runs_guest_updated_idx").on(table.guestId, table.updatedAt),
    foreignKey({
      columns: [table.scenarioId, table.scenarioVersion],
      foreignColumns: [scenarioVersions.id, scenarioVersions.version],
    }).onDelete("restrict"),
    check("runs_seed_range", sql`${table.seed} >= 0 and ${table.seed} <= 4294967295`),
    check("runs_revision_nonnegative", sql`${table.revision} >= 0`),
    check("runs_last_input_seq_nonnegative", sql`${table.lastInputSeq} >= 0`),
    check("runs_status_valid", sql`${table.status} in ('active','won','lost')`),
  ],
);

export const runInputs = pgTable(
  "run_inputs",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    inputId: uuid("input_id").notNull(),
    seq: integer("seq").notNull(),
    tick: integer("tick").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<RunInput>().notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.seq] }),
    uniqueIndex("run_inputs_run_input_unique").on(table.runId, table.inputId),
    index("run_inputs_run_tick_seq_idx").on(table.runId, table.tick, table.seq),
    check("run_inputs_seq_range", sql`${table.seq} >= 1 and ${table.seq} <= 10000`),
    check("run_inputs_tick_nonnegative", sql`${table.tick} >= 0`),
    check("run_inputs_type_valid", sql`${table.type} in ('play_card','end_turn','draft_pick')`),
    check("run_inputs_source_valid", sql`${table.source} in ('button','command')`),
  ],
);

export const runCheckpoints = pgTable(
  "run_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    tick: integer("tick").notNull(),
    throughSeq: integer("through_seq").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("run_checkpoints_run_revision_unique").on(table.runId, table.revision),
    index("run_checkpoints_run_tick_idx").on(table.runId, table.tick),
    check("run_checkpoints_revision_nonnegative", sql`${table.revision} >= 0`),
    check("run_checkpoints_tick_nonnegative", sql`${table.tick} >= 0`),
    check("run_checkpoints_through_seq_nonnegative", sql`${table.throughSeq} >= 0`),
  ],
);

export const runBatches = pgTable(
  "run_batches",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull(),
    requestHash: text("request_hash").notNull(),
    receipt: jsonb("receipt").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.batchId] })],
);

export type GuestRow = typeof guests.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type RunInputRow = typeof runInputs.$inferSelect;
export type RunCheckpointRow = typeof runCheckpoints.$inferSelect;
export type RunBatchRow = typeof runBatches.$inferSelect;
export type ScenarioVersionRow = typeof scenarioVersions.$inferSelect;
