-- 0021: Talk progress tracking + folder colors
-- Adds per-user listening state (position, completed) and folder accent colors.

-- Add folder_color column to talk_folders (nullable — null means auto-assign)
ALTER TABLE "talk_folders" ADD COLUMN "folder_color" text;

-- Create talk_progress table for per-user listening state
CREATE TABLE IF NOT EXISTS "talk_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "talk_id" uuid NOT NULL REFERENCES "talks"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 0 NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One progress record per user × talk
CREATE UNIQUE INDEX IF NOT EXISTS "talk_progress_user_talk_idx" ON "talk_progress" USING btree ("user_id", "talk_id");
-- Fast lookup of completed talks for a user
CREATE INDEX IF NOT EXISTS "talk_progress_user_completed_idx" ON "talk_progress" USING btree ("user_id", "completed");
