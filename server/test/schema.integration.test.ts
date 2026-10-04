import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import * as s from '../src/db/schema.js';
import {
  cutoffRunOffset,
  createOrderDraft,
  editPlan,
  submitOrder,
  synchronize,
  authorizeDeparture,
} from '../src/modules/operations/service.js';
import { importPeakScenario, importHistory } from '../src/modules/operations/imports.js';
import { releasePlan } from '../src/modules/operations/planning.js';
import { planningRead as planDetail } from '../src/modules/operations/reads.js';
import {
  recordLoad,
  completeLoading,
  recordArrival,
  completeDelivery,
  confirmReceipt,
} from '../src/modules/operations/execution.js';

const connection = process.env.TEST_DATABASE_URL
  ? createDatabase(process.env.TEST_DATABASE_URL)
  : null;
const db = connection?.db;
if (
  process.env.TEST_DATABASE_URL &&
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
)
  throw new Error('Schema integration tests require a dedicated *_test database');
const suite = connection ? describe : describe.skip;
let dispatcher: string, loader: string, driver: string, manager: string, productId: string;
beforeAll(async () => {
  if (!connection) return;
  await seed(process.env.TEST_DATABASE_URL!, 'Peliyagoda2026!');
  const accounts = await db!.select().from(s.users);
  dispatcher = accounts.find((u) => u.role === 'DISPATCHER')!.id;
  loader = accounts.find((u) => u.role === 'LOADER')!.id;
  driver = accounts.find((u) => u.role === 'DRIVER')!.id;
  manager = accounts.find((u) => u.role === 'STORE_MANAGER')!.id;
  productId = (await db!.select().from(s.products).where(eq(s.products.sku, 'DEMO-FRESH-DRY')))[0]!
    .id;
});
afterAll(async () => {
  await connection?.sql.end();
});
async function draft(quantity = 2) {
  const [order] = await db!
    .insert(s.orders)
    .values({
      publicReference: `TEST-${randomUUID()}`,
      outletId: 'OUT001',
      format: 'ITEMIZED',
      temperatureRequirement: 'ambient',
      requestedDate: '2026-03-30',
      eligibleDate: '2026-03-30',
      createdBy: manager,
    })
    .returning();
  const [line] = await db!
    .insert(s.orderLines)
    .values({
      orderId: order!.id,
      productId,
      lineNumber: 1,
      quantity,
      sku: 'temporary',
      name: 'temporary',
      orderingUnit: 'case',
      temperatureRequirement: 'ambient',
      unitWeightKg: '1',
      unitVolumeM3: '0.001',
    })
    .returning();
  return { order: order!, line: line! };
}
async function scenario(quantity = 2, aggregate = false) {
  const input = await draft(quantity);
  if (aggregate) {
    await db!.delete(s.orderLines).where(eq(s.orderLines.id, input.line.id));
    await db!.update(s.orders).set({ format: 'AGGREGATE' }).where(eq(s.orders.id, input.order.id));
    await db!
      .insert(s.orderAggregates)
      .values({ orderId: input.order.id, units: quantity, weightKg: '16', volumeM3: '0.080' });
    await db!
      .update(s.orders)
      .set({ status: 'SUBMITTED', submittedAt: new Date('2026-03-28T10:30:00Z') })
      .where(eq(s.orders.id, input.order.id));
  } else {
    await submitOrder(db!, input.order.id, manager, new Date('2026-03-28T10:30:00Z'));
  }
  const [batch] = await db!
    .insert(s.importBatches)
    .values({ dataset: 'TEST', version: '1', checksum: randomUUID(), result: 'IMPORTED' })
    .returning();
  await db!.insert(s.orderSources).values({
    orderId: input.order.id,
    batchId: batch!.id,
    scenario: 'S1',
    sourceReference: 'A',
    rowPosition: 0,
    sourceContext: {},
  });
  const [context] = await db!
    .insert(s.planningContexts)
    .values({ kind: 'SCENARIO', operatingDate: '2026-03-30', batchId: batch!.id, scenario: 'S1' })
    .returning();
  const [plan] = await db!
    .insert(s.plans)
    .values({ contextId: context!.id, depotId: 'Peliyagoda', createdBy: dispatcher })
    .returning();
  const [vehicle] = await db!
    .select()
    .from(s.vehicles)
    .where(and(eq(s.vehicles.depotId, 'Peliyagoda'), eq(s.vehicles.type, 'van')));
  await db!
    .insert(s.vehicleAvailability)
    .values({ contextId: context!.id, vehicleId: vehicle!.id, status: 'available' });
  const [decision] = await db!
    .insert(s.planOrders)
    .values({ planId: plan!.id, orderId: input.order.id, decision: 'ALLOCATED' })
    .returning();
  const [trip] = await db!
    .insert(s.trips)
    .values({
      planId: plan!.id,
      vehicleId: vehicle!.id,
      driverId: driver,
      tripNumber: 1,
      brandId: 'Fresh',
      districtId: 'Colombo',
    })
    .returning();
  const [stop] = await db!
    .insert(s.tripStops)
    .values({
      planId: plan!.id,
      tripId: trip!.id,
      planOrderId: decision!.id,
      orderId: input.order.id,
      sequence: 0,
      plannedDepartAt: new Date('2026-03-30T00:00:00Z'),
      plannedTravelMinutes: '24',
      plannedArrivalAt: new Date('2026-03-30T00:24:00Z'),
      serviceAllowanceMinutes: '16',
      distanceKm: '12',
      windowOpenAt: new Date('2026-03-29T23:30:00Z'),
      windowCloseAt: new Date('2026-03-30T02:00:00Z'),
      dockType: 'street',
      parkingConstraint: 'van_only',
    })
    .returning();
  return { ...input, plan: plan!, context: context!, trip: trip!, stop: stop!, vehicle: vehicle! };
}
suite('normalized operational database', () => {
  it('uses native UUID defaults and preserves typed reference data and network scope', async () => {
    const uuid = (await db!.execute<{ id: string }>(sql`SELECT gen_random_uuid()::text AS id`))[0]!
      .id;
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect((await db!.select().from(s.outlets)).length).toBe(120);
    expect((await db!.select().from(s.vehicles)).length).toBe(60);
    expect(
      (await db!.select().from(s.users).where(eq(s.users.id, dispatcher)))[0]!.depotId,
    ).toBeNull();
  });
  it('creates catalog-backed drafts only for the store manager', async () => {
    const order = await createOrderDraft(db!, manager, {
      requestedDate: '2026-03-30',
      temperatureRequirement: 'ambient',
      lines: [{ productId, quantity: 2 }],
    });
    expect(order.outletId).toBe('OUT001');
    expect(
      await db!.select().from(s.orderLines).where(eq(s.orderLines.orderId, order.id)),
    ).toHaveLength(1);
    await expect(
      createOrderDraft(db!, driver, {
        requestedDate: '2026-03-30',
        temperatureRequirement: 'ambient',
        lines: [{ productId, quantity: 2 }],
      }),
    ).rejects.toThrow('authorized');
    await expect(
      createOrderDraft(db!, manager, {
        requestedDate: '2026-03-30',
        temperatureRequirement: 'chilled',
        lines: [{ productId, quantity: 2 }],
      }),
    ).rejects.toThrow('available');
  });
  it('submits after-cutoff orders on the following operating run and freezes lines', async () => {
    const { order, line } = await draft();
    const submitted = await submitOrder(
      db!,
      order.id,
      manager,
      new Date('2026-03-28T10:30:00.001Z'),
    );
    expect(submitted.eligibleDate).toBe('2026-03-31');
    expect(cutoffRunOffset(new Date('2026-03-28T10:30:00Z'))).toBe(0);
    expect(
      (await db!.select().from(s.orderLines).where(eq(s.orderLines.id, line.id)))[0]!.unitWeightKg,
    ).toBe('8.00');
    await expect(
      db!.update(s.orderLines).set({ quantity: 3 }).where(eq(s.orderLines.id, line.id)),
    ).rejects.toThrow();
  });
  it('rejects aggregate/itemized mixing and cross-plan assignments', async () => {
    const f = await scenario();
    await expect(
      db!
        .insert(s.orderAggregates)
        .values({ orderId: f.order.id, units: 1, weightKg: '1', volumeM3: '1' }),
    ).rejects.toThrow();
    await expect(
      db!
        .insert(s.tripStops)
        .values({ ...f.stop, id: randomUUID(), planId: randomUUID(), sequence: 1 }),
    ).rejects.toThrow();
  });
  it('rolls back over-capacity release without creating manifests or reservations', async () => {
    const f = await scenario(100000);
    await expect(releasePlan(db!, f.plan.id, 1, dispatcher)).rejects.toThrow('capacity');
    expect(
      (await db!.select().from(s.loadManifests).where(eq(s.loadManifests.tripId, f.trip.id)))
        .length,
    ).toBe(0);
    expect(
      (
        await db!
          .select()
          .from(s.tripFuelReservations)
          .where(eq(s.tripFuelReservations.tripId, f.trip.id))
      ).length,
    ).toBe(0);
  });
  it('allows exactly one concurrent release and creates one manifest', async () => {
    const f = await scenario();
    const results = await Promise.allSettled([
      releasePlan(db!, f.plan.id, 1, dispatcher),
      releasePlan(db!, f.plan.id, 1, dispatcher),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db!.select().from(s.loadManifests).where(eq(s.loadManifests.tripId, f.trip.id)),
    ).toHaveLength(1);
    await expect(editPlan(db!, f.plan.id, 2, dispatcher, async () => null)).rejects.toThrow();
    await expect(
      db!.update(s.tripStops).set({ sequence: 2 }).where(eq(s.tripStops.id, f.stop.id)),
    ).rejects.toThrow();
  });
  it.each(['workshop', 'brand', 'driver', 'window', 'van access'] as const)(
    'rejects %s feasibility violations',
    async (rule) => {
      const f = await scenario();
      if (rule === 'workshop')
        await db!
          .update(s.vehicleAvailability)
          .set({ status: 'in_workshop' })
          .where(eq(s.vehicleAvailability.contextId, f.context.id));
      if (rule === 'brand')
        await db!.update(s.trips).set({ brandId: 'Style' }).where(eq(s.trips.id, f.trip.id));
      if (rule === 'driver')
        await db!.update(s.trips).set({ driverId: manager }).where(eq(s.trips.id, f.trip.id));
      if (rule === 'window')
        await db!
          .update(s.tripStops)
          .set({ windowCloseAt: new Date('2026-03-30T00:25:00Z') })
          .where(eq(s.tripStops.id, f.stop.id));
      if (rule === 'van access') {
        const [truck] = await db!
          .select()
          .from(s.vehicles)
          .where(and(eq(s.vehicles.depotId, 'Peliyagoda'), eq(s.vehicles.type, 'truck')));
        await db!
          .insert(s.vehicleAvailability)
          .values({ contextId: f.context.id, vehicleId: truck!.id, status: 'available' });
        await db!.update(s.trips).set({ vehicleId: truck!.id }).where(eq(s.trips.id, f.trip.id));
      }
      await expect(releasePlan(db!, f.plan.id, 1, dispatcher)).rejects.toThrow();
    },
  );
  it('accounts for opening weekly fuel usage before release', async () => {
    const f = await scenario();
    await db!.insert(s.vehicleWeekBudgets).values({
      namespace: `SCENARIO:${f.context.batchId}:S1`,
      vehicleId: f.vehicle.id,
      weekStart: '2026-03-30',
      quotaL: f.vehicle.weeklyFuelQuotaL,
      openingUsageL: f.vehicle.weeklyFuelQuotaL,
    });
    await expect(releasePlan(db!, f.plan.id, 1, dispatcher)).rejects.toThrow('fuel quota');
  });
  it('imports aggregate sources idempotently without inventing product lines', async () => {
    const identifier = randomUUID();
    const input = {
      ordersCsv: `scenario,order_ref,outlet_id,brand,district,depot,temp_requirement,order_units,order_weight_kg,order_volume_m3,deferred_yesterday,days_since_last_served\n${identifier},SOURCE-1,OUT001,Fresh,Colombo,Peliyagoda,ambient,2,16,0.08,0,1\n`,
      fleetCsv: `scenario,vehicle_id,status\n${identifier},VEH001,available\n`,
      operatingDate: '2026-03-30',
      version: '1',
    };
    const first = await importPeakScenario(db!, input),
      second = await importPeakScenario(db!, input);
    expect(first.batchId).toBe(second.batchId);
    expect(second.imported).toBe(false);
    const [source] = await db!
      .select()
      .from(s.orderSources)
      .where(eq(s.orderSources.batchId, first.batchId));
    expect(source!.sourceReference).toBe('SOURCE-1');
    expect(source!.rowPosition).toBe(0);
    expect(
      await db!.select().from(s.orderLines).where(eq(s.orderLines.orderId, source!.orderId)),
    ).toHaveLength(0);
    expect(
      await db!
        .select()
        .from(s.orderAggregates)
        .where(eq(s.orderAggregates.orderId, source!.orderId)),
    ).toHaveLength(1);
  });
  it('rejects unmatched historical legs instead of guessing joins', async () => {
    await expect(
      importHistory(db!, {
        dataset: 'TEST_HISTORY',
        version: '1',
        ordersCsv:
          'delivery_id,route_id,dispatch_date,seq_in_route,outlet_id\nA,R1,2026-03-30,0,OUT001\n',
        legsCsv: 'route_id,date,seq,to_outlet\nR1,2026-03-30,0,OUT002\n',
      }),
    ).rejects.toThrow('exactly one route leg');
  });
  it('deduplicates concurrent offline commands and rejects changed payloads', async () => {
    const input = {
      actorId: driver,
      clientOperationId: randomUUID(),
      capturedAt: new Date(),
      payload: { action: 'test', quantity: 1 },
    };
    let executions = 0;
    const apply = async () => ({ count: ++executions });
    const results = await Promise.all([
      synchronize(db!, input, apply),
      synchronize(db!, input, apply),
    ]);
    expect(results).toEqual([{ count: 1 }, { count: 1 }]);
    expect(executions).toBe(1);
    await expect(synchronize(db!, { ...input, payload: { quantity: 2 } }, apply)).rejects.toThrow(
      'reused',
    );
  });
  it('tracks aggregate actuals and rejects loading beyond source totals', async () => {
    const f = await scenario(2, true);
    await releasePlan(db!, f.plan.id, 1, dispatcher);
    await expect(
      db!.transaction((tx) =>
        recordLoad(tx, loader, f.stop.id, {
          aggregate: { units: 3, weightKg: '16', volumeM3: '0.080' },
        }),
      ),
    ).rejects.toThrow();
    await db!.transaction((tx) =>
      recordLoad(tx, loader, f.stop.id, {
        aggregate: { units: 1, weightKg: '8', volumeM3: '0.040' },
      }),
    );
    await db!.transaction((tx) => completeLoading(tx, loader, f.trip.id));
    await db!.insert(s.tripInspections).values({
      tripId: f.trip.id,
      driverId: driver,
      startingOdometerKm: '100',
      fuelChecked: true,
      chillerChecked: true,
      inspectedAt: new Date(),
    });
    const inspectedPlan = await planDetail(db!, dispatcher, f.plan.id);
    const inspectedTrip = inspectedPlan.trips.find((trip) => trip.id === f.trip.id)!;
    expect(inspectedTrip.dispatch_ready).toBe(true);
    expect(inspectedTrip.dispatch_block_reason).toBeNull();
    await authorizeDeparture(db!, f.trip.id, dispatcher);
    const dispatchedPlan = await planDetail(db!, dispatcher, f.plan.id);
    const dispatchedTrip = dispatchedPlan.trips.find((trip) => trip.id === f.trip.id)!;
    expect(dispatchedTrip.status).toBe('DISPATCHED');
    expect(dispatchedTrip.dispatch_ready).toBe(false);
    const arrival = await db!.transaction((tx) =>
      recordArrival(tx, driver, f.stop.id, new Date('2026-03-30T00:24:00Z')),
    );
    await db!.transaction((tx) =>
      completeDelivery(tx, driver, arrival.attemptId, {
        outcome: 'PARTIAL',
        completedAt: new Date('2026-03-30T00:40:00Z'),
        deliveredUnits: 1,
        deliveredWeightKg: '8',
        deliveredVolumeM3: '0.040',
      }),
    );
    await db!.transaction((tx) =>
      confirmReceipt(tx, manager, arrival.attemptId, {
        outcome: 'PARTIAL',
        aggregate: { acceptedUnits: 1, missingUnits: 0, damagedUnits: 0, rejectedUnits: 0 },
      }),
    );
    expect(
      (await db!.select().from(s.receipts).where(eq(s.receipts.attemptId, arrival.attemptId)))[0]!
        .acceptedUnits,
    ).toBe(1);
  });
  it('tracks a partial load through dispatch, driver completion and independent store receipt', async () => {
    const f = await scenario();
    await releasePlan(db!, f.plan.id, 1, dispatcher);
    await db!.transaction((tx) =>
      recordLoad(tx, loader, f.stop.id, {
        lines: [{ orderLineId: f.line.id, loadedQuantity: 1, damagedQuantity: 1 }],
      }),
    );
    await db!.transaction((tx) => completeLoading(tx, loader, f.trip.id));
    await expect(
      db!
        .update(s.loadLineRecords)
        .set({ loadedQuantity: 2 })
        .where(eq(s.loadLineRecords.stopId, f.stop.id)),
    ).rejects.toThrow();
    const loadedPlan = await planDetail(db!, dispatcher, f.plan.id);
    const loadedTrip = loadedPlan.trips.find((trip) => trip.id === f.trip.id)!;
    expect(loadedTrip.manifest_status).toBe('COMPLETED');
    expect(loadedTrip.dispatch_ready).toBe(false);
    expect(loadedTrip.dispatch_block_reason).toBe(
      'The assigned driver must complete the pre-trip inspection',
    );
    await expect(authorizeDeparture(db!, f.trip.id, dispatcher)).rejects.toThrow(
      'pre-trip inspection',
    );
    await db!.insert(s.tripInspections).values({
      tripId: f.trip.id,
      driverId: driver,
      startingOdometerKm: '100',
      fuelChecked: true,
      chillerChecked: true,
      inspectedAt: new Date(),
    });
    await authorizeDeparture(db!, f.trip.id, dispatcher);
    const arrival = await db!.transaction((tx) =>
      recordArrival(tx, driver, f.stop.id, new Date('2026-03-30T00:24:00Z')),
    );
    await db!.transaction((tx) =>
      completeDelivery(tx, driver, arrival.attemptId, {
        outcome: 'PARTIAL',
        completedAt: new Date('2026-03-30T00:40:00Z'),
        lines: [{ orderLineId: f.line.id, deliveredQuantity: 1, rejectedQuantity: 0 }],
      }),
    );
    expect(
      await db!.select().from(s.receipts).where(eq(s.receipts.attemptId, arrival.attemptId)),
    ).toHaveLength(0);
    await db!.transaction((tx) =>
      confirmReceipt(tx, manager, arrival.attemptId, {
        outcome: 'PARTIAL',
        lines: [
          {
            orderLineId: f.line.id,
            acceptedQuantity: 1,
            missingQuantity: 0,
            damagedQuantity: 0,
            rejectedQuantity: 0,
          },
        ],
      }),
    );
    expect((await db!.select().from(s.orders).where(eq(s.orders.id, f.order.id)))[0]!.status).toBe(
      'COMPLETED',
    );
    expect(
      (await db!.select().from(s.orderLines).where(eq(s.orderLines.id, f.line.id)))[0]!.quantity,
    ).toBe(2);
  });
});
