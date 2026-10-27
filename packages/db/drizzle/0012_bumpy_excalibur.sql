CREATE TABLE "oauth_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"provider" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_transactions_hash_key" ON "oauth_transactions" USING btree ("kind","token_hash");--> statement-breakpoint
CREATE INDEX "oauth_transactions_expires_idx" ON "oauth_transactions" USING btree ("expires_at");