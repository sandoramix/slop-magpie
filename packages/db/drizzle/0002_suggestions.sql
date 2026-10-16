CREATE TABLE "item_folder_suggestions" (
	"item_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_folder_suggestions_item_id_folder_id_pk" PRIMARY KEY("item_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "item_tag_suggestions" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_tag_suggestions_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "item_folder_suggestions" ADD CONSTRAINT "item_folder_suggestions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_folder_suggestions" ADD CONSTRAINT "item_folder_suggestions_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_suggestions" ADD CONSTRAINT "item_tag_suggestions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_suggestions" ADD CONSTRAINT "item_tag_suggestions_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_fetch_status_idx" ON "items" USING btree ("fetch_status") WHERE "items"."fetch_status" <> 'ready';--> statement-breakpoint
CREATE INDEX "items_availability_checked_idx" ON "items" USING btree ("availability_checked_at" NULLS FIRST);