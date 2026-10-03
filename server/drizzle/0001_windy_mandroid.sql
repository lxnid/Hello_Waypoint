CREATE TYPE "public"."planning_decision" AS ENUM('UNASSIGNED', 'ALLOCATED', 'DEFERRED');--> statement-breakpoint
CREATE TYPE "public"."load_status" AS ENUM('WAITING', 'LOADING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."order_format" AS ENUM('ITEMIZED', 'AGGREGATE');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'SUBMITTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."delivery_outcome" AS ENUM('DELIVERED', 'PARTIAL', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('DRAFT', 'RELEASED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."temperature_requirement" AS ENUM('ambient', 'chilled');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('PLANNED', 'DISPATCHED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid,
	"attempt_id" uuid,
	"receipt_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachments_owner_check" CHECK (num_nonnulls("attachments"."issue_id","attachments"."attempt_id","attachments"."receipt_id") = 1),
	CONSTRAINT "attachments_values_check" CHECK ("attachments"."byte_size" > 0 AND "attachments"."kind" IN ('PHOTO','SIGNATURE'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" "delivery_outcome",
	"actual_depart_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"temperature_c" numeric(12, 2),
	"driver_id" uuid NOT NULL,
	"receiver_name" text,
	"receiver_staff_id" text,
	"delivered_units" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempts_number_unique" UNIQUE("stop_id","attempt_number"),
	CONSTRAINT "delivery_attempts_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "delivery_attempts_values_check" CHECK ("delivery_attempts"."attempt_number" >= 1 AND ("delivery_attempts"."delivered_units" IS NULL OR "delivery_attempts"."delivered_units" >= 0) AND ("delivery_attempts"."completed_at" IS NULL OR ("delivery_attempts"."arrived_at" IS NOT NULL AND "delivery_attempts"."completed_at" >= "delivery_attempts"."arrived_at" AND "delivery_attempts"."outcome" IS NOT NULL)) AND ("delivery_attempts"."actual_depart_at" IS NULL OR "delivery_attempts"."arrived_at" IS NULL OR "delivery_attempts"."actual_depart_at" <= "delivery_attempts"."arrived_at"))
);
--> statement-breakpoint
CREATE TABLE "delivery_line_records" (
	"attempt_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"delivered_quantity" integer NOT NULL,
	"rejected_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_line_records_attempt_id_order_line_id_pk" PRIMARY KEY("attempt_id","order_line_id"),
	CONSTRAINT "delivery_line_records_values_check" CHECK ("delivery_line_records"."delivered_quantity" >= 0 AND "delivery_line_records"."rejected_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" "depot" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "district_travel" (
	"district_id" text PRIMARY KEY NOT NULL,
	"road_class" text NOT NULL,
	"free_flow_kmh" numeric(12, 2) NOT NULL,
	"depot_to_district_km" numeric(12, 2) NOT NULL,
	"depot_to_district_freeflow_minutes" numeric(12, 2) NOT NULL,
	"inter_stop_km" numeric(12, 2) NOT NULL,
	"inter_stop_freeflow_minutes" numeric(12, 2) NOT NULL,
	CONSTRAINT "district_travel_values_check" CHECK ("district_travel"."free_flow_kmh" > 0 AND "district_travel"."depot_to_district_km" >= 0 AND "district_travel"."depot_to_district_freeflow_minutes" >= 0 AND "district_travel"."inter_stop_km" >= 0 AND "district_travel"."inter_stop_freeflow_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"depot_id" "depot" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_route_id" text NOT NULL,
	"date" date NOT NULL,
	"vehicle_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"district_id" text NOT NULL,
	CONSTRAINT "historical_routes_source_unique" UNIQUE("batch_id","source_route_id","date")
);
--> statement-breakpoint
CREATE TABLE "historical_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"source_delivery_id" text NOT NULL,
	"source_leg_id" text NOT NULL,
	"row_position" integer NOT NULL,
	"outlet_id" text NOT NULL,
	"requested_date" date NOT NULL,
	"dispatch_status" text NOT NULL,
	"temperature_requirement" "temperature_requirement" NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" numeric(12, 2) NOT NULL,
	"volume_m3" numeric(12, 3) NOT NULL,
	"window_open_at" timestamp with time zone NOT NULL,
	"window_close_at" timestamp with time zone NOT NULL,
	"planned_depart_at" timestamp with time zone NOT NULL,
	"planned_arrival_at" timestamp with time zone NOT NULL,
	"planned_travel_minutes" numeric(12, 2) NOT NULL,
	"distance_km" numeric(12, 2) NOT NULL,
	"actual_depart_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"actual_travel_minutes" numeric(12, 2),
	CONSTRAINT "historical_stops_sequence_unique" UNIQUE("route_id","sequence"),
	CONSTRAINT "historical_stops_values_check" CHECK ("historical_stops"."sequence" >= 0 AND "historical_stops"."row_position" >= 0 AND "historical_stops"."units" > 0 AND "historical_stops"."weight_kg" > 0 AND "historical_stops"."volume_m3" > 0 AND "historical_stops"."distance_km" >= 0 AND "historical_stops"."planned_travel_minutes" >= 0 AND ("historical_stops"."actual_travel_minutes" IS NULL OR "historical_stops"."actual_travel_minutes" >= 0))
);
--> statement-breakpoint
CREATE TABLE "historical_unrun_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_delivery_id" text NOT NULL,
	"row_position" integer NOT NULL,
	"outlet_id" text NOT NULL,
	"requested_date" date NOT NULL,
	"temperature_requirement" "temperature_requirement" NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" numeric(12, 2) NOT NULL,
	"volume_m3" numeric(12, 3) NOT NULL,
	CONSTRAINT "historical_unrun_orders_source_unique" UNIQUE("batch_id","source_delivery_id"),
	CONSTRAINT "historical_unrun_orders_values_check" CHECK ("historical_unrun_orders"."row_position" >= 0 AND "historical_unrun_orders"."units" > 0 AND "historical_unrun_orders"."weight_kg" > 0 AND "historical_unrun_orders"."volume_m3" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL,
	CONSTRAINT "import_batches_identity_unique" UNIQUE("dataset","version","checksum")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"order_line_id" uuid,
	"attempt_id" uuid,
	"type" text NOT NULL,
	"affected_quantity" integer NOT NULL,
	"notes" text,
	"reported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"estimated_credit_lkr" numeric(12, 2),
	CONSTRAINT "issues_values_check" CHECK ("issues"."stage" IN ('LOADING','DELIVERY','RECEIPT') AND "issues"."affected_quantity" > 0 AND ("issues"."estimated_credit_lkr" IS NULL OR "issues"."estimated_credit_lkr" >= 0) AND (("issues"."resolved_at" IS NULL AND "issues"."resolved_by" IS NULL AND "issues"."resolution" IS NULL) OR ("issues"."resolved_at" IS NOT NULL AND "issues"."resolved_by" IS NOT NULL AND "issues"."resolution" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "load_line_records" (
	"stop_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"loaded_quantity" integer NOT NULL,
	"damaged_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "load_line_records_stop_id_order_line_id_pk" PRIMARY KEY("stop_id","order_line_id"),
	CONSTRAINT "load_line_records_values_check" CHECK ("load_line_records"."loaded_quantity" >= 0 AND "load_line_records"."damaged_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "load_manifests" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"status" "load_status" DEFAULT 'WAITING' NOT NULL,
	"bay_label" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"signed_by" uuid,
	"authorized_by" uuid,
	"authorized_at" timestamp with time zone,
	CONSTRAINT "load_manifests_completion_check" CHECK ("load_manifests"."status" <> 'COMPLETED' OR ("load_manifests"."completed_at" IS NOT NULL AND "load_manifests"."signed_by" IS NOT NULL)),
	CONSTRAINT "load_manifests_authorization_check" CHECK (("load_manifests"."authorized_by" IS NULL AND "load_manifests"."authorized_at" IS NULL) OR ("load_manifests"."authorized_by" IS NOT NULL AND "load_manifests"."authorized_at" IS NOT NULL AND "load_manifests"."status" = 'COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "load_records" (
	"stop_id" uuid PRIMARY KEY NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"temperature_c" numeric(12, 2),
	"loaded_units" integer,
	"loaded_weight_kg" numeric(12, 2),
	"loaded_volume_m3" numeric(12, 3),
	CONSTRAINT "load_records_values_check" CHECK (("load_records"."loaded_units" IS NULL AND "load_records"."loaded_weight_kg" IS NULL AND "load_records"."loaded_volume_m3" IS NULL) OR ("load_records"."loaded_units" IS NOT NULL AND "load_records"."loaded_weight_kg" IS NOT NULL AND "load_records"."loaded_volume_m3" IS NOT NULL AND "load_records"."loaded_units" >= 0 AND "load_records"."loaded_weight_kg" >= 0 AND "load_records"."loaded_volume_m3" >= 0)),
	CONSTRAINT "load_records_confirmation_check" CHECK (("load_records"."confirmed_by" IS NULL) = ("load_records"."confirmed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "operating_calendar" (
	"date" date PRIMARY KEY NOT NULL,
	"is_operating" boolean NOT NULL,
	"is_holiday" boolean NOT NULL,
	"is_payday" boolean NOT NULL,
	"festival" text,
	"festival_ramp" numeric(5, 4) NOT NULL,
	"monsoon" boolean NOT NULL,
	CONSTRAINT "operating_calendar_ramp_check" CHECK ("operating_calendar"."festival_ramp" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "order_aggregates" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" numeric(12, 2) NOT NULL,
	"volume_m3" numeric(12, 3) NOT NULL,
	CONSTRAINT "order_aggregates_values_check" CHECK ("order_aggregates"."units" > 0 AND "order_aggregates"."weight_kg" > 0 AND "order_aggregates"."volume_m3" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"ordering_unit" text NOT NULL,
	"temperature_requirement" "temperature_requirement" NOT NULL,
	"unit_weight_kg" numeric(12, 2) NOT NULL,
	"unit_volume_m3" numeric(12, 3) NOT NULL,
	"estimated_unit_value_lkr" numeric(12, 2),
	CONSTRAINT "order_lines_position_unique" UNIQUE("order_id","line_number"),
	CONSTRAINT "order_lines_order_id_unique" UNIQUE("order_id","id"),
	CONSTRAINT "order_lines_values_check" CHECK ("order_lines"."line_number" >= 1 AND "order_lines"."quantity" > 0 AND "order_lines"."unit_weight_kg" > 0 AND "order_lines"."unit_volume_m3" > 0 AND ("order_lines"."estimated_unit_value_lkr" IS NULL OR "order_lines"."estimated_unit_value_lkr" >= 0))
);
--> statement-breakpoint
CREATE TABLE "order_sources" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"scenario" text DEFAULT '' NOT NULL,
	"source_reference" text NOT NULL,
	"row_position" integer NOT NULL,
	"deferred_yesterday" boolean,
	"days_since_last_served" integer,
	"source_context" jsonb NOT NULL,
	CONSTRAINT "order_sources_identity_unique" UNIQUE("batch_id","scenario","source_reference"),
	CONSTRAINT "order_sources_row_unique" UNIQUE("batch_id","row_position"),
	CONSTRAINT "order_sources_values_check" CHECK ("order_sources"."row_position" >= 0 AND ("order_sources"."days_since_last_served" IS NULL OR "order_sources"."days_since_last_served" >= 0))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_reference" text NOT NULL,
	"outlet_id" text NOT NULL,
	"format" "order_format" NOT NULL,
	"temperature_requirement" "temperature_requirement" NOT NULL,
	"requested_date" date NOT NULL,
	"eligible_date" date NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_reference_unique" UNIQUE("public_reference"),
	CONSTRAINT "orders_submission_check" CHECK ("orders"."status" = 'DRAFT' OR "orders"."status" = 'CANCELLED' OR "orders"."submitted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "plan_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"decision" "planning_decision" DEFAULT 'UNASSIGNED' NOT NULL,
	"reason_code" text,
	"rationale" text,
	"next_eligible_date" date,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"priority_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_orders_plan_order_unique" UNIQUE("plan_id","order_id"),
	CONSTRAINT "plan_orders_plan_id_unique" UNIQUE("plan_id","id"),
	CONSTRAINT "plan_orders_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "plan_orders_deferral_check" CHECK ("plan_orders"."decision" <> 'DEFERRED' OR ("plan_orders"."reason_code" IS NOT NULL AND "plan_orders"."rationale" IS NOT NULL AND "plan_orders"."next_eligible_date" IS NOT NULL AND "plan_orders"."decided_by" IS NOT NULL AND "plan_orders"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "planning_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"operating_date" date NOT NULL,
	"batch_id" uuid,
	"scenario" text,
	CONSTRAINT "planning_contexts_scenario_unique" UNIQUE("batch_id","scenario","operating_date"),
	CONSTRAINT "planning_contexts_kind_check" CHECK (("planning_contexts"."kind" = 'LIVE' AND "planning_contexts"."batch_id" IS NULL AND "planning_contexts"."scenario" IS NULL) OR ("planning_contexts"."kind" = 'SCENARIO' AND "planning_contexts"."batch_id" IS NOT NULL AND "planning_contexts"."scenario" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"depot_id" "depot" NOT NULL,
	"status" "plan_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"policy_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_context_depot_unique" UNIQUE("context_id","depot_id"),
	CONSTRAINT "plans_version_check" CHECK ("plans"."version" > 0),
	CONSTRAINT "plans_release_check" CHECK ("plans"."status" = 'DRAFT' OR "plans"."released_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "prediction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"version" text NOT NULL,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"ordering_unit" text NOT NULL,
	"temperature_requirement" "temperature_requirement" NOT NULL,
	"unit_weight_kg" numeric(12, 2) NOT NULL,
	"unit_volume_m3" numeric(12, 3) NOT NULL,
	"estimated_unit_value_lkr" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_dimensions_check" CHECK ("products"."unit_weight_kg" > 0 AND "products"."unit_volume_m3" > 0 AND ("products"."estimated_unit_value_lkr" IS NULL OR "products"."estimated_unit_value_lkr" >= 0))
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"receipt_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"accepted_quantity" integer NOT NULL,
	"missing_quantity" integer DEFAULT 0 NOT NULL,
	"damaged_quantity" integer DEFAULT 0 NOT NULL,
	"rejected_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "receipt_lines_receipt_id_order_line_id_pk" PRIMARY KEY("receipt_id","order_line_id"),
	CONSTRAINT "receipt_lines_values_check" CHECK ("receipt_lines"."accepted_quantity" >= 0 AND "receipt_lines"."missing_quantity" >= 0 AND "receipt_lines"."damaged_quantity" >= 0 AND "receipt_lines"."rejected_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"outcome" "delivery_outcome" NOT NULL,
	"temperature_c" numeric(12, 2),
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipts_attempt_order_unique" UNIQUE("attempt_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "road_conditions" (
	"district_id" text NOT NULL,
	"date" date NOT NULL,
	"disruption_index" numeric(12, 2) NOT NULL,
	CONSTRAINT "road_conditions_district_id_date_pk" PRIMARY KEY("district_id","date"),
	CONSTRAINT "road_conditions_values_check" CHECK ("road_conditions"."disruption_index" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_allowances" (
	"brand_id" text NOT NULL,
	"dock_type" text NOT NULL,
	"minutes" numeric(12, 2) NOT NULL,
	CONSTRAINT "service_allowances_brand_id_dock_type_pk" PRIMARY KEY("brand_id","dock_type"),
	CONSTRAINT "service_allowances_values_check" CHECK ("service_allowances"."minutes" >= 0 AND "service_allowances"."dock_type" IN ('rear_dock','street','mall_bay'))
);
--> statement-breakpoint
CREATE TABLE "stop_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"stop_id" uuid,
	"historical_stop_id" uuid,
	"service_minutes" numeric(12, 2) NOT NULL,
	"late_probability" numeric(7, 6) NOT NULL,
	CONSTRAINT "stop_predictions_operational_unique" UNIQUE("run_id","stop_id"),
	CONSTRAINT "stop_predictions_historical_unique" UNIQUE("run_id","historical_stop_id"),
	CONSTRAINT "stop_predictions_values_check" CHECK (num_nonnulls("stop_predictions"."stop_id","stop_predictions"."historical_stop_id") = 1 AND "stop_predictions"."service_minutes" >= 0 AND "stop_predictions"."late_probability" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "sync_operations_replay_unique" UNIQUE("actor_id","client_operation_id")
);
--> statement-breakpoint
CREATE TABLE "traffic_profiles" (
	"district_id" text NOT NULL,
	"hour" integer NOT NULL,
	"monsoon" boolean NOT NULL,
	"speed_index" numeric(12, 2) NOT NULL,
	CONSTRAINT "traffic_profiles_district_id_hour_monsoon_pk" PRIMARY KEY("district_id","hour","monsoon"),
	CONSTRAINT "traffic_profiles_values_check" CHECK ("traffic_profiles"."hour" BETWEEN 0 AND 23 AND "traffic_profiles"."speed_index" > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_fuel_reservations" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"distance_km" numeric(12, 2) NOT NULL,
	"estimated_fuel_l" numeric(12, 3) NOT NULL,
	"actual_fuel_l" numeric(12, 3),
	"state" text DEFAULT 'RESERVED' NOT NULL,
	CONSTRAINT "trip_fuel_values_check" CHECK ("trip_fuel_reservations"."distance_km" >= 0 AND "trip_fuel_reservations"."estimated_fuel_l" >= 0 AND ("trip_fuel_reservations"."actual_fuel_l" IS NULL OR "trip_fuel_reservations"."actual_fuel_l" >= 0) AND "trip_fuel_reservations"."state" IN ('RESERVED','CONSUMED','RELEASED'))
);
--> statement-breakpoint
CREATE TABLE "trip_inspections" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"starting_odometer_km" numeric(12, 2) NOT NULL,
	"fuel_checked" boolean NOT NULL,
	"chiller_checked" boolean NOT NULL,
	"temperature_c" numeric(12, 2),
	"inspected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trip_inspections_odometer_check" CHECK ("trip_inspections"."starting_odometer_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"plan_order_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"planned_depart_at" timestamp with time zone NOT NULL,
	"planned_travel_minutes" numeric(12, 2) NOT NULL,
	"planned_arrival_at" timestamp with time zone NOT NULL,
	"service_allowance_minutes" numeric(12, 2) NOT NULL,
	"distance_km" numeric(12, 2) NOT NULL,
	"window_open_at" timestamp with time zone NOT NULL,
	"window_close_at" timestamp with time zone NOT NULL,
	"dock_type" text NOT NULL,
	"parking_constraint" text NOT NULL,
	CONSTRAINT "trip_stops_plan_order_id_unique" UNIQUE("plan_order_id"),
	CONSTRAINT "trip_stops_sequence_unique" UNIQUE("trip_id","sequence"),
	CONSTRAINT "trip_stops_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "trip_stops_values_check" CHECK ("trip_stops"."sequence" >= 0 AND "trip_stops"."planned_travel_minutes" >= 0 AND "trip_stops"."service_allowance_minutes" >= 0 AND "trip_stops"."distance_km" >= 0 AND "trip_stops"."window_open_at" < "trip_stops"."window_close_at" AND "trip_stops"."planned_depart_at" <= "trip_stops"."planned_arrival_at")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"vehicle_id" text NOT NULL,
	"driver_id" uuid NOT NULL,
	"trip_number" integer NOT NULL,
	"brand_id" text NOT NULL,
	"district_id" text NOT NULL,
	"status" "trip_status" DEFAULT 'PLANNED' NOT NULL,
	"weight_cap_kg" numeric(12, 2),
	"volume_cap_m3" numeric(12, 3),
	"km_per_l" numeric(12, 2),
	"vehicle_type" text,
	"vehicle_temperature" text,
	CONSTRAINT "trips_slot_unique" UNIQUE("plan_id","vehicle_id","trip_number"),
	CONSTRAINT "trips_plan_id_unique" UNIQUE("plan_id","id"),
	CONSTRAINT "trips_number_check" CHECK ("trips"."trip_number" IN (1,2))
);
--> statement-breakpoint
CREATE TABLE "vehicle_availability" (
	"context_id" uuid NOT NULL,
	"vehicle_id" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "vehicle_availability_context_id_vehicle_id_pk" PRIMARY KEY("context_id","vehicle_id"),
	CONSTRAINT "vehicle_availability_status_check" CHECK ("vehicle_availability"."status" IN ('available','in_workshop'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_week_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"week_start" date NOT NULL,
	"quota_l" numeric(12, 3) NOT NULL,
	"opening_usage_l" numeric(12, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "vehicle_week_budgets_identity_unique" UNIQUE("namespace","vehicle_id","week_start"),
	CONSTRAINT "vehicle_week_budgets_values_check" CHECK ("vehicle_week_budgets"."quota_l" >= 0 AND "vehicle_week_budgets"."opening_usage_l" >= 0 AND EXTRACT(ISODOW FROM "vehicle_week_budgets"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "weekly_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"depot_id" "depot" NOT NULL,
	"brand_id" text NOT NULL,
	"week_start" date NOT NULL,
	"total_volume_m3" numeric(12, 3) NOT NULL,
	"chilled_volume_m3" numeric(12, 3) NOT NULL,
	"source_row_id" text,
	"row_position" integer,
	CONSTRAINT "weekly_forecasts_target_unique" UNIQUE("run_id","depot_id","brand_id","week_start"),
	CONSTRAINT "weekly_forecasts_values_check" CHECK ("weekly_forecasts"."total_volume_m3" >= 0 AND "weekly_forecasts"."chilled_volume_m3" BETWEEN 0 AND "weekly_forecasts"."total_volume_m3" AND EXTRACT(ISODOW FROM "weekly_forecasts"."week_start") = 1 AND ("weekly_forecasts"."brand_id" = 'Fresh' OR "weekly_forecasts"."chilled_volume_m3" = 0) AND ("weekly_forecasts"."row_position" IS NULL OR "weekly_forecasts"."row_position" >= 0))
);
--> statement-breakpoint
ALTER TABLE "outlets" RENAME COLUMN "brand" TO "brand_id";--> statement-breakpoint
ALTER TABLE "outlets" RENAME COLUMN "district" TO "district_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "depot" TO "depot_id";--> statement-breakpoint
DROP INDEX "outlets_depot_idx";--> statement-breakpoint
DROP INDEX "vehicles_depot_idx";--> statement-breakpoint
ALTER TABLE "outlets" ALTER COLUMN "window_open_time" SET DATA TYPE time USING "window_open_time"::time;--> statement-breakpoint
ALTER TABLE "outlets" ALTER COLUMN "window_close_time" SET DATA TYPE time USING "window_close_time"::time;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "km_per_l" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "weekly_fuel_quota_l" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "mall_open_time" time;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "mall_close_time" time;--> statement-breakpoint
ALTER TABLE "vehicles" RENAME COLUMN "depot" TO "depot_id";--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Normalize existing foundation data before foreign keys and checks are installed.
INSERT INTO "depots" ("id", "name") VALUES ('Peliyagoda', 'Peliyagoda'), ('Kandy', 'Kandy') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "brands" ("id", "name") VALUES ('Fresh', 'Waypoint Fresh'), ('Style', 'Waypoint Style'), ('Tech', 'Waypoint Tech') ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT district_id FROM outlets GROUP BY district_id HAVING count(DISTINCT depot) > 1) THEN
    RAISE EXCEPTION 'Cannot normalize districts: a district has multiple serving depots';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "districts" ("id", "name", "depot_id") SELECT DISTINCT "district_id", "district_id", "depot" FROM "outlets";
--> statement-breakpoint
UPDATE "outlets" SET "mall_open_time" = split_part("mall_window", '-', 1)::time, "mall_close_time" = split_part("mall_window", '-', 2)::time WHERE nullif("mall_window", '') IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "depot_id" DROP NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "depot_id" = NULL WHERE "role" IN ('DISPATCHER', 'STORE_MANAGER');
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_attempt_id_delivery_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."delivery_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_receipt_id_receipts_attempt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("attempt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_stop_id_order_id_trip_stops_id_order_id_fk" FOREIGN KEY ("stop_id","order_id") REFERENCES "public"."trip_stops"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_line_records" ADD CONSTRAINT "delivery_line_records_attempt_id_order_id_delivery_attempts_id_order_id_fk" FOREIGN KEY ("attempt_id","order_id") REFERENCES "public"."delivery_attempts"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_line_records" ADD CONSTRAINT "delivery_line_records_order_id_order_line_id_order_lines_order_id_id_fk" FOREIGN KEY ("order_id","order_line_id") REFERENCES "public"."order_lines"("order_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_travel" ADD CONSTRAINT "district_travel_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_routes" ADD CONSTRAINT "historical_routes_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_routes" ADD CONSTRAINT "historical_routes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_routes" ADD CONSTRAINT "historical_routes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_routes" ADD CONSTRAINT "historical_routes_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_stops" ADD CONSTRAINT "historical_stops_route_id_historical_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."historical_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_stops" ADD CONSTRAINT "historical_stops_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_unrun_orders" ADD CONSTRAINT "historical_unrun_orders_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_unrun_orders" ADD CONSTRAINT "historical_unrun_orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_stop_id_order_id_trip_stops_id_order_id_fk" FOREIGN KEY ("stop_id","order_id") REFERENCES "public"."trip_stops"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_order_line_id_order_lines_order_id_id_fk" FOREIGN KEY ("order_id","order_line_id") REFERENCES "public"."order_lines"("order_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_attempt_id_order_id_delivery_attempts_id_order_id_fk" FOREIGN KEY ("attempt_id","order_id") REFERENCES "public"."delivery_attempts"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_line_records" ADD CONSTRAINT "load_line_records_stop_id_load_records_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."load_records"("stop_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_line_records" ADD CONSTRAINT "load_line_records_stop_id_order_id_trip_stops_id_order_id_fk" FOREIGN KEY ("stop_id","order_id") REFERENCES "public"."trip_stops"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_line_records" ADD CONSTRAINT "load_line_records_order_id_order_line_id_order_lines_order_id_id_fk" FOREIGN KEY ("order_id","order_line_id") REFERENCES "public"."order_lines"("order_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_manifests" ADD CONSTRAINT "load_manifests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_manifests" ADD CONSTRAINT "load_manifests_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_manifests" ADD CONSTRAINT "load_manifests_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_records" ADD CONSTRAINT "load_records_stop_id_trip_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_records" ADD CONSTRAINT "load_records_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_aggregates" ADD CONSTRAINT "order_aggregates_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_sources" ADD CONSTRAINT "order_sources_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_sources" ADD CONSTRAINT "order_sources_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_contexts" ADD CONSTRAINT "planning_contexts_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_context_id_planning_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."planning_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_runs" ADD CONSTRAINT "prediction_runs_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_order_id_receipts_attempt_id_order_id_fk" FOREIGN KEY ("receipt_id","order_id") REFERENCES "public"."receipts"("attempt_id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_order_id_order_line_id_order_lines_order_id_id_fk" FOREIGN KEY ("order_id","order_line_id") REFERENCES "public"."order_lines"("order_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attempt_id_order_id_delivery_attempts_id_order_id_fk" FOREIGN KEY ("attempt_id","order_id") REFERENCES "public"."delivery_attempts"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_conditions" ADD CONSTRAINT "road_conditions_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_allowances" ADD CONSTRAINT "service_allowances_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_predictions" ADD CONSTRAINT "stop_predictions_run_id_prediction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prediction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_predictions" ADD CONSTRAINT "stop_predictions_stop_id_trip_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_predictions" ADD CONSTRAINT "stop_predictions_historical_stop_id_historical_stops_id_fk" FOREIGN KEY ("historical_stop_id") REFERENCES "public"."historical_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_profiles" ADD CONSTRAINT "traffic_profiles_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_fuel_reservations" ADD CONSTRAINT "trip_fuel_reservations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_fuel_reservations" ADD CONSTRAINT "trip_fuel_reservations_budget_id_vehicle_week_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."vehicle_week_budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_inspections" ADD CONSTRAINT "trip_inspections_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_inspections" ADD CONSTRAINT "trip_inspections_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_plan_fk" FOREIGN KEY ("plan_id","trip_id") REFERENCES "public"."trips"("plan_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_decision_plan_fk" FOREIGN KEY ("plan_id","plan_order_id") REFERENCES "public"."plan_orders"("plan_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_decision_order_fk" FOREIGN KEY ("plan_order_id","order_id") REFERENCES "public"."plan_orders"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_availability" ADD CONSTRAINT "vehicle_availability_context_id_planning_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."planning_contexts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_availability" ADD CONSTRAINT "vehicle_availability_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_week_budgets" ADD CONSTRAINT "vehicle_week_budgets_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_forecasts" ADD CONSTRAINT "weekly_forecasts_run_id_prediction_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prediction_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_forecasts" ADD CONSTRAINT "weekly_forecasts_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_forecasts" ADD CONSTRAINT "weekly_forecasts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_issue_idx" ON "attachments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "attachments_attempt_idx" ON "attachments" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attachments_receipt_idx" ON "attachments" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "attachments_uploader_idx" ON "attachments" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_driver_idx" ON "delivery_attempts" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_order_idx" ON "delivery_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_line_records_line_idx" ON "delivery_line_records" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "delivery_line_records_order_idx" ON "delivery_line_records" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "districts_depot_idx" ON "districts" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "historical_routes_vehicle_idx" ON "historical_routes" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "historical_routes_brand_idx" ON "historical_routes" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "historical_routes_district_idx" ON "historical_routes" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "historical_stops_outlet_idx" ON "historical_stops" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "historical_unrun_orders_outlet_idx" ON "historical_unrun_orders" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "issues_unresolved_idx" ON "issues" USING btree ("created_at" DESC NULLS LAST,"id") WHERE "issues"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "issues_stop_idx" ON "issues" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "issues_order_idx" ON "issues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "issues_line_idx" ON "issues" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "issues_attempt_idx" ON "issues" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "issues_reporter_idx" ON "issues" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "issues_resolver_idx" ON "issues" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "load_line_records_line_idx" ON "load_line_records" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "load_line_records_order_idx" ON "load_line_records" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "load_manifests_signer_idx" ON "load_manifests" USING btree ("signed_by");--> statement-breakpoint
CREATE INDEX "load_manifests_authorizer_idx" ON "load_manifests" USING btree ("authorized_by");--> statement-breakpoint
CREATE INDEX "load_records_actor_idx" ON "load_records" USING btree ("confirmed_by");--> statement-breakpoint
CREATE INDEX "order_lines_product_idx" ON "order_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_outlet_history_idx" ON "orders" USING btree ("outlet_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "orders_queue_idx" ON "orders" USING btree ("eligible_date","outlet_id") WHERE "orders"."status" = 'SUBMITTED';--> statement-breakpoint
CREATE INDEX "orders_creator_idx" ON "orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "plan_orders_order_history_idx" ON "plan_orders" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "plan_orders_actor_idx" ON "plan_orders" USING btree ("decided_by");--> statement-breakpoint
CREATE UNIQUE INDEX "planning_contexts_live_date_unique" ON "planning_contexts" USING btree ("operating_date") WHERE "planning_contexts"."kind" = 'LIVE';--> statement-breakpoint
CREATE INDEX "plans_depot_idx" ON "plans" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "plans_creator_idx" ON "plans" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "prediction_runs_batch_idx" ON "prediction_runs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "products_catalog_idx" ON "products" USING btree ("brand_id","temperature_requirement") WHERE "products"."is_active" = true;--> statement-breakpoint
CREATE INDEX "receipt_lines_line_idx" ON "receipt_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_order_idx" ON "receipt_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "receipts_manager_idx" ON "receipts" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "receipts_order_idx" ON "receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "road_conditions_date_idx" ON "road_conditions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "stop_predictions_stop_idx" ON "stop_predictions" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "stop_predictions_historical_idx" ON "stop_predictions" USING btree ("historical_stop_id");--> statement-breakpoint
CREATE INDEX "trip_fuel_budget_idx" ON "trip_fuel_reservations" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "trip_inspections_driver_idx" ON "trip_inspections" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "trip_stops_plan_idx" ON "trip_stops" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "trip_stops_order_idx" ON "trip_stops" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "trips_vehicle_idx" ON "trips" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "trips_driver_plan_idx" ON "trips" USING btree ("driver_id","plan_id");--> statement-breakpoint
CREATE INDEX "trips_district_idx" ON "trips" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "trips_brand_idx" ON "trips" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "vehicle_availability_vehicle_idx" ON "vehicle_availability" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_week_budgets_vehicle_idx" ON "vehicle_week_budgets" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "weekly_forecasts_lookup_idx" ON "weekly_forecasts" USING btree ("depot_id","brand_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_forecasts_brand_idx" ON "weekly_forecasts" USING btree ("brand_id");--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outlets_district_brand_idx" ON "outlets" USING btree ("district_id","brand_id");--> statement-breakpoint
CREATE INDEX "outlets_brand_idx" ON "outlets" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_depot_idx" ON "users" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "users_outlet_idx" ON "users" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "vehicles_depot_idx" ON "vehicles" USING btree ("depot_id");--> statement-breakpoint
ALTER TABLE "outlets" DROP COLUMN "depot";--> statement-breakpoint
ALTER TABLE "outlets" DROP COLUMN "mall_window";--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_dock_check" CHECK ("outlets"."dock_type" IN ('rear_dock','street','mall_bay'));--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_parking_check" CHECK ("outlets"."parking_constraint" IN ('normal','van_only','mall_dock'));--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_window_check" CHECK ("outlets"."window_open_time" < "outlets"."window_close_time");--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_mall_window_check" CHECK (("outlets"."mall_open_time" IS NULL AND "outlets"."mall_close_time" IS NULL AND "outlets"."parking_constraint" <> 'mall_dock') OR ("outlets"."mall_open_time" IS NOT NULL AND "outlets"."mall_close_time" IS NOT NULL AND "outlets"."mall_open_time" < "outlets"."mall_close_time"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_scope_check" CHECK (("users"."role" = 'DISPATCHER' AND "users"."depot_id" IS NULL AND "users"."outlet_id" IS NULL) OR ("users"."role" IN ('LOADER','DRIVER') AND "users"."depot_id" IS NOT NULL AND "users"."outlet_id" IS NULL) OR ("users"."role" = 'STORE_MANAGER' AND "users"."depot_id" IS NULL AND "users"."outlet_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_type_check" CHECK ("vehicles"."type" IN ('truck','van'));--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_temp_check" CHECK ("vehicles"."temp" IN ('reefer','ambient'));--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("vehicles"."weight_cap_kg" > 0 AND "vehicles"."volume_cap_m3" > 0 AND "vehicles"."km_per_l" > 0 AND "vehicles"."weekly_fuel_quota_l" >= 0);