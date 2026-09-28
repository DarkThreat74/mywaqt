CREATE TABLE "quran_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "opponent_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "difficulty" text NOT NULL,
  "rounds" integer NOT NULL,
  "seed" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "winner_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone
);
CREATE INDEX "quran_matches_opponent_idx" ON "quran_matches" ("opponent_id", "status");
CREATE INDEX "quran_matches_creator_idx" ON "quran_matches" ("creator_id", "status");

CREATE TABLE "quran_match_rounds" (
  "match_id" uuid NOT NULL REFERENCES "quran_matches"("id") ON DELETE cascade,
  "round" integer NOT NULL,
  "verse_idx" integer NOT NULL,
  "creator_ready_at" timestamp with time zone,
  "opponent_ready_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "creator_correct" boolean,
  "creator_ms" integer,
  "opponent_correct" boolean,
  "opponent_ms" integer,
  "winner_id" uuid,
  "resolved_at" timestamp with time zone,
  PRIMARY KEY ("match_id", "round")
);
