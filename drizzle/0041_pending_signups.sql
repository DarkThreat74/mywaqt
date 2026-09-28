-- Verify-email-first signup: credentials live here until the emailed
-- link is clicked. One row per email; re-signup overwrites.
CREATE TABLE IF NOT EXISTS pending_signups (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  fingerprint_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_signups_expires_idx ON pending_signups(expires_at);
