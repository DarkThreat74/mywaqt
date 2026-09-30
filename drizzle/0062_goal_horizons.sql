-- 0062: goal horizons replace long/short-term; adds "rules to live by"
ALTER TABLE goals ALTER COLUMN goal_type SET DEFAULT 'month';
UPDATE goals SET goal_type = 'year' WHERE goal_type = 'long_term';
UPDATE goals SET goal_type = 'month' WHERE goal_type = 'short_term';
