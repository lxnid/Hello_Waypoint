import { and, eq } from 'drizzle-orm';
import type { CreateOrder } from '@waypoint/contracts';
import type { Database } from '../../db/client.js';
import { auditEvents, orderLines, orders } from '../../db/schema.js';
import { createOrderDraft, requireActor, WorkflowError } from './service.js';

export async function replaceDraft(
  db: Database,
  actorId: string,
  orderId: string,
  input: CreateOrder,
) {
  return db.transaction(async (tx) => {
    const actor = await requireActor(tx, actorId, 'STORE_MANAGER');
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.outletId, actor.outletId!)))
      .for('update');
    if (!order) throw new WorkflowError('Order not found', 404);
    if (order.status !== 'DRAFT') throw new WorkflowError('Only drafts can be edited');
    // Build validated catalog snapshots through the same path as creation, then move them.
    const replacement = await createOrderDraft(tx, actorId, input);
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, replacement.id));
    await tx.delete(orderLines).where(eq(orderLines.orderId, orderId));
    await tx.delete(orderLines).where(eq(orderLines.orderId, replacement.id));
    await tx.insert(orderLines).values(lines.map((line) => ({ ...line, orderId })));
    await tx.delete(orders).where(eq(orders.id, replacement.id));
    const [updated] = await tx
      .update(orders)
      .set({
        requestedDate: input.requestedDate,
        eligibleDate: input.requestedDate,
        temperatureRequirement: input.temperatureRequirement,
      })
      .where(eq(orders.id, orderId))
      .returning();
    await tx
      .insert(auditEvents)
      .values({ actorId, action: 'ORDER_DRAFT_EDITED', entityType: 'order', entityId: orderId });
    return updated!;
  });
}
export async function deleteDraft(db: Database, actorId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const actor = await requireActor(tx, actorId, 'STORE_MANAGER');
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.outletId, actor.outletId!)))
      .for('update');
    if (!order) throw new WorkflowError('Order not found', 404);
    if (order.status !== 'DRAFT') throw new WorkflowError('Only drafts can be deleted');
    await tx.delete(orderLines).where(eq(orderLines.orderId, orderId));
    await tx.delete(orders).where(eq(orders.id, orderId));
    await tx
      .insert(auditEvents)
      .values({ actorId, action: 'ORDER_DRAFT_DELETED', entityType: 'order', entityId: orderId });
    return { deleted: true };
  });
}
