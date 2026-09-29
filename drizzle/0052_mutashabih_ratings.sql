CREATE TABLE IF NOT EXISTS "mutashabih_ratings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL DEFAULT 0,
  "played" integer NOT NULL DEFAULT 0,
  "correct" integer NOT NULL DEFAULT 0,
  "streak" integer NOT NULL DEFAULT 0,
  "best_streak" integer NOT NULL DEFAULT 0,
  "loss_streak" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
