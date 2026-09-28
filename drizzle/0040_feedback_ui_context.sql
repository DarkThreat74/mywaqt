-- DOM-state snapshot for feedback reports (open dialog, expanded sections,
-- active tab, heading, scroll depth).
ALTER TABLE feedback_reports ADD COLUMN IF NOT EXISTS ui_context jsonb;
