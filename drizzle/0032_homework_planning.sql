-- Homework planning: do-dates, estimates, deadline reminder stages, subtasks
-- Goals: progress tracking for pace indicator
-- Idempotent — safe to re-run.

ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_date date;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_start_time time;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_end_time time;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS planned_event_id uuid;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_3d_at timestamptz;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_1d_at timestamptz;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS notified_morning_at timestamptz;

-- Constraint added separately; re-runs may report a duplicate_object error,
-- which is safe to ignore.
ALTER TABLE homeworks ADD CONSTRAINT homeworks_planned_event_fk
  FOREIGN KEY (planned_event_id) REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS homeworks_user_planned_date_idx ON homeworks(user_id, planned_date);
-- Cron sweep: pending homework due within 3 days
CREATE INDEX IF NOT EXISTS homeworks_pending_due_idx ON homeworks(due_date) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS homework_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
  homework_id uuid NOT NULL REFERENCES homeworks(id) ON DELETE cascade,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_subtasks_homework_idx ON homework_subtasks(homework_id);
CREATE INDEX IF NOT EXISTS homework_subtasks_user_idx ON homework_subtasks(user_id);

ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress_current integer NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress_target integer;
