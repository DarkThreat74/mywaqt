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
