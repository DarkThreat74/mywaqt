CREATE TABLE IF NOT EXISTS "friend_profile_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "friend_id" uuid NOT NULL REFERENCES "friends"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "friend_profile_shares_owner_friend_idx" ON "friend_profile_shares" ("user_id", "friend_id");
