-- 0056: per-event rating history for the shared Quran ladder.
-- Powers the chess.com-style match history: rating-at-the-time + deltas.

CREATE TABLE IF NOT EXISTS quran_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES quran_matches(id) ON DELETE CASCADE,
  game text NOT NULL DEFAULT 'trace',
  source text NOT NULL,
  verse_idx integer,
  mode text,
  correct boolean,
  ms integer,
  delta integer NOT NULL,
  rating_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quran_rating_events_user_idx
  ON quran_rating_events (user_id, created_at);
