ALTER TABLE "outlets" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "longitude" numeric(11, 7);--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_location_check" CHECK (("outlets"."latitude" IS NULL AND "outlets"."longitude" IS NULL) OR ("outlets"."latitude" IS NOT NULL AND "outlets"."longitude" IS NOT NULL AND "outlets"."latitude" BETWEEN -90 AND 90 AND "outlets"."longitude" BETWEEN -180 AND 180));