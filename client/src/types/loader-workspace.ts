export type Trip = {
  id: string;
  depot_id: string;
  vehicle_id: string;
  load_id?: string;
  driver_name?: string;
  driver_id: string;
  trip_number: number;
  operating_date: string;
  status: string;
  manifest_status?: string | null;
  stops_count?: number;
  temperature_requirement?: string;
  planned_departure_at?: string | null;
  orders_count?: number;
  created_at?: string;
};

export type Stop = {
  id: string;
  trip_id: string;
  order_id: string;
  sequence: number;
  outlet_name?: string;
  public_reference?: string;
  planned_arrival_at: string;
  actual_arrival_at?: string | null;
  loaded_quantity?: number | null;
  temperature_requirement?: string;
  window_close_at?: string;
  lines?: OrderLine[];
  aggregate?: { units: number; weight_kg: string; volume_m3: string } | null;
  load?: {
    confirmed_at?: string | null;
    confirmed_by?: string | null;
    temperature_c?: string | null;
  } | null;
  load_lines?: {
    order_line_id?: string;
    orderLineId?: string;
    loaded_quantity?: number;
    loadedQuantity?: number;
    damaged_quantity?: number;
    damagedQuantity?: number;
  }[] | null;
  dock_damaged_quantity?: number | null;
};

export type TripDetail = {
  trip: Trip;
  stops: Stop[];
  manifest: { id: string; status: string; signed_at?: string | null } | null;
};

export type OrderLine = {
  id: string;
  sku?: string;
  name?: string;
  product_name?: string;
  quantity: number;
  temperature_requirement?: string;
};

export type OrderDetail = {
  order: {
    id: string;
    public_reference: string;
    temperature_requirement: string;
    status: string;
    requested_date: string;
  };
  outlet?: {
    name?: string;
    window_open_time?: string;
    window_close_time?: string;
    dock_type?: string;
  };
  lines: OrderLine[];
  aggregate?: { units: number; weight_kg: string; volume_m3: string } | null;
};
