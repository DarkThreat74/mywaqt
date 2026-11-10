ALTER TABLE "birthdays" ADD COLUMN IF NOT EXISTS "friend_id" uuid REFERENCES "friends"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "birthdays_friend_id_idx" ON "birthdays" ("friend_id");
