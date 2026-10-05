import { request, buildQuery } from '../http';
import type { CreateOrder } from '@waypoint/contracts';
import type { OrderQuery, OrdersResponse, OrderDetail } from '@waypoint/contracts/workflows';
import type {
  OrdersCreateResponse,
  OrdersUpdateResponse,
  OrdersDeleteResponse,
  OrdersSubmitResponse,
} from '../../types/api/orders';

export const ordersApi = {
  list: (query?: OrderQuery) => request<OrdersResponse>(`/orders${buildQuery(query)}`),

  get: (id: string) => request<OrderDetail>(`/orders/${encodeURIComponent(id)}`),

  create: (order: CreateOrder) =>
    request<OrdersCreateResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    }),

  update: (id: string, order: CreateOrder) =>
    request<OrdersUpdateResponse>(`/orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    }),

  delete: (id: string) =>
    request<OrdersDeleteResponse>(`/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  submit: (id: string) =>
    request<OrdersSubmitResponse>(`/orders/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: '{}',
    }),
};
