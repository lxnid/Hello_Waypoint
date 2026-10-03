import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { createDatabase, type Database } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import * as s from '../src/db/schema.js';
import type { Transaction } from '../src/modules/operations/service.js';
const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated test database required');
const connection = url ? createDatabase(url) : null;
const suite = connection ? describe : describe.skip;
beforeAll(async () => {
  if (connection) {
    await seed(url!, 'Peliyagoda2026!');
    process.env.PROOF_STORAGE_PATH = `/tmp/waypoint-proof-${randomUUID()}`;
  }
});
afterAll(async () => {
  await connection?.sql.end();
});
async function isolated(
  work: (tx: Transaction, app: FastifyInstance, cookies: Record<string, string>) => Promise<void>,
) {
  const rollback = new Error('ROLLBACK');
  try {
    await connection!.db.transaction(async (tx) => {
      const app = await buildApp(
        { ...loadConfig(), serveClient: false, logLevel: 'error' },
        tx as unknown as Database,
      );
      try {
        await app.ready();
        const cookies: Record<string, string> = {};
        for (const role of ['dispatcher', 'loader', 'driver', 'manager.out001']) {
          const r = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { email: `${role}@waypoint.lk`, password: 'Peliyagoda2026!' },
          });
          expect(r.statusCode).toBe(200);
          cookies[role] =
            `waypoint_session=${r.cookies.find((c) => c.name === 'waypoint_session')!.value}`;
        }
        await work(tx, app, cookies);
        throw rollback;
      } finally {
        await app.close();
      }
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function call(
  app: FastifyInstance,
  cookie: string,
  method: HTTPMethods,
  path: string,
  payload: object = {},
) {
  const r = await app.inject({
    method,
    url: `/api/v1${path}`,
    headers: { cookie },
    ...(method === 'GET' ? {} : { payload }),
  });
  if (r.statusCode !== 200) throw new Error(`${method} ${path}: ${r.statusCode} ${r.body}`);
  return r.json();
}
async function scenario(
  tx: Transaction,
  app: FastifyInstance,
  c: Record<string, string>,
  quantity = 2,
) {
  const catalog = await call(app, c['manager.out001']!, 'GET', '/catalog');
  const product = catalog.find(
    (p: { temperature_requirement: string }) => p.temperature_requirement === 'ambient',
  );
  const order = await call(app, c['manager.out001']!, 'POST', '/orders', {
    requestedDate: '2026-03-30',
    temperatureRequirement: 'ambient',
    lines: [{ productId: product.id, quantity }],
  });
  // Historical scenario time isolates the fixture from today's intake cutoff.
  await tx
    .update(s.orders)
    .set({ status: 'SUBMITTED', submittedAt: new Date('2026-03-28T10:30:00Z') })
    .where(eq(s.orders.id, order.id));
  const [batch] = await tx
    .insert(s.importBatches)
    .values({ dataset: 'HTTP_TEST', version: '1', checksum: randomUUID(), result: 'IMPORTED' })
    .returning();
  await tx.insert(s.orderSources).values({
    orderId: order.id,
    batchId: batch!.id,
    scenario: 'HTTP',
    sourceReference: order.publicReference,
    rowPosition: 0,
    sourceContext: {},
  });
  const [context] = await tx
    .insert(s.planningContexts)
    .values({ kind: 'SCENARIO', operatingDate: '2026-03-30', batchId: batch!.id, scenario: 'HTTP' })
    .returning();
  const [vehicle] = await tx.select().from(s.vehicles).where(eq(s.vehicles.type, 'van'));
  await tx
    .insert(s.vehicleAvailability)
    .values({ contextId: context!.id, vehicleId: vehicle!.id, status: 'available' });
  const plan = await call(app, c.dispatcher!, 'POST', '/planning/plans', {
    contextId: context!.id,
    depot: 'Peliyagoda',
  });
  const generated = await call(app, c.dispatcher!, 'POST', `/planning/plans/${plan.id}/generate`, {
    version: 1,
  });
  return { order, plan, generated, context };
}
suite('operational HTTP workflows', () => {
  it('edits drafts, scopes reads and rejects invalid pagination', () =>
    isolated(async (_tx, app, c) => {
      const products = await call(app, c['manager.out001']!, 'GET', '/catalog');
      const input = {
        requestedDate: '2026-03-30',
        temperatureRequirement: 'ambient',
        lines: [
          {
            productId: products.find(
              (p: { temperature_requirement: string }) => p.temperature_requirement === 'ambient',
            ).id,
            quantity: 2,
          },
        ],
      };
      const order = await call(app, c['manager.out001']!, 'POST', '/orders', input);
      await call(app, c['manager.out001']!, 'PUT', `/orders/${order.id}`, {
        ...input,
        lines: [{ ...input.lines[0], quantity: 3 }],
      });
      const detail = await call(app, c['manager.out001']!, 'GET', `/orders/${order.id}`);
      expect(detail.lines[0].quantity).toBe(3);
      const denied = await app.inject({
        url: `/api/v1/orders/${order.id}`,
        headers: { cookie: c.driver! },
      });
      expect(denied.statusCode).toBe(404);
      expect(
        (await app.inject({ url: '/api/v1/orders?cursor=bad', headers: { cookie: c.dispatcher! } }))
          .statusCode,
      ).toBe(400);
      await call(app, c['manager.out001']!, 'DELETE', `/orders/${order.id}`);
    }));
  it('runs assisted allocation, loading, proof, offline replay, receipt and return through HTTP', () =>
    isolated(async (tx, app, c) => {
      const f = await scenario(tx, app, c);
      expect(f.generated.tripCount).toBe(1);
      expect(
        (
          await call(app, c.dispatcher!, 'POST', `/planning/plans/${f.plan.id}/validate`, {
            version: 2,
          })
        ).valid,
      ).toBe(true);
      expect((await tx.select().from(s.loadManifests)).some((m) => m.tripId === f.plan.id)).toBe(
        false,
      );
      const released = await call(
        app,
        c.dispatcher!,
        'POST',
        `/planning/plans/${f.plan.id}/release`,
        { version: 2 },
      );
      const detail = await call(app, c.dispatcher!, 'GET', `/planning/plans/${f.plan.id}`);
      const trip = detail.trips[0],
        stop = trip.stops[0];
      const order = await call(app, c['manager.out001']!, 'GET', `/orders/${f.order.id}`),
        line = order.lines[0];
      await call(app, c.loader!, 'PUT', `/stops/${stop.id}/load`, {
        lines: [{ orderLineId: line.id, loadedQuantity: 2, damagedQuantity: 0 }],
      });
      await call(app, c.loader!, 'POST', `/trips/${trip.id}/sign-load`);
      await call(app, c.driver!, 'PUT', `/trips/${trip.id}/inspection`, {
        startingOdometerKm: '100',
        fuelChecked: true,
        chillerChecked: false,
      });
      await call(app, c.dispatcher!, 'POST', `/trips/${trip.id}/depart`);
      const arrivalCommand = {
        clientOperationId: randomUUID(),
        planId: f.plan.id,
        planVersion: released.version,
        action: 'ARRIVAL',
        stopId: stop.id,
        capturedAt: stop.planned_arrival_at,
      };
      const arrived = await call(app, c.driver!, 'POST', '/sync', { commands: [arrivalCommand] });
      const attemptId = arrived.results[0].result.attemptId;
      expect(
        (await call(app, c.driver!, 'POST', '/sync', { commands: [arrivalCommand] })).results[0]
          .result.attemptId,
      ).toBe(attemptId);
      const proofId = randomUUID(),
        png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==',
          'base64',
        );
      const uploadPath = `/api/v1/proof/${proofId}?ownerType=attempt&ownerId=${attemptId}&kind=SIGNATURE`;
      const upload = () =>
        app.inject({
          method: 'PUT',
          url: uploadPath,
          headers: { cookie: c.driver!, 'content-type': 'image/png' },
          payload: png,
        });
      expect((await upload()).statusCode).toBe(200);
      expect((await upload()).statusCode).toBe(200);
      const time = new Date(
        new Date(stop.planned_arrival_at).getTime() + 16 * 60_000,
      ).toISOString();
      const completion = {
        clientOperationId: randomUUID(),
        planId: f.plan.id,
        planVersion: released.version,
        action: 'DELIVERY',
        attemptId,
        capturedAt: time,
        payload: {
          outcome: 'DELIVERED',
          completedAt: time,
          receiverName: 'Store receiver',
          lines: [{ orderLineId: line.id, deliveredQuantity: 2, rejectedQuantity: 0 }],
          proofIds: [proofId],
        },
      };
      const completed = await call(app, c.driver!, 'POST', '/sync', { commands: [completion] });
      expect(completed.results[0].applied).toBe(true);
      expect((await call(app, c.driver!, 'GET', `/trips/${trip.id}`)).trip.status).toBe(
        'AWAITING_RETURN',
      );
      await call(app, c.driver!, 'POST', `/trips/${trip.id}/return`, {
        returnedAt: new Date(new Date(time).getTime() + 24 * 60_000).toISOString(),
        endingOdometerKm: '124',
        actualFuelL: '2.000',
      });
      // Store sign-off remains available after vehicle return and plan closure.
      await call(app, c['manager.out001']!, 'POST', `/attempts/${attemptId}/receipt`, {
        outcome: 'DELIVERED',
        lines: [
          {
            orderLineId: line.id,
            acceptedQuantity: 2,
            missingQuantity: 0,
            damagedQuantity: 0,
            rejectedQuantity: 0,
          },
        ],
      });
      expect(
        (await call(app, c['manager.out001']!, 'GET', `/orders/${f.order.id}`)).order.status,
      ).toBe('COMPLETED');
      expect(
        (await call(app, c.dispatcher!, 'GET', `/planning/plans/${f.plan.id}`)).plan.status,
      ).toBe('COMPLETED');
      expect(
        (await call(app, c.driver!, 'POST', '/sync', { commands: [completion] })).results[0]
          .applied,
      ).toBe(true);
      const changed = await call(app, c.driver!, 'POST', '/sync', {
        commands: [
          { ...completion, capturedAt: new Date(new Date(time).getTime() + 1000).toISOString() },
        ],
      });
      expect(changed.results[0].applied).toBe(false);
      const data = await app.inject({
        url: `/api/v1/proof/${proofId}`,
        headers: { cookie: c['manager.out001']! },
      });
      expect(data.statusCode).toBe(200);
    }));
  it('defers infeasible demand with reasons and protects draft versions', () =>
    isolated(async (tx, app, c) => {
      const f = await scenario(tx, app, c, 100000);
      expect(f.generated.deferredCount).toBe(1);
      const detail = await call(app, c.dispatcher!, 'GET', `/planning/plans/${f.plan.id}`);
      expect(detail.decisions[0].rationale).toMatch(/capacity/);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/planning/plans/${f.plan.id}/generate`,
            headers: { cookie: c.dispatcher! },
            payload: { version: 1 },
          })
        ).statusCode,
      ).toBe(409);
      const released = await call(
        app,
        c.dispatcher!,
        'POST',
        `/planning/plans/${f.plan.id}/release`,
        { version: 2 },
      );
      expect(released.status).toBe('COMPLETED');
    }));
});
