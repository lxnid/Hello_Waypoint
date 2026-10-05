export type Order = {
  id: string;
  public_reference: string;
  status: string;
  requested_date: string;
  temperature_requirement: string;
  order_size: number;
  created_at: string;
  deferred: boolean;
  eligible_date?: string;
  next_eligible_date?: string | null;
  deferral_reason?: string | null;
};
import type { CatalogListItem } from './api/catalog';
export type Product = CatalogListItem;
export type { StoreProfile, StoreVehicle } from '@waypoint/contracts/workflows';
export type Line = {
  id: string;
  name: string;
  quantity: number;
  product_id: string;
  sku: string;
  temperature_requirement: string;
  ordering_unit: string;
  unit_weight_kg: string;
  unit_volume_m3: string;
};
export type Attempt = {
  id: string;
  stop_id: string;
  outcome: string | null;
  completed_at: string | null;
  receipt: object | null;
  lines: { order_line_id: string; delivered_quantity: number; rejected_quantity: number }[] | null;
  delivered_units: number | null;
};
export type Detail = {
  order: Order;
  outlet: { name: string | null; depot_id: string; brand_name: string };
  decisions: {
    decision: string;
    reason_code: string | null;
    rationale: string | null;
    next_eligible_date: string | null;
  }[];
  lines: Line[];
  aggregate: { units: number } | null;
  attempts: Attempt[];
  stops: {
    id: string;
    trip_status: string;
    vehicle_id: string;
    load_id: string;
    driver_name: string;
  }[];
  issues: { id: string; type: string; notes: string | null; resolution: string | null }[];
};
export type Page = {
  items: Order[];
  nextCursor: string | null;
  summary: { total: number; deferred: number };
};

export type ReceiptCounts = {
  accepted: number;
  missing: number;
  damaged: number;
  rejected: number;
};
