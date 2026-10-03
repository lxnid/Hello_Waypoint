import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import * as s from './schema.js';
import { releasePlan } from '../modules/operations/planning.js';

/** Isolated synthetic demo: seed only once, never reset a judge's execution progress. */
export async function seedDemoWorkflow(db: Database) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('waypoint-demo-seed', 0))`);
    const [existing] = await tx
      .select()
      .from(s.importBatches)
      .where(eq(s.importBatches.dataset, 'SYNTHETIC_WORKFLOW_DEMO'));
    if (existing) return null;
    const accounts = await tx.select().from(s.users);
    const dispatcher = accounts.find((u) => u.email === 'dispatcher@waypoint.lk')!;
    const driver = accounts.find((u) => u.email === 'driver@waypoint.lk')!;
    const manager = accounts.find((u) => u.email === 'manager.out001@waypoint.lk')!;
    const [vehicle] = await tx
      .select()
      .from(s.vehicles)
      .where(
        and(
          eq(s.vehicles.depotId, 'Peliyagoda'),
          eq(s.vehicles.type, 'van'),
          eq(s.vehicles.temperatureCapability, 'reefer'),
        ),
      );
    const [batch] = await tx
      .insert(s.importBatches)
      .values({
        dataset: 'SYNTHETIC_WORKFLOW_DEMO',
        version: '1',
        checksum: 'synthetic-workflow-v1',
        result: 'IMPORTED',
      })
      .returning();
    const [context] = await tx
      .insert(s.planningContexts)
      .values({
        kind: 'SCENARIO',
        operatingDate: '2026-03-30',
        batchId: batch!.id,
        scenario: 'DEMO',
      })
      .returning();
    const [plan] = await tx
      .insert(s.plans)
      .values({
        contextId: context!.id,
        depotId: 'Peliyagoda',
        createdBy: dispatcher.id,
        policyNotes:
          'Synthetic walkthrough: allocate ambient goods; explicitly defer chilled demand.',
      })
      .returning();
    await tx
      .insert(s.vehicleAvailability)
      .values({ contextId: context!.id, vehicleId: vehicle!.id, status: 'available' });
    const catalog = await tx.select().from(s.products).where(eq(s.products.brandId, 'Fresh'));
    const [trip] = await tx
      .insert(s.trips)
      .values({
        planId: plan!.id,
        vehicleId: vehicle!.id,
        driverId: driver.id,
        tripNumber: 1,
        brandId: 'Fresh',
        districtId: 'Colombo',
      })
      .returning();
    for (const [position, product] of catalog.entries()) {
      const [order] = await tx
        .insert(s.orders)
        .values({
          publicReference: `DEMO-${product.sku}`,
          outletId: 'OUT001',
          format: 'ITEMIZED',
          temperatureRequirement: product.temperatureRequirement,
          requestedDate: '2026-03-30',
          eligibleDate: '2026-03-30',
          createdBy: manager.id,
        })
        .returning();
      await tx.insert(s.orderLines).values({
        orderId: order!.id,
        productId: product.id,
        lineNumber: 1,
        quantity: 2,
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
        .set({ status: 'SUBMITTED', submittedAt: new Date('2026-03-28T10:00:00Z') })
        .where(eq(s.orders.id, order!.id));
      await tx.insert(s.orderSources).values({
        orderId: order!.id,
        batchId: batch!.id,
        scenario: 'DEMO',
        sourceReference: product.sku,
        rowPosition: position,
        sourceContext: { synthetic: true },
      });
      const ambient = product.temperatureRequirement === 'ambient';
      const [decision] = await tx
        .insert(s.planOrders)
        .values({
          planId: plan!.id,
          orderId: order!.id,
          decision: ambient ? 'ALLOCATED' : 'DEFERRED',
          reasonCode: ambient ? null : 'DEMO_POLICY',
          rationale: ambient
            ? null
            : 'Synthetic deferral for walkthrough; no warehouse inventory claim.',
          nextEligibleDate: ambient ? null : '2026-03-31',
          decidedBy: dispatcher.id,
          decidedAt: new Date('2026-03-28T11:00:00Z'),
        })
        .returning();
      if (ambient)
        await tx.insert(s.tripStops).values({
          planId: plan!.id,
          tripId: trip!.id,
          planOrderId: decision!.id,
          orderId: order!.id,
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
        });
    }
    await releasePlan(tx, plan!.id, 1, dispatcher.id);
  });
}
