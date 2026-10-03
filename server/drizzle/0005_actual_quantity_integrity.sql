ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_aggregate_values_check" CHECK (num_nonnulls("delivery_attempts"."delivered_units","delivery_attempts"."delivered_weight_kg","delivery_attempts"."delivered_volume_m3") = 0 OR (num_nonnulls("delivery_attempts"."delivered_units","delivery_attempts"."delivered_weight_kg","delivery_attempts"."delivered_volume_m3") = 3 AND "delivery_attempts"."delivered_units" >= 0 AND "delivery_attempts"."delivered_weight_kg" >= 0 AND "delivery_attempts"."delivered_volume_m3" >= 0));--> statement-breakpoint
CREATE FUNCTION validate_aggregate_actuals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE format order_format; expected record; stop uuid;
BEGIN
  IF TG_TABLE_NAME='load_records' THEN
    SELECT o.format INTO format FROM orders o JOIN trip_stops s ON s.order_id=o.id WHERE s.id=NEW.stop_id;
    IF format='ITEMIZED' AND NEW.loaded_units IS NOT NULL THEN RAISE EXCEPTION 'Itemized load uses line quantities' USING ERRCODE='23514'; END IF;
    IF format='AGGREGATE' THEN
      SELECT a.* INTO expected FROM order_aggregates a JOIN trip_stops s ON s.order_id=a.order_id WHERE s.id=NEW.stop_id;
      IF NEW.loaded_units IS NULL OR NEW.loaded_units>expected.units OR NEW.loaded_weight_kg>expected.weight_kg OR NEW.loaded_volume_m3>expected.volume_m3 THEN RAISE EXCEPTION 'Aggregate load exceeds requested totals' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='delivery_attempts' THEN
    SELECT o.format INTO format FROM orders o WHERE o.id=NEW.order_id;
    IF format='ITEMIZED' AND NEW.delivered_units IS NOT NULL THEN RAISE EXCEPTION 'Itemized delivery uses line quantities' USING ERRCODE='23514'; END IF;
    IF format='AGGREGATE' AND NEW.completed_at IS NOT NULL THEN
      SELECT * INTO expected FROM load_records WHERE stop_id=NEW.stop_id;
      IF NEW.delivered_units IS NULL OR expected.loaded_units IS NULL OR NEW.delivered_units>expected.loaded_units OR NEW.delivered_weight_kg>expected.loaded_weight_kg OR NEW.delivered_volume_m3>expected.loaded_volume_m3 THEN RAISE EXCEPTION 'Aggregate delivery exceeds the recorded load' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='receipts' THEN
    SELECT * INTO expected FROM delivery_attempts WHERE id=NEW.attempt_id;
    IF expected.completed_at IS NULL THEN RAISE EXCEPTION 'Receipt requires completed delivery' USING ERRCODE='23514'; END IF;
    SELECT o.format INTO format FROM orders o WHERE o.id=NEW.order_id;
    IF format='ITEMIZED' AND NEW.accepted_units IS NOT NULL THEN RAISE EXCEPTION 'Itemized receipt uses line quantities' USING ERRCODE='23514'; END IF;
    IF format='AGGREGATE' AND (NEW.accepted_units IS NULL OR NEW.accepted_units+NEW.missing_units+NEW.damaged_units+NEW.rejected_units<>expected.delivered_units) THEN RAISE EXCEPTION 'Aggregate receipt must account for the delivery' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER load_records_aggregate_guard BEFORE INSERT OR UPDATE ON load_records FOR EACH ROW EXECUTE FUNCTION validate_aggregate_actuals();
--> statement-breakpoint
CREATE TRIGGER delivery_attempts_aggregate_guard BEFORE INSERT OR UPDATE ON delivery_attempts FOR EACH ROW EXECUTE FUNCTION validate_aggregate_actuals();
--> statement-breakpoint
CREATE TRIGGER receipts_aggregate_guard BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION validate_aggregate_actuals();
