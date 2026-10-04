import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as s from './schema.js';

/** Repeatable competition dataset; existing orders and execution progress are never reset. */
export async function seedUiDemo(db: Database) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('waypoint-ui-demo-v1',0))`);
    const [existing] = await tx
      .select()
      .from(s.importBatches)
      .where(eq(s.importBatches.dataset, 'UI_DEMO_64'));
    if (existing) {
      // Correct only contradictory synthetic history; never rewrite live service records.
      await tx
        .update(s.orderSources)
        .set({ daysSinceLastServed: 1 })
        .where(
          and(
            eq(s.orderSources.batchId, existing.id),
            eq(s.orderSources.deferredYesterday, true),
            eq(s.orderSources.daysSinceLastServed, 0),
          ),
        );
      return;
    }
    const [dispatcher] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.email, 'dispatcher@waypoint.lk'));
    if (!dispatcher) throw new Error('Seed demo accounts before UI orders');
    const stores = await tx.select().from(s.outlets).orderBy(s.outlets.id);
    const catalog = await tx.select().from(s.products);
    const fleet = await tx.select().from(s.vehicles);
    const date = '2026-04-01';
    const [batch] = await tx
      .insert(s.importBatches)
      .values({
        dataset: 'UI_DEMO_64',
        version: '1',
        checksum: 'ui-demo-64-v1',
        result: 'IMPORTED',
      })
      .returning();
    const [context] = await tx
      .insert(s.planningContexts)
      .values({ kind: 'SCENARIO', operatingDate: date, batchId: batch!.id, scenario: 'UI_DEMO' })
      .returning();
    await tx.insert(s.vehicleAvailability).values(
      fleet.map((vehicle) => ({
        contextId: context!.id,
        vehicleId: vehicle.id,
        status: 'available' as const,
      })),
    );
    await tx.insert(s.plans).values(
      ['Peliyagoda', 'Kandy'].map((depot) => ({
        contextId: context!.id,
        depotId: depot as 'Peliyagoda' | 'Kandy',
        createdBy: dispatcher.id,
        policyNotes:
          'Synthetic competition UI demonstration. Orders and service history are sample data.',
      })),
    );
    for (let index = 0; index < 64; index++) {
      const store = stores[index % stores.length]!;
      const choices = catalog.filter((product) => product.brandId === store.brandId);
      const product = choices[index % choices.length]!;
      const quantity = 8 + (index % 25);
      const [order] = await tx
        .insert(s.orders)
        .values({
          publicReference: `UI-${store.brandId.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
          outletId: store.id,
          format: 'ITEMIZED',
          temperatureRequirement: product.temperatureRequirement,
          requestedDate: date,
          eligibleDate: date,
          createdBy: dispatcher.id,
        })
        .returning();
      await tx.insert(s.orderLines).values({
        orderId: order!.id,
        productId: product.id,
        lineNumber: 1,
        quantity,
        sku: product.sku,
        name: product.name,
        orderingUnit: product.orderingUnit,
        temperatureRequirement: product.temperatureRequirement,
        unitWeightKg: product.unitWeightKg,
        unitVolumeM3: product.unitVolumeM3,
        estimatedUnitValueLkr: product.estimatedUnitValueLkr,
      });
      await tx
        .update(s.orders)
        .set({ status: 'SUBMITTED', submittedAt: new Date('2026-03-31T09:00:00Z') })
        .where(eq(s.orders.id, order!.id));
      await tx.insert(s.orderSources).values({
        orderId: order!.id,
        batchId: batch!.id,
        scenario: 'UI_DEMO',
        sourceReference: order!.publicReference,
        rowPosition: index,
        deferredYesterday: index % 9 === 0,
        daysSinceLastServed: index % 9 === 0 ? Math.max(1, index % 5) : index % 5,
        sourceContext: { synthetic: true, purpose: 'Competition UI demo' },
      });
    }
  });
}
