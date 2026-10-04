export type OrderHit = {
  id: string;
  public_reference: string;
  outlet_name?: string;
  district_name?: string;
  brand_name?: string;
  status: string;
  temperature_requirement: string;
};
export type TripHit = {
  id: string;
  vehicle_id: string;
  trip_number: number;
  status: string;
  manifest_status?: string | null;
  operating_date?: string;
};

export type SearchTarget = { kind: 'order'; id: string } | { kind: 'load'; id: string };
