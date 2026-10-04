export type CatalogListItem = {
  id: string;
  sku: string;
  name: string;
  ordering_unit: string;
  temperature_requirement: 'ambient' | 'chilled';
  unit_weight_kg: string;
  unit_volume_m3: string;
  estimated_unit_value_lkr: string | null;
};
