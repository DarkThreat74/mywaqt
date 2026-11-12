ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_id" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_name" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tag_place_address" text;
