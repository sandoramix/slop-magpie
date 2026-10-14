CREATE TYPE "public"."assigned_by" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('available', 'gone', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fetch_status" AS ENUM('pending', 'fetching', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('text', 'number', 'boolean', 'date', 'duration', 'url', 'select', 'multiselect');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('video', 'image', 'gallery', 'link');--> statement-breakpoint
CREATE TYPE "public"."keyword_source" AS ENUM('hashtag', 'caption', 'transcript', 'ocr', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image');--> statement-breakpoint
CREATE TYPE "public"."workflow" AS ENUM('inbox', 'to_try', 'done', 'reference');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"source" text NOT NULL,
	"source_item_id" text,
	"kind" "item_kind" DEFAULT 'link' NOT NULL,
	"author_handle" text,
	"author_name" text,
	"author_url" text,
	"caption" text,
	"title" text,
	"notes" text,
	"posted_at" timestamp with time zone,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetch_status" "fetch_status" DEFAULT 'pending' NOT NULL,
	"fetch_error" text,
	"fetch_attempts" integer DEFAULT 0 NOT NULL,
	"availability" "availability" DEFAULT 'unknown' NOT NULL,
	"availability_checked_at" timestamp with time zone,
	"workflow" "workflow" DEFAULT 'inbox' NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"rating" smallint,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_meta" jsonb,
	"transcript" text,
	"ocr_text" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(caption, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(notes, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(transcript, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(ocr_text, '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_rating_range" CHECK ("items"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"type" "media_type" NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_defs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "field_type" NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_folders" (
	"item_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"assigned_by" "assigned_by" DEFAULT 'manual' NOT NULL,
	"confidence" real,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_folders_item_id_folder_id_pk" PRIMARY KEY("item_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "item_keywords" (
	"item_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"source" "keyword_source" NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	CONSTRAINT "item_keywords_item_id_keyword_source_pk" PRIMARY KEY("item_id","keyword","source")
);
--> statement-breakpoint
CREATE TABLE "item_tags" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_by" "assigned_by" DEFAULT 'manual' NOT NULL,
	"confidence" real,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "smart_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"query" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_folders" ADD CONSTRAINT "item_folders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_folders" ADD CONSTRAINT "item_folders_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_keywords" ADD CONSTRAINT "item_keywords_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "items_canonical_url_key" ON "items" USING btree ("canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_item_key" ON "items" USING btree ("source","source_item_id") WHERE "items"."source_item_id" is not null;--> statement-breakpoint
CREATE INDEX "items_source_idx" ON "items" USING btree ("source");--> statement-breakpoint
CREATE INDEX "items_saved_at_idx" ON "items" USING btree ("saved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_workflow_idx" ON "items" USING btree ("workflow");--> statement-breakpoint
CREATE INDEX "items_favorite_idx" ON "items" USING btree ("saved_at" DESC NULLS LAST) WHERE "items"."favorite";--> statement-breakpoint
CREATE INDEX "items_search_idx" ON "items" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "items_title_trgm_idx" ON "items" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "items_caption_trgm_idx" ON "items" USING gin ("caption" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "items_author_handle_trgm_idx" ON "items" USING gin ("author_handle" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_position_key" ON "media" USING btree ("item_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "field_defs_key_key" ON "field_defs" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_parent_name_key" ON "folders" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "item_folders_folder_idx" ON "item_folders" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "item_keywords_keyword_idx" ON "item_keywords" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "item_tags_tag_idx" ON "item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_key" ON "tags" USING btree (lower("name"));