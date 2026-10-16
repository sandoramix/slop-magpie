CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "users" ("id", "name", "is_admin") VALUES ('00000000-0000-7000-8000-000000000001', 'Admin', true);--> statement-breakpoint
DROP INDEX "items_canonical_url_key";--> statement-breakpoint
DROP INDEX "items_source_item_key";--> statement-breakpoint
DROP INDEX "items_saved_at_idx";--> statement-breakpoint
DROP INDEX "field_defs_key_key";--> statement-breakpoint
DROP INDEX "folders_parent_name_key";--> statement-breakpoint
DROP INDEX "tags_name_key";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "user_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "field_defs" ADD COLUMN "user_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "field_defs" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "user_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "folders" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "smart_folders" ADD COLUMN "user_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "smart_folders" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id" uuid NOT NULL DEFAULT '00000000-0000-7000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "users_name_key" ON "users" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_token_hash_key" ON "users" USING btree ("token_hash") WHERE "users"."token_hash" is not null;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_defs" ADD CONSTRAINT "field_defs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_folders" ADD CONSTRAINT "smart_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_canonical_url_key" ON "items" USING btree ("user_id","canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_item_key" ON "items" USING btree ("user_id","source","source_item_id") WHERE "items"."source_item_id" is not null;--> statement-breakpoint
CREATE INDEX "items_saved_at_idx" ON "items" USING btree ("user_id","saved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "field_defs_key_key" ON "field_defs" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_parent_name_key" ON "folders" USING btree ("user_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_key" ON "tags" USING btree ("user_id",lower("name"));