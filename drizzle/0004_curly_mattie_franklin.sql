CREATE TABLE "parsed_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"gmail_connection_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"from" text NOT NULL,
	"to" jsonb NOT NULL,
	"raw_email" jsonb NOT NULL,
	"html" text,
	"text" text,
	"attachments" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parsed_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "parsed_emails" ADD CONSTRAINT "parsed_emails_gmail_connection_id_gmail_connection_id_fk" FOREIGN KEY ("gmail_connection_id") REFERENCES "public"."gmail_connection"("id") ON DELETE cascade ON UPDATE no action;