-- Waterline becomes a timestamp: "missed prayers marked since you last
-- engaged", not "missed prayers dated after a day boundary". Existing date
-- values cast to midnight UTC — a safe, slightly-early waterline.
ALTER TABLE qadaa_ledger
  ALTER COLUMN unlogged_seen_through TYPE timestamptz
  USING unlogged_seen_through::timestamptz;
