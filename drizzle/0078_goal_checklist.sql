-- Goal checklists — criteria bullets for "find-mine"/"apply"-tagged goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS checklist jsonb;
