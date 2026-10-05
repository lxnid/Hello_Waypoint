import type { StoreProfile, StoreVehicle } from '../../types/store-workspace';
import { request } from '../http';
import type { CatalogListItem } from '../../types/api/catalog';
import type { Depot } from '@waypoint/contracts/workflows';
import { buildQuery } from '../http';

export const catalogApi = {
  vehicles: () => request<StoreVehicle[]>('/store/vehicles'),
  profile: () => request<StoreProfile>('/store/profile'),
  list: (depot?: Depot) => request<CatalogListItem[]>(`/catalog${buildQuery({ depot })}`),
  setAvailableQuantity: (id: string, depotId: Depot, availableQuantity: number) =>
    request<{ productId: string; depotId: Depot; availableQuantity: number }>(
      `/catalog/${encodeURIComponent(id)}/inventory`,
      { method: 'PUT', body: JSON.stringify({ depotId, availableQuantity }) },
    ),
};
