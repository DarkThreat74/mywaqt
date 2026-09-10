-- Native push support: add platform + token columns to push_subscriptions
-- Existing rows are 'web' (endpoint/p256dh/auth). New native rows use
-- platform='ios'|'android' with a token (APNs or FCM).

ALTER TABLE push_subscriptions ADD COLUMN platform text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ADD COLUMN token text;

-- Index for native token lookups (dedup by user + platform + token)
CREATE INDEX IF NOT EXISTS push_subscriptions_user_platform_token_idx
  ON push_subscriptions (user_id, platform, token);
