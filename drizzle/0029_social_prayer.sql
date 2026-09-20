-- Social prayer features:
--  1. 'excused' prayer status — deliberate pause (menstruation/illness/travel)
--     that preserves streaks without counting as prayed.
--  2. friends_notify_complete — opt-in push when a friend finishes all 5.
--  3. prayer_cheers — one-tap encouragement, deduped per day.

ALTER TYPE prayer_status ADD VALUE IF NOT EXISTS 'excused';

ALTER TABLE prayer_settings
  ADD COLUMN IF NOT EXISTS friends_notify_complete boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS prayer_cheers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prayer_cheers_sender_recipient_date_idx
  ON prayer_cheers (sender_id, recipient_id, date);

CREATE INDEX IF NOT EXISTS prayer_cheers_recipient_idx
  ON prayer_cheers (recipient_id, date);
