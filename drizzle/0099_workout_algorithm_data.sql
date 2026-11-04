ALTER TABLE workout_sessions ADD COLUMN exercise_order jsonb;
ALTER TABLE workout_sessions ADD COLUMN readiness jsonb;
ALTER TABLE workout_sessions ADD COLUMN paused_sec integer NOT NULL DEFAULT 0;
ALTER TABLE workout_sessions ADD COLUMN ended_reason text;

ALTER TABLE workout_sets ADD COLUMN side text;
ALTER TABLE workout_sets ADD COLUMN logged_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE workout_sets ADD COLUMN rest_after_sec integer;
ALTER TABLE workout_sets ADD COLUMN pain integer;
ALTER TABLE workout_sets ADD COLUMN technique_flag text;
ALTER TABLE workout_sets ADD COLUMN is_partial boolean NOT NULL DEFAULT false;

CREATE TABLE body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric(7,2) NOT NULL,
  bodyfat_pct numeric(5,2)
);
CREATE INDEX body_metrics_user_date_idx ON body_metrics(user_id, measured_at);
