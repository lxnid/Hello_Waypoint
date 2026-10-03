import type { Identity, Overview } from '@waypoint/contracts';
import { ROLE_API, type Role } from '@waypoint/contracts/roles';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Fastify rejects an empty request carrying a JSON content type. Only declare
  // JSON when a request actually has a body (login does; logout does not).
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
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const api = {
  me: () => request<Identity>('/auth/me'),
  login: (email: string, password: string) =>
    request<Identity>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  overview: (role: Role) => request<Overview>(`/portal/${ROLE_API[role]}/overview`),
};
