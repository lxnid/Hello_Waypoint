import { eq, sql } from 'drizzle-orm';
import { issues, auditEvents, orderLines } from '../../db/schema.js';
import { actor, assertOrderScope } from './reads.js';
import { fixed, decimal } from './decimal.js';
import { type Transaction, WorkflowError, requireActor } from './service.js';
export async function fileIssue(
  tx: Transaction,
  actorId: string,
  input: {
    stopId: string;
    stage: 'LOADING' | 'DELIVERY' | 'RECEIPT';
    type: string;
    affectedQuantity: number;
    orderLineId?: string;
    attemptId?: string;
    notes?: string;
  },
) {
  const user = await actor(tx, actorId);
  const role =
    input.stage === 'LOADING' ? 'LOADER' : input.stage === 'DELIVERY' ? 'DRIVER' : 'STORE_MANAGER';
  if (user.role !== role) throw new WorkflowError('Issue stage unavailable to this role', 403);
  const [stop] = await tx.execute<{ order_id: string; trip_id: string }>(
    sql`SELECT s.order_id,s.trip_id FROM trip_stops s JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id WHERE s.id=${input.stopId} AND p.status<>'DRAFT'`,
  );
  if (!stop) throw new WorkflowError('Stop not found', 404);
  await assertOrderScope(tx, user, stop.order_id);
  await tx.execute(sql`SELECT id FROM trips WHERE id=${stop.trip_id} FOR UPDATE`);
  let credit: string | null = null;
  if (input.orderLineId) {
    const [line] = await tx.select().from(orderLines).where(eq(orderLines.id, input.orderLineId));
    if (!line || line.orderId !== stop.order_id || input.affectedQuantity > line.quantity)
      throw new WorkflowError('Invalid affected quantity or order line', 400);
    if (line.estimatedUnitValueLkr !== null)
      credit = decimal(fixed(line.estimatedUnitValueLkr, 2) * BigInt(input.affectedQuantity), 2);
  }
  if (input.attemptId) {
    const attempt = await tx.execute(
      sql`SELECT 1 FROM delivery_attempts WHERE id=${input.attemptId} AND stop_id=${input.stopId}`,
    );
    if (!attempt.length) throw new WorkflowError('Attempt does not belong to stop', 400);
  }
  const [issue] = await tx
    .insert(issues)
    .values({ ...input, orderId: stop.order_id, reportedBy: actorId, estimatedCreditLkr: credit })
    .returning();
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'ISSUE_FILED', entityType: 'issue', entityId: issue!.id });
  return issue!;
}
export async function resolveIssue(
  tx: Transaction,
  actorId: string,
  id: string,
  resolution: string,
) {
  await requireActor(tx, actorId, 'DISPATCHER');
  if (!resolution.trim()) throw new WorkflowError('Resolution required', 400);
  const [issue] = await tx.select().from(issues).where(eq(issues.id, id)).for('update');
  if (!issue) throw new WorkflowError('Issue not found', 404);
  if (issue.resolvedAt) throw new WorkflowError('Issue already resolved');
  const [updated] = await tx
    .update(issues)
    .set({ resolution: resolution.trim(), resolvedBy: actorId, resolvedAt: new Date() })
    .where(eq(issues.id, id))
    .returning();
  await tx
    .insert(auditEvents)
    .values({ actorId, action: 'ISSUE_RESOLVED', entityType: 'issue', entityId: id });
  return updated!;
}
