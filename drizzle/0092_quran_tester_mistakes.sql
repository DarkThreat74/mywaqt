CREATE TABLE IF NOT EXISTS "quran_tester_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"surah" integer NOT NULL,
	"ayah" integer NOT NULL,
	"word" integer NOT NULL,
	"kind" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quran_tester_mistakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quran_tester_mistakes_user_loc_idx" ON "quran_tester_mistakes" USING btree ("user_id","surah","ayah","word");
