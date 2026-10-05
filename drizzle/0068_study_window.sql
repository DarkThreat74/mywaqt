ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS study_start_min integer NOT NULL DEFAULT 420,
  ADD COLUMN IF NOT EXISTS study_end_min integer NOT NULL DEFAULT 1320;
