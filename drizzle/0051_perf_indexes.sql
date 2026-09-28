-- 100k-user perf pass.
-- 1) Friend name search: prefix lookup expressed as a range scan on
--    lower(name) — needs these functional indexes or it's a full users scan.
CREATE INDEX IF NOT EXISTS users_first_name_lower_idx
  ON users (lower(first_name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS users_display_name_lower_idx
  ON users (lower(display_name) text_pattern_ops);

-- 2) Daily cron prunes login_attempts by failed_at — the existing composite
--    index leads with email, so the prune was a seq scan.
CREATE INDEX IF NOT EXISTS login_attempts_failed_at_idx
  ON login_attempts (failed_at);

-- 3) Account-deletion sweep filters deletion_scheduled_at < now — a partial
--    index keeps the daily scan tiny (the column is null for ~everyone).
CREATE INDEX IF NOT EXISTS users_deletion_scheduled_idx
  ON users (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;

-- 4) trusted_devices prune uses last_used_at < cutoff (composite PK leads
--    with user_id, so the sweep scanned the table).
CREATE INDEX IF NOT EXISTS trusted_devices_last_used_idx
  ON trusted_devices (last_used_at);
