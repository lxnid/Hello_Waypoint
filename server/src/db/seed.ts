import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { hash } from 'bcryptjs';
import { seedUiDemo } from './ui-demo-seed.js';
import { seedDemoWorkflow } from './demo-seed.js';
import { seedPlanningReferences } from './reference-seed.js';
import { loadConfig } from '../config/env.js';
import { createDatabase } from './client.js';
import { brands, depots, districts, outlets, products, users, vehicles } from './schema.js';

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
      await tx
        .insert(depots)
        .values([
          { id: 'Peliyagoda', name: 'Peliyagoda' },
          { id: 'Kandy', name: 'Kandy' },
        ])
        .onConflictDoNothing();
      await tx
        .insert(brands)
        .values(['Fresh', 'Style', 'Tech'].map((id) => ({ id, name: `Waypoint ${id}` })))
        .onConflictDoNothing();
      for (const item of outletRows) {
        await tx
          .insert(districts)
          .values({ id: item.district, name: item.district, depotId: item.depot })
          .onConflictDoNothing();
        await tx
          .insert(outlets)
          .values({
            id: item.outlet_id,
            brandId: item.brand,
            districtId: item.district,
            dockType: item.dock_type,
            parkingConstraint: item.parking_constraint,
            mallOpenTime: item.mall_window ? item.mall_window.split('-')[0] : null,
            mallCloseTime: item.mall_window ? item.mall_window.split('-')[1] : null,
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
            depotId: item.depot,
          })
          .onConflictDoNothing();
      }
      await tx
        .insert(products)
        .values([
          {
            sku: 'DEMO-FRESH-DRY',
            brandId: 'Fresh',
            name: 'Synthetic grocery case',
            orderingUnit: 'case',
            temperatureRequirement: 'ambient',
            unitWeightKg: '8.00',
            unitVolumeM3: '0.040',
            estimatedUnitValueLkr: '2000.00',
          },
          {
            sku: 'DEMO-FRESH-CHILL',
            brandId: 'Fresh',
            name: 'Synthetic chilled case',
            orderingUnit: 'case',
            temperatureRequirement: 'chilled',
            unitWeightKg: '5.00',
            unitVolumeM3: '0.030',
            estimatedUnitValueLkr: '3000.00',
          },
          {
            sku: 'DEMO-STYLE',
            brandId: 'Style',
            name: 'Synthetic garment carton',
            orderingUnit: 'carton',
            temperatureRequirement: 'ambient',
            unitWeightKg: '4.00',
            unitVolumeM3: '0.200',
            estimatedUnitValueLkr: '5000.00',
          },
          {
            sku: 'DEMO-TECH',
            brandId: 'Tech',
            name: 'Synthetic appliance',
            orderingUnit: 'item',
            temperatureRequirement: 'ambient',
            unitWeightKg: '50.00',
            unitVolumeM3: '0.400',
            estimatedUnitValueLkr: '40000.00',
          },
        ])
        .onConflictDoNothing();
      await seedPlanningReferences(tx);
      const passwordHash = await hash(demoPassword, 12);
      const accounts = [
        {
          email: 'dispatcher@waypoint.lk',
          displayName: 'Dinesh Wickramasinghe',
          role: 'DISPATCHER' as const,
          depotId: null,
          outletId: null,
        },
        {
          email: 'loader@waypoint.lk',
          displayName: 'Kavinda Rathnayake',
          role: 'LOADER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'loader.kandy@waypoint.lk',
          displayName: 'Sisira Kumara',
          role: 'LOADER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver@waypoint.lk',
          displayName: 'Sunil Fernando',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.gamini@waypoint.lk',
          displayName: 'Gamini Silva',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.upul@waypoint.lk',
          displayName: 'Upul Perera',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.nimal@waypoint.lk',
          displayName: 'Nimal Jayasuriya',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.kamal@waypoint.lk',
          displayName: 'Kamal Bandara',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.priyantha@waypoint.lk',
          displayName: 'Priyantha Kumara',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.ruwan@waypoint.lk',
          displayName: 'Ruwan Dissanayake',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.chathura@waypoint.lk',
          displayName: 'Chathura Senanayake',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.mahesh@waypoint.lk',
          displayName: 'Mahesh Mendis',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.roshan@waypoint.lk',
          displayName: 'Roshan Ranasinghe',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.kasun@waypoint.lk',
          displayName: 'Kasun Wijesinghe',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.dhammika@waypoint.lk',
          displayName: 'Dhammika Prasad',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.sanjeewa@waypoint.lk',
          displayName: 'Sanjeewa Pushpakumara',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.nuwan@waypoint.lk',
          displayName: 'Nuwan Pradeep',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.lahiru@waypoint.lk',
          displayName: 'Lahiru Thirimanne',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.chamara@waypoint.lk',
          displayName: 'Chamara Silva',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.indika@waypoint.lk',
          displayName: 'Indika Fernando',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.lasantha@waypoint.lk',
          displayName: 'Lasantha Perera',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.manoj@waypoint.lk',
          displayName: 'Manoj De Silva',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.thilina@waypoint.lk',
          displayName: 'Thilina Kandamby',
          role: 'DRIVER' as const,
          depotId: 'Peliyagoda' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy1@waypoint.lk',
          displayName: 'Kithsiri Bandara',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy2@waypoint.lk',
          displayName: 'Anura Herath',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy3@waypoint.lk',
          displayName: 'Bandula Jayawardena',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy4@waypoint.lk',
          displayName: 'Sarath Weerasinghe',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy5@waypoint.lk',
          displayName: 'Chaminda Vaas',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy6@waypoint.lk',
          displayName: 'Tishan Gunawardena',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy7@waypoint.lk',
          displayName: 'Asanka Gurusinha',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy8@waypoint.lk',
          displayName: 'Chandika Hathurusingha',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy9@waypoint.lk',
          displayName: 'Pradeep Nishantha',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'driver.kandy10@waypoint.lk',
          displayName: 'Rohan Kaluwitharana',
          role: 'DRIVER' as const,
          depotId: 'Kandy' as const,
          outletId: null,
        },
        {
          email: 'manager.out001@waypoint.lk',
          displayName: 'Anoma Jayawardena',
          role: 'STORE_MANAGER' as const,
          depotId: null,
          outletId: 'OUT001',
        },
      ];
      for (const account of accounts)
        await tx
          .insert(users)
          .values({ ...account, passwordHash })
          .onConflictDoNothing();
    });
    await seedDemoWorkflow(db);
    await seedUiDemo(db);
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
