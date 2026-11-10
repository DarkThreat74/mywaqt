CREATE TABLE IF NOT EXISTS "friend_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "friend_id" uuid NOT NULL REFERENCES "friends"("id") ON DELETE CASCADE,
  "photo_data" text NOT NULL,
  "photo_mime" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "friend_photos_user_friend_idx" ON "friend_photos" ("user_id", "friend_id");
INSERT INTO "friend_photos" ("user_id", "friend_id", "photo_data", "photo_mime")
SELECT "user_id", "id", "photo_data", "photo_mime" FROM "friends"
WHERE "photo_data" IS NOT NULL AND "photo_mime" IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "friend_photos" fp WHERE fp."friend_id" = "friends"."id");
