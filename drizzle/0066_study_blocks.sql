-- Study blocks: planned work sessions claimed in free-time gaps.
-- Dates and minutes are user-local (same convention as homework due_date/due_time).

CREATE TABLE study_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_min integer NOT NULL,              -- minutes from local midnight
  end_min integer NOT NULL,
  status text NOT NULL DEFAULT 'planned',  -- planned | worked | released
  release_reason text,                     -- one-tap skip reason when released
  worked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX study_blocks_user_date_idx ON study_blocks (user_id, block_date);

CREATE TABLE block_assignments (
  block_id uuid NOT NULL REFERENCES study_blocks(id) ON DELETE CASCADE,
  homework_id uuid NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  PRIMARY KEY (block_id, homework_id)
);

CREATE INDEX block_assignments_hw_idx ON block_assignments (homework_id);
