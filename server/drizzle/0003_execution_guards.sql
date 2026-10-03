CREATE FUNCTION protect_loaded_actuals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stop uuid; state text;
BEGIN
  stop := CASE WHEN TG_OP='DELETE' THEN OLD.stop_id ELSE NEW.stop_id END;
  SELECT m.status INTO state FROM load_manifests m JOIN trip_stops s ON s.trip_id=m.trip_id WHERE s.id=stop FOR UPDATE OF m;
  IF state='COMPLETED' THEN RAISE EXCEPTION 'Signed loading records are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.stop_id<>NEW.stop_id THEN RAISE EXCEPTION 'Loading record cannot change stop' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER load_records_guard BEFORE INSERT OR UPDATE OR DELETE ON load_records FOR EACH ROW EXECUTE FUNCTION protect_loaded_actuals();
--> statement-breakpoint
CREATE TRIGGER load_line_records_guard BEFORE INSERT OR UPDATE OR DELETE ON load_line_records FOR EACH ROW EXECUTE FUNCTION protect_loaded_actuals();
--> statement-breakpoint
CREATE FUNCTION protect_delivery_actuals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE finalized timestamptz;
BEGIN
  SELECT completed_at INTO finalized FROM delivery_attempts WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.attempt_id ELSE NEW.attempt_id END FOR UPDATE;
  IF finalized IS NOT NULL THEN RAISE EXCEPTION 'Completed delivery quantities are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.attempt_id<>NEW.attempt_id THEN RAISE EXCEPTION 'Delivery record cannot change attempt' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER delivery_line_records_guard BEFORE INSERT OR UPDATE OR DELETE ON delivery_line_records FOR EACH ROW EXECUTE FUNCTION protect_delivery_actuals();
--> statement-breakpoint
CREATE FUNCTION protect_delivery_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed delivery proof is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.stop_id,NEW.order_id,NEW.driver_id,NEW.attempt_number,NEW.arrived_at) IS DISTINCT FROM ROW(OLD.stop_id,OLD.order_id,OLD.driver_id,OLD.attempt_number,OLD.arrived_at) THEN RAISE EXCEPTION 'Delivery attempt identity is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER delivery_attempts_guard BEFORE UPDATE OR DELETE ON delivery_attempts FOR EACH ROW EXECUTE FUNCTION protect_delivery_attempt();
--> statement-breakpoint
CREATE TRIGGER receipts_guard BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION protect_audit();
--> statement-breakpoint
CREATE TRIGGER receipt_lines_guard BEFORE UPDATE OR DELETE ON receipt_lines FOR EACH ROW EXECUTE FUNCTION protect_audit();
