export type Order = {
  id: string;
  public_reference: string;
  status: string;
  requested_date: string;
  temperature_requirement: string;
  order_size: number;
};
export type Product = {
  id: string;
  sku: string;
  name: string;
  temperature_requirement: 'ambient' | 'chilled';
  ordering_unit: string;
};
export type Line = { id: string; name: string; quantity: number; product_id: string };
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
  lines: Line[];
  aggregate: { units: number } | null;
  attempts: Attempt[];
  stops: { id: string }[];
  issues: { id: string; type: string; notes: string | null; resolution: string | null }[];
};
export type Page = { items: Order[]; nextCursor: string | null };

export type ReceiptCounts = {
  accepted: number;
  missing: number;
  damaged: number;
  rejected: number;
};
