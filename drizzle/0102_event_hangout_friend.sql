ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_friend_id" uuid REFERENCES "friends"("id") ON DELETE SET NULL;
UPDATE "events" SET "type" = 'block' WHERE "type" = 'hangout';
