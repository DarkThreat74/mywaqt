-- events.created_via was a Postgres enum ('manual','voice_ai') — any other
-- value (goal:<id>, class:<id>, homework, quran) fails the INSERT and the
-- client reports "Failed to create event". Convert to text.
ALTER TABLE "events" ALTER COLUMN "created_via" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_via" TYPE text USING "created_via"::text;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "created_via" SET DEFAULT 'manual';
