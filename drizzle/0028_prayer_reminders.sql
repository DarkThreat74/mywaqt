-- Prayer buddy reminders: one nudge per sender per prayer per day.
-- The unique index is the dedupe backstop — a second remind the same day
-- conflicts and is rejected.

CREATE TABLE IF NOT EXISTS prayer_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  prayer_name prayer_name NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prayer_reminders_sender_recipient_date_prayer_idx
  ON prayer_reminders (sender_id, recipient_id, date, prayer_name);

CREATE INDEX IF NOT EXISTS prayer_reminders_recipient_idx
  ON prayer_reminders (recipient_id, date);
