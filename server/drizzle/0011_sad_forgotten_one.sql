CREATE TABLE "product_inventory" (
	"product_id" uuid NOT NULL,
	"depot_id" "depot" NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_inventory_pk" PRIMARY KEY("product_id","depot_id"),
	CONSTRAINT "product_inventory_quantity_check" CHECK ("product_inventory"."available_quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_inventory" ADD CONSTRAINT "product_inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_inventory" ADD CONSTRAINT "product_inventory_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_inventory_depot_idx" ON "product_inventory" USING btree ("depot_id","product_id");
--> statement-breakpoint
INSERT INTO "product_inventory" ("product_id","depot_id","available_quantity")
SELECT p."id",d."id",CASE WHEN p."sku" LIKE 'DEMO-%' THEN 100000 ELSE coalesce(p."max_order_quantity",100) END
FROM "products" p CROSS JOIN "depots" d
ON CONFLICT ("product_id","depot_id") DO NOTHING;
