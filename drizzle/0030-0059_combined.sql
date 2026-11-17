-- Combined migrations 0030_peer_accountability.sql .. 0059_friend_messages.sql
-- Consolidated to reduce file count. Sections preserve original order.

-- ── 0030_peer_accountability.sql ────────────────────────────────
-- Peer accountability: day completions (shared streaks, completion pushes,
-- challenge progress), shared streak pairs, invite links, groups, challenges.

CREATE TABLE IF NOT EXISTS prayer_day_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS prayer_day_completions_date_idx ON prayer_day_completions (date);

CREATE TABLE IF NOT EXISTS prayer_friend_streaks (
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low_id, user_high_id)
);

CREATE TABLE IF NOT EXISTS prayer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prayer_invites_token_hash_idx ON prayer_invites (token_hash);
CREATE INDEX IF NOT EXISTS prayer_invites_inviter_idx ON prayer_invites (inviter_id);

CREATE TABLE IF NOT EXISTS prayer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) NOT NULL,
  invite_code varchar(12) NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prayer_groups_invite_code_idx ON prayer_groups (invite_code);

CREATE TABLE IF NOT EXISTS prayer_group_members (
  group_id uuid NOT NULL REFERENCES prayer_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(10) NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS prayer_group_members_user_idx ON prayer_group_members (user_id);

CREATE TABLE IF NOT EXISTS prayer_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES prayer_groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  goal_days integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prayer_challenges_group_idx ON prayer_challenges (group_id);

-- ── 0031_homework_kinds.sql ─────────────────────────────────────
-- Expand homework_kind to cover the assignment types students actually track
-- (competitor taxonomies: myHomework, Power Planner, MyStudyLife use
-- essay/lab/exam/presentation/worksheet/study in addition to the basics).
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'exam';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'essay';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'lab';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'presentation';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'worksheet';
ALTER TYPE homework_kind ADD VALUE IF NOT EXISTS 'study';

-- ── 0032_homework_planning.sql ──────────────────────────────────
-- Homework planning: do-dates, estimates, deadline reminder stages, subtasks
-- Goals: progress tracking for pace indicator
-- Idempotent — safe to re-run.

ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_date date;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_start_time time;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_end_time time;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_event_id uuid;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_3d_at timestamptz;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_1d_at timestamptz;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_morning_at timestamptz;

-- Constraint added separately; re-runs may report a duplicate_object error,
-- which is safe to ignore.
ALTER TABLE homeworks ADD CONSTRAINT homeworks_planned_event_fk
  FOREIGN KEY (planned_event_id) REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS homeworks_user_planned_date_idx ON homeworks(user_id, planned_date);
-- Cron sweep: pending homework due within 3 days
CREATE INDEX IF NOT EXISTS homeworks_pending_due_idx ON homeworks(due_date) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS homework_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
  homework_id uuid NOT NULL REFERENCES homeworks(id) ON DELETE cascade,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_subtasks_homework_idx ON homework_subtasks(homework_id);
CREATE INDEX IF NOT EXISTS homework_subtasks_user_idx ON homework_subtasks(user_id);

ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress_current integer NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress_target integer;

-- ── 0033_hayd_masjid_prefs.sql ──────────────────────────────────
-- 0033: hayd tracking, per-prayer notification prefs, masjid iqamah,
-- extra (nafl) prayer times, per-user time offset.

-- Prayer settings: gender, hayd toggle, masjid iqamah, offsets, nafl display
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS hayd_tracking boolean NOT NULL DEFAULT false;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS masjid_external_id text;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS masjid_name text;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS masjid_iqamah jsonb;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS use_iqamah_reminders boolean NOT NULL DEFAULT false;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS time_offset_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS show_nafl_times boolean NOT NULL DEFAULT false;

-- Hayd periods: open-ended while active (end_date null = ongoing)
CREATE TABLE IF NOT EXISTS hayd_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS hayd_periods_user_idx ON hayd_periods(user_id, start_date);

-- Per-prayer notification prefs: {fajr:{mode,beforeMin}, dhuhr:{...}, ...}
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS per_prayer jsonb;

-- Extra times from AlAdhan payload for nafl markers
ALTER TABLE prayer_times_cache ADD COLUMN IF NOT EXISTS imsak time;
ALTER TABLE prayer_times_cache ADD COLUMN IF NOT EXISTS first_third time;
ALTER TABLE prayer_times_cache ADD COLUMN IF NOT EXISTS last_third time;

-- ── 0034_masjid_iqamah.sql ──────────────────────────────────────
-- Crowdsourced iqamah times: users submit their local masjid's iqamah,
-- one canonical record per external masjid id (latest submission wins).
CREATE TABLE IF NOT EXISTS masjid_iqamah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masjid_id text NOT NULL UNIQUE,          -- e.g. "osm:node/123", "mq:uuid"
  masjid_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  fajr text, dhuhr text, asr text, maghrib text, isha text,
  jummah jsonb,                            -- string[] of "HH:MM"
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masjid_iqamah_geo_idx ON masjid_iqamah (lat, lng);

-- ── 0035_masjid_sources.sql ─────────────────────────────────────
-- Masjid source registry imported from the MIT-licensed praytime project:
-- each row is a masjid plus the public endpoint that publishes its iqamah
-- (Masjidal JSON API, Mohid widget page, Mawaqit, etc.). Iqamah itself is
-- fetched live and cached, not stored.
CREATE TABLE IF NOT EXISTS masjid_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,       -- praytime uuid4
  name text NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  timezone text,
  website text,
  fetch_url text,                          -- endpoint that publishes iqamah
  platform text,                           -- masjidal | mohid | mawaqit | masjidbox | other
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masjid_sources_geo_idx ON masjid_sources (lat, lng);

-- ── 0036_masjid_iqamah_cache.sql ────────────────────────────────
-- Cache of resolved live iqamah per registry masjid, so we don't refetch
-- masjid homepages/widget endpoints on every /api/masjids request.
ALTER TABLE masjid_sources ADD COLUMN IF NOT EXISTS iqamah_cache jsonb;
ALTER TABLE masjid_sources ADD COLUMN IF NOT EXISTS iqamah_checked_at timestamptz;

-- ── 0037_talk_progress_fk.sql ───────────────────────────────────
-- talk_progress.user_id had no foreign key: deleting a user orphaned their
-- listening-progress rows (dangling personal data). Clean orphans, then add
-- the cascade FK so user deletion removes everything.
DELETE FROM talk_progress tp WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = tp.user_id);
ALTER TABLE talk_progress
  ADD CONSTRAINT talk_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Community iqamah data belongs to everyone who uses it — a contributor
-- deleting their account shouldn't erase times other users rely on.
ALTER TABLE masjid_iqamah ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE masjid_iqamah DROP CONSTRAINT masjid_iqamah_submitted_by_fkey;
ALTER TABLE masjid_iqamah
  ADD CONSTRAINT masjid_iqamah_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── 0038_delete_timer_qadaa_waterline.sql ───────────────────────
-- Scheduled account deletion (5h grace period with cancel)
ALTER TABLE users ADD COLUMN deletion_scheduled_at timestamptz;
CREATE INDEX users_deletion_scheduled_idx ON users (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- Qadaa "missed since last update" waterline
ALTER TABLE qadaa_ledger ADD COLUMN unlogged_seen_through date;

-- ── 0039_feedback_reports.sql ───────────────────────────────────
-- In-app feedback / bug reports submitted via the floating feedback widget.
-- Captures full page context (path + query) so admin can reproduce reports.
CREATE TABLE IF NOT EXISTS feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Pathname only, e.g. /calendar/day
  page text NOT NULL,
  -- Pathname + query, e.g. /calendar/day?date=2025-10-01 — "what they were looking at"
  page_detail text,
  message text NOT NULL,
  -- Device context for UI bug reports (light/dark, screen size, browser)
  theme text,
  viewport text,
  user_agent text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_reports_created_idx ON feedback_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_user_idx ON feedback_reports(user_id);

-- ── 0040_feedback_ui_context.sql ────────────────────────────────
-- DOM-state snapshot for feedback reports (open dialog, expanded sections,
-- active tab, heading, scroll depth).
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS ui_context jsonb;

-- ── 0041_pending_signups.sql ────────────────────────────────────
-- Verify-email-first signup: credentials live here until the emailed
-- link is clicked. One row per email; re-signup overwrites.
CREATE TABLE IF NOT EXISTS pending_signups (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  fingerprint_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_signups_expires_idx ON pending_signups(expires_at);

-- ── 0042_app_settings.sql ───────────────────────────────────────
-- App-wide feature flags (feedback widget toggle, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 0043_unlogged_waterline_timestamptz.sql ─────────────────────
-- Waterline becomes a timestamp: "missed prayers marked since you last
-- engaged", not "missed prayers dated after a day boundary". Existing date
-- values cast to midnight UTC — a safe, slightly-early waterline.
ALTER TABLE qadaa_ledger
  ALTER COLUMN unlogged_seen_through TYPE timestamptz
  USING unlogged_seen_through::timestamptz;

-- ── 0044_is_hifidh.sql ──────────────────────────────────────────
ALTER TABLE "prayer_settings" ADD COLUMN "is_hifidh" boolean NOT NULL DEFAULT false;

-- ── 0045_quran_matches.sql ──────────────────────────────────────
CREATE TABLE "quran_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "opponent_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "difficulty" text NOT NULL,
  "rounds" integer NOT NULL,
  "seed" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "winner_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone
);
CREATE INDEX "quran_matches_opponent_idx" ON "quran_matches" ("opponent_id", "status");
CREATE INDEX "quran_matches_creator_idx" ON "quran_matches" ("creator_id", "status");

CREATE TABLE "quran_match_rounds" (
  "match_id" uuid NOT NULL REFERENCES "quran_matches"("id") ON DELETE cascade,
  "round" integer NOT NULL,
  "verse_idx" integer NOT NULL,
  "creator_ready_at" timestamp with time zone,
  "opponent_ready_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "creator_correct" boolean,
  "creator_ms" integer,
  "opponent_correct" boolean,
  "opponent_ms" integer,
  "winner_id" uuid,
  "resolved_at" timestamp with time zone,
  PRIMARY KEY ("match_id", "round")
);

-- ── 0046_friends_searchable.sql ─────────────────────────────────
ALTER TABLE "prayer_settings" ADD COLUMN "friends_searchable" boolean NOT NULL DEFAULT true;

-- ── 0047_friend_request_expiry.sql ──────────────────────────────
ALTER TYPE "prayer_friend_status" ADD VALUE IF NOT EXISTS 'expired';

-- ── 0048_quran_ratings.sql ──────────────────────────────────────
CREATE TABLE "quran_ratings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL DEFAULT 0,
  "played" integer NOT NULL DEFAULT 0,
  "correct" integer NOT NULL DEFAULT 0,
  "streak" integer NOT NULL DEFAULT 0,
  "best_streak" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ── 0049_match_rated.sql ────────────────────────────────────────
ALTER TABLE "quran_matches" ADD COLUMN IF NOT EXISTS "rated" boolean DEFAULT false NOT NULL;

-- ── 0050_avatar_loss_streak.sql ─────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "quran_ratings" ADD COLUMN IF NOT EXISTS "loss_streak" integer DEFAULT 0 NOT NULL;

-- ── 0051_perf_indexes.sql ───────────────────────────────────────
-- 100k-user perf pass.
-- 1) Friend name search: prefix lookup expressed as a range scan on
--    lower(name) — needs these functional indexes or it's a full users scan.
CREATE INDEX IF NOT EXISTS users_first_name_lower_idx
  ON users (lower(first_name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS users_display_name_lower_idx
  ON users (lower(display_name) text_pattern_ops);

-- 2) Daily cron prunes login_attempts by failed_at — the existing composite
--    index leads with email, so the prune was a seq scan.
CREATE INDEX IF NOT EXISTS login_attempts_failed_at_idx
  ON login_attempts (failed_at);

-- 3) Account-deletion sweep filters deletion_scheduled_at < now — a partial
--    index keeps the daily scan tiny (the column is null for ~everyone).
CREATE INDEX IF NOT EXISTS users_deletion_scheduled_idx
  ON users (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;

-- 4) trusted_devices prune uses last_used_at < cutoff (composite PK leads
--    with user_id, so the sweep scanned the table).
CREATE INDEX IF NOT EXISTS trusted_devices_last_used_idx
  ON trusted_devices (last_used_at);

-- ── 0052_mutashabih_ratings.sql ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "mutashabih_ratings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL DEFAULT 0,
  "played" integer NOT NULL DEFAULT 0,
  "correct" integer NOT NULL DEFAULT 0,
  "streak" integer NOT NULL DEFAULT 0,
  "best_streak" integer NOT NULL DEFAULT 0,
  "loss_streak" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ── 0053_drop_sadaqah.sql ───────────────────────────────────────
DROP TABLE IF EXISTS "sadaqah_logs";

-- ── 0054_shared_rank_game.sql ───────────────────────────────────
-- One collective rank across AyaTrace + Mutashabih, and a game column so
-- 1v1 matches can run on either game's question engine.

ALTER TABLE quran_matches ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT 'trace';

-- Merge existing mutashabih_ratings rows into the shared ladder, then drop.
INSERT INTO quran_ratings (user_id, rating, played, correct, streak, best_streak, loss_streak, updated_at)
SELECT user_id, rating, played, correct, streak, best_streak, loss_streak, updated_at
FROM mutashabih_ratings
ON CONFLICT (user_id) DO UPDATE SET
  rating = quran_ratings.rating + EXCLUDED.rating,
  played = quran_ratings.played + EXCLUDED.played,
  correct = quran_ratings.correct + EXCLUDED.correct,
  best_streak = greatest(quran_ratings.best_streak, EXCLUDED.best_streak),
  updated_at = greatest(quran_ratings.updated_at, EXCLUDED.updated_at);

DROP TABLE IF EXISTS mutashabih_ratings;

-- ── 0055_notifications_friends_cleanup.sql ──────────────────────
-- In-app notification center + friends rework
-- 1) Durable per-user notifications (broadcasts, friend removals, acceptances)
CREATE TABLE IF NOT EXISTS app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(32) NOT NULL,
  title varchar(160) NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS app_notifications_user_pending_idx
  ON app_notifications (user_id, acknowledged_at);

-- 2) Friend-request "answer later" snooze (toast resurfaces ~3h later)
ALTER TABLE prayer_friends ADD COLUMN IF NOT EXISTS dismissed_until timestamptz;

-- 3) Match forfeiture bookkeeping
ALTER TABLE quran_matches ADD COLUMN IF NOT EXISTS end_reason text;
ALTER TABLE quran_matches ADD COLUMN IF NOT EXISTS forfeited_by uuid;

-- 4) Privacy defaults: friends see salah status by default
--    (sunnah + "notify when complete" stay opt-in)
ALTER TABLE prayer_settings
  ALTER COLUMN friends_see_today_status SET DEFAULT true;
UPDATE prayer_settings SET friends_see_today_status = true;

-- 5) Private circles removed entirely
DROP TABLE IF EXISTS prayer_challenges;
DROP TABLE IF EXISTS prayer_group_members;
DROP TABLE IF EXISTS prayer_groups;

-- ── 0056_rating_events.sql ──────────────────────────────────────
-- 0056: per-event rating history for the shared Quran ladder.
-- Powers the chess.com-style match history: rating-at-the-time + deltas.

CREATE TABLE IF NOT EXISTS quran_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES quran_matches(id) ON DELETE CASCADE,
  game text NOT NULL DEFAULT 'trace',
  source text NOT NULL,
  verse_idx integer,
  mode text,
  correct boolean,
  ms integer,
  delta integer NOT NULL,
  rating_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quran_rating_events_user_idx
  ON quran_rating_events (user_id, created_at);

-- ── 0057_nudge_dua.sql ──────────────────────────────────────────
ALTER TABLE prayer_reminders
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS dua_text text,
  ADD COLUMN IF NOT EXISTS dua_at timestamptz;

ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS dua_thanks_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dua_thanks_push boolean NOT NULL DEFAULT true;

-- ── 0058_sync_first_name.sql ────────────────────────────────────
-- first_name is legacy; display surfaces read firstName || displayName.
-- Backfill: where they diverge, display_name (the field users edit) wins.
UPDATE users
SET first_name = display_name
WHERE display_name IS NOT NULL
  AND display_name <> ''
  AND (first_name IS NULL OR first_name <> display_name);

-- ── 0059_friend_messages.sql ────────────────────────────────────
-- 0059: friend_messages — 1:1 chat between accepted prayer friends
CREATE TABLE IF NOT EXISTS friend_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  reply_to_id uuid,
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friend_messages_pair_idx
  ON friend_messages (recipient_id, sender_id, created_at);
CREATE INDEX IF NOT EXISTS friend_messages_recipient_unread_idx
  ON friend_messages (recipient_id, read_at);

