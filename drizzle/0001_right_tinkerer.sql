CREATE TABLE "apiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"userId" text NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apiKey_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;