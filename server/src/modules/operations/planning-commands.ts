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
async function save(
  tx: Transaction,
  planId: string,
  actorId: string,
  input: PlanEdit,
  partial = false,
  failures = new Map<string, string>(),
  acknowledged = new Set<string>(),
) {
  const inputs = await planningInputs(tx, planId);
  const assignments = schedule(inputs, input.trips);
  const decisions = [
    ...input.trips.flatMap((t) => t.orderIds),
    ...input.deferrals.map((d) => d.orderId),
  ];
  if (
    new Set(decisions).size !== decisions.length ||
    (!partial && decisions.length !== inputs.demand.length) ||
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
  const previous = await tx.select().from(planOrders).where(eq(planOrders.planId, planId));
  const previousByOrder = new Map(previous.map((decision) => [decision.orderId, decision]));
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
        .values({
          ...previousByOrder.get(stop.orderId),
          planId,
          orderId: stop.orderId,
          decision: 'ALLOCATED',
          reasonCode: null,
          rationale: null,
          nextEligibleDate: null,
          overrideAcknowledged: false,
          overrideReason: null,
          overrideBy: null,
          overrideAt: null,
        })
        .returning();
      await tx
        .insert(tripStops)
        .values({ ...stop, planId, tripId: trip!.id, planOrderId: decision!.id });
    }
  }
  if (input.deferrals.length)
    await tx.insert(planOrders).values(
      input.deferrals.map((d) => {
        const old = previousByOrder.get(d.orderId);
        const unchanged =
          old?.decision === 'DEFERRED' &&
          old.reasonCode === d.reasonCode &&
          old.rationale === d.rationale &&
          old.nextEligibleDate === d.nextEligibleDate;
        return {
          ...old,
          ...d,
          planId,
          decision: 'DEFERRED' as const,
          decidedBy: unchanged ? old.decidedBy : actorId,
          decidedAt: unchanged ? old.decidedAt : new Date(),
          overrideAcknowledged:
            acknowledged.has(d.orderId) || (unchanged ? old.overrideAcknowledged : false),
          overrideReason: acknowledged.has(d.orderId)
            ? d.rationale
            : unchanged
              ? old.overrideReason
              : null,
          overrideBy: acknowledged.has(d.orderId) ? actorId : unchanged ? old.overrideBy : null,
          overrideAt: acknowledged.has(d.orderId) ? new Date() : unchanged ? old.overrideAt : null,
        };
      }),
    );
  if (partial) {
    const unresolved = inputs.demand.filter((order) => !decisions.includes(order.id));
    if (unresolved.length)
      await tx.insert(planOrders).values(
        unresolved.map((order) => ({
          planId,
          orderId: order.id,
          decision: 'UNASSIGNED' as const,
          reasonCode: failures.has(order.id) ? 'CAPACITY_OR_FEASIBILITY' : null,
          rationale: failures.get(order.id) ?? previousByOrder.get(order.id)?.rationale ?? null,
        })),
      );
  }
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
export async function generatePlan(
  db: Database,
  actorId: string,
  planId: string,
  version: number,
  selection?: {
    orderIds: string[];
    deferrals: PlanEdit['deferrals'];
    acknowledgeDeferral?: boolean | undefined;
  },
) {
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
    const selectedIds = selection ? new Set(selection.orderIds) : null;
    if (selection) {
      const ids = [...selection.orderIds, ...selection.deferrals.map((d) => d.orderId)];
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !inputs.demand.some((o) => o.id === id))
      )
        throw new WorkflowError('Selected orders must be unique and eligible', 400);
    }
    const demand = [...inputs.demand]
      .filter((order) => !selectedIds || selectedIds.has(order.id))
      .sort(
        (a, b) =>
          Number(ranks.get(b.id)?.requiresOverride ?? false) -
            Number(ranks.get(a.id)?.requiresOverride ?? false) ||
          Number(b.temperature_requirement === 'chilled') -
            Number(a.temperature_requirement === 'chilled') ||
          (ranks.get(b.id)?.daysSinceLastServed ?? -1) -
            (ranks.get(a.id)?.daysSinceLastServed ?? -1) ||
          a.window_close_time.localeCompare(b.window_close_time) ||
          inputs.demand.indexOf(a) - inputs.demand.indexOf(b),
      );
    const assignments: PlanEdit['trips'] = [],
      deferrals: PlanEdit['deferrals'] = [];
    const failures = new Map<string, string>();
    if (selection) {
      const changing = new Set([
        ...selection.orderIds,
        ...selection.deferrals.map((d) => d.orderId),
      ]);
      const previousTrips = await tx.execute<{
        vehicle_id: string;
        driver_id: string;
        order_ids: string[];
      }>(
        sql`SELECT t.vehicle_id,t.driver_id,array_agg(s.order_id ORDER BY s.sequence) AS order_ids FROM trips t JOIN trip_stops s ON s.trip_id=t.id WHERE t.plan_id=${planId} GROUP BY t.id ORDER BY min(s.planned_depart_at),t.vehicle_id,t.trip_number`,
      );
      for (const trip of previousTrips) {
        const orderIds = trip.order_ids.filter((id) => !changing.has(id));
        if (orderIds.length)
          assignments.push({ vehicleId: trip.vehicle_id, driverId: trip.driver_id, orderIds });
      }
      const previousDecisions = await tx
        .select()
        .from(planOrders)
        .where(eq(planOrders.planId, planId));
      for (const decision of previousDecisions) {
        if (decision.decision === 'DEFERRED' && !changing.has(decision.orderId))
          deferrals.push({
            orderId: decision.orderId,
            reasonCode: decision.reasonCode!,
            rationale: decision.rationale!,
            nextEligibleDate: decision.nextEligibleDate!,
          });
      }
      deferrals.push(...selection.deferrals);
    }
    const [next] = await tx.execute<{ date: string }>(
      sql`SELECT date::text FROM operating_calendar WHERE is_operating AND date>${inputs.plan.operating_date}::date ORDER BY date LIMIT 1`,
    );
    if (!next) throw new WorkflowError('No next operating date in calendar');
    // Group demand by cluster (brand_id / district_id)
    const clusters = new Map<string, typeof inputs.demand>();
    for (const order of demand) {
      const key = `${order.brand_id}/${order.district_id}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(order);
    }

    for (const [, clusterOrders] of clusters.entries()) {
      const firstOrder = clusterOrders[0]!;
      const pending = [...clusterOrders];

      // 1. Try inserting pending orders into existing compatible trips in assignments
      for (let i = 0; i < assignments.length; i++) {
        const trip = assignments[i]!;
        const tripFirstOrder = inputs.demand.find((o) => o.id === trip.orderIds[0]);
        if (
          !tripFirstOrder ||
          tripFirstOrder.brand_id !== firstOrder.brand_id ||
          tripFirstOrder.district_id !== firstOrder.district_id
        ) {
          continue;
        }
        const vehicle = inputs.fleet.find((v) => v.id === trip.vehicleId);
        if (!vehicle) continue;

        for (let oi = 0; oi < pending.length; ) {
          const order = pending[oi]!;
          if (order.temperature_requirement === 'chilled' && vehicle.temp !== 'reefer') {
            oi++;
            continue;
          }
          if (order.parking_constraint === 'van_only' && vehicle.type !== 'van') {
            oi++;
            continue;
          }

          let inserted = false;
          for (let p = 0; p <= trip.orderIds.length; p++) {
            const testOrderIds = [
              ...trip.orderIds.slice(0, p),
              order.id,
              ...trip.orderIds.slice(p),
            ];
            const testAssignments = assignments.map((t, j) =>
              j === i ? { ...t, orderIds: testOrderIds } : t,
            );
            try {
              schedule(inputs, testAssignments);
              trip.orderIds = testOrderIds;
              pending.splice(oi, 1);
              inserted = true;
              break;
            } catch {}
          }
          if (!inserted) oi++;
        }
      }

      // 2. Pack remaining orders into minimum new trips
      while (pending.length > 0) {
        let bestTrip: PlanEdit['trips'][0] | null = null;
        let bestPackedOrders: typeof inputs.demand = [];
        let bestFailureReason = 'No compatible available vehicle and driver';

        const vehicleTripCounts = new Map<string, number>();
        for (const t of assignments) {
          vehicleTripCounts.set(t.vehicleId, (vehicleTripCounts.get(t.vehicleId) ?? 0) + 1);
        }
        const candidateVehicles = inputs.fleet.filter(
          (v) => (vehicleTripCounts.get(v.id) ?? 0) < 2,
        );

        const hasChilled = pending.some((o) => o.temperature_requirement === 'chilled');
        const hasVanOnly = pending.some((o) => o.parking_constraint === 'van_only');

        candidateVehicles.sort((a, b) => {
          if (hasVanOnly && a.type !== b.type) return a.type === 'van' ? -1 : 1;
          if (hasChilled && a.temp !== b.temp) return a.temp === 'reefer' ? -1 : 1;
          if (!hasVanOnly && a.type !== b.type) return a.type === 'truck' ? -1 : 1;
          if (!hasChilled && a.temp !== b.temp) return a.temp === 'ambient' ? -1 : 1;
          return Number(b.km_per_l) - Number(a.km_per_l) || a.id.localeCompare(b.id);
        });

        const driverUsage = new Map<string, number>();
        for (const t of assignments) {
          driverUsage.set(t.driverId, (driverUsage.get(t.driverId) ?? 0) + 1);
        }
        const candidateDrivers: typeof inputs.drivers = [];
        let hasAddedUnused = false;
        for (const d of inputs.drivers) {
          const usage = driverUsage.get(d.id) ?? 0;
          if (usage > 0) candidateDrivers.push(d);
          else if (!hasAddedUnused) {
            candidateDrivers.push(d);
            hasAddedUnused = true;
          }
        }

        for (const vehicle of candidateVehicles) {
          for (const driver of candidateDrivers) {
            let tripOrderIds: string[] = [];
            const packed: typeof inputs.demand = [];

            for (const order of pending) {
              if (order.temperature_requirement === 'chilled' && vehicle.temp !== 'reefer') continue;
              if (order.parking_constraint === 'van_only' && vehicle.type !== 'van') continue;

              let bestPos: number | null = null;
              for (let p = 0; p <= tripOrderIds.length; p++) {
                const testOrderIds = [
                  ...tripOrderIds.slice(0, p),
                  order.id,
                  ...tripOrderIds.slice(p),
                ];
                const testTrial = [
                  ...assignments,
                  { vehicleId: vehicle.id, driverId: driver.id, orderIds: testOrderIds },
                ];
                try {
                  schedule(inputs, testTrial);
                  bestPos = p;
                  break;
                } catch (err: any) {
                  if (tripOrderIds.length === 0) bestFailureReason = err.message;
                }
              }

              if (bestPos !== null) {
                tripOrderIds = [
                  ...tripOrderIds.slice(0, bestPos),
                  order.id,
                  ...tripOrderIds.slice(bestPos),
                ];
                packed.push(order);
              }
            }

            if (packed.length > bestPackedOrders.length) {
              bestPackedOrders = packed;
              bestTrip = { vehicleId: vehicle.id, driverId: driver.id, orderIds: tripOrderIds };
              if (packed.length === pending.length) break;
            }
          }
          if (bestPackedOrders.length === pending.length) break;
        }

        if (bestTrip && bestPackedOrders.length > 0) {
          assignments.push(bestTrip);
          const packedIds = new Set(bestPackedOrders.map((o) => o.id));
          const remaining = pending.filter((o) => !packedIds.has(o.id));
          pending.splice(0, pending.length, ...remaining);
        } else {
          for (const order of pending) {
            let orderFailure = bestFailureReason;
            for (const v of candidateVehicles) {
              if (order.temperature_requirement === 'chilled' && v.temp !== 'reefer') continue;
              if (order.parking_constraint === 'van_only' && v.type !== 'van') continue;
              for (const d of candidateDrivers) {
                try {
                  schedule(inputs, [
                    ...assignments,
                    { vehicleId: v.id, driverId: d.id, orderIds: [order.id] },
                  ]);
                } catch (err: any) {
                  if (err instanceof WorkflowError) {
                    orderFailure = err.message;
                  }
                }
              }
            }
            if (!selection)
              deferrals.push({
                orderId: order.id,
                reasonCode: 'CAPACITY_OR_FEASIBILITY',
                rationale: orderFailure,
                nextEligibleDate: next.date,
              });
            else failures.set(order.id, orderFailure);
          }
          break;
        }
      }
    }
    const needsAcknowledgment =
      selection?.deferrals.filter((d) => ranks.get(d.orderId)?.requiresOverride) ?? [];
    if (needsAcknowledgment.length && !selection?.acknowledgeDeferral)
      throw new WorkflowError(
        'Confirm deferral for stores skipped on the previous run or unserved for two or more days',
        400,
      );
    return save(
      tx,
      planId,
      actorId,
      { version, trips: assignments, deferrals },
      !!selection,
      failures,
      new Set(needsAcknowledgment.map((d) => d.orderId)),
    );
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

async function draftAssignments(tx: Transaction, planId: string) {
  const rows = await tx.execute<{
    id: string;
    vehicle_id: string;
    driver_id: string;
    order_ids: string[];
  }>(
    sql`SELECT t.id,t.vehicle_id,t.driver_id,array_agg(s.order_id ORDER BY s.sequence) AS order_ids FROM trips t JOIN trip_stops s ON s.trip_id=t.id WHERE t.plan_id=${planId} GROUP BY t.id ORDER BY min(s.planned_depart_at),t.vehicle_id,t.trip_number`,
  );
  const decisions = await tx.select().from(planOrders).where(eq(planOrders.planId, planId));
  return {
    rows: [...rows],
    trips: rows.map((trip) => ({
      vehicleId: trip.vehicle_id,
      driverId: trip.driver_id,
      orderIds: trip.order_ids,
    })),
    deferrals: decisions
      .filter((d) => d.decision === 'DEFERRED')
      .map((d) => ({
        orderId: d.orderId,
        reasonCode: d.reasonCode!,
        rationale: d.rationale!,
        nextEligibleDate: d.nextEligibleDate!,
      })),
  };
}

/** Candidate previews and writes share the exact scheduler; previews never authorize a stale write. */
export async function tripCandidates(db: Database, actorId: string, tripId: string) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId));
    if (!trip) throw new WorkflowError('Trip not found', 404);
    const [plan] = await tx.select().from(plans).where(eq(plans.id, trip.planId));
    if (plan!.status !== 'DRAFT') throw new WorkflowError('Released trips cannot be edited');
    const inputs = await planningInputs(tx, trip.planId);
    const draft = await draftAssignments(tx, trip.planId);
    const target = draft.rows.findIndex((row) => row.id === tripId);
    const assigned = new Set(draft.trips.flatMap((item) => item.orderIds));
    const items = inputs.demand
      .filter((order) => !assigned.has(order.id))
      .map((order) => {
        const candidate = draft.trips.map((item, index) =>
          index === target ? { ...item, orderIds: [...item.orderIds, order.id] } : item,
        );
        try {
          schedule(inputs, candidate);
          return { orderId: order.id, valid: true, reason: null };
        } catch (error) {
          if (!(error instanceof WorkflowError)) throw error;
          return { orderId: order.id, valid: false, reason: error.message };
        }
      });
    return { version: plan!.version, items };
  });
}

export async function editTripOrder(
  db: Database,
  actorId: string,
  planId: string,
  input: { version: number; tripId: string; orderId: string; action: 'ADD' | 'REMOVE' },
) {
  return editPlan(db, planId, input.version, actorId, async (tx) => {
    const draft = await draftAssignments(tx, planId);
    const target = draft.rows.findIndex((row) => row.id === input.tripId);
    if (target < 0) throw new WorkflowError('Trip not found in this plan', 404);
    const trip = draft.trips[target]!;
    if (input.action === 'ADD') {
      if (draft.trips.some((item) => item.orderIds.includes(input.orderId)))
        throw new WorkflowError('Order is already allocated', 400);
      trip.orderIds.push(input.orderId);
    } else {
      if (!trip.orderIds.includes(input.orderId))
        throw new WorkflowError('Order is not in this trip', 400);
      trip.orderIds = trip.orderIds.filter((id) => id !== input.orderId);
    }
    const deferrals =
      input.action === 'ADD'
        ? draft.deferrals.filter((d) => d.orderId !== input.orderId)
        : draft.deferrals;
    // save() runs all seven rules and chronology checks before mutating any persisted assignments.
    return save(
      tx,
      planId,
      actorId,
      {
        version: input.version,
        trips: draft.trips.filter((item) => item.orderIds.length),
        deferrals,
      },
      true,
    );
  });
}
