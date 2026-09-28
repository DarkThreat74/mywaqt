ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "quran_ratings" ADD COLUMN IF NOT EXISTS "loss_streak" integer DEFAULT 0 NOT NULL;
