import { request, buildQuery } from '../http';
import type { AuditListQuery, AuditListResponse } from '../../types/api/audit';

export const auditApi = {
  list: (query?: AuditListQuery) => request<AuditListResponse>(`/audit${buildQuery(query)}`),
};
