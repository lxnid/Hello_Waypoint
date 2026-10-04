export type Line = { id: string; sku: string; name: string; quantity: number };
export type Stop = {
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  contact?: string | null;
  id: string;
  order_id: string;
  sequence: number;
  public_reference: string;
  outlet_name: string | null;
  temperature_requirement: string;
  planned_arrival_at: string;
  window_close_at: string;
  lines: Line[];
  load_lines?: { order_line_id: string; loaded_quantity: number }[] | null;
  aggregate: { units: number; weight_kg: string; volume_m3: string } | null;
  attempt: { id: string; outcome: string | null; completed_at: string | null } | null;
};
export type Trip = {
  id: string;
  vehicle_id: string;
  trip_number: number;
  operating_date: string;
  status: string;
  plan_id: string;
  version: number;
};
export type Detail = {
  trip: Trip;
  stops: Stop[];
  inspection: object | null;
  manifest: { status: string } | null;
};
