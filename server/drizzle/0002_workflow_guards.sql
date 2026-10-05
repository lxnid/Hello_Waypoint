-- Domain-wide invariants that cannot be represented by row-local CHECK constraints.
CREATE FUNCTION protect_order_contents() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent orders%ROWTYPE; parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  SELECT * INTO parent FROM orders WHERE id=parent_id FOR UPDATE;
  IF parent.status <> 'DRAFT' THEN RAISE EXCEPTION 'Submitted order contents are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.order_id<>NEW.order_id THEN RAISE EXCEPTION 'Order content cannot change ownership' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='order_lines' AND parent.format<>'ITEMIZED' THEN RAISE EXCEPTION 'Aggregate orders cannot have product lines' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='order_aggregates' AND parent.format<>'AGGREGATE' THEN RAISE EXCEPTION 'Itemized orders cannot have aggregate totals' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON order_lines FOR EACH ROW EXECUTE FUNCTION protect_order_contents();
--> statement-breakpoint
CREATE TRIGGER order_aggregates_guard BEFORE INSERT OR UPDATE OR DELETE ON order_aggregates FOR EACH ROW EXECUTE FUNCTION protect_order_contents();
--> statement-breakpoint
CREATE FUNCTION protect_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Historical orders cannot be deleted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' AND NEW.status NOT IN ('DRAFT','CANCELLED') THEN RAISE EXCEPTION 'Create a draft before submitting an order' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' THEN
    IF ROW(NEW.outlet_id,NEW.format,NEW.temperature_requirement,NEW.requested_date,NEW.submitted_at,NEW.public_reference,NEW.created_by) IS DISTINCT FROM ROW(OLD.outlet_id,OLD.format,OLD.temperature_requirement,OLD.requested_date,OLD.submitted_at,OLD.public_reference,OLD.created_by) OR NEW.status='DRAFT' THEN
      RAISE EXCEPTION 'Submitted order identity and requested contents are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='SUBMITTED' AND (TG_OP='INSERT' OR OLD.status='DRAFT') THEN
    IF NEW.format='ITEMIZED' THEN
      IF NOT EXISTS(SELECT 1 FROM order_lines WHERE order_id=NEW.id) OR EXISTS(
        SELECT 1 FROM order_lines l JOIN products p ON p.id=l.product_id JOIN outlets o ON o.id=NEW.outlet_id
        WHERE l.order_id=NEW.id AND (p.brand_id<>o.brand_id OR NOT p.is_active OR l.temperature_requirement<>NEW.temperature_requirement OR p.temperature_requirement<>NEW.temperature_requirement)
      ) THEN RAISE EXCEPTION 'Invalid or empty itemized order' USING ERRCODE='23514'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM order_aggregates WHERE order_id=NEW.id) THEN
      RAISE EXCEPTION 'Aggregate order requires source totals' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_guard BEFORE INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION protect_order();
--> statement-breakpoint
CREATE FUNCTION protect_plan_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent plans%ROWTYPE; parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  SELECT * INTO parent FROM plans WHERE id=parent_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.plan_id<>NEW.plan_id THEN RAISE EXCEPTION 'Assignment cannot change plan ownership' USING ERRCODE='23514'; END IF;
  IF parent.status<>'DRAFT' THEN
    IF TG_TABLE_NAME='trips' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Released plan assignments are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plan_orders_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_orders FOR EACH ROW EXECUTE FUNCTION protect_plan_assignment();
--> statement-breakpoint
CREATE TRIGGER trips_guard BEFORE INSERT OR UPDATE OR DELETE ON trips FOR EACH ROW EXECUTE FUNCTION protect_plan_assignment();
--> statement-breakpoint
CREATE TRIGGER trip_stops_guard BEFORE INSERT OR UPDATE OR DELETE ON trip_stops FOR EACH ROW EXECUTE FUNCTION protect_plan_assignment();
--> statement-breakpoint
CREATE FUNCTION protect_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Plans must start as drafts' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Released plans cannot be deleted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND ((to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR NEW.status<>'COMPLETED') THEN
    RAISE EXCEPTION 'Released plans can only be completed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER plans_guard BEFORE INSERT OR UPDATE OR DELETE ON plans FOR EACH ROW EXECUTE FUNCTION protect_plan();
--> statement-breakpoint
CREATE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_guard BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
--> statement-breakpoint
CREATE FUNCTION validate_actual_quantities() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maximum integer;
BEGIN
  SELECT quantity INTO maximum FROM order_lines WHERE id=NEW.order_line_id;
  IF TG_TABLE_NAME='load_line_records' THEN
    IF NEW.loaded_quantity+NEW.damaged_quantity>maximum THEN RAISE EXCEPTION 'Loaded and damaged quantities exceed the requested quantity' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='delivery_line_records' THEN
    SELECT l.loaded_quantity INTO maximum FROM delivery_attempts a JOIN load_line_records l ON l.stop_id=a.stop_id AND l.order_line_id=NEW.order_line_id WHERE a.id=NEW.attempt_id;
    IF maximum IS NULL OR NEW.delivered_quantity+NEW.rejected_quantity>maximum THEN RAISE EXCEPTION 'Delivery quantities exceed the recorded load' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='receipt_lines' THEN
    SELECT delivered_quantity INTO maximum FROM delivery_line_records WHERE attempt_id=NEW.receipt_id AND order_line_id=NEW.order_line_id;
    IF maximum IS NULL OR NEW.accepted_quantity+NEW.missing_quantity+NEW.damaged_quantity+NEW.rejected_quantity<>maximum THEN RAISE EXCEPTION 'Receipt quantities must account for the reported delivery' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER load_line_quantities_guard BEFORE INSERT OR UPDATE ON load_line_records FOR EACH ROW EXECUTE FUNCTION validate_actual_quantities();
--> statement-breakpoint
CREATE TRIGGER delivery_line_quantities_guard BEFORE INSERT OR UPDATE ON delivery_line_records FOR EACH ROW EXECUTE FUNCTION validate_actual_quantities();
--> statement-breakpoint
CREATE TRIGGER receipt_line_quantities_guard BEFORE INSERT OR UPDATE ON receipt_lines FOR EACH ROW EXECUTE FUNCTION validate_actual_quantities();
