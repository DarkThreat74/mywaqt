-- 0063: subscription tracker — recurring costs with renewal tracking
CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company text NOT NULL,
  plan text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  cycle billing_cycle NOT NULL,
  start_date date NOT NULL,
  remind_days_before integer NOT NULL DEFAULT 3,
  color text NOT NULL DEFAULT '#c2410c',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id);
