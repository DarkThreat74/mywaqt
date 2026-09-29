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
