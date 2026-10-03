import { and, eq, sql } from 'drizzle-orm';
import type { PlanEdit } from '@waypoint/contracts/workflows';
import type { Database } from '../../db/client.js';
import {
  auditEvents,
  planningContexts,
  plans,
  planOrders,
  tripStops,
  trips,
  vehicleAvailability,
  vehicles,
} from '../../db/schema.js';
import { calculateOrderPriorities } from './priority.js';
import { planningInputs, schedule } from './scheduling.js';
import { editPlan, requireActor, type Transaction, WorkflowError } from './service.js';

export async function createContext(db: Database, actorId: string, date: string) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const operating = await tx.execute(
      sql`SELECT 1 FROM operating_calendar WHERE date=${date}::date AND is_operating`,
    );
    if (!operating.length) throw new WorkflowError('Date must be a known operating day', 400);
    await tx
      .insert(planningContexts)
      .values({ kind: 'LIVE', operatingDate: date })
      .onConflictDoNothing();
    const [context] = await tx
      .select()
      .from(planningContexts)
      .where(and(eq(planningContexts.kind, 'LIVE'), eq(planningContexts.operatingDate, date)));
    const fleet = await tx.select().from(vehicles).where(eq(vehicles.isActive, true));
    if (fleet.length)
      await tx
        .insert(vehicleAvailability)
        .values(
          fleet.map((v) => ({ contextId: context!.id, vehicleId: v.id, status: 'available' })),
        )
        .onConflictDoNothing();
    return context!;
  });
}
export async function createPlan(
  db: Database,
  actorId: string,
  contextId: string,
  depot: 'Peliyagoda' | 'Kandy',
) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [context] = await tx
      .select()
      .from(planningContexts)
      .where(eq(planningContexts.id, contextId));
    if (!context) throw new WorkflowError('Planning context not found', 404);
    await tx
      .insert(plans)
      .values({ contextId, depotId: depot, createdBy: actorId })
      .onConflictDoNothing();
    return (
      await tx
        .select()
        .from(plans)
        .where(and(eq(plans.contextId, contextId), eq(plans.depotId, depot)))
    )[0]!;
  });
}
async function save(tx: Transaction, planId: string, actorId: string, input: PlanEdit) {
  const inputs = await planningInputs(tx, planId);
  const assignments = schedule(inputs, input.trips);
  const decisions = [
    ...input.trips.flatMap((t) => t.orderIds),
    ...input.deferrals.map((d) => d.orderId),
  ];
  if (
    new Set(decisions).size !== decisions.length ||
    decisions.length !== inputs.demand.length ||
    decisions.some((id) => !inputs.demand.some((o) => o.id === id))
  )
    throw new WorkflowError('Every eligible order requires exactly one decision');
  for (const d of input.deferrals) {
    if (!d.reasonCode.trim() || !d.rationale.trim())
      throw new WorkflowError('Deferral reason required', 400);
    const next = await tx.execute(
      sql`SELECT 1 FROM operating_calendar WHERE date=${d.nextEligibleDate}::date AND is_operating AND date>${inputs.plan.operating_date}::date`,
    );
    if (!next.length) throw new WorkflowError('Deferral needs a later operating date');
  }
  await tx.delete(tripStops).where(eq(tripStops.planId, planId));
  await tx.delete(trips).where(eq(trips.planId, planId));
  await tx.delete(planOrders).where(eq(planOrders.planId, planId));
  for (const assignment of assignments) {
    const [trip] = await tx
      .insert(trips)
      .values({
        planId,
        vehicleId: assignment.vehicleId,
        driverId: assignment.driverId,
        tripNumber: assignment.tripNumber,
        brandId: assignment.brandId,
        districtId: assignment.districtId,
      })
      .returning();
    for (const stop of assignment.stops) {
      const [decision] = await tx
        .insert(planOrders)
        .values({ planId, orderId: stop.orderId, decision: 'ALLOCATED' })
        .returning();
      await tx
        .insert(tripStops)
        .values({ ...stop, planId, tripId: trip!.id, planOrderId: decision!.id });
    }
  }
  if (input.deferrals.length)
    await tx.insert(planOrders).values(
      input.deferrals.map((d) => ({
        ...d,
        planId,
        decision: 'DEFERRED' as const,
        decidedBy: actorId,
        decidedAt: new Date(),
      })),
    );
  return {
    planId,
    version: input.version + 1,
    tripCount: assignments.length,
    deferredCount: input.deferrals.length,
  };
}
export async function replacePlan(db: Database, actorId: string, planId: string, input: PlanEdit) {
  return editPlan(db, planId, input.version, actorId, (tx) => save(tx, planId, actorId, input));
}
export async function generatePlan(db: Database, actorId: string, planId: string, version: number) {
  return editPlan(db, planId, version, actorId, async (tx) => {
    const inputs = await planningInputs(tx, planId);
    const priority = await calculateOrderPriorities(
      tx,
      {
        id: inputs.plan.context_id,
        kind: inputs.plan.kind,
        operating_date: inputs.plan.operating_date,
        batch_id: inputs.plan.batch_id,
        scenario: inputs.plan.scenario,
      },
      inputs.plan.depot_id,
    );
    const ranks = new Map(priority.map((p) => [p.orderId, p]));
    const demand = [...inputs.demand].sort(
      (a, b) =>
        Number(ranks.get(b.id)?.requiresOverride ?? false) -
          Number(ranks.get(a.id)?.requiresOverride ?? false) ||
        Number(b.temperature_requirement === 'chilled') -
          Number(a.temperature_requirement === 'chilled') ||
        inputs.demand.indexOf(a) - inputs.demand.indexOf(b),
    );
    const assignments: PlanEdit['trips'] = [],
      deferrals: PlanEdit['deferrals'] = [];
    const [next] = await tx.execute<{ date: string }>(
      sql`SELECT date::text FROM operating_calendar WHERE is_operating AND date>${inputs.plan.operating_date}::date ORDER BY date LIMIT 1`,
    );
    if (!next) throw new WorkflowError('No next operating date in calendar');
    for (const order of demand) {
      let assigned = false;
      const trials: PlanEdit['trips'][] = [];
      for (let i = 0; i < assignments.length; i++) {
        const candidate = assignments.map((t, j) =>
          j === i ? { ...t, orderIds: [...t.orderIds, order.id] } : t,
        );
        trials.push(candidate);
      }
      const fleet = [...inputs.fleet].sort(
        (a, b) =>
          (order.temperature_requirement === 'ambient'
            ? Number(a.temp === 'reefer') - Number(b.temp === 'reefer')
            : 0) || a.id.localeCompare(b.id),
      );
      for (const v of fleet)
        for (const d of inputs.drivers)
          trials.push([...assignments, { vehicleId: v.id, driverId: d.id, orderIds: [order.id] }]);
      let reason = 'No compatible available vehicle and driver';
      for (const trial of trials) {
        try {
          schedule(inputs, trial);
          assignments.splice(0, assignments.length, ...trial);
          assigned = true;
          break;
        } catch (error) {
          if (!(error instanceof WorkflowError)) throw error;
          reason = error.message;
        }
      }
      if (!assigned)
        deferrals.push({
          orderId: order.id,
          reasonCode: 'CAPACITY_OR_FEASIBILITY',
          rationale: reason,
          nextEligibleDate: next.date,
        });
    }
    return save(tx, planId, actorId, { version, trips: assignments, deferrals });
  });
}
export async function setAvailability(
  db: Database,
  actorId: string,
  contextId: string,
  vehicleId: string,
  status: 'available' | 'workshop',
) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    await tx.execute(sql`SELECT id FROM planning_contexts WHERE id=${contextId} FOR UPDATE`);
    const released = await tx.execute(
      sql`SELECT 1 FROM plans WHERE context_id=${contextId} AND status<>'DRAFT' LIMIT 1`,
    );
    if (released.length) throw new WorkflowError('Availability is sealed after release');
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    if (!vehicle) throw new WorkflowError('Vehicle not found', 404);
    await tx
      .insert(vehicleAvailability)
      .values({ contextId, vehicleId, status })
      .onConflictDoUpdate({
        target: [vehicleAvailability.contextId, vehicleAvailability.vehicleId],
        set: { status },
      });
    await tx.insert(auditEvents).values({
      actorId,
      action: 'FLEET_AVAILABILITY_CHANGED',
      entityType: 'context',
      entityId: contextId,
      details: { vehicleId, status },
    });
    return { contextId, vehicleId, status };
  });
}
