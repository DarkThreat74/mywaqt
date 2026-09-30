-- 0061: default madhab is Hanafi; backfill users who never chose one
ALTER TABLE prayer_settings ALTER COLUMN madhab SET DEFAULT 'hanafi';
UPDATE prayer_settings SET madhab = 'hanafi' WHERE madhab IS NULL;
