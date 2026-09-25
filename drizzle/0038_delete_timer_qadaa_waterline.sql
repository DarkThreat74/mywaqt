-- Scheduled account deletion (5h grace period with cancel)
ALTER TABLE users ADD COLUMN deletion_scheduled_at timestamptz;
CREATE INDEX users_deletion_scheduled_idx ON users (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- Qadaa "missed since last update" waterline
ALTER TABLE qadaa_ledger ADD COLUMN unlogged_seen_through date;
