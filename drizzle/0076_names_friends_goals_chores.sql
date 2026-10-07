-- Names, friend nicknames, onboarding resume, chore weekdays, goal tags/sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_initial text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step text;
ALTER TABLE prayer_friends ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS weekdays integer[];
ALTER TABLE goals ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE goals ADD COLUMN IF NOT EXISTS sessions_target integer;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS hidden_from_today boolean NOT NULL DEFAULT false;
-- A "test"-tagged goal gets a shadow homework row so sessions plan/count
-- through the existing block_assignments + subjects[].hw machinery.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS homework_id uuid;
