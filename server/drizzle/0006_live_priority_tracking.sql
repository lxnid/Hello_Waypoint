ALTER TABLE "plan_orders" ADD COLUMN "priority_source" text;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "priority_as_of_date" date;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "priority_evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "last_served_date" date;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "days_since_last_served" integer;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "temperature_last_served_date" date;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "temperature_days_since_last_served" integer;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "previous_operating_date" date;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "deferred_previous_run" boolean;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "requires_override" boolean;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "override_acknowledged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "override_by" uuid;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD COLUMN "override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_orders_override_actor_idx" ON "plan_orders" USING btree ("override_by");--> statement-breakpoint
CREATE INDEX "plan_orders_deferred_plan_order_idx" ON "plan_orders" USING btree ("plan_id","order_id") WHERE "plan_orders"."decision" = 'DEFERRED';--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_priority_values_check" CHECK (("plan_orders"."priority_source" IS NULL OR "plan_orders"."priority_source" IN ('LIVE','SCENARIO')) AND ("plan_orders"."days_since_last_served" IS NULL OR "plan_orders"."days_since_last_served" >= 0) AND ("plan_orders"."temperature_days_since_last_served" IS NULL OR "plan_orders"."temperature_days_since_last_served" >= 0));--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_priority_snapshot_check" CHECK ("plan_orders"."priority_evaluated_at" IS NULL OR ("plan_orders"."priority_source" IS NOT NULL AND "plan_orders"."priority_as_of_date" IS NOT NULL AND "plan_orders"."deferred_previous_run" IS NOT NULL AND "plan_orders"."requires_override" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_override_check" CHECK (("plan_orders"."override_acknowledged" = false AND "plan_orders"."override_reason" IS NULL AND "plan_orders"."override_by" IS NULL AND "plan_orders"."override_at" IS NULL) OR ("plan_orders"."override_acknowledged" = true AND "plan_orders"."override_reason" IS NOT NULL AND length(btrim("plan_orders"."override_reason")) > 0 AND "plan_orders"."override_by" IS NOT NULL AND "plan_orders"."override_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_protected_deferral_check" CHECK ("plan_orders"."decision" <> 'DEFERRED' OR "plan_orders"."requires_override" IS DISTINCT FROM true OR "plan_orders"."override_acknowledged" = true);--> statement-breakpoint
-- Acknowledgement is specific to the decision: changing the deferral invalidates it.
CREATE FUNCTION invalidate_deferral_override() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.decision,NEW.reason_code,NEW.rationale,NEW.next_eligible_date) IS DISTINCT FROM ROW(OLD.decision,OLD.reason_code,OLD.rationale,OLD.next_eligible_date) THEN
    NEW.override_acknowledged := false;
    NEW.override_reason := NULL; NEW.override_by := NULL; NEW.override_at := NULL;
    NEW.priority_source := NULL; NEW.priority_as_of_date := NULL; NEW.priority_evaluated_at := NULL;
    NEW.last_served_date := NULL; NEW.days_since_last_served := NULL;
    NEW.temperature_last_served_date := NULL; NEW.temperature_days_since_last_served := NULL;
    NEW.previous_operating_date := NULL; NEW.deferred_previous_run := NULL; NEW.requires_override := NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plan_orders_override_guard BEFORE UPDATE ON plan_orders FOR EACH ROW EXECUTE FUNCTION invalidate_deferral_override();
--> statement-breakpoint
CREATE FUNCTION validate_priority_release() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context planning_contexts%ROWTYPE;
BEGIN
  SELECT * INTO context FROM planning_contexts WHERE id=NEW.context_id;
  IF EXISTS (SELECT 1 FROM plan_orders po WHERE po.plan_id=NEW.id AND (po.priority_evaluated_at IS NULL OR po.priority_source IS DISTINCT FROM context.kind OR po.priority_as_of_date IS DISTINCT FROM context.operating_date)) THEN
    RAISE EXCEPTION 'Release requires evaluated priority snapshots' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM plan_orders po LEFT JOIN users u ON u.id=po.override_by WHERE po.plan_id=NEW.id AND po.decision='DEFERRED' AND po.requires_override AND (NOT po.override_acknowledged OR u.id IS NULL OR u.role<>'DISPATCHER' OR NOT u.is_active)) THEN
    RAISE EXCEPTION 'Protected deferral requires an active dispatcher override' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plans_priority_release_guard BEFORE UPDATE ON plans FOR EACH ROW WHEN (OLD.status='DRAFT' AND NEW.status='RELEASED') EXECUTE FUNCTION validate_priority_release();
