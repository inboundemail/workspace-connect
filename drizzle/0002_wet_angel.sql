ALTER TABLE "apiKey" RENAME TO "apikey";--> statement-breakpoint
ALTER TABLE "apikey" DROP CONSTRAINT "apiKey_key_unique";--> statement-breakpoint
ALTER TABLE "apikey" DROP CONSTRAINT "apiKey_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_key_unique" UNIQUE("key");