-- Free-time chips default to OFF for new settings rows (existing rows keep
-- their explicit value).
ALTER TABLE prayer_settings
  ALTER COLUMN study_show_gap_chips SET DEFAULT false;
