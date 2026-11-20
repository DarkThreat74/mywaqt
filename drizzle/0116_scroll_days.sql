-- Scroll counter days synced from the Android app (one row per user per local date)
CREATE TABLE IF NOT EXISTS scroll_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  apps jsonb,
  sec jsonb,
  hours jsonb,
  sessions jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS scroll_days_user_date_idx ON scroll_days (user_id, date);
