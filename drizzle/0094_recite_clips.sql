CREATE TABLE IF NOT EXISTS "recite_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"reciter" text,
	"passage" text,
	"style" text,
	"storage_key" text,
	"processed_storage_key" text,
	"file_size" integer,
	"duration" integer,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"processing_error" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recite_clips_processing_status_idx" ON "recite_clips" ("processing_status");
CREATE INDEX IF NOT EXISTS "recite_clips_published_idx" ON "recite_clips" ("published_at");
