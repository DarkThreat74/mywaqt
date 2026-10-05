ALTER TABLE events
  ADD COLUMN IF NOT EXISTS share_public boolean NOT NULL DEFAULT true;
