import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import type { Transaction } from './service.js';
import { requireActor, WorkflowError } from './service.js';

export type PriorityContext = {
  id: string;
  kind: string;
  operating_date: string;
  batch_id: string | null;
  scenario: string | null;
};
export type OrderPriority = {
  weightKg: string | null;
  volumeM3: string | null;
  orderId: string;
  publicReference: string;
  outletId: string;
  brand: string;
  district: string;
  temperatureRequirement: 'ambient' | 'chilled';
  source: 'LIVE' | 'SCENARIO';
  asOfDate: string;
  previousOperatingDate: string | null;
  lastServedDate: string | null;
  daysSinceLastServed: number | null;
  temperatureLastServedDate: string | null;
  temperatureDaysSinceLastServed: number | null;
  deferredPreviousRun: boolean;
  outletDeferredPreviousRun: boolean;
  requiresOverride: boolean;
  historyStatus: 'KNOWN' | 'UNKNOWN';
};
/** Shared by release and the queue: one batched query, never a history query per order. */
export async function calculateOrderPriorities(
  db: Database | Transaction,
  context: PriorityContext,
  depotId: 'Peliyagoda' | 'Kandy',
  planId?: string,
): Promise<OrderPriority[]> {
  const rows = await db.execute<OrderPriority>(sql`
    WITH targets AS MATERIALIZED (
      SELECT o.id,o.public_reference,o.outlet_id,o.temperature_requirement,ot.brand_id,ot.district_id,
        src.deferred_yesterday,src.days_since_last_served,
        coalesce(agg.weight_kg,lines.weight)::text AS weight,coalesce(agg.volume_m3,lines.volume)::text AS volume
      FROM orders o JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id
      LEFT JOIN order_sources src ON src.order_id=o.id
      LEFT JOIN order_aggregates agg ON agg.order_id=o.id
      LEFT JOIN LATERAL (SELECT sum(quantity*unit_weight_kg) AS weight,sum(quantity*unit_volume_m3) AS volume FROM order_lines WHERE order_id=o.id) lines ON true
      WHERE d.depot_id=${depotId}
        AND (${planId ?? null}::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM plan_orders po WHERE po.plan_id=${planId ?? null}::uuid AND po.order_id=o.id)
          OR ${planId ?? null}::uuid IS NULL AND (
            o.status='SUBMITTED' AND o.eligible_date<=${context.operating_date}::date
            OR EXISTS (SELECT 1 FROM plan_orders po JOIN plans p ON p.id=po.plan_id WHERE po.order_id=o.id AND p.context_id=${context.id})))
        AND ((${context.kind}='LIVE' AND (src.scenario IS NULL OR src.scenario=''))
          OR (${context.kind}='SCENARIO' AND src.batch_id=${context.batch_id}::uuid AND src.scenario=${context.scenario}))
    ), previous_run AS (
      SELECT max(date) AS date FROM operating_calendar WHERE is_operating AND date<${context.operating_date}::date
    ), service_events AS MATERIALIZED (
      SELECT o.outlet_id,o.temperature_requirement,(a.completed_at AT TIME ZONE 'Asia/Colombo')::date AS service_date
      FROM receipts r JOIN delivery_attempts a ON a.id=r.attempt_id JOIN orders o ON o.id=a.order_id
      JOIN trip_stops s ON s.id=a.stop_id JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id
      JOIN planning_contexts c ON c.id=p.context_id
      WHERE ${context.kind}='LIVE' AND c.kind='LIVE' AND r.outcome IN ('DELIVERED','PARTIAL')
        AND a.outcome IN ('DELIVERED','PARTIAL') AND (a.completed_at AT TIME ZONE 'Asia/Colombo')::date<${context.operating_date}::date
        AND o.outlet_id IN (SELECT outlet_id FROM targets)
        AND (r.accepted_units>0 OR EXISTS (SELECT 1 FROM receipt_lines l WHERE l.receipt_id=r.attempt_id AND l.accepted_quantity>0))
    ), outlet_service AS (
      SELECT outlet_id,max(service_date) AS last_date FROM service_events GROUP BY outlet_id
    ), temperature_service AS (
      SELECT outlet_id,temperature_requirement,max(service_date) AS last_date FROM service_events GROUP BY outlet_id,temperature_requirement
    ), prior_deferrals AS MATERIALIZED (
      SELECT DISTINCT o.outlet_id,o.temperature_requirement FROM plan_orders po JOIN orders o ON o.id=po.order_id
      JOIN plans p ON p.id=po.plan_id JOIN planning_contexts c ON c.id=p.context_id
      WHERE ${context.kind}='LIVE' AND c.kind='LIVE' AND c.operating_date=(SELECT date FROM previous_run)
        AND p.status<>'DRAFT' AND po.decision='DEFERRED' AND o.outlet_id IN (SELECT outlet_id FROM targets)
    ), metrics AS (
      SELECT target.*,prev.date AS previous_date,os.last_date,ts.last_date AS temperature_last_date,
        CASE WHEN ${context.kind}='SCENARIO' THEN target.days_since_last_served ELSE ${context.operating_date}::date-os.last_date END AS elapsed_days,
        CASE WHEN ${context.kind}='SCENARIO' THEN NULL::integer ELSE ${context.operating_date}::date-ts.last_date END AS temperature_elapsed_days,
        CASE WHEN ${context.kind}='SCENARIO' THEN coalesce(target.deferred_yesterday,false) ELSE EXISTS (SELECT 1 FROM prior_deferrals pd WHERE pd.outlet_id=target.outlet_id AND pd.temperature_requirement=target.temperature_requirement) END AS previous_deferral,
        CASE WHEN ${context.kind}='SCENARIO' THEN coalesce(target.deferred_yesterday,false) ELSE EXISTS (SELECT 1 FROM prior_deferrals pd WHERE pd.outlet_id=target.outlet_id) END AS outlet_previous_deferral
      FROM targets target CROSS JOIN previous_run prev LEFT JOIN outlet_service os ON os.outlet_id=target.outlet_id
      LEFT JOIN temperature_service ts ON ts.outlet_id=target.outlet_id AND ts.temperature_requirement=target.temperature_requirement
    )
    SELECT id AS "orderId",public_reference AS "publicReference",outlet_id AS "outletId",brand_id AS brand,district_id AS district,
      weight AS "weightKg",volume AS "volumeM3",
      temperature_requirement AS "temperatureRequirement",${context.kind}::text AS source,${context.operating_date}::text AS "asOfDate",
      previous_date::text AS "previousOperatingDate",last_date::text AS "lastServedDate",elapsed_days AS "daysSinceLastServed",
      temperature_last_date::text AS "temperatureLastServedDate",temperature_elapsed_days AS "temperatureDaysSinceLastServed",
      previous_deferral AS "deferredPreviousRun",outlet_previous_deferral AS "outletDeferredPreviousRun",
      (previous_deferral OR coalesce(elapsed_days>=2,false) OR coalesce(temperature_elapsed_days>=2,false)) AS "requiresOverride",
      CASE WHEN elapsed_days IS NULL THEN 'UNKNOWN' ELSE 'KNOWN' END AS "historyStatus"
    FROM metrics ORDER BY district_id,brand_id,outlet_id,id`);
  return [...rows];
}
export async function getPlanningPriorities(
  db: Database,
  contextId: string,
  depotId: 'Peliyagoda' | 'Kandy',
  actorId: string,
) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [context] = await tx.execute<PriorityContext>(
      sql`SELECT id,kind,operating_date::text,batch_id,scenario FROM planning_contexts WHERE id=${contextId}`,
    );
    if (!context) throw new WorkflowError('Planning context not found', 404);
    return calculateOrderPriorities(tx, context, depotId);
  });
}
/** Serializes live receipt history with release decisions for affected outlets. */
export async function lockLiveOutletHistory(tx: Transaction, outletIds: string[]) {
  for (const outletId of [...new Set(outletIds)].sort())
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`waypoint-live-service:${outletId}`},0))`,
    );
}
