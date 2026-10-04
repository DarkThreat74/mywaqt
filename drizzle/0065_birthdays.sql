-- 0065: birthdays tracker — people + reminder offsets + full-screen alerts
CREATE TABLE birthdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_month integer NOT NULL,
  birth_day integer NOT NULL,
  birth_year integer,
  remind_days integer[] NOT NULL DEFAULT '{0,1}',
  last_notified_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX birthdays_user_id_idx ON birthdays (user_id);
