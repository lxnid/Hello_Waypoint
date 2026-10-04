import { and, eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  deliveryAttempts,
  deliveryLineRecords,
  loadLineRecords,
  loadManifests,
  loadRecords,
  orderLines,
  orders,
  receiptLines,
  receipts,
  trips,
} from '../../db/schema.js';
import { lockLiveOutletHistory } from './priority.js';
import { requireActor, type Transaction, WorkflowError } from './service.js';

async function scopedStop(
  tx: Transaction,
  stopId: string,
  actorId: string,
  role: 'LOADER' | 'DRIVER' | 'STORE_MANAGER',
) {
  const actor = await requireActor(tx, actorId, role);
  const [context] = await tx.execute<{
    trip_id: string;
    order_id: string;
    depot_id: string;
    driver_id: string;
    outlet_id: string;
    format: string;
    temperature_requirement: string;
    status: string;
  }>(sql`
    SELECT t.id AS trip_id,s.order_id,p.depot_id,t.driver_id,o.outlet_id,o.format,o.temperature_requirement,t.status
    FROM trip_stops s JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id JOIN orders o ON o.id=s.order_id
    WHERE s.id=${stopId} AND p.status IN ('RELEASED','COMPLETED') FOR UPDATE OF t`);
  if (
    !context ||
    (role === 'STORE_MANAGER'
      ? actor.outletId !== context.outlet_id
      : actor.depotId !== context.depot_id) ||
    (role === 'DRIVER' && actor.id !== context.driver_id)
  )
    throw new WorkflowError('Stop is not available to this actor', 403);
  return context;
}
export async function recordLoad(
  tx: Transaction,
  actorId: string,
  stopId: string,
  input: {
    lines?: { orderLineId: string; loadedQuantity: number; damagedQuantity: number }[];
    aggregate?: { units: number; weightKg: string; volumeM3: string };
    temperatureC?: string;
  },
) {
  const context = await scopedStop(tx, stopId, actorId, 'LOADER');
  const [manifest] = await tx
    .select()
    .from(loadManifests)
    .where(eq(loadManifests.tripId, context.trip_id))
    .for('update');
  if (!manifest || manifest.status === 'COMPLETED' || context.status !== 'PLANNED')
    throw new WorkflowError('Load is already sealed or dispatched');
  const expectedLines = await tx
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, context.order_id));
  if (context.format === 'ITEMIZED') {
    const existingRecordedLines = await tx
      .select()
      .from(loadLineRecords)
      .where(eq(loadLineRecords.stopId, stopId));
    const linesToValidate =
      input.lines && input.lines.length > 0
        ? input.lines
        : existingRecordedLines.map((l) => ({
            orderLineId: l.orderLineId,
            loadedQuantity: l.loadedQuantity,
            damagedQuantity: l.damagedQuantity,
          }));
    if (
      input.aggregate ||
      linesToValidate.length !== expectedLines.length ||
      new Set(linesToValidate.map((l) => l.orderLineId)).size !== expectedLines.length ||
      linesToValidate.some((l) => !expectedLines.some((e) => e.id === l.orderLineId))
    )
      throw new WorkflowError('Every assigned order line must be reported once');
  } else if (!input.aggregate || input.lines?.length)
    throw new WorkflowError('Aggregate load requires aggregate actual quantities');
  if (context.temperature_requirement === 'chilled' && input.temperatureC === undefined)
    throw new WorkflowError('Chilled load requires a temperature measurement');
  await tx
    .insert(loadRecords)
    .values({
      stopId,
      confirmedBy: actorId,
      confirmedAt: new Date(),
      temperatureC: input.temperatureC,
      loadedUnits: input.aggregate?.units,
      loadedWeightKg: input.aggregate?.weightKg,
      loadedVolumeM3: input.aggregate?.volumeM3,
    })
    .onConflictDoUpdate({
      target: loadRecords.stopId,
      set: {
        confirmedBy: actorId,
        confirmedAt: new Date(),
        temperatureC: input.temperatureC ?? null,
        loadedUnits: input.aggregate?.units ?? null,
        loadedWeightKg: input.aggregate?.weightKg ?? null,
        loadedVolumeM3: input.aggregate?.volumeM3 ?? null,
      },
    });
  for (const line of input.lines ?? [])
    await tx
      .insert(loadLineRecords)
      .values({ stopId, orderId: context.order_id, ...line })
      .onConflictDoUpdate({
        target: [loadLineRecords.stopId, loadLineRecords.orderLineId],
        set: { loadedQuantity: line.loadedQuantity, damagedQuantity: line.damagedQuantity },
      });
  await tx
    .update(loadManifests)
    .set({ status: 'LOADING', startedAt: manifest.startedAt ?? new Date() })
    .where(eq(loadManifests.tripId, context.trip_id));
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'ORDER_LOADED', entityType: 'stop', entityId: stopId });
  return { stopId, confirmed: true };
}
export async function verifyLoadLine(
  tx: Transaction,
  actorId: string,
  stopId: string,
  input: {
    orderLineId: string;
    verified: boolean;
    loadedQuantity?: number;
    damagedQuantity?: number;
  },
) {
  const context = await scopedStop(tx, stopId, actorId, 'LOADER');
  const [manifest] = await tx
    .select()
    .from(loadManifests)
    .where(eq(loadManifests.tripId, context.trip_id))
    .for('update');
  if (!manifest || manifest.status === 'COMPLETED' || context.status !== 'PLANNED')
    throw new WorkflowError('Load is already sealed or dispatched');

  const [line] = await tx
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.id, input.orderLineId), eq(orderLines.orderId, context.order_id)));
  if (!line) throw new WorkflowError('Order line does not belong to this stop', 404);

  await tx
    .insert(loadRecords)
    .values({ stopId })
    .onConflictDoNothing();

  if (input.verified) {
    const loadedQty = input.loadedQuantity ?? line.quantity;
    const damagedQty = input.damagedQuantity ?? 0;
    await tx
      .insert(loadLineRecords)
      .values({
        stopId,
        orderId: context.order_id,
        orderLineId: input.orderLineId,
        loadedQuantity: loadedQty,
        damagedQuantity: damagedQty,
      })
      .onConflictDoUpdate({
        target: [loadLineRecords.stopId, loadLineRecords.orderLineId],
        set: { loadedQuantity: loadedQty, damagedQuantity: damagedQty },
      });
  } else {
    await tx
      .delete(loadLineRecords)
      .where(
        and(
          eq(loadLineRecords.stopId, stopId),
          eq(loadLineRecords.orderLineId, input.orderLineId),
        ),
      );
  }

  if (manifest.status === 'WAITING') {
    await tx
      .update(loadManifests)
      .set({ status: 'LOADING', startedAt: new Date() })
      .where(eq(loadManifests.tripId, context.trip_id));
  }

  await tx.insert(auditEvents).values({
    actorId,
    action: input.verified ? 'ITEM_VERIFIED' : 'ITEM_UNVERIFIED',
    entityType: 'line',
    entityId: input.orderLineId,
  });

  return { stopId, orderLineId: input.orderLineId, verified: input.verified };
}
export async function startLoading(tx: Transaction, actorId: string, tripId: string) {
  const actor = await requireActor(tx, actorId, 'LOADER');
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
  const scope = await tx.execute(
    sql`SELECT 1 FROM plans WHERE id=${trip?.planId ?? null} AND depot_id=${actor.depotId} AND status='RELEASED'`,
  );
  if (!trip || trip.status !== 'PLANNED' || !scope.length)
    throw new WorkflowError('Trip is not available for loading', 403);
  const [manifest] = await tx
    .update(loadManifests)
    .set({ status: 'LOADING', startedAt: new Date() })
    .where(and(eq(loadManifests.tripId, tripId), eq(loadManifests.status, 'WAITING')))
    .returning();
  if (!manifest) {
    const [existing] = await tx.select().from(loadManifests).where(eq(loadManifests.tripId, tripId));
    if (existing?.status === 'LOADING') return { tripId, status: existing.status };
    throw new WorkflowError('Load cannot be started');
  }
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'LOAD_STARTED', entityType: 'trip', entityId: tripId });
  return { tripId, status: manifest.status };
}
export async function completeLoading(tx: Transaction, actorId: string, tripId: string) {
  const actor = await requireActor(tx, actorId, 'LOADER');
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
  const scope = await tx.execute(
    sql`SELECT 1 FROM plans WHERE id=${trip?.planId ?? null} AND depot_id=${actor.depotId} AND status='RELEASED'`,
  );
  if (!trip || trip.status !== 'PLANNED' || !scope.length)
    throw new WorkflowError('Trip is not available for loading', 403);
  const missing = await tx.execute(
    sql`SELECT s.id FROM trip_stops s LEFT JOIN load_records l ON l.stop_id=s.id WHERE s.trip_id=${tripId} AND l.confirmed_at IS NULL LIMIT 1`,
  );
  if (missing.length) throw new WorkflowError('Every consignment needs loading confirmation');
  const [manifest] = await tx
    .update(loadManifests)
    .set({ status: 'COMPLETED', completedAt: new Date(), signedBy: actorId })
    .where(and(eq(loadManifests.tripId, tripId), eq(loadManifests.status, 'LOADING')))
    .returning();
  if (!manifest) throw new WorkflowError('Load is not in progress');
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'LOAD_SIGNED', entityType: 'trip', entityId: tripId });
  return { tripId, status: manifest.status };
}
export async function recordArrival(
  tx: Transaction,
  actorId: string,
  stopId: string,
  capturedAt: Date,
) {
  const context = await scopedStop(tx, stopId, actorId, 'DRIVER');
  if (context.status !== 'DISPATCHED') throw new WorkflowError('Trip has not departed');
  const unfinishedPrevious = await tx.execute(
    sql`SELECT 1 FROM trip_stops previous JOIN trip_stops current ON current.id=${stopId} WHERE previous.trip_id=current.trip_id AND previous.sequence<current.sequence AND NOT EXISTS(SELECT 1 FROM delivery_attempts a WHERE a.stop_id=previous.id AND a.completed_at IS NOT NULL) LIMIT 1`,
  );
  if (unfinishedPrevious.length) throw new WorkflowError('Previous stop has not been completed');
  const [existing] = await tx
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.stopId, stopId));
  if (existing) throw new WorkflowError('Arrival has already been recorded');
  const [attempt] = await tx
    .insert(deliveryAttempts)
    .values({
      stopId,
      orderId: context.order_id,
      attemptNumber: 1,
      arrivedAt: capturedAt,
      driverId: actorId,
    })
    .returning();
  await tx.insert(auditEvents).values({
    actorId,
    action: 'STOP_ARRIVED',
    entityType: 'stop',
    entityId: stopId,
    details: { capturedAt: capturedAt.toISOString() },
  });
  return { attemptId: attempt!.id };
}
export async function completeDelivery(
  tx: Transaction,
  actorId: string,
  attemptId: string,
  input: {
    outcome: 'DELIVERED' | 'PARTIAL' | 'REJECTED' | 'FAILED';
    completedAt: Date;
    receiverName?: string;
    temperatureC?: string;
    deliveredUnits?: number;
    deliveredWeightKg?: string;
    deliveredVolumeM3?: string;
    lines?: { orderLineId: string; deliveredQuantity: number; rejectedQuantity: number }[];
  },
) {
  let [attempt] = await tx
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.id, attemptId));
  if (!attempt) throw new WorkflowError('Unknown delivery attempt');
  const context = await scopedStop(tx, attempt.stopId, actorId, 'DRIVER');
  [attempt] = await tx
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.id, attemptId))
    .for('update');
  if (
    context.status !== 'DISPATCHED' ||
    !attempt ||
    attempt.completedAt ||
    !attempt.arrivedAt ||
    input.completedAt < attempt.arrivedAt
  )
    throw new WorkflowError('Invalid delivery completion');
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, context.order_id));
  if (
    context.format === 'ITEMIZED' &&
    (!input.lines ||
      input.lines.length !== lines.length ||
      new Set(input.lines.map((l) => l.orderLineId)).size !== lines.length ||
      input.lines.some((l) => !lines.some((e) => e.id === l.orderLineId)))
  )
    throw new WorkflowError('Report every order line once');
  if (
    context.format === 'AGGREGATE' &&
    (input.deliveredUnits === undefined ||
      input.deliveredWeightKg === undefined ||
      input.deliveredVolumeM3 === undefined ||
      input.lines?.length)
  )
    throw new WorkflowError('Report aggregate delivered units');
  if (context.temperature_requirement === 'chilled' && input.temperatureC === undefined)
    throw new WorkflowError('Chilled delivery requires a temperature measurement');
  if (
    input.outcome === 'DELIVERED' &&
    input.lines?.some(
      (line) =>
        line.rejectedQuantity > 0 ||
        line.deliveredQuantity !==
          lines.find((expected) => expected.id === line.orderLineId)!.quantity,
    )
  )
    throw new WorkflowError('Full delivery outcome requires all requested quantities');
  for (const line of input.lines ?? [])
    await tx.insert(deliveryLineRecords).values({ attemptId, orderId: context.order_id, ...line });
  await tx
    .update(deliveryAttempts)
    .set({
      outcome: input.outcome,
      completedAt: input.completedAt,
      receiverName: input.receiverName,
      temperatureC: input.temperatureC,
      deliveredUnits: input.deliveredUnits,
      deliveredWeightKg: input.deliveredWeightKg,
      deliveredVolumeM3: input.deliveredVolumeM3,
    })
    .where(eq(deliveryAttempts.id, attemptId));
  const pending = await tx.execute(
    sql`SELECT 1 FROM trip_stops s WHERE s.trip_id=${context.trip_id} AND NOT EXISTS(SELECT 1 FROM delivery_attempts a WHERE a.stop_id=s.id AND a.completed_at IS NOT NULL) LIMIT 1`,
  );
  if (!pending.length)
    await tx.update(trips).set({ status: 'AWAITING_RETURN' }).where(eq(trips.id, context.trip_id));
  if (input.outcome === 'FAILED' || input.outcome === 'REJECTED')
    await tx
      .update(orders)
      .set({ status: 'CLOSED_EXCEPTION' })
      .where(eq(orders.id, context.order_id));
  await tx.insert(auditEvents).values({
    actorId,
    action: 'DELIVERY_COMPLETED',
    entityType: 'attempt',
    entityId: attemptId,
    details: { outcome: input.outcome },
  });
  return { attemptId, outcome: input.outcome };
}
export async function confirmReceipt(
  tx: Transaction,
  actorId: string,
  attemptId: string,
  input: {
    outcome: 'DELIVERED' | 'PARTIAL' | 'REJECTED' | 'FAILED';
    temperatureC?: string;
    aggregate?: {
      acceptedUnits: number;
      missingUnits: number;
      damagedUnits: number;
      rejectedUnits: number;
    };
    lines?: {
      orderLineId: string;
      acceptedQuantity: number;
      missingQuantity: number;
      damagedQuantity: number;
      rejectedQuantity: number;
    }[];
  },
) {
  const [attempt] = await tx
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.id, attemptId));
  if (!attempt?.completedAt) throw new WorkflowError('Delivery is not completed');
  const [historyScope] = await tx.execute<{ outlet_id: string; kind: string }>(
    sql`SELECT o.outlet_id,c.kind FROM orders o JOIN trip_stops s ON s.id=${attempt.stopId} JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id JOIN planning_contexts c ON c.id=p.context_id WHERE o.id=${attempt.orderId}`,
  );
  if (historyScope?.kind === 'LIVE') await lockLiveOutletHistory(tx, [historyScope.outlet_id]);
  const context = await scopedStop(tx, attempt.stopId, actorId, 'STORE_MANAGER');
  if (
    context.temperature_requirement === 'chilled' &&
    (input.temperatureC === undefined ||
      (Number(input.temperatureC) > 4 &&
        !['REJECTED', 'PARTIAL', 'FAILED'].includes(input.outcome)))
  )
    throw new WorkflowError(
      'Temperature measurement and exception outcome required for chilled receipt',
    );
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, context.order_id));
  if (
    context.format === 'ITEMIZED' &&
    (!input.lines ||
      input.lines.length !== lines.length ||
      new Set(input.lines.map((l) => l.orderLineId)).size !== lines.length ||
      input.lines.some((l) => !lines.some((e) => e.id === l.orderLineId)))
  )
    throw new WorkflowError('Receipt must account for every line');
  if (
    context.format === 'AGGREGATE' &&
    (!input.aggregate ||
      input.lines?.length ||
      Object.values(input.aggregate).reduce((sum, n) => sum + n, 0) !== attempt.deliveredUnits)
  )
    throw new WorkflowError('Aggregate receipt must account for delivered units');
  await tx.insert(receipts).values({
    attemptId,
    orderId: context.order_id,
    managerId: actorId,
    outcome: input.outcome,
    temperatureC: input.temperatureC,
    confirmedAt: new Date(),
    ...input.aggregate,
  });
  for (const line of input.lines ?? [])
    await tx
      .insert(receiptLines)
      .values({ receiptId: attemptId, orderId: context.order_id, ...line });
  await tx
    .update(orders)
    .set({
      status: ['DELIVERED', 'PARTIAL'].includes(input.outcome) ? 'COMPLETED' : 'CLOSED_EXCEPTION',
    })
    .where(eq(orders.id, context.order_id));
  await tx.insert(auditEvents).values({
    actorId,
    action: 'RECEIPT_CONFIRMED',
    entityType: 'attempt',
    entityId: attemptId,
    details: { outcome: input.outcome },
  });
  return { attemptId, outcome: input.outcome };
}
