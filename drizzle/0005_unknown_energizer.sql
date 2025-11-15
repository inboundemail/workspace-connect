CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"remaining" integer,
	"refillInterval" integer,
	"refillAmount" integer,
	"lastRefillAt" timestamp,
	"rateLimitEnabled" boolean DEFAULT true NOT NULL,
	"rateLimitTimeWindow" integer,
	"rateLimitMax" integer,
	"requestCount" integer DEFAULT 0 NOT NULL,
	"lastRequest" timestamp,
	"expiresAt" timestamp,
	"permissions" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_connection" DROP COLUMN "imap_host";--> statement-breakpoint
ALTER TABLE "gmail_connection" DROP COLUMN "imap_port";--> statement-breakpoint
ALTER TABLE "gmail_connection" DROP COLUMN "smtp_host";--> statement-breakpoint
ALTER TABLE "gmail_connection" DROP COLUMN "smtp_port";