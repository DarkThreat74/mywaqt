-- first_name is legacy; display surfaces read firstName || displayName.
-- Backfill: where they diverge, display_name (the field users edit) wins.
UPDATE users
SET first_name = display_name
WHERE display_name IS NOT NULL
  AND display_name <> ''
  AND (first_name IS NULL OR first_name <> display_name);
