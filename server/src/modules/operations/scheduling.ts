import type { PlanEdit } from '@waypoint/contracts/workflows';
import { sql } from 'drizzle-orm';
import { fixed } from './decimal.js';
import { validateDailyBudgets } from './planning.js';
import { type Transaction, WorkflowError } from './service.js';
export type Demand = {
  id: string;
  outlet_id: string;
  brand_id: string;
  district_id: string;
  temperature_requirement: string;
  parking_constraint: string;
  dock_type: string;
  window_open_time: string;
  window_close_time: string;
  mall_open_time: string | null;
  mall_close_time: string | null;
  weight: string;
  volume: string;
};
export type Fleet = {
  id: string;
  type: string;
  temp: string;
  weight_cap_kg: string;
  volume_cap_m3: string;
  km_per_l: string;
  weekly_fuel_quota_l: string;
};
export async function planningInputs(tx: Transaction, planId: string) {
  const [plan] = await tx.execute<{
    id: string;
    context_id: string;
    depot_id: 'Peliyagoda' | 'Kandy';
    kind: string;
    operating_date: string;
    batch_id: string | null;
    scenario: string | null;
  }>(
    sql`SELECT p.id,p.context_id,p.depot_id,c.kind,c.operating_date::text,c.batch_id,c.scenario FROM plans p JOIN planning_contexts c ON c.id=p.context_id WHERE p.id=${planId}`,
  );
  if (!plan) throw new WorkflowError('Plan not found', 404);
  const demand = await tx.execute<Demand>(
    sql`SELECT o.id,o.outlet_id,o.temperature_requirement,ot.brand_id,ot.district_id,ot.parking_constraint,ot.dock_type,ot.window_open_time::text,ot.window_close_time::text,ot.mall_open_time::text,ot.mall_close_time::text,coalesce(a.weight_kg,l.weight)::text AS weight,coalesce(a.volume_m3,l.volume)::text AS volume FROM orders o JOIN outlets ot ON ot.id=o.outlet_id JOIN districts d ON d.id=ot.district_id LEFT JOIN order_sources src ON src.order_id=o.id LEFT JOIN order_aggregates a ON a.order_id=o.id LEFT JOIN LATERAL(SELECT sum(quantity*unit_weight_kg) AS weight,sum(quantity*unit_volume_m3) AS volume FROM order_lines WHERE order_id=o.id) l ON true WHERE o.status='SUBMITTED' AND o.eligible_date<=${plan.operating_date}::date AND d.depot_id=${plan.depot_id} AND ((${plan.kind}='LIVE' AND coalesce(src.scenario,'')='') OR (${plan.kind}='SCENARIO' AND src.batch_id=${plan.batch_id}::uuid AND src.scenario=${plan.scenario})) AND NOT EXISTS(SELECT 1 FROM plan_orders po JOIN plans other ON other.id=po.plan_id JOIN trip_stops s ON s.plan_order_id=po.id WHERE po.order_id=o.id AND other.status<>'DRAFT') ORDER BY o.eligible_date,o.public_reference`,
  );
  const fleet = await tx.execute<Fleet>(
    sql`SELECT v.id,v.type,v.temp,v.weight_cap_kg::text,v.volume_cap_m3::text,v.km_per_l::text,v.weekly_fuel_quota_l::text FROM vehicles v JOIN vehicle_availability av ON av.vehicle_id=v.id AND av.context_id=${plan.context_id} WHERE v.depot_id=${plan.depot_id} AND v.is_active AND av.status='available' ORDER BY v.id`,
  );
  const drivers = await tx.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE role='DRIVER' AND is_active AND depot_id=${plan.depot_id} ORDER BY id`,
  );
  const references = await tx.execute<{
    district_id: string;
    outbound: string;
    interstop: string;
    distance: string;
    interdistance: string;
  }>(
    sql`SELECT district_id,depot_to_district_freeflow_minutes::text AS outbound,inter_stop_freeflow_minutes::text AS interstop,depot_to_district_km::text AS distance,inter_stop_km::text AS interdistance FROM district_travel`,
  );
  const allowance = await tx.execute<{ brand_id: string; dock_type: string; minutes: string }>(
    sql`SELECT brand_id,dock_type,minutes::text FROM service_allowances`,
  );
  const namespace = plan.kind === 'LIVE' ? 'LIVE' : `SCENARIO:${plan.batch_id}:${plan.scenario}`;
  const fuel = await tx.execute<{ vehicle_id: string; used: string }>(
    sql`SELECT b.vehicle_id,(b.opening_usage_l+coalesce(sum(coalesce(r.actual_fuel_l,r.estimated_fuel_l)) FILTER(WHERE r.state<>'RELEASED'),0))::text AS used FROM vehicle_week_budgets b LEFT JOIN trip_fuel_reservations r ON r.budget_id=b.id WHERE b.namespace=${namespace} AND b.week_start=date_trunc('week',${plan.operating_date}::date)::date GROUP BY b.id`,
  );
  return {
    plan,
    demand: [...demand],
    fleet: [...fleet],
    drivers: [...drivers],
    references: [...references],
    allowance: [...allowance],
    fuel: [...fuel],
  };
}
export type Inputs = Awaited<ReturnType<typeof planningInputs>>;
const local = (date: string, time: string) =>
  new Date(`${date}T${time.length === 5 ? time + ':00' : time}+05:30`).getTime();
export function schedule(inputs: Inputs, assignments: PlanEdit['trips']) {
  const vehicleEnd = new Map<string, number>(),
    driverEnd = new Map<string, number>(),
    slots = new Map<string, number>();
  const fuel = new Map(inputs.fuel.map((v) => [v.vehicle_id, fixed(v.used, 3)]));
  const seen = new Set<string>();
  const scheduled = assignments.map((trip) => {
    const vehicle = inputs.fleet.find((v) => v.id === trip.vehicleId);
    if (!vehicle || !inputs.drivers.some((d) => d.id === trip.driverId))
      throw new WorkflowError('Vehicle or driver unavailable');
    const orders = trip.orderIds.map((id) => {
      const order = inputs.demand.find((o) => o.id === id);
      if (!order || seen.has(id)) throw new WorkflowError('Invalid or duplicate assigned order');
      seen.add(id);
      return order;
    });
    const first = orders[0]!;
    const ref = inputs.references.find((r) => r.district_id === first.district_id);
    if (!ref) throw new WorkflowError('Missing district travel reference');
    let weight = 0n,
      volume = 0n;
    for (const o of orders) {
      if (
        o.brand_id !== first.brand_id ||
        o.district_id !== first.district_id ||
        (o.temperature_requirement === 'chilled' && vehicle.temp !== 'reefer') ||
        (o.parking_constraint === 'van_only' && vehicle.type !== 'van')
      )
        throw new WorkflowError('Trip violates brand, district, temperature or access constraints');
      weight += fixed(o.weight, 2);
      volume += fixed(o.volume, 3);
    }
    if (weight > fixed(vehicle.weight_cap_kg, 2) || volume > fixed(vehicle.volume_cap_m3, 3))
      throw new WorkflowError('Trip exceeds weight or volume capacity');
    const tripNumber = (slots.get(vehicle.id) ?? 0) + 1;
    slots.set(vehicle.id, tripNumber);
    let at = Math.max(
      local(inputs.plan.operating_date, first.brand_id === 'Fresh' ? '03:30' : '08:00'),
      vehicleEnd.get(vehicle.id) ?? 0,
      driverEnd.get(trip.driverId) ?? 0,
    );
    let handling = 0;
    const stops = orders.map((o, sequence) => {
      const minutes = inputs.allowance.find(
        (a) => a.brand_id === o.brand_id && a.dock_type === o.dock_type,
      )?.minutes;
      if (minutes === undefined) throw new WorkflowError('Missing service allowance');
      handling += Number(minutes);
      const travel = sequence === 0 ? ref.outbound : ref.interstop;
      const open = Math.max(
        local(inputs.plan.operating_date, o.window_open_time),
        o.mall_open_time ? local(inputs.plan.operating_date, o.mall_open_time) : 0,
      );
      const close = Math.min(
        local(inputs.plan.operating_date, o.window_close_time),
        o.mall_close_time ? local(inputs.plan.operating_date, o.mall_close_time) : Infinity,
        first.brand_id === 'Fresh' ? local(inputs.plan.operating_date, '08:00') : Infinity,
      );
      const depart = Math.max(at, open - Number(travel) * 60_000),
        arrival = depart + Number(travel) * 60_000;
      at = arrival + Number(minutes) * 60_000;
      if (at > close) throw new WorkflowError('Trip misses an outlet service window');
      return {
        orderId: o.id,
        sequence,
        plannedDepartAt: new Date(depart),
        plannedTravelMinutes: travel,
        plannedArrivalAt: new Date(arrival),
        serviceAllowanceMinutes: minutes,
        distanceKm: sequence === 0 ? ref.distance : ref.interdistance,
        windowOpenAt: new Date(open),
        windowCloseAt: new Date(close),
        dockType: o.dock_type,
        parkingConstraint: o.parking_constraint,
      };
    });
    const end = at + Number(ref.outbound) * 60_000;
    vehicleEnd.set(vehicle.id, end);
    driverEnd.set(trip.driverId, end);
    const distanceHundredths =
      2n * fixed(ref.distance, 2) +
      BigInt(Math.max(orders.length - 1, 0)) * fixed(ref.interdistance, 2);
    const efficiency = fixed(vehicle.km_per_l, 2);
    const consumed = (distanceHundredths * 1000n + efficiency - 1n) / efficiency;
    const used = (fuel.get(vehicle.id) ?? 0n) + consumed;
    fuel.set(vehicle.id, used);
    if (used > fixed(vehicle.weekly_fuel_quota_l, 3))
      throw new WorkflowError('Weekly fuel quota exceeded');
    return {
      ...trip,
      tripNumber,
      brandId: first.brand_id,
      districtId: first.district_id,
      stops,
      minutes: (
        Number(ref.outbound) +
        Math.max(orders.length - 1, 0) * Number(ref.interstop) +
        handling
      ).toFixed(2),
    };
  });
  validateDailyBudgets(
    scheduled.map((t) => ({ vehicle_id: t.vehicleId, brand_id: t.brandId, minutes: t.minutes })),
  );
  return scheduled;
}
