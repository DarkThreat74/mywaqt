CREATE TABLE IF NOT EXISTS "workout_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"angle" text NOT NULL,
	"weight_kg" numeric(7, 2),
	"note" text,
	"photo_data" text NOT NULL,
	"photo_mime" text NOT NULL,
	"pose" jsonb,
	CONSTRAINT "workout_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "workout_photos_user_taken_idx" ON "workout_photos" USING btree ("user_id","taken_at");
