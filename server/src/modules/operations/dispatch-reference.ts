import type { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { sql } from 'drizzle-orm';

/** Small reference tables, separate from paginated operational order reads. */
export const dispatchReferenceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/dispatch/reference',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER'],
        summary: 'Dispatcher store, fleet and calendar reference',
        security: [{ cookieAuth: [] }],
        response: {
          200: Type.Object({
            stores: Type.Array(Type.Record(Type.String(), Type.Unknown())),
            vehicles: Type.Array(Type.Record(Type.String(), Type.Unknown())),
            operatingDates: Type.Array(Type.String()),
          }),
        },
      },
    },
    async () => {
      const [stores, vehicles, dates] = await Promise.all([
        app.db.execute(
          sql`SELECT o.*,b.name AS brand_name,d.name AS district_name,d.depot_id FROM outlets o JOIN brands b ON b.id=o.brand_id JOIN districts d ON d.id=o.district_id ORDER BY d.id,o.brand_id,o.id`,
        ),
        app.db.execute(sql`SELECT * FROM vehicles WHERE is_active ORDER BY depot_id,id`),
        app.db.execute<{ date: string }>(
          sql`SELECT date::text FROM operating_calendar WHERE is_operating ORDER BY date`,
        ),
      ]);
      return {
        stores: [...stores],
        vehicles: [...vehicles],
        operatingDates: dates.map((row) => row.date),
      };
    },
  );
};
