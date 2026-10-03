-- Custom SQL migration file, put your code below! ---- Evidence and closure are immutable independently of route handlers.
CREATE TRIGGER trip_closures_guard BEFORE UPDATE OR DELETE ON trip_closures FOR EACH ROW EXECUTE FUNCTION protect_audit();
--> statement-breakpoint
CREATE TRIGGER attachments_guard BEFORE UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION protect_audit();
--> statement-breakpoint
CREATE FUNCTION protect_terminal_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status::text IN ('COMPLETED','CLOSED_EXCEPTION','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Closed order is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_terminal_guard BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_terminal_order();
--> statement-breakpoint
CREATE FUNCTION guard_inspection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid; trip_state text;
BEGIN
 SELECT driver_id,status::text INTO owner,trip_state FROM trips WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.trip_id ELSE NEW.trip_id END FOR UPDATE;
 IF trip_state<>'PLANNED' THEN RAISE EXCEPTION 'Inspection is immutable after departure' USING ERRCODE='23514'; END IF;
 IF TG_OP<>'DELETE' AND NEW.driver_id<>owner THEN RAISE EXCEPTION 'Inspection must belong to assigned driver' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER trip_inspections_guard BEFORE INSERT OR UPDATE OR DELETE ON trip_inspections FOR EACH ROW EXECUTE FUNCTION guard_inspection();
--> statement-breakpoint
CREATE FUNCTION guard_trip_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NOT ((OLD.status::text='PLANNED' AND NEW.status::text='DISPATCHED') OR (OLD.status::text='DISPATCHED' AND NEW.status::text='AWAITING_RETURN') OR (OLD.status::text='AWAITING_RETURN' AND NEW.status::text='COMPLETED')) THEN
  RAISE EXCEPTION 'Invalid trip state transition' USING ERRCODE='23514';
 END IF;
 IF NEW.status::text='COMPLETED' AND NOT EXISTS(SELECT 1 FROM trip_closures WHERE trip_id=NEW.id) THEN RAISE EXCEPTION 'Trip closure evidence required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER trips_transition_guard BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION guard_trip_transition();
