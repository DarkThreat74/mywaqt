-- Combined migrations 0060_hidden_tabs.sql .. 0089_friends_deep_questions.sql
-- Consolidated to reduce file count. Sections preserve original order.

-- ── 0060_hidden_tabs.sql ────────────────────────────────────────
-- 0060: users.hidden_tabs — which nav/tool surfaces the user hid
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_tabs text[];

-- ── 0061_madhab_default.sql ─────────────────────────────────────
-- 0061: default madhab is Hanafi; backfill users who never chose one
ALTER TABLE prayer_settings ALTER COLUMN madhab SET DEFAULT 'hanafi';
UPDATE prayer_settings SET madhab = 'hanafi' WHERE madhab IS NULL;

-- ── 0062_goal_horizons.sql ──────────────────────────────────────
-- 0062: goal horizons replace long/short-term; adds "rules to live by"
ALTER TABLE goals ALTER COLUMN goal_type SET DEFAULT 'month';
UPDATE goals SET goal_type = 'year' WHERE goal_type = 'long_term';
UPDATE goals SET goal_type = 'month' WHERE goal_type = 'short_term';

-- ── 0063_subscriptions.sql ──────────────────────────────────────
-- 0063: subscription tracker — recurring costs with renewal tracking
CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company text NOT NULL,
  plan text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  cycle billing_cycle NOT NULL,
  start_date date NOT NULL,
  remind_days_before integer NOT NULL DEFAULT 3,
  color text NOT NULL DEFAULT '#c2410c',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id);

-- ── 0064_subscriptions_cancel.sql ───────────────────────────────
-- 0064: subscription cancellation (keeps spend history) + renewal-push dedupe
ALTER TABLE subscriptions ADD COLUMN cancelled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN last_renewal_notified_on date;

-- ── 0065_birthdays.sql ──────────────────────────────────────────
-- 0065: birthdays tracker — people + reminder offsets + full-screen alerts
CREATE TABLE birthdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_month integer NOT NULL,
  birth_day integer NOT NULL,
  birth_year integer,
  remind_days integer[] NOT NULL DEFAULT '{0,1}',
  last_notified_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX birthdays_user_id_idx ON birthdays (user_id);

-- ── 0066_study_blocks.sql ───────────────────────────────────────
-- Study blocks: planned work sessions claimed in free-time gaps.
-- Dates and minutes are user-local (same convention as homework due_date/due_time).

CREATE TABLE study_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_min integer NOT NULL,              -- minutes from local midnight
  end_min integer NOT NULL,
  status text NOT NULL DEFAULT 'planned',  -- planned | worked | released
  release_reason text,                     -- one-tap skip reason when released
  worked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX study_blocks_user_date_idx ON study_blocks (user_id, block_date);

CREATE TABLE block_assignments (
  block_id uuid NOT NULL REFERENCES study_blocks(id) ON DELETE CASCADE,
  homework_id uuid NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  PRIMARY KEY (block_id, homework_id)
);

CREATE INDEX block_assignments_hw_idx ON block_assignments (homework_id);

-- ── 0067_birthday_categories.sql ────────────────────────────────
CREATE TABLE IF NOT EXISTS birthday_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS birthday_categories_user_name_uq
  ON birthday_categories (user_id, name);
CREATE INDEX IF NOT EXISTS birthday_categories_user_id_idx
  ON birthday_categories (user_id);

ALTER TABLE birthdays
  ADD COLUMN IF NOT EXISTS category_id uuid
  REFERENCES birthday_categories(id) ON DELETE SET NULL;

-- ── 0068_study_window.sql ───────────────────────────────────────
ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS study_start_min integer NOT NULL DEFAULT 420,
  ADD COLUMN IF NOT EXISTS study_end_min integer NOT NULL DEFAULT 1320;

-- ── 0069_gap_chips.sql ──────────────────────────────────────────
ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS study_show_gap_chips boolean NOT NULL DEFAULT true;

-- ── 0070_event_share_public.sql ─────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS share_public boolean NOT NULL DEFAULT true;

-- ── 0071_block_share_public.sql ─────────────────────────────────
ALTER TABLE study_blocks
  ADD COLUMN IF NOT EXISTS share_public boolean NOT NULL DEFAULT true;

-- ── 0072_gap_chips_default_off.sql ──────────────────────────────
-- Free-time chips default to OFF for new settings rows (existing rows keep
-- their explicit value).
ALTER TABLE prayer_settings
  ALTER COLUMN study_show_gap_chips SET DEFAULT false;

-- ── 0073_homework_grade.sql ─────────────────────────────────────
ALTER TABLE "homeworks" ADD COLUMN "grade" text;

-- ── 0074_chores.sql ─────────────────────────────────────────────
CREATE TABLE "chores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"estimated_minutes" integer DEFAULT 30 NOT NULL,
	"frequency_days" integer DEFAULT 7 NOT NULL,
	"last_done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "chores_user_id_idx" ON "chores" USING btree ("user_id");

-- ── 0075_study_session_history.sql ──────────────────────────────
CREATE TABLE "study_session_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"reason" text,
	"method" text,
	"breaks" integer,
	"focus_min" integer,
	"switches" integer,
	"subjects" jsonb,
	"block_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_session_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "study_session_history_user_idx" ON "study_session_history" USING btree ("user_id","date");

-- ── 0076_names_friends_goals_chores.sql ─────────────────────────
-- Names, friend nicknames, onboarding resume, chore weekdays, goal tags/sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_initial text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step text;
ALTER TABLE prayer_friends ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS weekdays integer[];
ALTER TABLE goals ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE goals ADD COLUMN IF NOT EXISTS sessions_target integer;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS hidden_from_today boolean NOT NULL DEFAULT false;
-- A "test"-tagged goal gets a shadow homework row so sessions plan/count
-- through the existing block_assignments + subjects[].hw machinery.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS homework_id uuid;

-- ── 0077_league_hide_activate.sql ───────────────────────────────
-- League visibility toggle + friends activation gate
ALTER TABLE prayer_friends ADD COLUMN IF NOT EXISTS hidden_from_league boolean NOT NULL DEFAULT false;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS friends_active boolean NOT NULL DEFAULT false;

-- ── 0078_goal_checklist.sql ─────────────────────────────────────
-- Goal checklists — criteria bullets for "find-mine"/"apply"-tagged goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS checklist jsonb;

-- ── 0079_expenses.sql ───────────────────────────────────────────
-- Expenses — manual spending entries with small tags (gas, groceries, …).
-- quantity/unit carry "6.966 gal" for gas so $/unit math survives.
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag varchar(24) NOT NULL,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  occurred_on date NOT NULL,
  quantity double precision,
  unit varchar(16),
  place varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses(user_id);
CREATE INDEX IF NOT EXISTS expenses_user_tag_idx ON expenses(user_id, tag);
CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON expenses(user_id, occurred_on);

-- ── 0080_salah_breaks.sql ───────────────────────────────────────
ALTER TABLE "study_session_history" ADD COLUMN "salah_breaks" integer;

-- ── 0081_expense_detail_photo.sql ───────────────────────────────
-- Expenses: haircut support — detail (barber name etc.) + photo thumbnail.
-- photo_data holds a client-compressed JPEG as base64 text (TOASTed);
-- list queries never select it — it's served via /api/expenses/[id]/photo.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS detail varchar(80);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS photo_data text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS photo_mime varchar(32);

-- ── 0082_friends.sql ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"met_tag" text,
	"met_detail" text,
	"talk_freq" text,
	"notes" text,
	"photo_data" text,
	"photo_mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friends_user_id_idx" ON "friends" USING btree ("user_id");

-- ── 0083_friends_closeness.sql ──────────────────────────────────
ALTER TABLE "friends" ADD COLUMN "known_years" text;
ALTER TABLE "friends" ADD COLUMN "trust" text;
ALTER TABLE "friends" ADD COLUMN "openness" text;
ALTER TABLE "friends" ADD COLUMN "score" integer;

-- ── 0084_friends_phone.sql ──────────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "phone" varchar(40);

-- ── 0085_friends_miss_tell.sql ──────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "miss" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "tell" text;

-- ── 0086_friends_phase.sql ──────────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "phase" text;

-- ── 0087_friends_vibe_group.sql ─────────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "vibe" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "group_label" varchar(60);

-- ── 0088_friend_crews.sql ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "friend_crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"hidden_from_all" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_crews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "friend_crews_user_id_idx" ON "friend_crews" USING btree ("user_id");

-- ── 0089_friends_deep_questions.sql ─────────────────────────────
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "sacrifice" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "loyalty" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "gap" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "plans" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "hangout" text;
ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "shortlist" text;

