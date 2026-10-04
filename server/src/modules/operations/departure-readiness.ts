import { sql, type SQL } from 'drizzle-orm';

/** Shared by dispatcher reads and the locked departure command. NULL means ready. */
export function departureBlockReasonSql(tripId: string | SQL) {
  return sql`(SELECT CASE
    WHEN departure_trip.status <> 'PLANNED' THEN 'Trip is not awaiting dispatch'
    WHEN departure_plan.status <> 'RELEASED' THEN 'Release the plan before dispatch'
    WHEN departure_manifest.status IS DISTINCT FROM 'COMPLETED' THEN 'The loader must complete loading'
    WHEN departure_inspection.trip_id IS NULL OR departure_inspection.driver_id <> departure_trip.driver_id THEN 'The assigned driver must complete the pre-trip inspection'
    WHEN NOT departure_inspection.fuel_checked THEN 'The driver must confirm the fuel check'
    WHEN EXISTS (SELECT 1 FROM trip_stops s JOIN orders o ON o.id=s.order_id WHERE s.trip_id=departure_trip.id AND o.temperature_requirement='chilled')
      AND (NOT departure_inspection.chiller_checked OR departure_inspection.temperature_c IS NULL OR departure_inspection.temperature_c > 4)
      THEN 'The driver must confirm the chiller check and record a temperature at or below 4°C'
    WHEN EXISTS (SELECT 1 FROM issues x JOIN trip_stops s ON s.id=x.stop_id WHERE s.trip_id=departure_trip.id AND x.resolved_at IS NULL)
      THEN 'Resolve the load issues before dispatch'
    ELSE NULL END
    FROM trips departure_trip JOIN plans departure_plan ON departure_plan.id=departure_trip.plan_id
    LEFT JOIN load_manifests departure_manifest ON departure_manifest.trip_id=departure_trip.id
    LEFT JOIN trip_inspections departure_inspection ON departure_inspection.trip_id=departure_trip.id
    WHERE departure_trip.id=${tripId})`;
}
