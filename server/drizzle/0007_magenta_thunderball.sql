ALTER TYPE "public"."order_status" ADD VALUE 'CLOSED_EXCEPTION' BEFORE 'CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."trip_status" ADD VALUE 'AWAITING_RETURN' BEFORE 'COMPLETED';--> statement-breakpoint
CREATE TABLE "trip_closures" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"returned_at" timestamp with time zone NOT NULL,
	"ending_odometer_km" numeric(12, 2) NOT NULL,
	"actual_fuel_l" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_closures_values_check" CHECK ("trip_closures"."ending_odometer_km" >= 0 AND "trip_closures"."actual_fuel_l" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trip_closures" ADD CONSTRAINT "trip_closures_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_closures" ADD CONSTRAINT "trip_closures_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;