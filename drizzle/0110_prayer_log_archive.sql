CREATE TABLE IF NOT EXISTS "prayer_log_archive" (
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"payload" bytea NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_log_archive_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "prayer_log_archive_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
