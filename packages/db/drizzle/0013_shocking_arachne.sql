CREATE TABLE "item_folder_rejections" (
	"item_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_folder_rejections_item_id_folder_id_pk" PRIMARY KEY("item_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "item_tag_rejections" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_tag_rejections_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "stop_terms" (
	"user_id" uuid NOT NULL,
	"term" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stop_terms_user_id_term_pk" PRIMARY KEY("user_id","term")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedding" real[];--> statement-breakpoint
ALTER TABLE "item_folder_rejections" ADD CONSTRAINT "item_folder_rejections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_folder_rejections" ADD CONSTRAINT "item_folder_rejections_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_rejections" ADD CONSTRAINT "item_tag_rejections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag_rejections" ADD CONSTRAINT "item_tag_rejections_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_terms" ADD CONSTRAINT "stop_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;