CREATE TYPE "public"."visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX "items_public_idx" ON "items" USING btree ("saved_at" DESC NULLS LAST) WHERE "items"."visibility" = 'public';