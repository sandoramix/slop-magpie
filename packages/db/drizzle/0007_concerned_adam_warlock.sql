CREATE TABLE "source_credentials" (
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_credentials_source_kind_pk" PRIMARY KEY("source","kind")
);
