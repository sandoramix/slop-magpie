CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "items_public_idx";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_key" ON "auth_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "items_owner_public_idx" ON "items" USING btree ("user_id","published_at" DESC NULLS LAST) WHERE "items"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "items_public_idx" ON "items" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "items"."visibility" = 'public';