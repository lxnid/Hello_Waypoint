import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { auditEvents, loadManifests, planOrders, plans } from '../../db/schema.js';
import { calculateOrderPriorities, lockLiveOutletHistory } from './priority.js';
import { fixed } from './decimal.js';
import { editPlan, requireActor, type Transaction, WorkflowError } from './service.js';

/** Lock, revalidate, reserve fuel and release together: no visible half-released plan. */
export async function releasePlan(
  db: Database | Transaction,
  planId: string,
  version: number,
  actorId: string,
) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).for('update');
    if (!plan || plan.status !== 'DRAFT' || plan.version !== version)
      throw new WorkflowError('Plan changed or is no longer a draft');
    const [context] = await tx.execute<{
      id: string;
      kind: string;
      operating_date: string;
      batch_id: string | null;
      scenario: string | null;
    }>(
      sql`SELECT id,kind,operating_date::text,batch_id,scenario FROM planning_contexts WHERE id=${plan.contextId}`,
    );
    if (!context) throw new WorkflowError('Missing planning context');
    const calendar = await tx.execute(
      sql`SELECT 1 FROM operating_calendar WHERE date=${context.operating_date}::date AND is_operating`,
    );
    if (!calendar.length) throw new WorkflowError('Plan date is not an operating day');
    if (context.kind === 'LIVE') {
      const affected = await tx.execute<{ outlet_id: string }>(
        sql`SELECT DISTINCT o.outlet_id FROM orders o JOIN plan_orders po ON po.order_id=o.id WHERE po.plan_id=${planId}`,
      );
      await lockLiveOutletHistory(
        tx,
        affected.map((row) => row.outlet_id),
      );
    }
    // All releases lock orders and vehicles in the same order, across depots and plans.
    await tx.execute(
      sql`SELECT o.id FROM orders o JOIN plan_orders po ON po.order_id=o.id WHERE po.plan_id=${planId} ORDER BY o.id FOR UPDATE OF o`,
    );
    await tx.execute(
      sql`SELECT v.id FROM vehicles v WHERE v.id IN (SELECT vehicle_id FROM trips WHERE plan_id=${planId}) ORDER BY v.id FOR UPDATE`,
    );
    const invalidDecision = await tx.execute(sql`
      SELECT po.id FROM plan_orders po JOIN orders o ON o.id=po.order_id JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id
      LEFT JOIN trip_stops s ON s.plan_order_id=po.id LEFT JOIN order_sources os ON os.order_id=o.id
      WHERE po.plan_id=${planId} AND (po.decision='UNASSIGNED' OR o.status<>'SUBMITTED' OR o.eligible_date>${context.operating_date}::date OR d.depot_id<>${plan.depotId}
        OR (po.decision='ALLOCATED' AND s.id IS NULL) OR (po.decision='DEFERRED' AND (s.id IS NOT NULL OR po.next_eligible_date<=${context.operating_date}::date))
        OR (${context.kind}='LIVE' AND os.scenario IS NOT NULL AND os.scenario<>'')
        OR (${context.kind}='SCENARIO' AND (os.batch_id IS DISTINCT FROM ${context.batch_id}::uuid OR os.scenario IS DISTINCT FROM ${context.scenario}))) LIMIT 1`);
    if (invalidDecision.length) throw new WorkflowError('Unresolved or invalid planning decision');
    const omitted =
      await tx.execute(sql`SELECT o.id FROM orders o JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id LEFT JOIN order_sources os ON os.order_id=o.id
      WHERE o.status='SUBMITTED' AND o.eligible_date<=${context.operating_date}::date AND d.depot_id=${plan.depotId}
      AND ((${context.kind}='LIVE' AND (os.scenario IS NULL OR os.scenario='')) OR (${context.kind}='SCENARIO' AND os.batch_id=${context.batch_id}::uuid AND os.scenario=${context.scenario}))
      AND NOT EXISTS (SELECT 1 FROM plan_orders po WHERE po.plan_id=${planId} AND po.order_id=o.id)
      AND NOT EXISTS (SELECT 1 FROM plan_orders po JOIN plans p ON p.id=po.plan_id JOIN trip_stops s ON s.plan_order_id=po.id WHERE po.order_id=o.id AND p.status<>'DRAFT') LIMIT 1`);
    if (omitted.length)
      throw new WorkflowError('Every eligible order requires allocation or an explicit deferral');
    const competing =
      await tx.execute(sql`SELECT 1 FROM plan_orders mine JOIN plan_orders other ON other.order_id=mine.order_id JOIN plans p ON p.id=other.plan_id JOIN trip_stops s ON s.plan_order_id=other.id
      WHERE mine.plan_id=${planId} AND other.plan_id<>${planId} AND p.status<>'DRAFT' LIMIT 1`);
    if (competing.length)
      throw new WorkflowError('An order is already committed to another released plan');
    const invalidNextRun = await tx.execute(
      sql`SELECT 1 FROM plan_orders po WHERE po.plan_id=${planId} AND po.decision='DEFERRED' AND NOT EXISTS (SELECT 1 FROM operating_calendar c WHERE c.date=po.next_eligible_date AND c.is_operating) LIMIT 1`,
    );
    if (invalidNextRun.length) throw new WorkflowError('Deferred date must be an operating day');
    const priorities = await calculateOrderPriorities(tx, context, plan.depotId, planId);
    const decisions = await tx.select().from(planOrders).where(eq(planOrders.planId, planId));
    const decisionsByOrder = new Map(decisions.map((decision) => [decision.orderId, decision]));
    for (const priority of priorities) {
      const decision = decisionsByOrder.get(priority.orderId)!;
      if (decision.decision === 'DEFERRED' && priority.requiresOverride) {
        if (
          !decision.overrideAcknowledged ||
          !decision.overrideReason?.trim() ||
          !decision.overrideBy ||
          !decision.overrideAt
        )
          throw new WorkflowError(
            `Protected order ${priority.publicReference} requires an explicit deferral override`,
          );
        const approver = await tx.execute(
          sql`SELECT 1 FROM users WHERE id=${decision.overrideBy} AND role='DISPATCHER' AND is_active`,
        );
        if (!approver.length)
          throw new WorkflowError('Deferral override requires an active dispatcher');
      }
      await tx
        .update(planOrders)
        .set({
          prioritySource: priority.source,
          priorityAsOfDate: priority.asOfDate,
          priorityEvaluatedAt: new Date(),
          lastServedDate: priority.lastServedDate,
          daysSinceLastServed: priority.daysSinceLastServed,
          temperatureLastServedDate: priority.temperatureLastServedDate,
          temperatureDaysSinceLastServed: priority.temperatureDaysSinceLastServed,
          previousOperatingDate: priority.previousOperatingDate,
          deferredPreviousRun: priority.deferredPreviousRun,
          requiresOverride: priority.requiresOverride,
        })
        .where(eq(planOrders.id, decision.id));
    }
    const invalidSequence = await tx.execute(sql`
      WITH legs AS (SELECT s.*,row_number() OVER(PARTITION BY s.trip_id ORDER BY s.sequence)-1 AS expected_sequence,
        lag(s.planned_arrival_at+s.service_allowance_minutes*interval '1 minute') OVER(PARTITION BY s.trip_id ORDER BY s.sequence) AS previous_completion
        FROM trip_stops s WHERE s.plan_id=${planId})
      SELECT 1 FROM legs WHERE sequence<>expected_sequence OR planned_arrival_at<>planned_depart_at+planned_travel_minutes*interval '1 minute'
        OR (previous_completion IS NOT NULL AND planned_depart_at<previous_completion)
        OR planned_arrival_at+service_allowance_minutes*interval '1 minute'>window_close_at LIMIT 1`);
    if (invalidSequence.length)
      throw new WorkflowError('Invalid stop sequence or planned chronology');
    const data = await tx.execute<{
      id: string;
      vehicle_id: string;
      brand_id: string;
      valid: boolean;
      stop_count: number;
      minutes: string;
      weight: string;
      volume: string;
      capacity_weight: string;
      capacity_volume: string;
      km_per_l: string;
      quota: string;
      distance: string;
    }>(sql`
      WITH totals AS (
        SELECT o.id, coalesce(a.weight_kg, l.weight) AS weight, coalesce(a.volume_m3,l.volume) AS volume FROM orders o
        LEFT JOIN order_aggregates a ON a.order_id=o.id
        LEFT JOIN LATERAL (SELECT sum(quantity*unit_weight_kg) AS weight,sum(quantity*unit_volume_m3) AS volume FROM order_lines WHERE order_id=o.id) l ON true
      )
      SELECT t.id,t.vehicle_id,t.brand_id,count(s.id)::int AS stop_count,
        (dt.depot_to_district_freeflow_minutes+greatest(count(s.id)-1,0)*dt.inter_stop_freeflow_minutes+coalesce(sum(sa.minutes),0))::text AS minutes,
        coalesce(sum(totals.weight),0)::text AS weight,coalesce(sum(totals.volume),0)::text AS volume,
        v.weight_cap_kg::text AS capacity_weight,v.volume_cap_m3::text AS capacity_volume,v.km_per_l::text,v.weekly_fuel_quota_l::text AS quota,
        (2*dt.depot_to_district_km+greatest(count(s.id)-1,0)*dt.inter_stop_km)::text AS distance,
        coalesce(bool_and(coalesce(v.is_active AND v.depot_id=${plan.depotId} AND d.depot_id=${plan.depotId} AND ot.brand_id=t.brand_id AND ot.district_id=t.district_id
          AND u.role='DRIVER' AND u.is_active AND u.depot_id=${plan.depotId} AND av.status='available' AND po.decision='ALLOCATED'
          AND (o.temperature_requirement='ambient' OR v.temp='reefer') AND (ot.parking_constraint<>'van_only' OR v.type='van')
          AND s.dock_type=ot.dock_type AND s.parking_constraint=ot.parking_constraint
          AND s.service_allowance_minutes=sa.minutes AND totals.weight IS NOT NULL AND totals.volume IS NOT NULL
          AND s.planned_arrival_at BETWEEN s.window_open_at AND s.window_close_at
          AND (s.window_open_at AT TIME ZONE 'Asia/Colombo')::date=${context.operating_date}::date
          AND (s.window_close_at AT TIME ZONE 'Asia/Colombo')::date=${context.operating_date}::date
          AND (s.window_open_at AT TIME ZONE 'Asia/Colombo')::time>=ot.window_open_time
          AND (s.window_close_at AT TIME ZONE 'Asia/Colombo')::time<=ot.window_close_time
          AND (ot.mall_open_time IS NULL OR (s.planned_arrival_at AT TIME ZONE 'Asia/Colombo')::time BETWEEN ot.mall_open_time AND ot.mall_close_time)
          AND (t.brand_id<>'Fresh' OR (s.planned_arrival_at AT TIME ZONE 'Asia/Colombo')::time<='08:00'::time), false)),false) AS valid
      FROM trips t JOIN vehicles v ON v.id=t.vehicle_id JOIN users u ON u.id=t.driver_id
      LEFT JOIN vehicle_availability av ON av.vehicle_id=v.id AND av.context_id=${plan.contextId}
      LEFT JOIN district_travel dt ON dt.district_id=t.district_id
      LEFT JOIN trip_stops s ON s.trip_id=t.id LEFT JOIN plan_orders po ON po.id=s.plan_order_id LEFT JOIN orders o ON o.id=s.order_id
      LEFT JOIN outlets ot ON ot.id=o.outlet_id LEFT JOIN districts d ON d.id=ot.district_id LEFT JOIN totals ON totals.id=o.id
      LEFT JOIN service_allowances sa ON sa.brand_id=t.brand_id AND sa.dock_type=ot.dock_type
      WHERE t.plan_id=${planId} GROUP BY t.id,v.id,dt.district_id ORDER BY t.vehicle_id,t.trip_number`);
    for (const trip of data) {
      if (!trip.valid || !trip.stop_count || !trip.minutes || !trip.distance)
        throw new WorkflowError(
          'Trip violates brand, district, depot, vehicle, driver, access, availability or window rules',
        );
      if (
        fixed(trip.weight, 2) > fixed(trip.capacity_weight, 2) ||
        fixed(trip.volume, 3) > fixed(trip.capacity_volume, 3)
      )
        throw new WorkflowError('Trip exceeds weight or volume capacity');
    }
    const budgets = validateDailyBudgets(data);
    // Released plans in this context also consume the same vehicle's daily budgets.
    const otherTrips = await tx.execute(
      sql`SELECT 1 FROM trips t JOIN plans p ON p.id=t.plan_id WHERE p.context_id=${plan.contextId} AND p.id<>${planId} AND p.status<>'DRAFT' AND t.vehicle_id IN (SELECT vehicle_id FROM trips WHERE plan_id=${planId}) LIMIT 1`,
    );
    if (otherTrips.length)
      throw new WorkflowError('Vehicle already has released work in another depot plan');
    const namespace =
      context.kind === 'LIVE' ? 'LIVE' : `SCENARIO:${context.batch_id}:${context.scenario}`;
    for (const vehicleId of [...budgets.keys()].sort()) {
      const trip = data.find((t) => t.vehicle_id === vehicleId)!;
      await tx.execute(
        sql`INSERT INTO vehicle_week_budgets(namespace,vehicle_id,week_start,quota_l) VALUES (${namespace},${vehicleId},date_trunc('week',${context.operating_date}::date)::date,${trip.quota}::numeric) ON CONFLICT DO NOTHING`,
      );
      const [budget] = await tx.execute<{ id: string }>(
        sql`SELECT id FROM vehicle_week_budgets WHERE namespace=${namespace} AND vehicle_id=${vehicleId} AND week_start=date_trunc('week',${context.operating_date}::date)::date FOR UPDATE`,
      );
      for (const assigned of data.filter((t) => t.vehicle_id === vehicleId)) {
        await tx.execute(
          sql`INSERT INTO trip_fuel_reservations(trip_id,budget_id,distance_km,estimated_fuel_l) VALUES (${assigned.id},${budget!.id},${assigned.distance}::numeric,ceil(${assigned.distance}::numeric/${assigned.km_per_l}::numeric*1000)/1000)`,
        );
      }
      const exceeded = await tx.execute(
        sql`SELECT b.id FROM vehicle_week_budgets b LEFT JOIN trip_fuel_reservations r ON r.budget_id=b.id AND r.state<>'RELEASED' WHERE b.id=${budget!.id} GROUP BY b.id HAVING b.opening_usage_l+coalesce(sum(coalesce(r.actual_fuel_l,r.estimated_fuel_l)),0)>b.quota_l`,
      );
      if (exceeded.length) throw new WorkflowError('Weekly fuel quota exceeded');
    }
    await tx.execute(
      sql`UPDATE trips t SET weight_cap_kg=v.weight_cap_kg,volume_cap_m3=v.volume_cap_m3,km_per_l=v.km_per_l,vehicle_type=v.type,vehicle_temperature=v.temp FROM vehicles v WHERE t.vehicle_id=v.id AND t.plan_id=${planId}`,
    );
    if (data.length) await tx.insert(loadManifests).values(data.map((t) => ({ tripId: t.id })));
    await tx.execute(
      sql`UPDATE orders o SET eligible_date=po.next_eligible_date FROM plan_orders po WHERE po.order_id=o.id AND po.plan_id=${planId} AND po.decision='DEFERRED'`,
    );
    const [released] = await tx
      .update(plans)
      .set({ status: 'RELEASED', releasedAt: new Date(), version: version + 1 })
      .where(eq(plans.id, planId))
      .returning();
    await tx.insert(auditEvents).values({
      actorId,
      action: 'PLAN_RELEASED',
      entityType: 'plan',
      entityId: planId,
      details: { version: version + 1, tripCount: data.length },
    });
    return released!;
  });
}

export function validateDailyBudgets(
  trips: { vehicle_id: string; brand_id: string; minutes: string }[],
) {
  const budgets = new Map<string, { fresh: bigint; daytime: bigint; count: number }>();
  for (const trip of trips) {
    const budget = budgets.get(trip.vehicle_id) ?? { fresh: 0n, daytime: 0n, count: 0 };
    if (trip.brand_id === 'Fresh') budget.fresh += fixed(trip.minutes, 2);
    else budget.daytime += fixed(trip.minutes, 2);
    budget.count++;
    if (budget.count > 2 || budget.fresh > 27000n || budget.daytime > 48000n)
      throw new WorkflowError('Vehicle exceeds combined daily trip or time limits');
    budgets.set(trip.vehicle_id, budget);
  }
  return budgets;
}

export async function acknowledgeDeferralOverride(
  db: Database | Transaction,
  planOrderId: string,
  version: number,
  actorId: string,
  reason: string,
) {
  const rationale = reason.trim();
  if (!rationale || rationale.length > 2000)
    throw new WorkflowError('An override reason of 1–2000 characters is required', 400);
  const [decision] = await db.select().from(planOrders).where(eq(planOrders.id, planOrderId));
  if (!decision) throw new WorkflowError('Planning decision not found', 404);
  return editPlan(db, decision.planId, version, actorId, async (tx) => {
    const [current] = await tx.select().from(planOrders).where(eq(planOrders.id, planOrderId));
    if (current!.decision !== 'DEFERRED')
      throw new WorkflowError('Only deferred orders can be acknowledged');
    await tx
      .update(planOrders)
      .set({
        overrideAcknowledged: true,
        overrideReason: rationale,
        overrideBy: actorId,
        overrideAt: new Date(),
      })
      .where(eq(planOrders.id, planOrderId));
    await tx.insert(auditEvents).values({
      actorId,
      action: 'DEFERRAL_OVERRIDE_ACKNOWLEDGED',
      entityType: 'plan_order',
      entityId: planOrderId,
      details: { reason: rationale, version: version + 1 },
    });
    return { planOrderId, version: version + 1, acknowledged: true };
  });
}
