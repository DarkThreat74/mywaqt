-- 0024_login_attempts_and_device_limits.sql
-- Per-account brute-force protection + trusted device cleanup

-- Login attempts table — DB-backed so it survives serverless cold starts
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of recent attempts by email
CREATE INDEX IF NOT EXISTS login_attempts_email_failed_at_idx
  ON login_attempts (email, failed_at);

-- Auto-prune: delete login attempts older than 24 hours
-- (run periodically or as part of the daily cron)
