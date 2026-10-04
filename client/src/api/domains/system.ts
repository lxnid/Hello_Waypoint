import { request } from '../http';
import type { Overview, Role } from '@waypoint/contracts';
import { ROLE_API } from '@waypoint/contracts/roles';
import type { SystemHealthResponse } from '../../types/api/system';

export const systemApi = {
  health: () => request<SystemHealthResponse>('/health'),
  overview: (role: Role) => request<Overview>(`/portal/${ROLE_API[role]}/overview`),
};
