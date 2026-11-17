-- Combined migrations 0000_many_genesis.sql .. 0029_social_prayer.sql
-- Consolidated to reduce file count. Sections preserve original order.

-- ── 0000_many_genesis.sql ───────────────────────────────────────
CREATE TYPE "public"."event_created_via" AS ENUM('manual', 'voice_ai');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('block', 'task', 'reminder');--> statement-breakpoint
CREATE TYPE "public"."oath_status" AS ENUM('owed', 'donated');--> statement-breakpoint
CREATE TYPE "public"."prayer_name" AS ENUM('fajr', 'dhuhr', 'asr', 'maghrib', 'isha');--> statement-breakpoint
CREATE TYPE "public"."prayer_status" AS ENUM('pending', 'prayed', 'missed', 'assumed_prayed');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'plus');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "daily_lesson_views" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid,
	"date" date NOT NULL,
	CONSTRAINT "daily_lesson_views_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "daily_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"source_citation" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "dhikr_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phrase_arabic" text NOT NULL,
	"phrase_transliteration" text NOT NULL,
	"target_count" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"source_citation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"type" "event_type" DEFAULT 'block' NOT NULL,
	"recurrence_rule" text,
	"created_via" "event_created_via" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "huddle_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"task_id" uuid,
	"date" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "huddle_task_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"is_default_free" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prayer_early_mid" text DEFAULT 'push' NOT NULL,
	"prayer_final" text DEFAULT 'push' NOT NULL,
	"other_reminders" text DEFAULT 'push' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oath_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"prayer_log_id" uuid,
	"amount" numeric(6, 2) NOT NULL,
	"status" "oath_status" DEFAULT 'owed' NOT NULL,
	"logged_donated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oath_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"amount_per_missed" numeric(6, 2) NOT NULL,
	"min_slider" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"max_slider" numeric(6, 2) DEFAULT '10.00' NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_responses" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"religiosity_self_rating" integer,
	"prayer_frequency" integer,
	"quran_reading_frequency" integer,
	"years_missed_estimate" integer,
	"responses_json" jsonb,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"prayer_name" "prayer_name" NOT NULL,
	"went_to_masjid" boolean,
	"status" "prayer_status" DEFAULT 'pending' NOT NULL,
	"marked_at" timestamp with time zone,
	"last_checkin_at" timestamp with time zone,
	"checkin_stage" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"timezone" text NOT NULL,
	"calculation_method" integer DEFAULT 2 NOT NULL,
	"madhab" text DEFAULT 'standard',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_times_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"date" date NOT NULL,
	"fajr" time NOT NULL,
	"sunrise" time NOT NULL,
	"dhuhr" time NOT NULL,
	"asr" time NOT NULL,
	"maghrib" time NOT NULL,
	"isha" time NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qadaa_ledger" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_owed" integer DEFAULT 0 NOT NULL,
	"onboarding_estimate" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qadaa_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"amount_logged" integer NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"speaker" text,
	"category" text,
	"external_url" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"phone_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subscription_tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"public_share_token" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_public_share_token_unique" UNIQUE("public_share_token")
);
--> statement-breakpoint
ALTER TABLE "daily_lesson_views" ADD CONSTRAINT "daily_lesson_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_lesson_views" ADD CONSTRAINT "daily_lesson_views_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."daily_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_completions" ADD CONSTRAINT "huddle_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huddle_completions" ADD CONSTRAINT "huddle_completions_task_id_huddle_task_pool_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."huddle_task_pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oath_ledger" ADD CONSTRAINT "oath_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oath_ledger" ADD CONSTRAINT "oath_ledger_prayer_log_id_prayer_log_id_fk" FOREIGN KEY ("prayer_log_id") REFERENCES "public"."prayer_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oath_settings" ADD CONSTRAINT "oath_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_responses" ADD CONSTRAINT "onboarding_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_log" ADD CONSTRAINT "prayer_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_times_cache" ADD CONSTRAINT "prayer_times_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qadaa_ledger" ADD CONSTRAINT "qadaa_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qadaa_log_entries" ADD CONSTRAINT "qadaa_log_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "huddle_completions_user_task_date_idx" ON "huddle_completions" USING btree ("user_id","task_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_log_user_date_prayer_idx" ON "prayer_log" USING btree ("user_id","date","prayer_name");--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_times_cache_user_date_idx" ON "prayer_times_cache" USING btree ("user_id","date");

-- ── 0001_sweet_mauler.sql ───────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "display_name" text;

-- ── 0002_sunnah_log.sql ─────────────────────────────────────────
-- Sunnah log table for tracking sunnah/nafl prayers
CREATE TABLE IF NOT EXISTS "sunnah_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "sunnah_key" text NOT NULL,
  "associated_fard" "prayer_name" NOT NULL,
  "prayed" boolean DEFAULT false NOT NULL,
  "logged_at" timestamp with time zone
);

-- Unique index: one entry per user per date per sunnah key
CREATE UNIQUE INDEX IF NOT EXISTS "sunnah_log_user_date_key_idx" ON "sunnah_log" ("user_id", "date", "sunnah_key");

-- ── 0003_event_notify.sql ───────────────────────────────────────
-- Add `notify` column to events table.
-- Allows per-event push notification toggle (15 min before event).
-- Defaults to true so existing events remain notified.
ALTER TABLE "events" ADD COLUMN "notify" boolean NOT NULL DEFAULT true;

-- ── 0004_trusted_devices.sql ────────────────────────────────────
-- ─── Trusted Devices (FingerprintJS) ───
CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "fingerprint_hash" text NOT NULL,
  "label" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One device per user (prevents duplicate entries)
CREATE UNIQUE INDEX IF NOT EXISTS "trusted_devices_user_hash_idx"
  ON "trusted_devices" ("user_id", "fingerprint_hash");

-- ── 0005_goals.sql ──────────────────────────────────────────────
-- Goals table: hierarchical goals with parent-child relationships
CREATE TABLE "goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "color" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);

-- Self-referencing FK with cascade delete (added separately for clarity)
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "goals"("id") ON DELETE CASCADE;

-- Goal share tokens: public read-only sharing
CREATE TABLE "goal_share_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text UNIQUE NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Index for querying goals by user
CREATE INDEX "goals_user_id_idx" ON "goals" ("user_id");
-- Index for querying children of a goal
CREATE INDEX "goals_parent_id_idx" ON "goals" ("parent_id");

-- ── 0006_index_optimization.sql ─────────────────────────────────
-- ─── Index optimization for 10k+ users ───
-- All indexes use CONCURRENTLY where possible to avoid locking.
-- Note: Drizzle migrations run in transactions, so CONCURRENTLY won't work
-- inside the migration runner. Run these manually on production if the
-- table is large, or let Drizzle run them (it will use regular CREATE INDEX
-- which is fine for tables under ~1M rows).
--
-- Index strategy:
-- 1. Composite B-tree indexes for hot query paths (equality → range order)
-- 2. BRIN indexes for append-only time-series tables (100-1000x smaller)
-- 3. Single-column indexes for FK lookups that are queried independently
-- 4. Partial indexes for queries that always filter on a status

-- ─── 1. events table — CRITICAL: no indexes existed ───
-- Hot path: calendar day/month view queries WHERE user_id = $1 AND start_at BETWEEN $2 AND $3
-- Composite index with equality (user_id) first, range (start_at) second
CREATE INDEX "events_user_start_idx" ON "events" ("user_id", "start_at");

-- Also index notified_at for the event notification cron (finds unnotified events)
-- Partial index: only rows where notify=true AND notified_at IS NULL
CREATE INDEX "events_pending_notify_idx" ON "events" ("start_at")
  WHERE "notify" = true AND "notified_at" IS NULL;

-- BRIN index on start_at for range scans across all users (append-only pattern)
-- 100-1000x smaller than B-tree, ideal for time-series data
CREATE INDEX "events_start_at_brin_idx" ON "events" USING BRIN ("start_at")
  WITH (autosummarize = on);

-- ─── 2. push_subscriptions — was missing user_id index ───
-- Hot path: cron fetches all subs for a user to send push notifications
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" ("user_id");

-- ─── 3. goal_share_tokens — was missing user_id index ───
-- Query: SELECT ... WHERE user_id = $1 (list/revoke share tokens)
CREATE INDEX "goal_share_tokens_user_id_idx" ON "goal_share_tokens" ("user_id");

-- ─── 4. qadaa_log_entries — was missing user_id index ───
-- Query: SELECT ... WHERE user_id = $1 ORDER BY logged_at DESC
CREATE INDEX "qadaa_log_entries_user_id_idx" ON "qadaa_log_entries" ("user_id");

-- ─── 5. prayer_log — additional indexes for analytics ───
-- The unique index (user_id, date, prayer_name) covers point lookups.
-- But analytics queries filter on user_id + date range + status.
-- Add a partial index for "prayed" status (most analytics queries filter on this).
CREATE INDEX "prayer_log_user_date_prayed_idx" ON "prayer_log" ("user_id", "date")
  WHERE "status" IN ('prayed', 'assumed_prayed');

-- BRIN index on date for the cron's range scans (append-only, ordered by date)
CREATE INDEX "prayer_log_date_brin_idx" ON "prayer_log" USING BRIN ("date")
  WITH (autosummarize = on);

-- ─── 6. prayer_times_cache — additional index for batch fetch ───
-- The unique index (user_id, date) covers single-day lookups.
-- But the analytics route fetches a range: WHERE user_id = $1 AND date >= $2
-- The unique index handles this, but a BRIN on date helps the cron's
-- "fetch all rows for a date across all users" pattern.
CREATE INDEX "prayer_times_cache_date_brin_idx" ON "prayer_times_cache" USING BRIN ("date")
  WITH (autosummarize = on);

-- ─── 7. goals — composite index for the list query ───
-- Query: SELECT ... WHERE user_id = $1 ORDER BY sort_order, created_at
-- The existing user_id index works but requires a sort step.
-- This composite index eliminates the sort.
CREATE INDEX "goals_user_sort_created_idx" ON "goals" ("user_id", "sort_order", "created_at");

-- ─── 8. sunnah_log — additional index for date range queries ───
-- The unique index (user_id, date, sunnah_key) covers point lookups.
-- Add a partial index for prayed=true (dashboard queries filter on this).
CREATE INDEX "sunnah_log_user_date_prayed_idx" ON "sunnah_log" ("user_id", "date")
  WHERE "prayed" = true;

-- ─── 9. trusted_devices — index on fingerprint_hash for lookup ───
-- The unique index (user_id, fingerprint_hash) covers the combined lookup.
-- But the login flow sometimes queries by fingerprint_hash alone when
-- checking if a device is trusted across users (rare but possible).
-- Skip — the composite index is sufficient for all current queries.

-- ─── 10. events — index on user_id + notified_at for notification cleanup ───
-- Helps the cron find events that need notifications sent
CREATE INDEX "events_user_notified_idx" ON "events" ("user_id", "notified_at");

-- ── 0007_event_series_id.sql ────────────────────────────────────
-- Add series_id column to events table.
-- All events in the same recurring series share a single UUID.
-- One-off events have NULL series_id.
-- This replaces using recurrenceRule (a non-unique rule string) as the
-- series identifier for bulk update/delete operations.
ALTER TABLE "events" ADD COLUMN "series_id" uuid;

-- Index for bulk update/delete by series (user_id + series_id)
CREATE INDEX "events_series_id_idx" ON "events" ("user_id", "series_id");

-- Backfill: assign a unique series_id to existing recurring events grouped by
-- their current recurrenceRule + user_id + title + created_at (approximate
-- series grouping). Events that share the same recurrenceRule but were created
-- at different times are treated as separate series.
-- Note: This is a best-effort backfill. If two series happened to be created
-- at the exact same second with the same rule, they'll share a series_id.
-- That's an acceptable edge case — going forward, each POST gets a fresh UUID.
UPDATE "events" e
SET "series_id" = gen_random_uuid()
WHERE "recurrence_rule" IS NOT NULL
  AND "series_id" IS NULL
  AND "id" = (
    SELECT MIN(e2."id") FROM "events" e2
    WHERE e2."user_id" = e."user_id"
      AND e2."recurrence_rule" = e."recurrence_rule"
      AND e2."title" = e."title"
      AND e2."recurrence_rule" IS NOT NULL
  );

-- Propagate the series_id from the representative event to all events in
-- the same group (same user_id + recurrence_rule + title)
UPDATE "events" e
SET "series_id" = sub.series_id
FROM (
  SELECT
    e2."user_id",
    e2."recurrence_rule",
    e2."title",
    MIN(e2."series_id") AS series_id
  FROM "events" e2
  WHERE e2."recurrence_rule" IS NOT NULL
  GROUP BY e2."user_id", e2."recurrence_rule", e2."title"
) sub
WHERE e."user_id" = sub."user_id"
  AND e."recurrence_rule" = sub."recurrence_rule"
  AND e."title" = sub."title"
  AND e."recurrence_rule" IS NOT NULL
  AND e."series_id" IS NULL;

-- ── 0008_user_names_prayer_code.sql ─────────────────────────────
-- Add missing columns to users table:
--   first_name  — used in prayer friends dashboard (never migrated)
--   prayer_code — 6-character prayer share code (never migrated)
-- Both columns are nullable so existing rows are unaffected.
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "prayer_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_prayer_code_unique" UNIQUE("prayer_code");

-- ── 0009_homework.sql ───────────────────────────────────────────
-- Homework tracker: classes (subjects) + homework assignments
-- Allows students to track homework with due dates, categorize by class,
-- and see them as colored dots on the calendar.

CREATE TYPE "homework_status" AS ENUM ('pending', 'completed');
CREATE TYPE "homework_priority" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "homework_kind" AS ENUM ('homework', 'test', 'project', 'quiz', 'reading', 'other');

-- Classes (subjects) — color-coded for calendar dots and list chips
CREATE TABLE "classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "classes_user_id_idx" ON "classes" ("user_id");

-- Homework assignments
CREATE TABLE "homeworks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "class_id" uuid REFERENCES "classes"("id") ON DELETE SET NULL,
  "due_date" date NOT NULL,
  "due_time" time,
  "priority" homework_priority DEFAULT 'medium' NOT NULL,
  "status" homework_status DEFAULT 'pending' NOT NULL,
  "kind" homework_kind DEFAULT 'homework' NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "homeworks_user_due_idx" ON "homeworks" ("user_id", "due_date");
CREATE INDEX "homeworks_user_class_idx" ON "homeworks" ("user_id", "class_id");
CREATE INDEX "homeworks_user_status_idx" ON "homeworks" ("user_id", "status");

-- ── 0010_goals_habits_notes.sql ─────────────────────────────────
-- 0010_goals_habits_notes.sql
-- Adds goal_type column, habits + habit_logs + notes tables for the unified Goals page.

-- ─── Add goal_type column to goals table ───
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "goal_type" text NOT NULL DEFAULT 'short_term';

-- Index for filtering goals by type (long-term vs short-term tabs)
CREATE INDEX IF NOT EXISTS "goals_user_type_idx" ON "goals" ("user_id", "goal_type");

-- ─── Habits ───
DO $$ BEGIN
  CREATE TYPE "habit_frequency" AS ENUM('daily', 'weekly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "habits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "frequency" "habit_frequency" DEFAULT 'daily' NOT NULL,
  "color" text DEFAULT '#c2410c' NOT NULL,
  "target_count" integer DEFAULT 1 NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "habits_user_id_idx" ON "habits" ("user_id");

-- ─── Habit logs (completion tracking) ───
CREATE TABLE IF NOT EXISTS "habit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "habit_id" uuid NOT NULL REFERENCES "habits"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "completed_at" timestamptz DEFAULT now() NOT NULL
);

-- One log per habit per date (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS "habit_logs_user_habit_date_idx"
  ON "habit_logs" ("user_id", "habit_id", "date");

-- Query all habit completions for a user on a specific date
CREATE INDEX IF NOT EXISTS "habit_logs_user_date_idx"
  ON "habit_logs" ("user_id", "date");

-- ─── Notes (brain dump / journal) ───
CREATE TABLE IF NOT EXISTS "notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text,
  "content" text NOT NULL DEFAULT '',
  "pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes" ("user_id");
CREATE INDEX IF NOT EXISTS "notes_user_updated_idx" ON "notes" ("user_id", "updated_at");

-- ── 0011_goals_target_date_habits_time.sql ──────────────────────
-- 0011: Add target_date to goals + time_of_day/reminder_time to habits
-- Allows Today tab to show goals approaching their deadline and group habits by time of day

-- Goals: optional target date for when the goal should be achieved by
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "target_date" date;

-- Index for filtering goals by target date (Today tab: goals due this week)
CREATE INDEX IF NOT EXISTS "goals_user_target_date_idx" ON "goals" ("user_id", "target_date");

-- Habits: optional time-of-day grouping (morning | afternoon | evening | night)
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "time_of_day" text;

-- Habits: optional specific reminder time (e.g., "07:00")
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "reminder_time" text;

-- ── 0012_prayer_friends_status.sql ──────────────────────────────
-- Add status and responded_at columns to prayer_friends
-- Changes the friend system from auto-accept to pending/accept/reject flow

CREATE TYPE "prayer_friend_status" AS ENUM ('pending', 'accepted', 'rejected');

ALTER TABLE "prayer_friends" ADD COLUMN "status" "prayer_friend_status" NOT NULL DEFAULT 'accepted';
ALTER TABLE "prayer_friends" ADD COLUMN "responded_at" timestamp with time zone;

-- Existing friendships are marked as accepted (they were auto-accepted before)
UPDATE "prayer_friends" SET "status" = 'accepted', "responded_at" = "created_at" WHERE "status" IS NULL OR "status" = 'accepted';

-- ── 0013_sadaqah.sql ────────────────────────────────────────────
-- Sadaqah tracker table
CREATE TABLE IF NOT EXISTS "sadaqah_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "category" text NOT NULL,
  "note" text,
  "date" date NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sadaqah_logs_user_id_idx" ON "sadaqah_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "sadaqah_logs_user_date_idx" ON "sadaqah_logs" ("user_id", "date");

-- ── 0014_drop_dead_features.sql ─────────────────────────────────
-- Drop dead/unused tables and enums
-- These features were never built or have been removed from the product.

DROP TABLE IF EXISTS "onboarding_responses" CASCADE;
DROP TABLE IF EXISTS "daily_lesson_views" CASCADE;
DROP TABLE IF EXISTS "daily_lessons" CASCADE;
DROP TABLE IF EXISTS "huddle_completions" CASCADE;
DROP TABLE IF EXISTS "huddle_task_pool" CASCADE;
DROP TABLE IF EXISTS "oath_ledger" CASCADE;
DROP TABLE IF EXISTS "oath_settings" CASCADE;

-- Drop unused enums
DROP TYPE IF EXISTS "oath_status" CASCADE;

-- ── 0015_friends_privacy_blocks.sql ─────────────────────────────
-- Friends privacy controls + block list
-- Adds visibility toggles to prayer_settings so users can control what
-- friends see, and a prayer_blocks table to prevent unwanted re-requests.

-- Add visibility columns to prayer_settings (defaults: streak visible, today's
-- detailed per-prayer status hidden by default — privacy-preserving).
ALTER TABLE "prayer_settings"
  ADD COLUMN IF NOT EXISTS "friends_see_streak" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "friends_see_today_status" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "friends_see_sunnah" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "friends_see_masjid_pct" boolean DEFAULT true NOT NULL;

-- Block list — prevents a user from sending or receiving requests to/from
-- a blocked user.
CREATE TABLE IF NOT EXISTS "prayer_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("user_id", "blocked_user_id")
);

CREATE INDEX IF NOT EXISTS "prayer_blocks_user_idx" ON "prayer_blocks" ("user_id");

-- ── 0017_add_missing_indexes.sql ────────────────────────────────
-- Add missing indexes for query performance

-- prayer_friends: index on friendId + status for pending request lookups
CREATE INDEX IF NOT EXISTS "prayer_friends_friend_status_idx"
  ON "prayer_friends" ("friend_id", "status");

-- homeworks: index on (userId, status, completedAt) for auto-prune
CREATE INDEX IF NOT EXISTS "homeworks_user_status_completed_idx"
  ON "homeworks" ("user_id", "status", "completed_at");

-- users: index on role for admin queries
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");

-- users: index on createdAt for admin user list ordering
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at");

-- ── 0018_talks_folders_r2.sql ───────────────────────────────────
-- 0018_talks_folders_r2.sql
-- Migrate talks from external-link-only to self-hosted MP3 on Cloudflare R2
-- with folder support.

-- Create talk_folders table
CREATE TABLE IF NOT EXISTS talk_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add new columns to talks table
ALTER TABLE talks ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES talk_folders(id) ON DELETE SET NULL;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS description TEXT;

-- Make external_url nullable (self-hosted talks don't have an external URL)
ALTER TABLE talks ALTER COLUMN external_url DROP NOT NULL;

-- Rename 'category' to 'description' is not needed — we keep category as-is
-- but new talks use 'description' instead. Old talks keep their category.

-- Add index for folder lookups
CREATE INDEX IF NOT EXISTS talks_folder_idx ON talks(folder_id);

-- ── 0019_talks_processing_folders_meta.sql ──────────────────────
-- 0019: Talk processing pipeline + folder metadata
-- Adds: folder image/dates, talk processing status, processed audio key, topics, publish flow

-- ── Folder metadata: image, optional date range ──
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE talk_folders ADD COLUMN IF NOT EXISTS end_date DATE;

-- ── Talk processing pipeline ──
-- processing_status: pending (just uploaded) → processing (worker running) → ready (processed, awaiting publish) → published (live) / failed
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processed_storage_key TEXT;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS topics TEXT;

-- Index for filtering published talks in the user-facing library
CREATE INDEX IF NOT EXISTS talks_processing_status_idx ON talks(processing_status);
CREATE INDEX IF NOT EXISTS talks_published_idx ON talks(published_at);

-- Backfill: existing talks with a storage_key are already published
UPDATE talks SET processing_status = 'published', published_at = added_at
  WHERE storage_key IS NOT NULL AND processing_status = 'pending';

-- ── Verify ──
DO $$
BEGIN
  RAISE NOTICE '0019: Added folder image_key, start_date, end_date';
  RAISE NOTICE '0019: Added talks processing_status, processed_storage_key, processed_at, published_at, processing_error, topics';
END $$;

-- ── 0020_talk_folders_speaker.sql ───────────────────────────────
-- Add speaker column to talk_folders
-- Used as default speaker for talks in this folder (inherited when talk speaker is empty)
ALTER TABLE "talk_folders" ADD COLUMN "speaker" text;

-- ── 0021_talk_progress_folder_color.sql ─────────────────────────
-- 0021: Talk progress tracking + folder colors
-- Adds per-user listening state (position, completed) and folder accent colors.

-- Add folder_color column to talk_folders (nullable — null means auto-assign)
ALTER TABLE "talk_folders" ADD COLUMN "folder_color" text;

-- Create talk_progress table for per-user listening state
CREATE TABLE IF NOT EXISTS "talk_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "talk_id" uuid NOT NULL REFERENCES "talks"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 0 NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One progress record per user × talk
CREATE UNIQUE INDEX IF NOT EXISTS "talk_progress_user_talk_idx" ON "talk_progress" USING btree ("user_id", "talk_id");
-- Fast lookup of completed talks for a user
CREATE INDEX IF NOT EXISTS "talk_progress_user_completed_idx" ON "talk_progress" USING btree ("user_id", "completed");

-- ── 0022_event_details.sql ──────────────────────────────────────
-- Add optional details column to events table.
-- Shown under the title in the calendar as smaller, grayer text.
ALTER TABLE events ADD COLUMN IF NOT EXISTS details TEXT;

-- ── 0023_performance_indexes.sql ────────────────────────────────
-- 0023_performance_indexes.sql
-- Composite indexes for common query patterns identified in the PWA performance audit.
-- These cover ORDER BY clauses that were causing filesorts and improve WHERE clause efficiency.

-- Homework: ORDER BY (due_date, due_time) for the homework list query
CREATE INDEX IF NOT EXISTS homeworks_user_due_time_idx
  ON homeworks (user_id, due_date, due_time);

-- Homework: completed_at filter for "pending OR completed recently" query
CREATE INDEX IF NOT EXISTS homeworks_user_completed_at_idx
  ON homeworks (user_id, completed_at);

-- Talks: filter by processing_status + ORDER BY title
CREATE INDEX IF NOT EXISTS talks_processing_status_title_idx
  ON talks (processing_status, title);

-- Talk folders: ORDER BY (sort_order, name)
CREATE INDEX IF NOT EXISTS talk_folders_sort_name_idx
  ON talk_folders (sort_order, name);

-- Classes: ORDER BY (sort_order, created_at)
CREATE INDEX IF NOT EXISTS classes_user_sort_created_idx
  ON classes (user_id, sort_order, created_at);

-- Events: series query ORDER BY start_at
CREATE INDEX IF NOT EXISTS events_user_series_start_idx
  ON events (user_id, series_id, start_at);

-- ── 0024_login_attempts_and_device_limits.sql ───────────────────
-- 0024_login_attempts_and_device_limits.sql
-- Per-account brute-force protection + trusted device cleanup

-- Login attempts table — DB-backed so it survives serverless cold starts
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of recent attempts by email
CREATE INDEX IF NOT EXISTS login_attempts_email_failed_at_idx
  ON login_attempts (email, failed_at);

-- Auto-prune: delete login attempts older than 24 hours
-- (run periodically or as part of the daily cron)

-- ── 0025_native_push_tokens.sql ─────────────────────────────────
-- Native push support: add platform + token columns to push_subscriptions
-- Existing rows are 'web' (endpoint/p256dh/auth). New native rows use
-- platform='ios'|'android' with a token (APNs or FCM).

ALTER TABLE push_subscriptions ADD COLUMN platform text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ADD COLUMN token text;

-- Index for native token lookups (dedup by user + platform + token)
CREATE INDEX IF NOT EXISTS push_subscriptions_user_platform_token_idx
  ON push_subscriptions (user_id, platform, token);

-- ── 0026_share_visibility.sql ───────────────────────────────────
-- Public portal visibility settings on users.
-- Enforced server-side on every /api/public/[token]/* request; changing them
-- applies to the existing share link immediately (no regeneration needed).

ALTER TABLE users ADD COLUMN share_future_days integer NOT NULL DEFAULT 30;
ALTER TABLE users ADD COLUMN share_past_days integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN share_show_events boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN share_show_event_details boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN share_show_prayer_times boolean NOT NULL DEFAULT true;

-- ── 0027_password_reset.sql ─────────────────────────────────────
-- Secure password reset: token table + session invalidation timestamp.
-- Raw tokens are never stored — only their SHA-256 hash.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id);

ALTER TABLE users ADD COLUMN sessions_valid_after timestamptz;

-- ── 0028_prayer_reminders.sql ───────────────────────────────────
-- Prayer buddy reminders: one nudge per sender per prayer per day.
-- The unique index is the dedupe backstop — a second remind the same day
-- conflicts and is rejected.

CREATE TABLE IF NOT EXISTS prayer_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  prayer_name prayer_name NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prayer_reminders_sender_recipient_date_prayer_idx
  ON prayer_reminders (sender_id, recipient_id, date, prayer_name);

CREATE INDEX IF NOT EXISTS prayer_reminders_recipient_idx
  ON prayer_reminders (recipient_id, date);

-- ── 0029_social_prayer.sql ──────────────────────────────────────
-- Social prayer features:
--  1. 'excused' prayer status — deliberate pause (menstruation/illness/travel)
--     that preserves streaks without counting as prayed.
--  2. friends_notify_complete — opt-in push when a friend finishes all 5.
--  3. prayer_cheers — one-tap encouragement, deduped per day.

ALTER TYPE prayer_status ADD VALUE IF NOT EXISTS 'excused';

ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS friends_notify_complete boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS prayer_cheers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prayer_cheers_sender_recipient_date_idx
  ON prayer_cheers (sender_id, recipient_id, date);

CREATE INDEX IF NOT EXISTS prayer_cheers_recipient_idx
  ON prayer_cheers (recipient_id, date);

