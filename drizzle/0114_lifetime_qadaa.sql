-- Lifetime prayer view: "me" birthday flag + qadaa baligh/backfill data.

ALTER TABLE birthdays ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS birthdays_one_self_per_user
  ON birthdays (user_id) WHERE is_self;

ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS baligh_date date;
ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS baligh_age integer;
ALTER TABLE qadaa_ledger ADD COLUMN IF NOT EXISTS initial_owed jsonb;

-- Backfill: the "me" birthday, if one exists, seeds baligh inputs later —
-- no data migration needed here since columns are nullable.
COMMENT ON COLUMN qadaa_ledger.baligh_date IS 'Day the user became baligh (drives lifetime view start)';
COMMENT ON COLUMN qadaa_ledger.initial_owed IS 'Snapshot of setup-time per-prayer owed counts {fajr,dhuhr,asr,maghrib,isha}';
COMMENT ON COLUMN birthdays.is_self IS 'At most one row per user — the owner''s own birthday';
