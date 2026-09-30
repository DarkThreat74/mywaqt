-- 0059: friend_messages — 1:1 chat between accepted prayer friends
CREATE TABLE IF NOT EXISTS friend_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  reply_to_id uuid,
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friend_messages_pair_idx
  ON friend_messages (recipient_id, sender_id, created_at);
CREATE INDEX IF NOT EXISTS friend_messages_recipient_unread_idx
  ON friend_messages (recipient_id, read_at);
