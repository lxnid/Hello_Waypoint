import type { PlanningWindow } from '@waypoint/contracts/workflows';
import type { StageOrders, TripOrderEdit, TripCandidates } from '@waypoint/contracts/workflows';
import { request, buildQuery } from '../http';
import type {
  PriorityQuery,
  OrderPriority,
  DeferralOverride,
  DeferralOverrideAcknowledgement,
  PlanEdit,
} from '@waypoint/contracts';
import type { PlanDetail } from '../../types/planning';
import type {
  PlanningListContextsItem,
  PlanningCreateContextResponse,
  PlanningGetContextPlansItem,
  PlanningGetContextFleetItem,
  PlanningSetVehicleAvailabilityResponse,
  PlanningGetContextDriversItem,
  PlanningCreatePlanResponse,
  PlanningUpdatePlanResponse,
  PlanningGenerateResponse,
  PlanningValidateResponse,
  PlanningReleaseResponse,
} from '../../types/api/planning';

export const planningApi = {
  window: () => request<PlanningWindow>('/planning/window'),
  stage: (planId: string, body: StageOrders) =>
    request<PlanningUpdatePlanResponse>(`/planning/plans/${encodeURIComponent(planId)}/stage`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  candidates: (tripId: string) =>
    request<TripCandidates>(`/planning/trips/${encodeURIComponent(tripId)}/candidates`),
  editTripOrders: (planId: string, body: TripOrderEdit) =>
    request<PlanningUpdatePlanResponse>(
      `/planning/plans/${encodeURIComponent(planId)}/trip-orders`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  listContexts: () => request<PlanningListContextsItem[]>('/planning/contexts'),

  createContext: (operatingDate: string) =>
    request<PlanningCreateContextResponse>('/planning/contexts', {
      method: 'POST',
      body: JSON.stringify({ operatingDate }),
    }),

  getContextPlans: (contextId: string) =>
    request<PlanningGetContextPlansItem[]>(`/planning/contexts/${contextId}/plans`),

  getContextFleet: (contextId: string) =>
    request<PlanningGetContextFleetItem[]>(`/planning/contexts/${contextId}/fleet`),

  setVehicleAvailability: (
    contextId: string,
    vehicleId: string,
    status: 'available' | 'workshop',
  ) =>
    request<PlanningSetVehicleAvailabilityResponse>(`/planning/contexts/${contextId}/fleet`, {
      method: 'PUT',
      body: JSON.stringify({ vehicleId, status }),
    }),

  getContextDrivers: (contextId: string) =>
    request<PlanningGetContextDriversItem[]>(`/planning/contexts/${contextId}/drivers`),

  getPriorities: (query: PriorityQuery) =>
    request<OrderPriority[]>(`/planning/priorities${buildQuery(query)}`),

  createPlan: (contextId: string, depot: 'Peliyagoda' | 'Kandy') =>
    request<PlanningCreatePlanResponse>('/planning/plans', {
      method: 'POST',
      body: JSON.stringify({ contextId, depot }),
    }),

  getPlan: (planId: string) => request<PlanDetail>(`/planning/plans/${planId}`),

  updatePlan: (planId: string, edit: PlanEdit) =>
    request<PlanningUpdatePlanResponse>(`/planning/plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(edit),
    }),

  generate: (planId: string, version: number) =>
    request<PlanningGenerateResponse>(`/planning/plans/${planId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  validate: (planId: string, version: number) =>
    request<PlanningValidateResponse>(`/planning/plans/${planId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  release: (planId: string, version: number) =>
    request<PlanningReleaseResponse>(`/planning/plans/${planId}/release`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  overrideDecision: (planOrderId: string, override: DeferralOverride) =>
    request<DeferralOverrideAcknowledgement>(`/planning/decisions/${planOrderId}/override`, {
      method: 'POST',
      body: JSON.stringify(override),
    }),

  allocationCsvUrl: (contextId: string) => `/api/v1/planning/contexts/${contextId}/allocation.csv`,
};
