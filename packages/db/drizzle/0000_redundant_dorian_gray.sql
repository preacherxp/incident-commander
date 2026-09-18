CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "run_batches" (
	"run_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_batches_run_id_batch_id_pk" PRIMARY KEY("run_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "run_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"tick" integer NOT NULL,
	"through_seq" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_checkpoints_revision_nonnegative" CHECK ("run_checkpoints"."revision" >= 0),
	CONSTRAINT "run_checkpoints_tick_nonnegative" CHECK ("run_checkpoints"."tick" >= 0),
	CONSTRAINT "run_checkpoints_through_seq_nonnegative" CHECK ("run_checkpoints"."through_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "run_inputs" (
	"run_id" uuid NOT NULL,
	"input_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"tick" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_inputs_run_id_seq_pk" PRIMARY KEY("run_id","seq"),
	CONSTRAINT "run_inputs_seq_range" CHECK ("run_inputs"."seq" >= 1 and "run_inputs"."seq" <= 10000),
	CONSTRAINT "run_inputs_tick_nonnegative" CHECK ("run_inputs"."tick" >= 0),
	CONSTRAINT "run_inputs_type_valid" CHECK ("run_inputs"."type" in ('start_operation','cancel_operation')),
	CONSTRAINT "run_inputs_source_valid" CHECK ("run_inputs"."source" in ('button','command'))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"create_key" uuid NOT NULL,
	"create_hash" text NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario_version" text NOT NULL,
	"scenario_hash" text NOT NULL,
	"engine_version" integer NOT NULL,
	"snapshot_schema_version" integer NOT NULL,
	"seed" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_input_seq" integer DEFAULT 0 NOT NULL,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "runs_seed_range" CHECK ("runs"."seed" >= 0 and "runs"."seed" <= 4294967295),
	CONSTRAINT "runs_revision_nonnegative" CHECK ("runs"."revision" >= 0),
	CONSTRAINT "runs_last_input_seq_nonnegative" CHECK ("runs"."last_input_seq" >= 0),
	CONSTRAINT "runs_status_valid" CHECK ("runs"."status" in ('active','won','lost'))
);
--> statement-breakpoint
CREATE TABLE "scenario_versions" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"content_hash" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_versions_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
ALTER TABLE "run_batches" ADD CONSTRAINT "run_batches_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_checkpoints" ADD CONSTRAINT "run_checkpoints_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_inputs" ADD CONSTRAINT "run_inputs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_scenario_id_scenario_version_scenario_versions_id_version_fk" FOREIGN KEY ("scenario_id","scenario_version") REFERENCES "public"."scenario_versions"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_checkpoints_run_revision_unique" ON "run_checkpoints" USING btree ("run_id","revision");--> statement-breakpoint
CREATE INDEX "run_checkpoints_run_tick_idx" ON "run_checkpoints" USING btree ("run_id","tick");--> statement-breakpoint
CREATE UNIQUE INDEX "run_inputs_run_input_unique" ON "run_inputs" USING btree ("run_id","input_id");--> statement-breakpoint
CREATE INDEX "run_inputs_run_tick_seq_idx" ON "run_inputs" USING btree ("run_id","tick","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_guest_create_key_unique" ON "runs" USING btree ("guest_id","create_key");--> statement-breakpoint
CREATE INDEX "runs_guest_updated_idx" ON "runs" USING btree ("guest_id","updated_at");