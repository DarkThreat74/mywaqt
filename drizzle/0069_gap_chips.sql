ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS study_show_gap_chips boolean NOT NULL DEFAULT true;
