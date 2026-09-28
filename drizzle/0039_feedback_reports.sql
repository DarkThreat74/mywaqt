-- In-app feedback / bug reports submitted via the floating feedback widget.
-- Captures full page context (path + query) so admin can reproduce reports.
CREATE TABLE IF NOT EXISTS feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Pathname only, e.g. /calendar/day
  page text NOT NULL,
  -- Pathname + query, e.g. /calendar/day?date=2025-10-01 — "what they were looking at"
  page_detail text,
  message text NOT NULL,
  -- Device context for UI bug reports (light/dark, screen size, browser)
  theme text,
  viewport text,
  user_agent text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_reports_created_idx ON feedback_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_user_idx ON feedback_reports(user_id);
