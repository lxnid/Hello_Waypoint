CREATE TYPE "public"."depot" AS ENUM('Peliyagoda', 'Kandy');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER');--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"district" text NOT NULL,
	"depot" "depot" NOT NULL,
	"dock_type" text NOT NULL,
	"parking_constraint" text NOT NULL,
	"mall_window" text,
	"window_open_time" text NOT NULL,
	"window_close_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"depot" "depot" NOT NULL,
	"outlet_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"temp" text NOT NULL,
	"weight_cap_kg" numeric(12, 2) NOT NULL,
	"volume_cap_m3" numeric(12, 3) NOT NULL,
	"fuel_type" text NOT NULL,
	"km_per_l" numeric(8, 2) NOT NULL,
	"weekly_fuel_quota_l" numeric(12, 2) NOT NULL,
	"depot" "depot" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outlets_depot_idx" ON "outlets" USING btree ("depot");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "vehicles_depot_idx" ON "vehicles" USING btree ("depot");