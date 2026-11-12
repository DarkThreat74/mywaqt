ALTER TABLE "friends" ADD COLUMN IF NOT EXISTS "group_labels" text[];
UPDATE "friends" SET "group_labels" = ARRAY["group_label"]::text[] WHERE "group_label" IS NOT NULL AND "group_labels" IS NULL;
