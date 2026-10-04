import { request } from '../http';
import type { CatalogListItem } from '../../types/api/catalog';

export const catalogApi = {
  list: () => request<CatalogListItem[]>('/catalog'),
};
