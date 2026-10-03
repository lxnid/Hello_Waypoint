import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import * as s from '../src/db/schema.js';
import {
  calculateOrderPriorities,
  type PriorityContext,
} from '../src/modules/operations/priority.js';
import { acknowledgeDeferralOverride, releasePlan } from '../src/modules/operations/planning.js';
import type { Transaction } from '../src/modules/operations/service.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Priority tests require a dedicated *_test database');
const connection = url ? createDatabase(url) : null;
const suite = connection ? describe : describe.skip;
let dispatcher: string, driver: string, manager: string;
beforeAll(async () => {
  if (!connection) return;
  await seed(url!, 'Peliyagoda2026!');
  const users = await connection.db.select().from(s.users);
  dispatcher = users.find((u) => u.email === 'dispatcher@waypoint.lk')!.id;
  driver = users.find((u) => u.email === 'driver@waypoint.lk')!.id;
  manager = users.find((u) => u.email === 'manager.out001@waypoint.lk')!.id;
});
afterAll(async () => {
  await connection?.sql.end();
});
async function isolated(work: (tx: Transaction) => Promise<void>) {
  const rollback = new Error('ROLLBACK_FIXTURE');
  try {
    await connection!.db.transaction(async (tx) => {
      await work(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function organic(tx: Transaction, temp: 'ambient' | 'chilled' = 'ambient') {
  const [product] = await tx
    .select()
    .from(s.products)
    .where(eq(s.products.sku, temp === 'ambient' ? 'DEMO-FRESH-DRY' : 'DEMO-FRESH-CHILL'));
  const [order] = await tx
    .insert(s.orders)
    .values({
      publicReference: `PRIORITY-${randomUUID()}`,
      outletId: 'OUT001',
      format: 'ITEMIZED',
      temperatureRequirement: temp,
      requestedDate: '2026-03-30',
      eligibleDate: '2026-03-30',
      createdBy: manager,
    })
    .returning();
  const [line] = await tx
    .insert(s.orderLines)
    .values({
      orderId: order!.id,
      productId: product!.id,
      lineNumber: 1,
      quantity: 2,
      sku: product!.sku,
      name: product!.name,
      orderingUnit: product!.orderingUnit,
      temperatureRequirement: temp,
      unitWeightKg: product!.unitWeightKg,
      unitVolumeM3: product!.unitVolumeM3,
    })
    .returning();
  await tx
    .update(s.orders)
    .set({ status: 'SUBMITTED', submittedAt: new Date('2026-03-27T10:00:00Z') })
    .where(eq(s.orders.id, order!.id));
  return { order: order!, line: line! };
}
async function livePlan(tx: Transaction, date: string) {
  await tx
    .insert(s.planningContexts)
    .values({ kind: 'LIVE', operatingDate: date })
    .onConflictDoNothing();
  const [context] = await tx
    .select()
    .from(s.planningContexts)
    .where(and(eq(s.planningContexts.kind, 'LIVE'), eq(s.planningContexts.operatingDate, date)));
  const [plan] = await tx
    .insert(s.plans)
    .values({ contextId: context!.id, depotId: 'Peliyagoda', createdBy: dispatcher })
    .returning();
  return {
    context: {
      id: context!.id,
      kind: 'LIVE',
      operating_date: date,
      batch_id: null,
      scenario: null,
    } satisfies PriorityContext,
    plan: plan!,
  };
}
async function defer(tx: Transaction, planId: string, orderId: string, next = '2026-03-31') {
  const [decision] = await tx
    .insert(s.planOrders)
    .values({
      planId,
      orderId,
      decision: 'DEFERRED',
      reasonCode: 'CAPACITY',
      rationale: 'Capacity exhausted',
      nextEligibleDate: next,
      decidedBy: dispatcher,
      decidedAt: new Date(),
    })
    .returning();
  return decision!;
}
/** Minimal released historical fixture, with complete typed evidence; no scenario source row. */
async function historicalPlan(tx: Transaction, date: string) {
  return livePlan(tx, date);
}
async function releaseFixture(tx: Transaction, planId: string, date: string) {
  await tx
    .update(s.planOrders)
    .set({
      prioritySource: 'LIVE',
      priorityAsOfDate: date,
      priorityEvaluatedAt: new Date(),
      deferredPreviousRun: false,
      requiresOverride: false,
    })
    .where(eq(s.planOrders.planId, planId));
  await tx
    .update(s.plans)
    .set({ status: 'RELEASED', releasedAt: new Date() })
    .where(eq(s.plans.id, planId));
}
async function received(
  tx: Transaction,
  date: string,
  temp: 'ambient' | 'chilled',
  accepted: number,
  outcome: 'DELIVERED' | 'PARTIAL' | 'REJECTED' | 'FAILED' = 'PARTIAL',
) {
  const f = await organic(tx, temp),
    h = await historicalPlan(tx, date);
  const [decision] = await tx
    .insert(s.planOrders)
    .values({ planId: h.plan.id, orderId: f.order.id, decision: 'ALLOCATED' })
    .returning();
  const [trip] = await tx
    .insert(s.trips)
    .values({
      planId: h.plan.id,
      vehicleId: 'VEH001',
      driverId: driver,
      tripNumber: 1,
      brandId: 'Fresh',
      districtId: 'Colombo',
    })
    .returning();
  const at = new Date(`${date}T05:30:00+05:30`);
  const [stop] = await tx
    .insert(s.tripStops)
    .values({
      planId: h.plan.id,
      tripId: trip!.id,
      planOrderId: decision!.id,
      orderId: f.order.id,
      sequence: 0,
      plannedDepartAt: at,
      plannedTravelMinutes: '0',
      plannedArrivalAt: at,
      serviceAllowanceMinutes: '16',
      distanceKm: '12',
      windowOpenAt: new Date(`${date}T05:00:00+05:30`),
      windowCloseAt: new Date(`${date}T07:30:00+05:30`),
      dockType: 'street',
      parkingConstraint: 'van_only',
    })
    .returning();
  await releaseFixture(tx, h.plan.id, date);
  await tx.insert(s.loadRecords).values({ stopId: stop!.id });
  await tx.insert(s.loadLineRecords).values({
    stopId: stop!.id,
    orderId: f.order.id,
    orderLineId: f.line.id,
    loadedQuantity: 2,
    damagedQuantity: 0,
  });
  const [attempt] = await tx
    .insert(s.deliveryAttempts)
    .values({
      stopId: stop!.id,
      orderId: f.order.id,
      attemptNumber: 1,
      driverId: driver,
      arrivedAt: at,
    })
    .returning();
  await tx.insert(s.deliveryLineRecords).values({
    attemptId: attempt!.id,
    orderId: f.order.id,
    orderLineId: f.line.id,
    deliveredQuantity: 2,
    rejectedQuantity: 0,
  });
  await tx
    .update(s.deliveryAttempts)
    .set({ outcome, completedAt: new Date(at.getTime() + 600_000) })
    .where(eq(s.deliveryAttempts.id, attempt!.id));
  await tx.insert(s.receipts).values({
    attemptId: attempt!.id,
    orderId: f.order.id,
    managerId: manager,
    outcome,
    confirmedAt: new Date(),
  });
  await tx.insert(s.receiptLines).values({
    receiptId: attempt!.id,
    orderId: f.order.id,
    orderLineId: f.line.id,
    acceptedQuantity: accepted,
    missingQuantity: 2 - accepted,
    damagedQuantity: 0,
    rejectedQuantity: 0,
  });
  await tx.update(s.orders).set({ status: 'COMPLETED' }).where(eq(s.orders.id, f.order.id));
  return f;
}
suite('live priority and protected deferral', () => {
  it('returns explicit unknown history for organic orders without source rows', () =>
    isolated(async (tx) => {
      const f = await organic(tx),
        p = await livePlan(tx, '2026-03-30');
      const result = (await calculateOrderPriorities(tx, p.context, 'Peliyagoda')).find(
        (r) => r.orderId === f.order.id,
      )!;
      expect(result.source).toBe('LIVE');
      expect(result.historyStatus).toBe('UNKNOWN');
      expect(result.daysSinceLastServed).toBeNull();
      expect(result.requiresOverride).toBe(false);
      expect(
        await tx.select().from(s.orderSources).where(eq(s.orderSources.orderId, f.order.id)),
      ).toHaveLength(0);
    }));
  it('treats Saturday as the previous run on Monday and blocks repeated deferral', () =>
    isolated(async (tx) => {
      const old = await organic(tx, 'chilled'),
        prior = await historicalPlan(tx, '2026-03-28');
      await defer(tx, prior.plan.id, old.order.id, '2026-03-30');
      await releaseFixture(tx, prior.plan.id, '2026-03-28');
      const p = await livePlan(tx, '2026-03-30');
      const decision = await defer(tx, p.plan.id, old.order.id);
      const result = (await calculateOrderPriorities(tx, p.context, 'Peliyagoda', p.plan.id))[0]!;
      expect(result.previousOperatingDate).toBe('2026-03-28');
      expect(result.deferredPreviousRun).toBe(true);
      expect(result.requiresOverride).toBe(true);
      await tx.execute(
        sql`UPDATE orders SET eligible_date='2026-04-01' WHERE id<>${old.order.id} AND status='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM order_sources WHERE order_id=orders.id)`,
      );
      await expect(releasePlan(tx, p.plan.id, 1, dispatcher)).rejects.toThrow(
        'explicit deferral override',
      );
      expect((await tx.select().from(s.plans).where(eq(s.plans.id, p.plan.id)))[0]!.status).toBe(
        'DRAFT',
      );
      const ack = await acknowledgeDeferralOverride(
        tx,
        decision.id,
        1,
        dispatcher,
        'No suitable refrigerated vehicle remains; prioritize the next run.',
      );
      expect(ack.version).toBe(2);
      await releasePlan(tx, p.plan.id, 2, dispatcher);
      const [frozen] = await tx.select().from(s.planOrders).where(eq(s.planOrders.id, decision.id));
      expect(frozen!.prioritySource).toBe('LIVE');
      expect(frozen!.deferredPreviousRun).toBe(true);
      expect(frozen!.overrideBy).toBe(dispatcher);
      await expect(
        tx.transaction((inner) =>
          inner
            .update(s.planOrders)
            .set({ overrideReason: 'Changed' })
            .where(eq(s.planOrders.id, decision.id)),
        ),
      ).rejects.toThrow();
    }));
  it('counts positive partial receipts as service and uses calendar-day age', () =>
    isolated(async (tx) => {
      await received(tx, '2026-03-28', 'ambient', 1);
      const f = await organic(tx),
        p = await livePlan(tx, '2026-03-30');
      const result = (await calculateOrderPriorities(tx, p.context, 'Peliyagoda')).find(
        (r) => r.orderId === f.order.id,
      )!;
      expect(result.lastServedDate).toBe('2026-03-28');
      expect(result.daysSinceLastServed).toBe(2);
      expect(result.requiresOverride).toBe(true);
    }));
  it.each(['REJECTED', 'FAILED'] as const)(
    'does not count %s or zero-accepted receipts as service',
    (outcome) =>
      isolated(async (tx) => {
        await received(tx, '2026-03-28', 'ambient', 0, outcome);
        const f = await organic(tx),
          p = await livePlan(tx, '2026-03-30');
        expect(
          (await calculateOrderPriorities(tx, p.context, 'Peliyagoda')).find(
            (r) => r.orderId === f.order.id,
          )!.lastServedDate,
        ).toBeNull();
      }),
  );
  it('keeps chilled service age visible after an ambient receipt', () =>
    isolated(async (tx) => {
      await received(tx, '2026-03-27', 'chilled', 1);
      await received(tx, '2026-03-28', 'ambient', 2, 'DELIVERED');
      const chilled = await organic(tx, 'chilled'),
        p = await livePlan(tx, '2026-03-30');
      const result = (await calculateOrderPriorities(tx, p.context, 'Peliyagoda')).find(
        (r) => r.orderId === chilled.order.id,
      )!;
      expect(result.lastServedDate).toBe('2026-03-28');
      expect(result.temperatureLastServedDate).toBe('2026-03-27');
      expect(result.temperatureDaysSinceLastServed).toBe(3);
    }));
  it('invalidates acknowledgement when the deferral decision changes', () =>
    isolated(async (tx) => {
      const f = await organic(tx),
        p = await livePlan(tx, '2026-03-30'),
        decision = await defer(tx, p.plan.id, f.order.id);
      await acknowledgeDeferralOverride(
        tx,
        decision.id,
        1,
        dispatcher,
        'Explicit operational override',
      );
      await tx
        .update(s.planOrders)
        .set({ rationale: 'A different decision' })
        .where(eq(s.planOrders.id, decision.id));
      const [changed] = await tx
        .select()
        .from(s.planOrders)
        .where(eq(s.planOrders.id, decision.id));
      expect(changed!.overrideAcknowledged).toBe(false);
      expect(changed!.overrideReason).toBeNull();
    }));
  it('rejects missing release snapshots and unauthorized or stale overrides', () =>
    isolated(async (tx) => {
      const f = await organic(tx),
        p = await livePlan(tx, '2026-03-30'),
        decision = await defer(tx, p.plan.id, f.order.id);
      await expect(
        tx.transaction((inner) =>
          inner.update(s.plans).set({ status: 'RELEASED' }).where(eq(s.plans.id, p.plan.id)),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: 'Release requires evaluated priority snapshots',
        }),
      });
      await expect(
        acknowledgeDeferralOverride(tx, decision.id, 1, driver, 'Vehicle shortage'),
      ).rejects.toThrow();
      await expect(
        acknowledgeDeferralOverride(tx, decision.id, 1, dispatcher, '   '),
      ).rejects.toThrow('override reason');
      await acknowledgeDeferralOverride(tx, decision.id, 1, dispatcher, 'Vehicle shortage');
      await expect(
        acknowledgeDeferralOverride(tx, decision.id, 1, dispatcher, 'Changed reason'),
      ).rejects.toThrow();
    }));
  it('reads imported scenario flags without using them as live service history', () =>
    isolated(async (tx) => {
      const f = await organic(tx);
      const [batch] = await tx
        .insert(s.importBatches)
        .values({
          dataset: 'PRIORITY_TEST',
          version: '1',
          checksum: randomUUID(),
          result: 'IMPORTED',
        })
        .returning();
      await tx.insert(s.orderSources).values({
        orderId: f.order.id,
        batchId: batch!.id,
        scenario: 'S1',
        sourceReference: 'X',
        rowPosition: 0,
        sourceContext: {},
        deferredYesterday: true,
        daysSinceLastServed: 5,
      });
      const [c] = await tx
        .insert(s.planningContexts)
        .values({
          kind: 'SCENARIO',
          operatingDate: '2026-03-30',
          batchId: batch!.id,
          scenario: 'S1',
        })
        .returning();
      const metrics = await calculateOrderPriorities(
        tx,
        {
          id: c!.id,
          kind: 'SCENARIO',
          operating_date: c!.operatingDate,
          batch_id: batch!.id,
          scenario: 'S1',
        },
        'Peliyagoda',
      );
      expect(metrics[0]!.daysSinceLastServed).toBe(5);
      expect(metrics[0]!.requiresOverride).toBe(true);
      const live = await livePlan(tx, '2026-03-30');
      expect(
        (await calculateOrderPriorities(tx, live.context, 'Peliyagoda')).some(
          (r) => r.orderId === f.order.id,
        ),
      ).toBe(false);
    }));
  it('documents and authorizes the priority and override endpoints', async () => {
    const app = await buildApp(
      { ...loadConfig(), serveClient: false, logLevel: 'silent' },
      connection!.db,
    );
    try {
      await app.ready();
      expect(
        (
          await app.inject(
            '/api/v1/planning/priorities?contextId=' + randomUUID() + '&depot=Peliyagoda',
          )
        ).statusCode,
      ).toBe(401);
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'driver@waypoint.lk', password: 'Peliyagoda2026!' },
      });
      const cookie = login.cookies.find((c) => c.name === 'waypoint_session')!;
      expect(
        (
          await app.inject({
            url: '/api/v1/planning/priorities?contextId=' + randomUUID() + '&depot=Kandy',
            headers: { cookie: `waypoint_session=${cookie.value}` },
          })
        ).statusCode,
      ).toBe(403);
      const dispatcherLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'dispatcher@waypoint.lk', password: 'Peliyagoda2026!' },
      });
      const dispatcherCookie = dispatcherLogin.cookies.find((c) => c.name === 'waypoint_session')!;
      const [context] = await connection!.db
        .select()
        .from(s.planningContexts)
        .where(eq(s.planningContexts.kind, 'SCENARIO'));
      const response = await app.inject({
        url: `/api/v1/planning/priorities?contextId=${context!.id}&depot=Peliyagoda`,
        headers: { cookie: `waypoint_session=${dispatcherCookie.value}` },
      });
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
      const docs = (await app.inject('/docs/json')).json();
      expect(docs.paths['/api/v1/planning/priorities']).toBeDefined();
      expect(docs.paths['/api/v1/planning/decisions/{planOrderId}/override']).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
