export type Context = { id: string; kind: string; operating_date: string };
export type Vehicle = {
  id: string;
  depot_id: string;
  type: string;
  temp: string;
  weight_cap_kg: string;
  volume_cap_m3: string;
  status?: string;
};
export type Store = {
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  id: string;
  name: string | null;
  brand_id: string;
  brand_name: string;
  district_id: string;
  district_name: string;
  depot_id: string;
  contact: string | null;
  parking_constraint: string;
  window_open_time: string;
  window_close_time: string;
};
export type Reference = { stores: Store[]; vehicles: Vehicle[]; operatingDates: string[] };
export type Priority = {
  weightKg: string | null;
  volumeM3: string | null;
  orderId: string;
  publicReference: string;
  outletId: string;
  brand: string;
  district: string;
  temperatureRequirement: string;
  daysSinceLastServed: number | null;
  requiresOverride: boolean;
  deferredPreviousRun?: boolean;
  historyStatus: string;
};
export type Plan = {
  id: string;
  version: number;
  status: string;
  depot_id: string;
  operating_date?: string;
};
export type Decision = {
  id: string;
  order_id: string;
  decision: string;
  reason_code: string | null;
  rationale: string | null;
  next_eligible_date: string | null;
  requires_override?: boolean;
  override_acknowledged?: boolean;
};
export type Stop = {
  id: string;
  order_id: string;
  sequence: number;
  planned_arrival_at: string;
  public_reference?: string;
  outlet_name?: string;
};
export type Trip = {
  id: string;
  plan_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_number: number;
  status: string;
  manifest_status?: string;
  loader_name?: string | null;
  inspection_recorded?: boolean;
  dispatch_ready?: boolean;
  dispatch_block_reason?: string | null;
  stops: Stop[];
  operating_date?: string;
};
export type PlanDetail = { plan: Plan; decisions: Decision[]; trips: Trip[] };
export type DraftTrip = { vehicleId: string; driverId: string; orderIds: string[] };
export type Deferral = {
  orderId: string;
  reasonCode: string;
  rationale: string;
  nextEligibleDate: string;
};
export type Issue = {
  id: string;
  order_id: string;
  type: string;
  stage: string;
  notes?: string;
  affected_quantity: number;
  resolved_at: string | null;
  resolution: string | null;
};
export type Page<T> = { items: T[]; nextCursor: string | null };

export type StopInfo = {
  id: string;
  order_id: string;
  sequence: number;
  outlet_name?: string;
  public_reference?: string;
  planned_arrival_at: string;
  attempt?: { outcome: string | null } | null;
};
