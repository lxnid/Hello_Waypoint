import { and, eq, gt, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { CreateOrder } from '@waypoint/contracts';
import type { Database } from '../../db/client.js';
import {
  auditEvents,
  loadManifests,
  operatingCalendar,
  orderLines,
  orders,
  outlets,
  plans,
  products,
  syncOperations,
  trips,
  users,
} from '../../db/schema.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export class WorkflowError extends Error {
  constructor(
    message: string,
    public statusCode = 409,
  ) {
    super(message);
  }
}
export async function requireActor(
  tx: Transaction,
  actorId: string,
  role: 'DISPATCHER' | 'LOADER' | 'DRIVER' | 'STORE_MANAGER',
) {
  const [actor] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, actorId), eq(users.isActive, true)));
  if (!actor || actor.role !== role) throw new WorkflowError('Role is not authorized', 403);
  return actor;
}

export async function createOrderDraft(
  db: Database | Transaction,
  actorId: string,
  input: CreateOrder,
) {
  return db.transaction(async (tx) => {
    const actor = await requireActor(tx, actorId, 'STORE_MANAGER');
    if (!actor.outletId || !input.lines.length)
      throw new WorkflowError('An outlet and product lines are required', 400);
    const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, actor.outletId));
    const [order] = await tx
      .insert(orders)
      .values({
        publicReference: `ORD-${randomUUID()}`,
        outletId: actor.outletId,
        format: 'ITEMIZED',
        temperatureRequirement: input.temperatureRequirement,
        requestedDate: input.requestedDate,
        eligibleDate: input.requestedDate,
        createdBy: actorId,
      })
      .returning();
    for (const [position, line] of input.lines.entries()) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1)
        throw new WorkflowError('Quantity must be a positive integer', 400);
      const [product] = await tx.select().from(products).where(eq(products.id, line.productId));
      if (
        !product ||
        !product.isActive ||
        product.brandId !== outlet!.brandId ||
        product.temperatureRequirement !== input.temperatureRequirement
      )
        throw new WorkflowError('Product is not available to this order', 400);
      await tx.insert(orderLines).values({
        orderId: order!.id,
        productId: product.id,
        lineNumber: position + 1,
        quantity: line.quantity,
        sku: product.sku,
        name: product.name,
        orderingUnit: product.orderingUnit,
        temperatureRequirement: product.temperatureRequirement,
        unitWeightKg: product.unitWeightKg,
        unitVolumeM3: product.unitVolumeM3,
        estimatedUnitValueLkr: product.estimatedUnitValueLkr,
      });
    }
    return order!;
  });
}

/** The cutoff is evaluated from server time in Colombo, never a client clock. */
export function cutoffRunOffset(at: Date): number {
  const local = new Date(at.getTime() + 330 * 60_000);
  const milliseconds =
    ((local.getUTCHours() * 60 + local.getUTCMinutes()) * 60 + local.getUTCSeconds()) * 1000 +
    local.getUTCMilliseconds();
  return milliseconds <= 16 * 60 * 60 * 1000 ? 0 : 1;
}
export async function submitOrder(
  db: Database | Transaction,
  orderId: string,
  actorId: string,
  at = new Date(),
) {
  return db.transaction(async (tx) => {
    const actor = await requireActor(tx, actorId, 'STORE_MANAGER');
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order || order.outletId !== actor.outletId)
      throw new WorkflowError('Order is not available to this outlet', 403);
    if (order.status !== 'DRAFT' || order.format !== 'ITEMIZED')
      throw new WorkflowError('Only itemized drafts can be submitted');
    const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, order.outletId));
    const lines = await tx
      .select({ line: orderLines, product: products })
      .from(orderLines)
      .innerJoin(products, eq(orderLines.productId, products.id))
      .where(eq(orderLines.orderId, orderId))
      .orderBy(orderLines.lineNumber);
    if (!lines.length) throw new WorkflowError('Order must contain at least one line');
    for (const { line, product } of lines) {
      if (
        !product.isActive ||
        product.brandId !== outlet!.brandId ||
        product.temperatureRequirement !== order.temperatureRequirement
      )
        throw new WorkflowError(
          'Product brand, temperature or availability does not match the order',
        );
      await tx
        .update(orderLines)
        .set({
          sku: product.sku,
          name: product.name,
          orderingUnit: product.orderingUnit,
          temperatureRequirement: product.temperatureRequirement,
          unitWeightKg: product.unitWeightKg,
          unitVolumeM3: product.unitVolumeM3,
          estimatedUnitValueLkr: product.estimatedUnitValueLkr,
        })
        .where(eq(orderLines.id, line.id));
    }
    const localDate = new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const days = await tx
      .select()
      .from(operatingCalendar)
      .where(and(gt(operatingCalendar.date, localDate), eq(operatingCalendar.isOperating, true)))
      .orderBy(operatingCalendar.date)
      .limit(2);
    const earliest = days[cutoffRunOffset(at)];
    if (!earliest)
      throw new WorkflowError('Operating calendar does not cover the next eligible run');
    const requested = order.requestedDate > earliest.date ? order.requestedDate : earliest.date;
    const [eligible] = await tx
      .select()
      .from(operatingCalendar)
      .where(
        and(
          sql`${operatingCalendar.date} >= ${requested}`,
          eq(operatingCalendar.isOperating, true),
        ),
      )
      .orderBy(operatingCalendar.date)
      .limit(1);
    if (!eligible) throw new WorkflowError('Requested date is outside the operating calendar');
    const [submitted] = await tx
      .update(orders)
      .set({ status: 'SUBMITTED', submittedAt: at, eligibleDate: eligible.date })
      .where(eq(orders.id, orderId))
      .returning();
    await tx.insert(auditEvents).values({
      actorId,
      action: 'ORDER_SUBMITTED',
      entityType: 'order',
      entityId: orderId,
      details: { eligibleDate: eligible.date },
    });
    return submitted!;
  });
}

/** Run draft edits under the parent lock so released assignments cannot race with edits. */
export async function editPlan<T>(
  db: Database | Transaction,
  planId: string,
  version: number,
  actorId: string,
  edit: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).for('update');
    if (!plan || plan.status !== 'DRAFT' || plan.version !== version)
      throw new WorkflowError('Plan changed or has already been released');
    const result = await edit(tx);
    await tx
      .update(plans)
      .set({ version: version + 1 })
      .where(eq(plans.id, planId));
    await tx.insert(auditEvents).values({
      actorId,
      action: 'PLAN_EDITED',
      entityType: 'plan',
      entityId: planId,
      details: { version: version + 1 },
    });
    return result;
  });
}

/** A transaction-scoped advisory lock serializes duplicate requests before side effects. */
export async function synchronize<T extends Record<string, unknown>>(
  db: Database,
  input: { actorId: string; clientOperationId: string; capturedAt: Date; payload: unknown },
  apply: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const payloadHash = createHash('sha256').update(canonical(input.payload)).digest('hex');
  return db.transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.actorId), eq(users.isActive, true)));
    if (!actor) throw new WorkflowError('Inactive or unknown actor', 403);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.actorId}:${input.clientOperationId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.actorId, input.actorId),
          eq(syncOperations.clientOperationId, input.clientOperationId),
        ),
      );
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new WorkflowError('Operation ID was reused with a different payload');
      return existing.result as T;
    }
    const result = await apply(tx);
    await tx.insert(syncOperations).values({
      actorId: input.actorId,
      clientOperationId: input.clientOperationId,
      capturedAt: input.capturedAt,
      payloadHash,
      result,
    });
    await tx.insert(auditEvents).values({
      actorId: input.actorId,
      action: 'OFFLINE_OPERATION_APPLIED',
      entityType: 'sync_operation',
      entityId: input.clientOperationId,
      details: { payloadHash },
    });
    return result;
  });
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new WorkflowError('Payload must be JSON', 400);
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}

export async function authorizeDeparture(db: Database, tripId: string, actorId: string) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId, 'DISPATCHER');
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
    if (!trip || trip.status !== 'PLANNED')
      throw new WorkflowError('Trip is not ready for departure');
    const readiness = await tx.execute(
      sql`SELECT 1 FROM load_manifests m JOIN trip_inspections i ON i.trip_id=m.trip_id JOIN plans p ON p.id=${trip.planId} WHERE m.trip_id=${tripId} AND m.status='COMPLETED' AND p.status='RELEASED' AND i.driver_id=${trip.driverId} AND i.fuel_checked AND (NOT EXISTS (SELECT 1 FROM trip_stops s JOIN orders o ON o.id=s.order_id WHERE s.trip_id=${tripId} AND o.temperature_requirement='chilled') OR (i.chiller_checked AND i.temperature_c <= 4)) AND NOT EXISTS (SELECT 1 FROM issues x JOIN trip_stops s ON s.id=x.stop_id WHERE s.trip_id=${tripId} AND x.resolved_at IS NULL)`,
    );
    if (!readiness.length) throw new WorkflowError('Loading or pre-trip inspection is incomplete');
    const at = new Date();
    await tx
      .update(loadManifests)
      .set({ authorizedBy: actorId, authorizedAt: at })
      .where(eq(loadManifests.tripId, tripId));
    await tx.update(trips).set({ status: 'DISPATCHED' }).where(eq(trips.id, tripId));
    await tx
      .insert(auditEvents)
      .values({ actorId, action: 'TRIP_DISPATCHED', entityType: 'trip', entityId: tripId });
  });
}
