CREATE TABLE "deleted_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
