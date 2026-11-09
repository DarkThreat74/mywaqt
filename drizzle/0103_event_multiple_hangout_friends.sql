ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_friend_ids" uuid[];
UPDATE "events" SET "hangout_friend_ids" = ARRAY["hangout_friend_id"]::uuid[] WHERE "hangout_friend_id" IS NOT NULL AND "hangout_friend_ids" IS NULL;
