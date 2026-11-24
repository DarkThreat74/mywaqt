ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS day_view_start_hour integer NOT NULL DEFAULT 5;
