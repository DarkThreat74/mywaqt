CREATE TABLE "study_session_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"reason" text,
	"method" text,
	"breaks" integer,
	"focus_min" integer,
	"switches" integer,
	"subjects" jsonb,
	"block_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_session_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX "study_session_history_user_idx" ON "study_session_history" USING btree ("user_id","date");
