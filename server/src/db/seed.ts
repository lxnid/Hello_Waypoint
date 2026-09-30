import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { hash } from 'bcryptjs';
import { loadConfig } from '../config/env.js';
import { createDatabase } from './client.js';
import { outlets, users, vehicles } from './schema.js';

type OutletCsv = {
  outlet_id: string;
  brand: string;
  district: string;
  depot: 'Peliyagoda' | 'Kandy';
  dock_type: string;
  parking_constraint: string;
  mall_window: string;
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

async function rows<T>(name: string): Promise<T[]> {
  // The copied competition reference files are immutable inputs to repeatable seeding.
  const path = fileURLToPath(new URL(`../../../data/reference/${name}`, import.meta.url));
  return parse(await readFile(path, 'utf8'), { columns: true, skip_empty_lines: true }) as T[];
}

export async function seed(databaseUrl: string, demoPassword: string): Promise<void> {
  if (!demoPassword) throw new Error('DEMO_PASSWORD is required for seeding');
  const { db, sql } = createDatabase(databaseUrl);
  try {
    const outletRows = await rows<OutletCsv>('outlets.csv');
    const vehicleRows = await rows<VehicleCsv>('vehicles.csv');
    if (outletRows.length !== 120 || vehicleRows.length !== 60)
      throw new Error('Unexpected reference data counts');
    await db.transaction(async (tx) => {
      for (const item of outletRows) {
        await tx
          .insert(outlets)
          .values({
            id: item.outlet_id,
            brand: item.brand,
            district: item.district,
            depot: item.depot,
            dockType: item.dock_type,
            parkingConstraint: item.parking_constraint,
            mallWindow: item.mall_window || null,
            windowOpenTime: item.window_open_time,
            windowCloseTime: item.window_close_time,
          })
          .onConflictDoNothing();
      }
      for (const item of vehicleRows) {
        await tx
          .insert(vehicles)
          .values({
            id: item.vehicle_id,
            type: item.type,
            temperatureCapability: item.temp,
            weightCapKg: item.weight_cap_kg,
            volumeCapM3: item.volume_cap_m3,
            fuelType: item.fuel_type,
            kmPerL: item.km_per_l,
            weeklyFuelQuotaL: item.weekly_fuel_quota_l,
            depot: item.depot,
          })
          .onConflictDoNothing();
      }
      const passwordHash = await hash(demoPassword, 12);
      const accounts = [
        {
          email: 'dispatcher@waypoint.lk',
          displayName: 'Dinesh Wickramasinghe',
          role: 'DISPATCHER' as const,
          depot: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'loader@waypoint.lk',
          displayName: 'Kavinda Rathnayake',
          role: 'LOADER' as const,
          depot: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver@waypoint.lk',
          displayName: 'Sunil Fernando',
          role: 'DRIVER' as const,
          depot: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'manager.out001@waypoint.lk',
          displayName: 'Anoma Jayawardena',
          role: 'STORE_MANAGER' as const,
          depot: 'Peliyagoda' as const,
          outletId: 'OUT001',
        },
      ];
      for (const account of accounts)
        await tx
          .insert(users)
          .values({ ...account, passwordHash })
          .onConflictDoNothing();
    });
    console.info(
      `Seed complete: ${outletRows.length} outlets, ${vehicleRows.length} vehicles, four demo accounts`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  await seed(config.databaseUrl, config.demoPassword);
}
