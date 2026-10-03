import { eq, sql } from 'drizzle-orm';
import { auditEvents, plans, tripClosures, tripInspections, trips } from '../../db/schema.js';
import { fixed } from './decimal.js';
import { requireActor, type Transaction, WorkflowError } from './service.js';

export async function inspectTrip(
  tx: Transaction,
  actorId: string,
  tripId: string,
  input: {
    startingOdometerKm: string;
    fuelChecked: boolean;
    chillerChecked: boolean;
    temperatureC?: string;
  },
) {
  const actor = await requireActor(tx, actorId, 'DRIVER');
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
  const scope = await tx.execute(
    sql`SELECT 1 FROM plans WHERE id=${trip?.planId ?? null} AND status='RELEASED' AND depot_id=${actor.depotId}`,
  );
  if (!trip || trip.driverId !== actorId || !scope.length)
    throw new WorkflowError('Trip not available', 403);
  if (trip.status !== 'PLANNED') throw new WorkflowError('Inspection is sealed after departure');
  await tx
    .insert(tripInspections)
    .values({ tripId, driverId: actorId, ...input, inspectedAt: new Date() })
    .onConflictDoUpdate({
      target: tripInspections.tripId,
      set: { ...input, inspectedAt: new Date() },
    });
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'TRIP_INSPECTED', entityType: 'trip', entityId: tripId });
  return { tripId, inspected: true };
}
export async function returnTrip(
  tx: Transaction,
  actorId: string,
  tripId: string,
  input: {
    returnedAt: Date;
    endingOdometerKm: string;
    actualFuelL: string;
  },
) {
  const actor = await requireActor(tx, actorId, 'DRIVER');
  const [identity] = await tx.select().from(trips).where(eq(trips.id, tripId));
  if (!identity || identity.driverId !== actorId)
    throw new WorkflowError('Trip not available', 403);
  const [plan] = await tx.select().from(plans).where(eq(plans.id, identity.planId)).for('update');
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
  if (plan?.depotId !== actor.depotId) throw new WorkflowError('Trip not available', 403);
  if (trip!.status !== 'AWAITING_RETURN')
    throw new WorkflowError('Finish all stops before recording return');
  const [inspection] = await tx
    .select()
    .from(tripInspections)
    .where(eq(tripInspections.tripId, tripId));
  const [latest] = await tx.execute<{ completed_at: Date }>(
    sql`SELECT max(a.completed_at) AS completed_at FROM delivery_attempts a JOIN trip_stops s ON s.id=a.stop_id WHERE s.trip_id=${tripId}`,
  );
  if (
    !inspection ||
    fixed(input.endingOdometerKm, 2) < fixed(inspection.startingOdometerKm, 2) ||
    input.returnedAt < latest!.completed_at ||
    input.returnedAt.getTime() > Date.now() + 300_000
  )
    throw new WorkflowError('Invalid return time or odometer', 400);
  const [budget] = await tx.execute<{ budget_id: string }>(
    sql`SELECT budget_id FROM trip_fuel_reservations WHERE trip_id=${tripId}`,
  );
  if (!budget) throw new WorkflowError('Missing fuel reservation');
  await tx.execute(
    sql`SELECT id FROM vehicle_week_budgets WHERE id=${budget.budget_id} FOR UPDATE`,
  );
  await tx.insert(tripClosures).values({ tripId, driverId: actorId, ...input });
  await tx.execute(
    sql`UPDATE trip_fuel_reservations SET actual_fuel_l=${input.actualFuelL}::numeric,state='CONSUMED' WHERE trip_id=${tripId}`,
  );
  // Actual consumption remains factual even if it exceeds the original quota.
  await tx.update(trips).set({ status: 'COMPLETED' }).where(eq(trips.id, tripId));
  const unfinished = await tx.execute(
    sql`SELECT 1 FROM trips WHERE plan_id=${trip!.planId} AND status<>'COMPLETED' LIMIT 1`,
  );
  if (!unfinished.length)
    await tx.update(plans).set({ status: 'COMPLETED' }).where(eq(plans.id, trip!.planId));
  await tx.insert(auditEvents).values({
    actorId,
    action: 'TRIP_RETURNED',
    entityType: 'trip',
    entityId: tripId,
    details: { actualFuelL: input.actualFuelL },
  });
  return { tripId, status: 'COMPLETED' };
}
