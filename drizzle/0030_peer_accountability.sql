-- Peer accountability: day completions (shared streaks, completion pushes,
-- challenge progress), shared streak pairs, invite links, groups, challenges.

CREATE TABLE IF NOT EXISTS prayer_day_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS prayer_day_completions_date_idx ON prayer_day_completions (date);

CREATE TABLE IF NOT EXISTS prayer_friend_streaks (
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low_id, user_high_id)
);

CREATE TABLE IF NOT EXISTS prayer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prayer_invites_token_hash_idx ON prayer_invites (token_hash);
CREATE INDEX IF NOT EXISTS prayer_invites_inviter_idx ON prayer_invites (inviter_id);

CREATE TABLE IF NOT EXISTS prayer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) NOT NULL,
  invite_code varchar(12) NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prayer_groups_invite_code_idx ON prayer_groups (invite_code);

CREATE TABLE IF NOT EXISTS prayer_group_members (
  group_id uuid NOT NULL REFERENCES prayer_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(10) NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS prayer_group_members_user_idx ON prayer_group_members (user_id);

CREATE TABLE IF NOT EXISTS prayer_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES prayer_groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  goal_days integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prayer_challenges_group_idx ON prayer_challenges (group_id);
