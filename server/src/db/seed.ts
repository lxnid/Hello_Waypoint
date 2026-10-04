import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { hash } from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { seedPlanningReferences } from './reference-seed.js';
import { loadConfig } from '../config/env.js';
import { createDatabase } from './client.js';
import {
  brands,
  depots,
  districts,
  outlets,
  products,
  productInventory,
  users,
  vehicles,
} from './schema.js';

type OutletCsv = {
  outlet_id: string;
  brand: string;
  district: string;
  depot: 'Peliyagoda' | 'Kandy';
  name?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  contact?: string;
  dock_type: string;
  parking_constraint: string;
  mall_window?: string;
  window_open_time: string;
  window_close_time: string;
};

type VehicleCsv = {
  vehicle_id: string;
  type: string;
  temp: string;
  weight_cap_kg: string;
  volume_cap_m3: string;
  fuel_type: string;
  km_per_l: string;
  weekly_fuel_quota_l: string;
  depot: 'Peliyagoda' | 'Kandy';
};

type ProductCsv = {
  brand_id: string;
  sku: string;
  name: string;
  ordering_unit: string;
  temperature_requirement: 'ambient' | 'chilled';
  unit_weight_kg: string;
  unit_volume_m3: string;
  estimated_unit_value_lkr: string;
  max_order_quantity: string;
  description: string;
  image_url: string;
};

type UserCsv = {
  email: string;
  display_name: string;
  role: 'DISPATCHER' | 'LOADER' | 'DRIVER' | 'STORE_MANAGER';
  depot_id?: string;
  outlet_id?: string;
};

async function rows<T>(name: string): Promise<T[]> {
  const path = fileURLToPath(new URL(`../../../data/reference/${name}`, import.meta.url));
  return parse(await readFile(path, 'utf8'), { columns: true, skip_empty_lines: true }) as T[];
}

export async function seed(
  databaseUrl: string,
  demoPassword: string,
): Promise<void> {
  if (!demoPassword) throw new Error('DEMO_PASSWORD is required for seeding');
  const { db, sql: rawSql } = createDatabase(databaseUrl);
  try {
    const outletRows = await rows<OutletCsv>('outlets.csv');
    const vehicleRows = await rows<VehicleCsv>('vehicles.csv');
    const productRows = await rows<ProductCsv>('products.csv');
    const userRows = await rows<UserCsv>('users.csv');

    if (
      outletRows.length !== 120 ||
      vehicleRows.length !== 60 ||
      productRows.length !== 17 ||
      userRows.length !== 153
    ) {
      throw new Error(
        `Unexpected reference data counts: ${outletRows.length} outlets, ${vehicleRows.length} vehicles, ${productRows.length} products, ${userRows.length} users`,
      );
    }

    await db.transaction(async (tx) => {
      // 1. Depots
      await tx
        .insert(depots)
        .values([
          { id: 'Peliyagoda', name: 'Peliyagoda' },
          { id: 'Kandy', name: 'Kandy' },
        ])
        .onConflictDoNothing();

      // 2. Brands
      await tx
        .insert(brands)
        .values(['Fresh', 'Style', 'Tech'].map((id) => ({ id, name: `Waypoint ${id}` })))
        .onConflictDoNothing();

      // 3. Districts & Outlets
      for (let i = 0; i < outletRows.length; i++) {
        const item = outletRows[i]!;
        await tx
          .insert(districts)
          .values({ id: item.district, name: item.district, depotId: item.depot })
          .onConflictDoNothing();

        const baseLat = item.depot === 'Kandy' ? 7.2906 : 6.9271;
        const baseLng = item.depot === 'Kandy' ? 80.6337 : 79.8612;
        const offsetLat = ((i % 7) - 3) * 0.0082;
        const offsetLng = (((i * 3) % 7) - 3) * 0.0078;
        const fallbackLat = (baseLat + offsetLat).toFixed(7);
        const fallbackLng = (baseLng + offsetLng).toFixed(7);
        const streetNum = 10 + ((i * 13) % 200);

        const outletData = {
          id: item.outlet_id,
          brandId: item.brand,
          districtId: item.district,
          name: item.name || `${item.district} ${(i % 5) + 1} - Waypoint ${item.brand}`,
          address: item.address || `No. ${streetNum}, Main Commercial Road, ${item.district}`,
          latitude: item.latitude || fallbackLat,
          longitude: item.longitude || fallbackLng,
          contact: item.contact || `078 342 ${String(1000 + ((i * 73) % 8999))}`,
          dockType: item.dock_type,
          parkingConstraint: item.parking_constraint,
          mallOpenTime: item.mall_window ? item.mall_window.split('-')[0] : null,
          mallCloseTime: item.mall_window ? item.mall_window.split('-')[1] : null,
          windowOpenTime: item.window_open_time,
          windowCloseTime: item.window_close_time,
        };

        await tx
          .insert(outlets)
          .values(outletData)
          .onConflictDoUpdate({
            target: outlets.id,
            set: outletData,
          });
      }

      // 4. Vehicles
      for (const item of vehicleRows) {
        const vehicleData = {
          id: item.vehicle_id,
          type: item.type,
          temperatureCapability: item.temp,
          weightCapKg: item.weight_cap_kg,
          volumeCapM3: item.volume_cap_m3,
          fuelType: item.fuel_type,
          kmPerL: item.km_per_l,
          weeklyFuelQuotaL: item.weekly_fuel_quota_l,
          depotId: item.depot,
        };
        await tx
          .insert(vehicles)
          .values(vehicleData)
          .onConflictDoUpdate({
            target: vehicles.id,
            set: vehicleData,
          });
      }

      // 5. Products (Clean up any legacy synthetic placeholder products first)
      await tx.execute(
        sql`DELETE FROM products WHERE sku IN ('DEMO-FRESH-DRY','DEMO-FRESH-CHILL','DEMO-STYLE','DEMO-TECH')`,
      );

      for (const item of productRows) {
        const productData = {
          brandId: item.brand_id,
          sku: item.sku,
          name: item.name,
          orderingUnit: item.ordering_unit,
          temperatureRequirement: item.temperature_requirement,
          unitWeightKg: item.unit_weight_kg,
          unitVolumeM3: item.unit_volume_m3,
          estimatedUnitValueLkr: item.estimated_unit_value_lkr,
          maxOrderQuantity: Number(item.max_order_quantity),
          description: item.description,
          imageUrl: item.image_url,
          isActive: true,
        };
        await tx
          .insert(products)
          .values(productData)
          .onConflictDoUpdate({
            target: products.sku,
            set: productData,
          });
      }

      // 6. Product Inventory (both Peliyagoda and Kandy depots)
      const allActiveProducts = await tx
        .select()
        .from(products)
        .where(eq(products.isActive, true));

      for (const prod of allActiveProducts) {
        for (const depotId of ['Peliyagoda', 'Kandy'] as const) {
          const availableQuantity =
            prod.sku === 'FRS-PINEAPPLE' ? 34 : (prod.maxOrderQuantity ?? 20) * 5;
          await tx
            .insert(productInventory)
            .values({
              productId: prod.id,
              depotId,
              availableQuantity,
            })
            .onConflictDoUpdate({
              target: [productInventory.productId, productInventory.depotId],
              set: { availableQuantity },
            });
        }
      }

      // 7. Planning References
      await seedPlanningReferences(tx);

      // 8. Users (all 153 accounts from users.csv)
      const passwordHash = await hash(demoPassword, 12);
      const existingUsers = await tx.select().from(users);
      const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));

      for (const u of userRows) {
        const existing = existingByEmail.get(u.email.toLowerCase());
        const userData = {
          email: u.email,
          displayName: u.display_name,
          role: u.role,
          depotId: (u.depot_id || null) as 'Peliyagoda' | 'Kandy' | null,
          outletId: u.outlet_id || null,
          passwordHash,
          isActive: true,
        };

        if (existing) {
          await tx
            .update(users)
            .set(userData)
            .where(eq(users.id, existing.id));
        } else {
          await tx.insert(users).values(userData);
        }
      }
    });

    console.info(
      `Seed complete: ${outletRows.length} outlets, ${vehicleRows.length} vehicles, ${productRows.length} products, ${userRows.length} users (clean QA master data, no demo orders)`,
    );
  } finally {
    await rawSql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  await seed(config.databaseUrl, config.demoPassword);
}
