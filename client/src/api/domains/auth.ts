import { request } from '../http';
import type { Identity } from '@waypoint/contracts';

export const authApi = {
  login: (email: string, password: string) =>
    request<Identity>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Identity>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
