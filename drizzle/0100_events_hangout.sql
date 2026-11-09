ALTER TYPE "event_type" ADD VALUE IF NOT EXISTS 'hangout';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hangout_with" text;
