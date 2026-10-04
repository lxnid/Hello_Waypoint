ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "max_order_quantity" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_quantity_limit_check" CHECK ("products"."max_order_quantity" IS NULL OR "products"."max_order_quantity" > 0);