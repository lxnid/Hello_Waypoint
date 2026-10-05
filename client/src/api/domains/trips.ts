import { request, buildQuery } from '../http';
import type {
  TripRow,
  TripDetail,
  DeliveryInput,
  ReceiptInput,
  LoadInput,
  InspectionInput,
  ReturnInput,
} from '@waypoint/contracts/workflows';
import type { Page } from '../../types/planning';
import type {
  TripsListQuery,
  TripsLoadStopResponse,
  TripsSignLoadResponse,
  TripsInspectResponse,
  TripsDepartResponse,
  TripsArriveResponse,
  TripsCompleteDeliveryResponse,
  TripsConfirmReceiptResponse,
  TripsReturnToDepotResponse,
} from '../../types/api/trips';

export const tripsApi = {
  list: (query?: TripsListQuery) => request<Page<TripRow>>(`/trips${buildQuery(query)}`),

  get: (id: string) => request<TripDetail>(`/trips/${encodeURIComponent(id)}`),

  loadStop: (stopId: string, body: LoadInput) =>
    request<TripsLoadStopResponse>(`/stops/${encodeURIComponent(stopId)}/load`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  startLoad: (tripId: string) =>
    request<TripsSignLoadResponse>(`/trips/${encodeURIComponent(tripId)}/start-load`, {
      method: 'POST',
    }),

  signLoad: (tripId: string) =>
    request<TripsSignLoadResponse>(`/trips/${encodeURIComponent(tripId)}/sign-load`, {
      method: 'POST',
      body: '{}',
    }),

  inspect: (tripId: string, body: InspectionInput) =>
    request<TripsInspectResponse>(`/trips/${encodeURIComponent(tripId)}/inspection`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  depart: (tripId: string) =>
    request<TripsDepartResponse>(`/trips/${encodeURIComponent(tripId)}/depart`, {
      method: 'POST',
      body: '{}',
    }),

  arrive: (stopId: string, capturedAt: string) =>
    request<TripsArriveResponse>(`/stops/${encodeURIComponent(stopId)}/arrival`, {
      method: 'POST',
      body: JSON.stringify({ capturedAt }),
    }),

  completeDelivery: (attemptId: string, body: DeliveryInput) =>
    request<TripsCompleteDeliveryResponse>(`/attempts/${encodeURIComponent(attemptId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  confirmReceipt: (attemptId: string, body: ReceiptInput) =>
    request<TripsConfirmReceiptResponse>(`/attempts/${encodeURIComponent(attemptId)}/receipt`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  returnToDepot: (tripId: string, body: ReturnInput) =>
    request<TripsReturnToDepotResponse>(`/trips/${encodeURIComponent(tripId)}/return`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
