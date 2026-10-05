import { authApi } from './domains/auth';
import { systemApi } from './domains/system';
import { dispatchApi } from './domains/dispatch';
import { catalogApi } from './domains/catalog';
import { ordersApi } from './domains/orders';
import { planningApi } from './domains/planning';
import { tripsApi } from './domains/trips';
import { issuesApi } from './domains/issues';
import { offlineApi } from './domains/offline';
import { proofApi } from './domains/proof';
import { importsApi } from './domains/imports';
import { auditApi } from './domains/audit';
export { request, ApiError, buildQuery } from './http';
export const api = {
  auth: authApi,
  system: systemApi,
  dispatch: dispatchApi,
  catalog: catalogApi,
  orders: ordersApi,
  planning: planningApi,
  trips: tripsApi,
  issues: issuesApi,
  offline: offlineApi,
  proof: proofApi,
  imports: importsApi,
  audit: auditApi,
  me: authApi.me,
  login: authApi.login,
  logout: authApi.logout,
  overview: systemApi.overview,
};
