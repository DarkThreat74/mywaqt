-- One collective rank across AyaTrace + Mutashabih, and a game column so
-- 1v1 matches can run on either game's question engine.

ALTER TABLE quran_matches ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT 'trace';

-- Merge existing mutashabih_ratings rows into the shared ladder, then drop.
INSERT INTO quran_ratings (user_id, rating, played, correct, streak, best_streak, loss_streak, updated_at)
SELECT user_id, rating, played, correct, streak, best_streak, loss_streak, updated_at
FROM mutashabih_ratings
ON CONFLICT (user_id) DO UPDATE SET
  rating = quran_ratings.rating + EXCLUDED.rating,
  played = quran_ratings.played + EXCLUDED.played,
  correct = quran_ratings.correct + EXCLUDED.correct,
  best_streak = greatest(quran_ratings.best_streak, EXCLUDED.best_streak),
  updated_at = greatest(quran_ratings.updated_at, EXCLUDED.updated_at);

DROP TABLE IF EXISTS mutashabih_ratings;
