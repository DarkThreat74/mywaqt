CREATE INDEX IF NOT EXISTS "friend_messages_sender_pair_idx" ON "friend_messages" ("sender_id", "recipient_id", "created_at");
