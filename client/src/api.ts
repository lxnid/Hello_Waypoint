import type {
  Identity,
  Overview,
  Role,
  CreateOrder,
  PriorityQuery,
  OrderPriority,
  DeferralOverride,
  DeferralOverrideAcknowledgement,
  PlanEdit,
  ReplayCommand,
} from '@waypoint/contracts';
import { ROLE_API } from '@waypoint/contracts/roles';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
      message?: string;
      code?: string;
    };
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  // Direct helpers for compatibility
  me: () => request<Identity>('/auth/me'),
  login: (email: string, password: string) =>
    request<Identity>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  overview: (role: Role) => request<Overview>(`/portal/${ROLE_API[role]}/overview`),

  // Tagged modules matching Swagger UI specification at /docs
  auth: {
    login: (email: string, password: string) =>
      request<Identity>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<Identity>('/auth/me'),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },

  system: {
    health: () => request<{ status: 'ok'; database: 'connected' }>('/health'),
    overview: (role: Role) => request<Overview>(`/portal/${ROLE_API[role]}/overview`),
  },

  dispatch: {
    reference: () =>
      request<{
        stores: Record<string, unknown>[];
        vehicles: Record<string, unknown>[];
        operatingDates: string[];
      }>('/dispatch/reference'),
  },

  catalog: {
    list: () =>
      request<
        {
          id: string;
          sku: string;
          name: string;
          ordering_unit: string;
          temperature_requirement: 'ambient' | 'chilled';
          unit_weight_kg: string;
          unit_volume_m3: string;
          estimated_unit_value_lkr: string | null;
        }[]
      >('/catalog'),
  },

  orders: {
    list: (query?: {
      limit?: number;
      cursor?: string;
      depot?: string;
      q?: string;
      brand?: string;
      district?: string;
      temperature?: string;
      status?: string;
      deferred?: boolean;
    }) =>
      request<{
        items: any[];
        nextCursor: string | null;
        summary: {
          total: number;
          chilled: number;
          ambient: number;
          fresh: number;
          textile: number;
          fragile: number;
          deferred: number;
        };
        filters: {
          brands: { id: string; name: string }[];
          districts: { id: string; name: string }[];
          statuses: string[];
        };
      }>(`/orders${buildQuery(query)}`),

    get: (id: string) => request<any>(`/orders/${encodeURIComponent(id)}`),

    create: (order: CreateOrder) =>
      request<{ id: string; publicReference: string; status: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify(order),
      }),

    update: (id: string, order: CreateOrder) =>
      request<{ id: string; publicReference: string; status: string }>(
        `/orders/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(order),
        },
      ),

    delete: (id: string) =>
      request<{ deleted: boolean }>(`/orders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    submit: (id: string) =>
      request<{ id: string; status: string }>(`/orders/${encodeURIComponent(id)}/submit`, {
        method: 'POST',
        body: '{}',
      }),
  },

  planning: {
    listContexts: () =>
      request<{ id: string; kind: string; operating_date: string }[]>('/planning/contexts'),

    createContext: (operatingDate: string) =>
      request<{ id: string; kind: string; operatingDate: string }>('/planning/contexts', {
        method: 'POST',
        body: JSON.stringify({ operatingDate }),
      }),

    getContextPlans: (contextId: string) =>
      request<
        {
          id: string;
          context_id: string;
          depot_id: string;
          status: string;
          version: number;
        }[]
      >(`/planning/contexts/${contextId}/plans`),

    getContextFleet: (contextId: string) =>
      request<
        {
          id: string;
          depot_id: string;
          type: string;
          temp: string;
          weight_cap_kg: string;
          volume_cap_m3: string;
          status: string;
        }[]
      >(`/planning/contexts/${contextId}/fleet`),

    setVehicleAvailability: (
      contextId: string,
      vehicleId: string,
      status: 'available' | 'workshop',
    ) =>
      request<{ contextId: string; vehicleId: string; status: string }>(
        `/planning/contexts/${contextId}/fleet`,
        {
          method: 'PUT',
          body: JSON.stringify({ vehicleId, status }),
        },
      ),

    getContextDrivers: (contextId: string) =>
      request<{ id: string; name: string; depot_id: string }[]>(
        `/planning/contexts/${contextId}/drivers`,
      ),

    getPriorities: (query: PriorityQuery) =>
      request<OrderPriority[]>(`/planning/priorities${buildQuery(query)}`),

    createPlan: (contextId: string, depot: 'Peliyagoda' | 'Kandy') =>
      request<{ id: string; contextId: string; depotId: string; status: string; version: number }>(
        '/planning/plans',
        {
          method: 'POST',
          body: JSON.stringify({ contextId, depot }),
        },
      ),

    getPlan: (planId: string) => request<any>(`/planning/plans/${planId}`),

    updatePlan: (planId: string, edit: PlanEdit) =>
      request<{
        planId: string;
        version: number;
        tripCount: number;
        deferredCount: number;
      }>(`/planning/plans/${planId}`, {
        method: 'PUT',
        body: JSON.stringify(edit),
      }),

    generate: (planId: string, version: number) =>
      request<{
        planId: string;
        version: number;
        tripCount: number;
        deferredCount: number;
      }>(`/planning/plans/${planId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),

    validate: (planId: string, version: number) =>
      request<{ valid: boolean; message?: string }>(`/planning/plans/${planId}/validate`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),

    release: (planId: string, version: number) =>
      request<{
        id: string;
        contextId: string;
        depotId: string;
        status: string;
        version: number;
      }>(`/planning/plans/${planId}/release`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),

    overrideDecision: (planOrderId: string, override: DeferralOverride) =>
      request<DeferralOverrideAcknowledgement>(
        `/planning/decisions/${planOrderId}/override`,
        {
          method: 'POST',
          body: JSON.stringify(override),
        },
      ),

    allocationCsvUrl: (contextId: string) =>
      `/api/v1/planning/contexts/${contextId}/allocation.csv`,
  },

  trips: {
    list: (query?: { limit?: number; cursor?: string; depot?: string }) =>
      request<{ items: any[]; nextCursor: string | null }>(`/trips${buildQuery(query)}`),

    get: (id: string) => request<any>(`/trips/${encodeURIComponent(id)}`),

    loadStop: (
      stopId: string,
      body: {
        lines?: { orderLineId: string; loadedQuantity: number; damagedQuantity: number }[];
        aggregate?: { units: number; weightKg: string; volumeM3: string };
        temperatureC?: string;
      },
    ) =>
      request<{ stopId: string; confirmed: boolean }>(`/stops/${encodeURIComponent(stopId)}/load`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    signLoad: (tripId: string) =>
      request<{ tripId: string; status: string }>(`/trips/${encodeURIComponent(tripId)}/sign-load`, {
        method: 'POST',
        body: '{}',
      }),

    inspect: (
      tripId: string,
      body: {
        startingOdometerKm: string;
        fuelChecked: boolean;
        chillerChecked: boolean;
        temperatureC?: string;
      },
    ) =>
      request<{ tripId: string; inspected: boolean }>(
        `/trips/${encodeURIComponent(tripId)}/inspection`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      ),

    depart: (tripId: string) =>
      request<{ ok: true }>(`/trips/${encodeURIComponent(tripId)}/depart`, {
        method: 'POST',
        body: '{}',
      }),

    arrive: (stopId: string, capturedAt: string) =>
      request<{ attemptId: string }>(`/stops/${encodeURIComponent(stopId)}/arrival`, {
        method: 'POST',
        body: JSON.stringify({ capturedAt }),
      }),

    completeDelivery: (attemptId: string, body: any) =>
      request<{ attemptId: string; outcome: string }>(
        `/attempts/${encodeURIComponent(attemptId)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),

    confirmReceipt: (attemptId: string, body: any) =>
      request<{ attemptId: string; outcome: string }>(
        `/attempts/${encodeURIComponent(attemptId)}/receipt`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),

    returnToDepot: (
      tripId: string,
      body: { returnedAt: string; endingOdometerKm: string; actualFuelL: string },
    ) =>
      request<{ tripId: string; status: string }>(`/trips/${encodeURIComponent(tripId)}/return`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  issues: {
    list: (query?: { limit?: number; cursor?: string; depot?: string }) =>
      request<{ items: any[]; nextCursor: string | null }>(`/issues${buildQuery(query)}`),

    fileReceiptIssue: (issue: {
      stopId: string;
      stage: 'RECEIPT';
      type: 'MISSING' | 'DAMAGED' | 'TEMPERATURE' | 'REJECTED';
      affectedQuantity: number;
      orderLineId?: string;
      attemptId?: string;
      notes?: string;
    }) =>
      request<{ id: string; orderId: string; stopId: string }>('/issues', {
        method: 'POST',
        body: JSON.stringify(issue),
      }),

    fileLoadingIssue: (issue: {
      stopId: string;
      stage: 'LOADING';
      type: 'MISSING' | 'DAMAGED' | 'TEMPERATURE' | 'REJECTED';
      affectedQuantity: number;
      orderLineId?: string;
      notes?: string;
    }) =>
      request<{ id: string; orderId: string; stopId: string }>('/loading/issues', {
        method: 'POST',
        body: JSON.stringify(issue),
      }),

    fileDeliveryIssue: (issue: {
      stopId: string;
      stage: 'DELIVERY';
      type: 'MISSING' | 'DAMAGED' | 'TEMPERATURE' | 'REJECTED';
      affectedQuantity: number;
      orderLineId?: string;
      attemptId?: string;
      notes?: string;
    }) =>
      request<{ id: string; orderId: string; stopId: string }>('/delivery/issues', {
        method: 'POST',
        body: JSON.stringify(issue),
      }),

    resolve: (id: string, resolution: string) =>
      request<{ id: string }>(`/issues/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
      }),
  },

  offline: {
    sync: (commands: ReplayCommand[]) =>
      request<{
        results: {
          clientOperationId: string;
          applied: boolean;
          result?: Record<string, unknown>;
          error?: { status: number; code: string; message: string };
        }[];
      }>('/sync', {
        method: 'POST',
        body: JSON.stringify({ commands }),
      }),
  },

  proof: {
    upload: async (
      id: string,
      query: { ownerType: 'attempt' | 'receipt' | 'issue'; ownerId: string; kind: 'PHOTO' | 'SIGNATURE' },
      body: Blob | BufferSource,
      mimeType?: string,
    ) => {
      const headers = new Headers();
      if (mimeType) headers.set('Content-Type', mimeType);
      const response = await fetch(
        `/api/v1/proof/${encodeURIComponent(id)}${buildQuery(query)}`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers,
          body,
        },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => ({ message: 'Upload failed' }))) as {
          message?: string;
        };
        throw new ApiError(response.status, err.message ?? 'Upload failed');
      }
      return response.json() as Promise<{ id: string; checksum: string; byteSize: number }>;
    },

    downloadUrl: (id: string) => `/api/v1/proof/${encodeURIComponent(id)}`,
  },

  imports: {
    peakScenario: (data: {
      ordersCsv: string;
      fleetCsv: string;
      operatingDate: string;
      version: string;
    }) =>
      request<{ batchId: string; imported: boolean }>('/imports/peak-scenario', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    history: (data: {
      ordersCsv: string;
      legsCsv: string;
      dataset: string;
      version: string;
    }) =>
      request<{ batchId: string; imported: boolean }>('/imports/history', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  audit: {
    list: (query?: { limit?: number; cursor?: string }) =>
      request<{
        items: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Record<string, unknown>;
          created_at: string;
        }[];
        nextCursor: string | null;
      }>(`/audit${buildQuery(query)}`),
  },
};
