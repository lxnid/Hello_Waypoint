ALTER TABLE "delivery_attempts" ADD COLUMN "delivered_weight_kg" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD COLUMN "delivered_volume_m3" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "accepted_units" integer;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "missing_units" integer;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "damaged_units" integer;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "rejected_units" integer;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_aggregate_values_check" CHECK (num_nonnulls("receipts"."accepted_units","receipts"."missing_units","receipts"."damaged_units","receipts"."rejected_units") = 0 OR (num_nonnulls("receipts"."accepted_units","receipts"."missing_units","receipts"."damaged_units","receipts"."rejected_units") = 4 AND "receipts"."accepted_units" >= 0 AND "receipts"."missing_units" >= 0 AND "receipts"."damaged_units" >= 0 AND "receipts"."rejected_units" >= 0));