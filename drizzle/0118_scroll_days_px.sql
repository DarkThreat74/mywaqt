ALTER TABLE scroll_days
  ADD COLUMN IF NOT EXISTS px jsonb,
  ADD COLUMN IF NOT EXISTS px_total integer,
  ADD COLUMN IF NOT EXISTS dpi integer;
