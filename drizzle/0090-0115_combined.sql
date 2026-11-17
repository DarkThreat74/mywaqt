-- Combined migrations 0090_friends_volition.sql .. 0114_lifetime_qadaa.sql
-- Consolidated to reduce file count. Sections preserve original order.

-- ── 0090_friends_volition.sql ───────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "volition" text;

-- ── 0091_friends_attune.sql ─────────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "attune" text;

-- ── 0092_quran_tester_mistakes.sql ──────────────────────────────
CREATE TABLE IF NOT EXISTS "quran_tester_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"surah" integer NOT NULL,
	"ayah" integer NOT NULL,
	"word" integer NOT NULL,
	"kind" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quran_tester_mistakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quran_tester_mistakes_user_loc_idx" ON "quran_tester_mistakes" USING btree ("user_id","surah","ayah","word");

-- ── 0093_user_ui_prefs.sql ──────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ui_prefs" jsonb;

-- ── 0094_recite_clips.sql ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "recite_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"reciter" text,
	"passage" text,
	"style" text,
	"storage_key" text,
	"processed_storage_key" text,
	"file_size" integer,
	"duration" integer,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"processing_error" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recite_clips_processing_status_idx" ON "recite_clips" ("processing_status");
CREATE INDEX IF NOT EXISTS "recite_clips_published_idx" ON "recite_clips" ("published_at");

-- ── 0095_recite_clips_analysis.sql ──────────────────────────────
ALTER TABLE "recite_clips" ADD COLUMN IF NOT EXISTS "analysis" jsonb;

-- ── 0096_recite_clips_stage.sql ─────────────────────────────────
ALTER TABLE recite_clips ADD COLUMN IF NOT EXISTS processing_stage text;

-- ── 0097_events_created_via_text.sql ────────────────────────────
-- events.created_via was a Postgres enum ('manual','voice_ai') — any other
-- value (goal:<id>, class:<id>, homework, quran) fails the INSERT and the
-- client reports "Failed to create event". Convert to text.
ALTER TABLE "events" ALTER COLUMN "created_via" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_via" TYPE text USING "created_via"::text;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_via" SET DEFAULT 'manual';

-- ── 0098_workout_sets_variation.sql ─────────────────────────────
ALTER TABLE workout_sets ADD COLUMN variation text;

-- ── 0099_workout_algorithm_data.sql ─────────────────────────────
ALTER TABLE workout_sessions ADD COLUMN exercise_order jsonb;
ALTER TABLE workout_sessions ADD COLUMN readiness jsonb;
ALTER TABLE workout_sessions ADD COLUMN paused_sec integer NOT NULL DEFAULT 0;
ALTER TABLE workout_sessions ADD COLUMN ended_reason text;

ALTER TABLE workout_sets ADD COLUMN side text;
ALTER TABLE workout_sets ADD COLUMN logged_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE workout_sets ADD COLUMN rest_after_sec integer;
ALTER TABLE workout_sets ADD COLUMN pain integer;
ALTER TABLE workout_sets ADD COLUMN technique_flag text;
ALTER TABLE workout_sets ADD COLUMN is_partial boolean NOT NULL DEFAULT false;

CREATE TABLE body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric(7,2) NOT NULL,
  bodyfat_pct numeric(5,2)
);
CREATE INDEX body_metrics_user_date_idx ON body_metrics(user_id, measured_at);

-- ── 0100_events_hangout.sql ─────────────────────────────────────
ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'hangout';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_with" text;

-- ── 0101_homework_series.sql ────────────────────────────────────
ALTER TABLE "homeworks" ADD COLUMN IF NOT EXISTS "series_id" uuid;

-- ── 0102_event_hangout_friend.sql ───────────────────────────────
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_friend_id" uuid REFERENCES "friends"("id") ON DELETE SET NULL;
UPDATE "events" SET "type" = 'block' WHERE "type" = 'hangout';

-- ── 0103_event_multiple_hangout_friends.sql ─────────────────────
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_friend_ids" uuid[];
UPDATE "events" SET "hangout_friend_ids" = ARRAY["hangout_friend_id"]::uuid[] WHERE "hangout_friend_id" IS NOT NULL AND "hangout_friend_ids" IS NULL;

-- ── 0104_friend_photo_history.sql ───────────────────────────────
CREATE TABLE IF NOT EXISTS "friend_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "friend_id" uuid NOT NULL REFERENCES "friends"("id") ON DELETE CASCADE,
  "photo_data" text NOT NULL,
  "photo_mime" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "friend_photos_user_friend_idx" ON "friend_photos" ("user_id", "friend_id");
INSERT INTO "friend_photos" ("user_id", "friend_id", "photo_data", "photo_mime")
SELECT "user_id", "id", "photo_data", "photo_mime" FROM "friends"
WHERE "photo_data" IS NOT NULL AND "photo_mime" IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "friend_photos" fp WHERE fp."friend_id" = "friends"."id");

-- ── 0105_birthday_friend_sync.sql ───────────────────────────────
ALTER TABLE "birthdays" ADD COLUMN IF NOT EXISTS "friend_id" uuid REFERENCES "friends"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "birthdays_friend_id_idx" ON "birthdays" ("friend_id");

-- ── 0106_event_place_tag.sql ────────────────────────────────────
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_id" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_name" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_address" text;

-- ── 0107_friend_multiple_crews.sql ──────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "group_labels" text[];
UPDATE "friends" SET "group_labels" = ARRAY["group_label"]::text[] WHERE "group_label" IS NOT NULL AND "group_labels" IS NULL;

-- ── 0108_friend_profile_shares.sql ──────────────────────────────
CREATE TABLE IF NOT EXISTS "friend_profile_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "friend_id" uuid NOT NULL REFERENCES "friends"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "friend_profile_shares_owner_friend_idx" ON "friend_profile_shares" ("user_id", "friend_id");

-- ── 0109_friend_messages_sender_idx.sql ─────────────────────────
CREATE INDEX IF NOT EXISTS "friend_messages_sender_pair_idx" ON "friend_messages" ("sender_id", "recipient_id", "created_at");

-- ── 0110_prayer_log_archive.sql ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "prayer_log_archive" (
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"payload" bytea NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_log_archive_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "prayer_log_archive_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);

-- ── 0111_workout_photos.sql ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "workout_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"angle" text NOT NULL,
	"weight_kg" numeric(7, 2),
	"note" text,
	"photo_data" text NOT NULL,
	"photo_mime" text NOT NULL,
	"pose" jsonb,
	CONSTRAINT "workout_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "workout_photos_user_taken_idx" ON "workout_photos" USING btree ("user_id","taken_at");

-- ── 0112_workout_photos_world_pose.sql ──────────────────────────
ALTER TABLE "workout_photos" ADD COLUMN IF NOT EXISTS "world_pose" jsonb;

-- ── 0113_workout_photos_analysis.sql ────────────────────────────
ALTER TABLE "workout_photos" ADD COLUMN IF NOT EXISTS "analysis" jsonb;

-- ── 0114_lifetime_qadaa.sql ─────────────────────────────────────
-- Lifetime prayer view: "me" birthday flag + qadaa baligh/backfill data.

ALTER TABLE birthdays ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS birthdays_one_self_per_user
  ON birthdays (user_id) WHERE is_self;

ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS baligh_date date;
ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS baligh_age integer;
ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS initial_owed jsonb;

-- Backfill: the "me" birthday, if one exists, seeds baligh inputs later —
-- no data migration needed here since columns are nullable.
COMMENT ON COLUMN qadaa_ledger.baligh_date IS 'Day the user became baligh (drives lifetime view start)';
COMMENT ON COLUMN qadaa_ledger.initial_owed IS 'Snapshot of setup-time per-prayer owed counts {fajr,dhuhr,asr,maghrib,isha}';
COMMENT ON COLUMN birthdays.is_self IS 'At most one row per user — the owner''s own birthday';

-- ── 0115_perf_indexes.sql ────────────────────────────
CREATE INDEX IF NOT EXISTS events_user_end_idx ON events (user_id, end_at);
CREATE INDEX IF NOT EXISTS events_user_created_via_idx ON events (user_id, created_via);
CREATE INDEX IF NOT EXISTS trusted_devices_last_used_idx ON trusted_devices (last_used_at);
CREATE INDEX IF NOT EXISTS pending_signups_expires_idx ON pending_signups (expires_at);
CREATE INDEX IF NOT EXISTS users_deletion_scheduled_idx ON users (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
