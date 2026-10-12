-- Expenses — manual spending entries with small tags (gas, groceries, …).
-- quantity/unit carry "6.966 gal" for gas so $/unit math survives.
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag varchar(24) NOT NULL,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  occurred_on date NOT NULL,
  quantity double precision,
  unit varchar(16),
  place varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses(user_id);
CREATE INDEX IF NOT EXISTS expenses_user_tag_idx ON expenses(user_id, tag);
CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON expenses(user_id, occurred_on);
