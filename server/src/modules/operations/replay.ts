import { sql } from 'drizzle-orm';
import type { ReplayCommand } from '@waypoint/contracts/workflows';
import type { Database } from '../../db/client.js';
import { completeDelivery, recordArrival } from './execution.js';
import { verifyDeliveryProof } from './proof.js';
import { synchronize, WorkflowError } from './service.js';
export async function replay(db: Database, actorId: string, commands: ReplayCommand[]) {
  const results = [];
  for (const command of commands) {
    try {
      const result = await synchronize(
        db,
        {
          actorId,
          clientOperationId: command.clientOperationId,
          capturedAt: new Date(command.capturedAt),
          payload: command,
        },
        async (tx) => {
          const captured = new Date(command.capturedAt);
          if (captured.getTime() > Date.now() + 300_000)
            throw new WorkflowError('Occurrence time is in the future', 400);
          const [scope] =
            command.action === 'ARRIVAL'
              ? await tx.execute<{ plan_id: string; version: number; status: string }>(
                  sql`SELECT p.id AS plan_id,p.version,p.status FROM trip_stops s JOIN plans p ON p.id=s.plan_id WHERE s.id=${command.stopId}`,
                )
              : await tx.execute<{ plan_id: string; version: number; status: string }>(
                  sql`SELECT p.id AS plan_id,p.version,p.status FROM delivery_attempts a JOIN trip_stops s ON s.id=a.stop_id JOIN plans p ON p.id=s.plan_id WHERE a.id=${command.attemptId}`,
                );
          if (
            !scope ||
            scope.plan_id !== command.planId ||
            scope.version !== command.planVersion ||
            scope.status === 'DRAFT'
          )
            throw new WorkflowError('Released manifest version does not match');
          if (command.action === 'ARRIVAL')
            return recordArrival(tx, actorId, command.stopId, captured);
          if (command.payload.completedAt !== command.capturedAt)
            throw new WorkflowError('Completion must match command occurrence time', 400);
          await verifyDeliveryProof(
            tx,
            actorId,
            command.attemptId,
            command.payload.proofIds ?? [],
            command.payload.outcome,
          );
          if (command.payload.outcome !== 'FAILED' && !command.payload.receiverName?.trim())
            throw new WorkflowError('Receiver name required', 400);
          return completeDelivery(tx, actorId, command.attemptId, {
            ...command.payload,
            completedAt: captured,
          });
        },
      );
      results.push({ clientOperationId: command.clientOperationId, applied: true, result });
    } catch (error) {
      if (!(error instanceof WorkflowError)) throw error;
      results.push({
        clientOperationId: command.clientOperationId,
        applied: false,
        error: {
          status: error.statusCode,
          code:
            error.statusCode === 403
              ? 'FORBIDDEN'
              : error.statusCode === 400
                ? 'VALIDATION_ERROR'
                : 'WORKFLOW_CONFLICT',
          message: error.message,
        },
      });
    }
  }
  return { results };
}
