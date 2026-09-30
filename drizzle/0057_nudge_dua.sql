ALTER TABLE prayer_reminders
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS dua_text text,
  ADD COLUMN IF NOT EXISTS dua_at timestamptz;

ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS dua_thanks_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dua_thanks_push boolean NOT NULL DEFAULT true;
