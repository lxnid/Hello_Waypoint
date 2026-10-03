import type { FastifyPluginAsync } from 'fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import { ErrorSchema, OverviewSchema, ROLE_API, type Role } from '@waypoint/contracts';
import { districts, outlets, vehicles } from '../../db/schema.js';

const portalRoles: Role[] = ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER'];

export const portalRoutes: FastifyPluginAsync = async (app) => {
  for (const role of portalRoles)
    app.get(
      `/${ROLE_API[role]}/overview`,
      {
        preHandler: [app.requireAuth, app.allowRole(role)],
        schema: {
          tags: ['System'],
          summary: `Read ${role.toLowerCase().replace('_', ' ')} foundation data`,
          security: [{ cookieAuth: [] }],
          response: { 200: OverviewSchema, 401: ErrorSchema, 403: ErrorSchema },
        },
      },
      async (request) => {
        const user = request.identity!.user;
        // Scope is enforced in the database query, never from a client-provided depot or outlet.
        const outletFilter =
          user.role === 'STORE_MANAGER'
            ? eq(outlets.id, user.outletId!)
            : inArray(districts.depotId, user.authorizedDepots);
        const [outletResult] = await app.db
          .select({ count: sql<number>`count(*)::int` })
          .from(outlets)
          .innerJoin(districts, eq(outlets.districtId, districts.id))
          .where(outletFilter);
        const [vehicleResult] = await app.db
          .select({ count: sql<number>`count(*)::int` })
          .from(vehicles)
          .where(inArray(vehicles.depotId, user.authorizedDepots));
        return {
          user,
          outletCount: outletResult?.count ?? 0,
          vehicleCount: user.role === 'STORE_MANAGER' ? 0 : (vehicleResult?.count ?? 0),
          stage: 'FOUNDATION' as const,
        };
      },
    );
};
