import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { type Transaction, WorkflowError } from './service.js';
export type Actor = { id: string; role: string; outlet_id: string | null; depot_id: string | null };
export async function actor(db: Database | Transaction, id: string) {
  const [user] = await db.execute<Actor>(
    sql`SELECT id,role,outlet_id,depot_id FROM users WHERE id=${id} AND is_active`,
  );
  if (!user) throw new WorkflowError('Inactive account', 403);
  return user;
}
export function orderScope(user: Actor) {
  return sql`(${user.role}='DISPATCHER' OR (${user.role}='STORE_MANAGER' AND o.outlet_id=${user.outlet_id}) OR (${user.role}='LOADER' AND d.depot_id=${user.depot_id}) OR (${user.role}='DRIVER' AND EXISTS(SELECT 1 FROM trip_stops s JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id WHERE s.order_id=o.id AND t.driver_id=${user.id} AND p.status<>'DRAFT')))`;
}
export async function assertOrderScope(db: Database | Transaction, user: Actor, orderId: string) {
  const rows = await db.execute(
    sql`SELECT 1 FROM orders o JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id WHERE o.id=${orderId} AND ${orderScope(user)}`,
  );
  if (!rows.length) throw new WorkflowError('Order not found', 404);
}
export type Page = { limit?: number; cursor?: string; depot?: 'Peliyagoda' | 'Kandy' };
function cursor(value?: string) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString()) as {
      at: string;
      id: string;
    };
    if (
      !/^\d{4}-\d{2}-\d{2}T/.test(decoded.at) ||
      !/^[\da-f-]{36}$/i.test(decoded.id) ||
      !Number.isFinite(Date.parse(decoded.at))
    )
      throw new Error();
    return decoded;
  } catch {
    throw new WorkflowError('Invalid cursor', 400);
  }
}
export function page<
  T extends { id: string; created_at?: string | Date; createdAt?: string | Date },
>(rows: T[], limit: number) {
  const more = rows.length > limit,
    items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      more && last
        ? Buffer.from(
            JSON.stringify({ at: last.createdAt ?? last.created_at, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
export async function listOrders(db: Database, userId: string, query: Page) {
  const user = await actor(db, userId),
    c = cursor(query.cursor),
    limit = query.limit ?? 25;
  const rows = await db.execute<{ id: string; created_at: string }>(
    sql`SELECT o.id,o.public_reference,o.outlet_id,ot.name AS outlet_name,ot.brand_id,b.name AS brand_name,ot.district_id,d.name AS district_name,d.depot_id,o.format,o.temperature_requirement,o.requested_date::text,o.eligible_date::text,o.status,o.submitted_at,o.created_at,coalesce((SELECT sum(l.quantity)::int FROM order_lines l WHERE l.order_id=o.id),(SELECT a.units FROM order_aggregates a WHERE a.order_id=o.id),0)::int AS order_size FROM orders o JOIN outlets ot ON ot.id=o.outlet_id JOIN brands b ON b.id=ot.brand_id JOIN districts d ON d.id=ot.district_id WHERE ${orderScope(user)} AND (${query.depot ?? null}::text IS NULL OR d.depot_id=${query.depot ?? null}) AND (${c?.at ?? null}::timestamptz IS NULL OR (o.created_at,o.id)<(${c?.at ?? null}::timestamptz,${c?.id ?? null}::uuid)) ORDER BY o.created_at DESC,o.id DESC LIMIT ${limit + 1}`,
  );
  return page([...rows], limit);
}
export async function orderDetail(db: Database, userId: string, id: string) {
  const user = await actor(db, userId);
  await assertOrderScope(db, user, id);
  const [result] = await db.execute<{ data: Record<string, unknown> }>(
    sql`SELECT jsonb_build_object('order',to_jsonb(o),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_number) FROM order_lines l WHERE l.order_id=o.id),'[]'),'aggregate',(SELECT to_jsonb(a) FROM order_aggregates a WHERE a.order_id=o.id),'decisions',coalesce((SELECT jsonb_agg(to_jsonb(po)||jsonb_build_object('plan_status',p.status,'operating_date',c.operating_date) ORDER BY c.operating_date DESC) FROM plan_orders po JOIN plans p ON p.id=po.plan_id JOIN planning_contexts c ON c.id=p.context_id WHERE po.order_id=o.id AND (${user.role}='DISPATCHER' OR p.status<>'DRAFT')),'[]'),'stops',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('trip_status',t.status)) FROM trip_stops s JOIN trips t ON t.id=s.trip_id JOIN plans p ON p.id=t.plan_id WHERE s.order_id=o.id AND p.status<>'DRAFT'),'[]'),'attempts',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('receipt',(SELECT to_jsonb(r) FROM receipts r WHERE r.attempt_id=a.id),'lines',(SELECT jsonb_agg(to_jsonb(l)) FROM delivery_line_records l WHERE l.attempt_id=a.id))) FROM delivery_attempts a WHERE a.order_id=o.id),'[]'),'issues',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM issues i WHERE i.order_id=o.id),'[]'),'predictionStatus','UNAVAILABLE') AS data FROM orders o WHERE o.id=${id}`,
  );
  return result!.data;
}
export async function catalog(db: Database, userId: string) {
  const user = await actor(db, userId);
  if (user.role !== 'STORE_MANAGER') throw new WorkflowError('Store catalog only', 403);
  return [
    ...(await db.execute(
      sql`SELECT p.id,p.sku,p.name,p.ordering_unit,p.temperature_requirement,p.unit_weight_kg::text,p.unit_volume_m3::text,p.estimated_unit_value_lkr::text FROM products p JOIN outlets o ON o.brand_id=p.brand_id WHERE o.id=${user.outlet_id} AND p.is_active ORDER BY p.sku`,
    )),
  ];
}
export async function listTrips(db: Database, userId: string, query: Page) {
  const user = await actor(db, userId),
    c = cursor(query.cursor),
    limit = query.limit ?? 25;
  const rows = await db.execute<{ id: string; created_at: string }>(
    sql`SELECT t.*,p.created_at,p.depot_id,p.version AS plan_version,c.operating_date::text,m.status AS manifest_status FROM trips t JOIN plans p ON p.id=t.plan_id JOIN planning_contexts c ON c.id=p.context_id LEFT JOIN load_manifests m ON m.trip_id=t.id WHERE p.status<>'DRAFT' AND (${user.role}='DISPATCHER' OR (${user.role}='LOADER' AND p.depot_id=${user.depot_id}) OR (${user.role}='DRIVER' AND t.driver_id=${user.id})) AND (${query.depot ?? null}::text IS NULL OR p.depot_id=${query.depot ?? null}) AND (${c?.at ?? null}::timestamptz IS NULL OR (p.created_at,t.id)<(${c?.at ?? null}::timestamptz,${c?.id ?? null}::uuid)) ORDER BY p.created_at DESC,t.id DESC LIMIT ${limit + 1}`,
  );
  return page([...rows], limit);
}
export async function tripDetail(db: Database, userId: string, id: string) {
  const user = await actor(db, userId);
  const [trip] = await db.execute<{ id: string; plan_id: string; version: number }>(
    sql`SELECT t.*,p.version,p.depot_id,c.operating_date::text FROM trips t JOIN plans p ON p.id=t.plan_id JOIN planning_contexts c ON c.id=p.context_id WHERE t.id=${id} AND p.status<>'DRAFT' AND (${user.role}='DISPATCHER' OR (${user.role}='LOADER' AND p.depot_id=${user.depot_id}) OR (${user.role}='DRIVER' AND t.driver_id=${user.id}))`,
  );
  if (!trip) throw new WorkflowError('Trip not found', 404);
  const stops = await db.execute(
    sql`SELECT s.*,o.public_reference,o.format,o.temperature_requirement,ot.name AS outlet_name,coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_number) FROM order_lines l WHERE l.order_id=o.id),'[]') AS lines,(SELECT to_jsonb(a) FROM order_aggregates a WHERE a.order_id=o.id) AS aggregate,(SELECT to_jsonb(l) FROM load_records l WHERE l.stop_id=s.id) AS load,(SELECT jsonb_agg(to_jsonb(l)) FROM load_line_records l WHERE l.stop_id=s.id) AS load_lines,(SELECT to_jsonb(a) FROM delivery_attempts a WHERE a.stop_id=s.id) AS attempt FROM trip_stops s JOIN orders o ON o.id=s.order_id JOIN outlets ot ON ot.id=o.outlet_id WHERE s.trip_id=${id} ORDER BY s.sequence`,
  );
  const [manifest] = await db.execute(sql`SELECT * FROM load_manifests WHERE trip_id=${id}`);
  const [inspection] = await db.execute(sql`SELECT * FROM trip_inspections WHERE trip_id=${id}`);
  const [closure] = await db.execute(sql`SELECT * FROM trip_closures WHERE trip_id=${id}`);
  return {
    trip,
    stops: [...stops],
    packingStopIds: [...stops].reverse().map((s) => s.id),
    manifest: manifest ?? null,
    inspection: inspection ?? null,
    closure: closure ?? null,
    predictionStatus: 'UNAVAILABLE',
  };
}
export async function planningRead(db: Database, userId: string, planId: string) {
  const user = await actor(db, userId);
  if (user.role !== 'DISPATCHER') throw new WorkflowError('Dispatcher only', 403);
  const [plan] = await db.execute(
    sql`SELECT p.*,c.operating_date::text,c.kind FROM plans p JOIN planning_contexts c ON c.id=p.context_id WHERE p.id=${planId}`,
  );
  if (!plan) throw new WorkflowError('Plan not found', 404);
  const decisions = await db.execute(
    sql`SELECT * FROM plan_orders WHERE plan_id=${planId} ORDER BY order_id`,
  );
  const trips = await db.execute(
    sql`SELECT t.*,coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY sequence) FROM trip_stops s WHERE s.trip_id=t.id),'[]') AS stops FROM trips t WHERE plan_id=${planId} ORDER BY vehicle_id,trip_number`,
  );
  return { plan, decisions: [...decisions], trips: [...trips] };
}
export async function listIssues(db: Database, userId: string, query: Page) {
  const user = await actor(db, userId),
    c = cursor(query.cursor),
    limit = query.limit ?? 25;
  const rows = await db.execute<{ id: string; created_at: string }>(
    sql`SELECT i.* FROM issues i JOIN orders o ON o.id=i.order_id JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id WHERE ${orderScope(user)} AND (${query.depot ?? null}::text IS NULL OR d.depot_id=${query.depot ?? null}) AND (${c?.at ?? null}::timestamptz IS NULL OR (i.created_at,i.id)<(${c?.at ?? null}::timestamptz,${c?.id ?? null}::uuid)) ORDER BY i.created_at DESC,i.id DESC LIMIT ${limit + 1}`,
  );
  return page([...rows], limit);
}
export async function auditHistory(db: Database, userId: string, query: Page) {
  const user = await actor(db, userId);
  if (user.role !== 'DISPATCHER') throw new WorkflowError('Dispatcher only', 403);
  const c = cursor(query.cursor),
    limit = query.limit ?? 25;
  const rows = await db.execute<{ id: string; created_at: string }>(
    sql`SELECT id,actor_id,action,entity_type,entity_id,details,created_at FROM audit_events WHERE (${c?.at ?? null}::timestamptz IS NULL OR (created_at,id)<(${c?.at ?? null}::timestamptz,${c?.id ?? null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`,
  );
  return page([...rows], limit);
}
