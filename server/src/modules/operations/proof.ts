import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { attachments } from '../../db/schema.js';
import { actor, assertOrderScope } from './reads.js';
import { type Transaction, WorkflowError } from './service.js';
export type Owner = {
  ownerType: 'attempt' | 'receipt' | 'issue';
  ownerId: string;
  kind: 'PHOTO' | 'SIGNATURE';
};
const root = () => process.env.PROOF_STORAGE_PATH ?? '/var/lib/waypoint/proofs';
async function ownerScope(tx: Transaction, userId: string, owner: Owner, write: boolean) {
  const user = await actor(tx, userId);
  let identity: { order_id: string; trip_id: string; sealed: boolean } | undefined;
  if (owner.ownerType === 'attempt')
    [identity] = await tx.execute<{ order_id: string; trip_id: string; sealed: boolean }>(
      sql`SELECT a.order_id,s.trip_id,a.completed_at IS NOT NULL AS sealed FROM delivery_attempts a JOIN trip_stops s ON s.id=a.stop_id WHERE a.id=${owner.ownerId}`,
    );
  else if (owner.ownerType === 'receipt')
    [identity] = await tx.execute<{ order_id: string; trip_id: string; sealed: boolean }>(
      sql`SELECT r.order_id,s.trip_id,false AS sealed FROM receipts r JOIN delivery_attempts a ON a.id=r.attempt_id JOIN trip_stops s ON s.id=a.stop_id WHERE r.attempt_id=${owner.ownerId}`,
    );
  else
    [identity] = await tx.execute<{ order_id: string; trip_id: string; sealed: boolean }>(
      sql`SELECT i.order_id,s.trip_id,i.resolved_at IS NOT NULL AS sealed FROM issues i JOIN trip_stops s ON s.id=i.stop_id WHERE i.id=${owner.ownerId}`,
    );
  if (!identity) throw new WorkflowError('Proof owner not found', 404);
  await assertOrderScope(tx, user, identity.order_id);
  if (write) {
    if (
      (owner.ownerType === 'attempt' && user.role !== 'DRIVER') ||
      (owner.ownerType === 'receipt' && user.role !== 'STORE_MANAGER')
    )
      throw new WorkflowError('Cannot attach evidence to this resource', 403);
    if (owner.ownerType === 'issue') {
      const [issue] = await tx.execute<{ reported_by: string }>(
        sql`SELECT reported_by FROM issues WHERE id=${owner.ownerId} FOR UPDATE`,
      );
      if (issue!.reported_by !== userId)
        throw new WorkflowError('Only reporter can attach issue evidence', 403);
    }
    await tx.execute(sql`SELECT id FROM trips WHERE id=${identity.trip_id} FOR UPDATE`);
    if (owner.ownerType === 'attempt') {
      const sealed = await tx.execute(
        sql`SELECT 1 FROM delivery_attempts WHERE id=${owner.ownerId} AND completed_at IS NOT NULL`,
      );
      if (sealed.length) throw new WorkflowError('Completed delivery proof is sealed');
    } else if (identity.sealed) throw new WorkflowError('Resolved issue evidence is sealed');
  }
}
export async function uploadProof(
  db: Database,
  userId: string,
  id: string,
  owner: Owner,
  bytes: Buffer,
  mime: string,
) {
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (
    bytes.length < 8 ||
    bytes.length > 5 * 1024 * 1024 ||
    !((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg))
  )
    throw new WorkflowError('Upload a PNG or JPEG up to 5 MiB', 400);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`proof:${id}`},0))`);
    const [existing] = await tx.select().from(attachments).where(eq(attachments.id, id));
    if (existing) {
      await ownerScope(tx, userId, owner, false);
      const sameOwner =
        owner.ownerType === 'attempt'
          ? existing.attemptId === owner.ownerId
          : owner.ownerType === 'receipt'
            ? existing.receiptId === owner.ownerId
            : existing.issueId === owner.ownerId;
      if (
        existing.uploadedBy !== userId ||
        existing.checksum !== checksum ||
        existing.kind !== owner.kind ||
        !sameOwner
      )
        throw new WorkflowError('Attachment UUID reused with different evidence');
      return { id, checksum, byteSize: existing.byteSize };
    }
    await ownerScope(tx, userId, owner, true);
    const storageKey = `${id}-${checksum}`,
      temporary = join(root(), `${randomUUID()}.pending`);
    await mkdir(root(), { recursive: true, mode: 0o700 });
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(root(), storageKey));
    await tx.insert(attachments).values({
      id,
      kind: owner.kind,
      attemptId: owner.ownerType === 'attempt' ? owner.ownerId : null,
      receiptId: owner.ownerType === 'receipt' ? owner.ownerId : null,
      issueId: owner.ownerType === 'issue' ? owner.ownerId : null,
      storageKey,
      mimeType: mime,
      byteSize: bytes.length,
      checksum,
      uploadedBy: userId,
    });
    return { id, checksum, byteSize: bytes.length };
  });
}
export async function downloadProof(db: Database, userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [proof] = await tx.select().from(attachments).where(eq(attachments.id, id));
    if (!proof) throw new WorkflowError('Proof not found', 404);
    await ownerScope(
      tx,
      userId,
      {
        ownerType: proof.attemptId ? 'attempt' : proof.receiptId ? 'receipt' : 'issue',
        ownerId: (proof.attemptId ?? proof.receiptId ?? proof.issueId)!,
        kind: proof.kind as Owner['kind'],
      },
      false,
    );
    if (!/^[\da-f-]{36}-[\da-f]{64}$/i.test(proof.storageKey))
      throw new WorkflowError('Invalid proof storage key', 500);
    const bytes = await readFile(join(root(), proof.storageKey));
    if (createHash('sha256').update(bytes).digest('hex') !== proof.checksum)
      throw new WorkflowError('Proof checksum mismatch', 500);
    return { bytes, mime: proof.mimeType };
  });
}
export async function verifyDeliveryProof(
  tx: Transaction,
  userId: string,
  attemptId: string,
  proofIds: string[],
  outcome: string,
) {
  if (outcome === 'FAILED') return;
  if (!proofIds.length)
    throw new WorkflowError('Delivery requires uploaded signature evidence', 400);
  const proofs = [];
  for (const id of proofIds) {
    const [proof] = await tx
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.attemptId, attemptId),
          eq(attachments.uploadedBy, userId),
        ),
      );
    if (!proof) throw new WorkflowError('Proof does not belong to this attempt', 400);
    const bytes = await readFile(join(root(), proof.storageKey));
    if (createHash('sha256').update(bytes).digest('hex') !== proof.checksum)
      throw new WorkflowError('Stored proof failed checksum verification', 500);
    proofs.push(proof);
  }
  if (!proofs.some((p) => p.kind === 'SIGNATURE'))
    throw new WorkflowError('Receiver signature required', 400);
}
