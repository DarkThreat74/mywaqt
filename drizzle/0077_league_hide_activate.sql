-- League visibility toggle + friends activation gate
ALTER TABLE prayer_friends ADD COLUMN IF NOT EXISTS hidden_from_league boolean NOT NULL DEFAULT false;
ALTER TABLE prayer_settings ADD COLUMN IF NOT EXISTS friends_active boolean NOT NULL DEFAULT false;
