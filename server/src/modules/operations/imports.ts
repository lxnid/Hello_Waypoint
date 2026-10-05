import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import * as s from '../../db/schema.js';
import { fixed } from './decimal.js';
import { WorkflowError } from './service.js';

type Row = Record<string, string>;
function csv(contents: string): Row[] {
  return parse(contents, { columns: true, skip_empty_lines: true, bom: true });
}
function temperature(value: string | undefined): 'ambient' | 'chilled' {
  if (value !== 'ambient' && value !== 'chilled')
    throw new WorkflowError('Unknown temperature requirement', 400);
  return value;
}
function whole(value: string | undefined, positive = false) {
  if (
    !value ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    (positive && Number(value) < 1)
  )
    throw new WorkflowError('Invalid integer quantity or position', 400);
  return Number(value);
}
function stamp(date: string, clock: string | undefined): Date | null {
  if (!clock) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(clock))
    throw new WorkflowError('Invalid source timestamp', 400);
  const result = new Date(`${date}T${clock}:00+05:30`);
  if (Number.isNaN(result.getTime())) throw new WorkflowError('Invalid source timestamp', 400);
  return result;
}
function dimensions(row: Row) {
  const units = whole(row.order_units, true),
    weightKg = row.order_weight_kg!,
    volumeM3 = row.order_volume_m3!;
  if (fixed(weightKg, 2) <= 0 || fixed(volumeM3, 3) <= 0)
    throw new WorkflowError('Invalid order dimensions', 400);
  return { units, weightKg, volumeM3 };
}
/** Imported orders retain supplied aggregate totals, not fabricated product lines. */
export async function importPeakScenario(
  db: Database,
  input: { ordersCsv: string; fleetCsv: string; operatingDate: string; version: string },
) {
  const rows = csv(input.ordersCsv),
    fleet = csv(input.fleetCsv);
  if (!rows.length || !fleet.length)
    throw new WorkflowError('Scenario orders and fleet are required', 400);
  const checksum = createHash('sha256')
    .update(JSON.stringify([input.ordersCsv, input.fleetCsv, input.operatingDate]))
    .digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`peak:${checksum}`},0))`);
    const [existing] = await tx
      .select()
      .from(s.importBatches)
      .where(
        sql`${s.importBatches.dataset}='PEAK_SCENARIO' AND ${s.importBatches.version}=${input.version} AND ${s.importBatches.checksum}=${checksum}`,
      );
    if (existing) return { batchId: existing.id, imported: false };
    const date = await tx
      .select()
      .from(s.operatingCalendar)
      .where(
        sql`${s.operatingCalendar.date}=${input.operatingDate}::date AND ${s.operatingCalendar.isOperating}`,
      );
    if (!date.length) throw new WorkflowError('Simulation date must be a known operating day', 400);
    const [batch] = await tx
      .insert(s.importBatches)
      .values({ dataset: 'PEAK_SCENARIO', version: input.version, checksum, result: 'IMPORTED' })
      .returning();
    const contexts = new Map<string, string>();
    for (const scenario of new Set(rows.map((r) => r.scenario!))) {
      if (!scenario) throw new WorkflowError('Missing scenario identifier', 400);
      const [context] = await tx
        .insert(s.planningContexts)
        .values({
          kind: 'SCENARIO',
          operatingDate: input.operatingDate,
          batchId: batch!.id,
          scenario,
        })
        .returning();
      contexts.set(scenario, context!.id);
    }
    for (const [position, row] of rows.entries()) {
      if (!row.order_ref) throw new WorkflowError('Missing source order reference', 400);
      const [reference] = await tx.execute<{
        brand_id: string;
        district_id: string;
        depot_id: string;
      }>(
        sql`SELECT o.brand_id,o.district_id,d.depot_id FROM outlets o JOIN districts d ON d.id=o.district_id WHERE o.id=${row.outlet_id}`,
      );
      if (
        !reference ||
        reference.brand_id !== row.brand ||
        reference.district_id !== row.district ||
        reference.depot_id !== row.depot
      )
        throw new WorkflowError('Scenario outlet attributes do not match reference data', 400);
      const [order] = await tx
        .insert(s.orders)
        .values({
          publicReference: `IMPORT-${batch!.id}-${position}`,
          outletId: row.outlet_id!,
          format: 'AGGREGATE',
          temperatureRequirement: temperature(row.temp_requirement),
          requestedDate: input.operatingDate,
          eligibleDate: input.operatingDate,
        })
        .returning();
      await tx.insert(s.orderAggregates).values({ orderId: order!.id, ...dimensions(row) });
      if (!['0', '1'].includes(row.deferred_yesterday!))
        throw new WorkflowError('Invalid deferral flag', 400);
      await tx.insert(s.orderSources).values({
        orderId: order!.id,
        batchId: batch!.id,
        scenario: row.scenario!,
        sourceReference: row.order_ref!,
        rowPosition: position,
        deferredYesterday: row.deferred_yesterday === '1',
        daysSinceLastServed: whole(row.days_since_last_served),
        sourceContext: row,
      });
      await tx
        .update(s.orders)
        .set({ status: 'SUBMITTED', submittedAt: new Date() })
        .where(eq(s.orders.id, order!.id));
    }
    for (const row of fleet) {
      const contextId = contexts.get(row.scenario!);
      if (!contextId || !['available', 'in_workshop'].includes(row.status!))
        throw new WorkflowError('Invalid fleet scenario or status', 400);
      await tx
        .insert(s.vehicleAvailability)
        .values({ contextId, vehicleId: row.vehicle_id!, status: row.status! });
    }
    await tx.insert(s.auditEvents).values({
      action: 'SCENARIO_IMPORTED',
      entityType: 'import_batch',
      entityId: batch!.id,
      details: { rowCount: rows.length, simulationDate: input.operatingDate },
    });
    return { batchId: batch!.id, imported: true };
  });
}
/** Join orders to exactly one route leg before persisting observations. */
export async function importHistory(
  db: Database,
  input: { ordersCsv: string; legsCsv: string; dataset: string; version: string },
) {
  const rows = csv(input.ordersCsv),
    legs = csv(input.legsCsv);
  const checksum = createHash('sha256')
    .update(JSON.stringify([input.ordersCsv, input.legsCsv]))
    .digest('hex');
  const key = (r: Row, order = false) =>
    JSON.stringify([r.route_id, order ? r.dispatch_date : r.date, order ? r.seq_in_route : r.seq]);
  const legMap = new Map<string, Row>();
  for (const leg of legs) {
    const k = key(leg);
    if (legMap.has(k)) throw new WorkflowError('Duplicate route leg key', 400);
    legMap.set(k, leg);
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`history:${input.dataset}:${checksum}`},0))`,
    );
    const [existing] = await tx
      .select()
      .from(s.importBatches)
      .where(
        sql`${s.importBatches.dataset}=${input.dataset} AND ${s.importBatches.version}=${input.version} AND ${s.importBatches.checksum}=${checksum}`,
      );
    if (existing) return { batchId: existing.id, imported: false };
    const [batch] = await tx
      .insert(s.importBatches)
      .values({ dataset: input.dataset, version: input.version, checksum, result: 'IMPORTED' })
      .returning();
    const routes = new Map<string, { id: string; signature: string }>(),
      seen = new Set<string>(),
      used = new Set<string>();
    for (const [position, row] of rows.entries()) {
      if (!row.delivery_id || seen.has(row.delivery_id))
        throw new WorkflowError('Missing or duplicate delivery identifier', 400);
      seen.add(row.delivery_id);
      if (!row.route_id) {
        if (row.dispatch_date || row.dispatch_status !== 'not_run')
          throw new WorkflowError('Unrun order has dispatch attributes', 400);
        await tx.insert(s.historicalUnrunOrders).values({
          batchId: batch!.id,
          sourceDeliveryId: row.delivery_id,
          rowPosition: position,
          outletId: row.outlet_id!,
          requestedDate: row.order_date!,
          temperatureRequirement: temperature(row.temp_requirement),
          ...dimensions(row),
        });
        continue;
      }
      const k = key(row, true),
        leg = legMap.get(k);
      if (
        !leg ||
        used.has(k) ||
        leg.to_outlet !== row.outlet_id ||
        leg.brand !== row.brand ||
        leg.district !== row.district ||
        leg.depot !== row.depot ||
        leg.vehicle_id !== row.vehicle_id ||
        leg.vehicle_type !== row.vehicle_type ||
        leg.vehicle_temp !== row.vehicle_temp ||
        leg.planned_arrival_time !== row.planned_arrival_time
      )
        throw new WorkflowError('Order does not match exactly one route leg', 400);
      used.add(k);
      const routeKey = JSON.stringify([row.route_id, row.dispatch_date]);
      const signature = JSON.stringify([row.brand, row.district, row.vehicle_id, row.depot]);
      let route = routes.get(routeKey);
      if (route && route.signature !== signature)
        throw new WorkflowError('Inconsistent route attributes', 400);
      if (!route) {
        const [created] = await tx
          .insert(s.historicalRoutes)
          .values({
            batchId: batch!.id,
            sourceRouteId: row.route_id,
            date: row.dispatch_date!,
            vehicleId: row.vehicle_id!,
            brandId: row.brand!,
            districtId: row.district!,
          })
          .returning();
        route = { id: created!.id, signature };
        routes.set(routeKey, route);
      }
      await tx.insert(s.historicalStops).values({
        routeId: route.id,
        sequence: whole(row.seq_in_route),
        sourceDeliveryId: row.delivery_id,
        sourceLegId: leg.leg_id!,
        rowPosition: position,
        outletId: row.outlet_id!,
        requestedDate: row.order_date!,
        dispatchStatus: row.dispatch_status || 'attempted',
        temperatureRequirement: temperature(row.temp_requirement),
        ...dimensions(row),
        windowOpenAt: stamp(row.dispatch_date!, row.window_open_time)!,
        windowCloseAt: stamp(row.dispatch_date!, row.window_close_time)!,
        plannedDepartAt: stamp(leg.date!, leg.planned_depart_time)!,
        plannedArrivalAt: stamp(leg.date!, leg.planned_arrival_time)!,
        plannedTravelMinutes: leg.planned_travel_duration_min!,
        distanceKm: leg.distance_km!,
        actualDepartAt: stamp(leg.date!, leg.actual_depart_time),
        arrivedAt: stamp(leg.date!, leg.arrival_time),
        completedAt: stamp(leg.date!, leg.leave_outlet_time),
        actualTravelMinutes: leg.actual_travel_duration_min || null,
      });
    }
    if (used.size !== legs.length)
      throw new WorkflowError('Unmatched route legs in the import', 400);
    await tx.insert(s.auditEvents).values({
      action: 'HISTORY_IMPORTED',
      entityType: 'import_batch',
      entityId: batch!.id,
      details: { rowCount: rows.length },
    });
    return { batchId: batch!.id, imported: true };
  });
}
function encodeCsv(columns: string[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return `${columns.join(',')}\n${rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n')}\n`;
}
export async function exportAllocation(db: Database, contextId: string) {
  const pending = await db.execute(
    sql`SELECT 1 FROM plans WHERE context_id=${contextId} AND status='DRAFT' LIMIT 1`,
  );
  if (pending.length) throw new WorkflowError('Release depot plans before exporting');
  const rows = await db.execute(
    sql`SELECT src.scenario,src.source_reference AS order_ref,o.outlet_id,CASE po.decision WHEN 'ALLOCATED' THEN 'served' WHEN 'DEFERRED' THEN 'deferred' END AS decision,t.vehicle_id,t.trip_number AS trip_id FROM planning_contexts c JOIN order_sources src ON src.batch_id=c.batch_id AND src.scenario=c.scenario JOIN orders o ON o.id=src.order_id LEFT JOIN plans p ON p.context_id=c.id AND p.depot_id=(SELECT d.depot_id FROM outlets ot JOIN districts d ON d.id=ot.district_id WHERE ot.id=o.outlet_id) LEFT JOIN plan_orders po ON po.plan_id=p.id AND po.order_id=o.id LEFT JOIN trip_stops st ON st.plan_order_id=po.id LEFT JOIN trips t ON t.id=st.trip_id WHERE c.id=${contextId} ORDER BY src.row_position`,
  );
  if (!rows.length || rows.some((r) => !r.decision))
    throw new WorkflowError('Every source order requires a released decision');
  return encodeCsv(
    ['scenario', 'order_ref', 'outlet_id', 'decision', 'vehicle_id', 'trip_id'],
    rows,
  );
}
export async function exportStopPredictions(db: Database, runId: string) {
  const rows = await db.execute(
    sql`SELECT h.source_delivery_id AS delivery_id,p.service_minutes AS pred_service_min,p.late_probability AS pred_late_prob FROM prediction_runs r JOIN historical_routes hr ON hr.batch_id=r.batch_id JOIN historical_stops h ON h.route_id=hr.id LEFT JOIN stop_predictions p ON p.historical_stop_id=h.id AND p.run_id=r.id WHERE r.id=${runId} ORDER BY h.row_position`,
  );
  if (!rows.length || rows.some((r) => r.pred_service_min === null || r.pred_late_prob === null))
    throw new WorkflowError('Missing source predictions');
  return encodeCsv(['delivery_id', 'pred_service_min', 'pred_late_prob'], rows);
}
export async function exportWeeklyForecasts(db: Database, runId: string) {
  const rows = await db.execute(
    sql`SELECT source_row_id AS row_id,total_volume_m3 AS pred_total_volume_m3,chilled_volume_m3 AS pred_chilled_volume_m3 FROM weekly_forecasts WHERE run_id=${runId} ORDER BY row_position`,
  );
  if (!rows.length || rows.some((r) => !r.row_id))
    throw new WorkflowError('Forecast export requires source row identifiers');
  return encodeCsv(['row_id', 'pred_total_volume_m3', 'pred_chilled_volume_m3'], rows);
}
