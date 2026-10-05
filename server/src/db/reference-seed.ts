import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import type { Transaction } from '../modules/operations/service.js';
import {
  districtTravel,
  operatingCalendar,
  roadConditions,
  serviceAllowances,
  trafficProfiles,
} from './schema.js';

async function rows(name: string): Promise<Record<string, string>[]> {
  return parse(
    await readFile(
      fileURLToPath(new URL(`../../../data/reference/${name}`, import.meta.url)),
      'utf8',
    ),
    { columns: true, skip_empty_lines: true },
  );
}
export async function seedPlanningReferences(tx: Transaction) {
  const calendar = (await rows('calendar.csv')).map((r) => ({
    date: r.date!,
    isOperating: r.is_operating === '1',
    isHoliday: r.is_holiday === '1',
    isPayday: r.is_payday === '1',
    festival: r.festival || null,
    festivalRamp: r.festival_ramp!,
    monsoon: r.monsoon === '1',
  }));
  for (let i = 0; i < calendar.length; i += 500)
    await tx
      .insert(operatingCalendar)
      .values(calendar.slice(i, i + 500))
      .onConflictDoNothing();
  await tx
    .insert(districtTravel)
    .values(
      (await rows('district_travel.csv')).map((r) => ({
        districtId: r.district!,
        roadClass: r.road_class!,
        freeFlowKmh: r.free_flow_kmh!,
        depotToDistrictKm: r.depot_to_district_km!,
        depotToDistrictFreeflowMinutes: r.depot_to_district_freeflow_min!,
        interStopKm: r.inter_stop_km!,
        interStopFreeflowMinutes: r.inter_stop_freeflow_min!,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(serviceAllowances)
    .values(
      (await rows('service_allowance.csv')).map((r) => ({
        brandId: r.brand!,
        dockType: r.dock_type!,
        minutes: r.service_allowance_min!,
      })),
    )
    .onConflictDoNothing();
  const profiles = (await rows('traffic_speed.csv')).map((r) => ({
    districtId: r.district!,
    hour: Number(r.hour),
    monsoon: r.monsoon === '1',
    speedIndex: r.speed_index!,
  }));
  for (let i = 0; i < profiles.length; i += 500)
    await tx
      .insert(trafficProfiles)
      .values(profiles.slice(i, i + 500))
      .onConflictDoNothing();
  const conditions = (await rows('road_conditions.csv')).map((r) => ({
    districtId: r.district!,
    date: r.date!,
    disruptionIndex: r.disruption_index!,
  }));
  for (let i = 0; i < conditions.length; i += 500)
    await tx
      .insert(roadConditions)
      .values(conditions.slice(i, i + 500))
      .onConflictDoNothing();
}
