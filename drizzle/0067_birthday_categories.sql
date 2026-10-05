CREATE TABLE IF NOT EXISTS birthday_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS birthday_categories_user_name_uq
  ON birthday_categories (user_id, name);
CREATE INDEX IF NOT EXISTS birthday_categories_user_id_idx
  ON birthday_categories (user_id);

ALTER TABLE birthdays
  ADD COLUMN IF NOT EXISTS category_id uuid
  REFERENCES birthday_categories(id) ON DELETE SET NULL;
