import { PageQuerySchema, IdParamsSchema } from '@waypoint/contracts/workflows';
import { type Page } from './reads.js';
import { WorkflowError } from './service.js';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { ErrorSchema } from '@waypoint/contracts';
import {
  PriorityQuerySchema,
  OrderPrioritySchema,
  DeferralOverrideSchema,
  DeferralOverrideAcknowledgementSchema,
  type PriorityQuery,
  type DeferralOverride,
} from '@waypoint/contracts/operations';
import { getPlanningPriorities } from './priority.js';
import { acknowledgeDeferralOverride } from './planning.js';
import { setAvailability } from './planning-commands.js';
import { listTrips, tripDetail } from './reads.js';

export const managementRoutes: FastifyPluginAsync = async (app) => {
  app.put<{
    Params: { id: string };
    Body: { address: string | null; latitude: number | null; longitude: number | null };
  }>(
    '/stores/:id/location',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Stores'],
        summary: 'Record verified outlet navigation location',
        security: [{ cookieAuth: [] }],
        params: Type.Object(
          { id: Type.String({ minLength: 1, maxLength: 100 }) },
          { additionalProperties: false },
        ),
        body: Type.Object(
          {
            address: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
            latitude: Type.Union([Type.Number({ minimum: -90, maximum: 90 }), Type.Null()]),
            longitude: Type.Union([Type.Number({ minimum: -180, maximum: 180 }), Type.Null()]),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const { address, latitude, longitude } = request.body;
      if ((latitude === null) !== (longitude === null))
        throw new WorkflowError('Supply both latitude and longitude', 400);
      return app.db.transaction(async (tx) => {
        const [store] = await tx.execute(
          sql`UPDATE outlets SET address=${address?.trim() || null},latitude=${latitude},longitude=${longitude} WHERE id=${request.params.id} RETURNING id,address,latitude::text,longitude::text`,
        );
        if (!store) throw new WorkflowError('Store not found', 404);
        await tx.execute(
          sql`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,details) VALUES (${request.identity!.user.id},'STORE_LOCATION_UPDATED','outlet',${request.params.id},${JSON.stringify({ address, latitude, longitude })}::jsonb)`,
        );
        return store;
      });
    },
  );

  // 1. GET /planning - high-level overview of planning contexts, plans, and priorities
  app.get(
    '/planning',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Planning'],
        summary: 'High-level planning overview for dispatchers',
        querystring: Type.Object(
          {
            contextId: Type.Optional(Type.String({ format: 'uuid' })),
            depot: Type.Optional(Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')])),
          },
          { additionalProperties: false },
        ),
        security: [{ cookieAuth: [] }],
      },
    },
    async (request) => {
      const query = request.query as { contextId?: string; depot?: 'Peliyagoda' | 'Kandy' };
      const contexts = [
        ...(await app.db.execute<{ id: string }>(
          sql`SELECT * FROM planning_contexts ORDER BY operating_date DESC LIMIT 50`,
        )),
      ];
      const activeContextId = query.contextId ?? contexts[0]?.id;
      const depot = query.depot ?? request.identity?.user.depot ?? 'Peliyagoda';

      let plans: unknown[] = [];
      let priorities: unknown[] = [];
      if (activeContextId) {
        plans = (await app.db.execute(
          sql`SELECT * FROM plans WHERE context_id = ${activeContextId} ORDER BY depot_id`,
        )) as unknown[];
        priorities = await getPlanningPriorities(
          app.db,
          activeContextId,
          depot,
          request.identity!.user.id,
        );
      }

      return {
        contexts,
        selectedContextId: activeContextId ?? null,
        plans,
        priorities,
        summary: {
          totalEligible: priorities.length,
          totalPlans: plans.length,
        },
      };
    },
  );

  // 2. GET /priorities - direct route matching client requests
  app.get<{ Querystring: PriorityQuery }>(
    '/priorities',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['Planning'],
        summary: 'Live or scenario priority metrics for eligible orders',
        security: [{ cookieAuth: [] }],
        querystring: PriorityQuerySchema,
        response: {
          200: Type.Array(OrderPrioritySchema),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    (request) =>
      getPlanningPriorities(
        app.db,
        request.query.contextId,
        request.query.depot,
        request.identity!.user.id,
      ),
  );

  // 3. POST /decisions/:planOrderId/override - direct route matching client requests
  app.post<{ Params: { planOrderId: string }; Body: DeferralOverride }>(
    '/decisions/:planOrderId/override',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['Planning'],
        summary: 'Explicitly acknowledge a protected deferral',
        security: [{ cookieAuth: [] }],
        params: Type.Object(
          { planOrderId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: DeferralOverrideSchema,
        response: {
          200: DeferralOverrideAcknowledgementSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    (request) =>
      acknowledgeDeferralOverride(
        app.db,
        request.params.planOrderId,
        request.body.version,
        request.identity!.user.id,
        request.body.reason,
      ),
  );

  // 4. GET /fleet - list vehicles with status
  app.get(
    '/fleet',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Fleet'],
        summary: 'List fleet vehicles and availability status',
        querystring: Type.Object(
          {
            contextId: Type.Optional(Type.String({ format: 'uuid' })),
            depot: Type.Optional(Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')])),
          },
          { additionalProperties: false },
        ),
        security: [{ cookieAuth: [] }],
      },
    },
    async (request) => {
      const query = request.query as { contextId?: string; depot?: string };
      const depot = query.depot;
      if (query.contextId) {
        const rows = await app.db.execute(
          sql`SELECT v.*, coalesce(av.status, 'available') AS status
              FROM vehicles v
              LEFT JOIN vehicle_availability av ON av.vehicle_id = v.id AND av.context_id = ${query.contextId}
              WHERE v.is_active AND (${depot ?? null}::text IS NULL OR v.depot_id = ${depot ?? null})
              ORDER BY v.depot_id, v.id`,
        );
        return [...rows];
      }
      const rows = await app.db.execute(
        sql`SELECT v.*, 'available'::text AS status
            FROM vehicles v
            WHERE v.is_active AND (${depot ?? null}::text IS NULL OR v.depot_id = ${depot ?? null})
            ORDER BY v.depot_id, v.id`,
      );
      return [...rows];
    },
  );

  // 5. PUT /fleet/:id and PUT /fleet - update vehicle availability
  app.put(
    '/fleet/:id',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Fleet'],
        summary: 'Update vehicle availability status',
        params: Type.Object(
          { id: Type.String({ minLength: 1, maxLength: 100 }) },
          { additionalProperties: false },
        ),
        body: Type.Object(
          {
            status: Type.Union([Type.Literal('available'), Type.Literal('workshop')]),
            contextId: Type.Optional(Type.String({ format: 'uuid' })),
          },
          { additionalProperties: false },
        ),
        security: [{ cookieAuth: [] }],
      },
    },
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as { status: string; contextId?: string };
      let contextId = body.contextId;
      if (!contextId) {
        const contexts = (await app.db.execute(
          sql`SELECT id FROM planning_contexts ORDER BY operating_date DESC LIMIT 1`,
        )) as unknown as { id?: string }[];
        contextId = contexts[0]?.id;
      }
      if (!contextId) throw new WorkflowError('Planning context required', 400);
      if (!['workshop', 'available'].includes(body.status))
        throw new WorkflowError('Invalid availability status', 400);
      const status = body.status as 'workshop' | 'available';
      await setAvailability(app.db, request.identity!.user.id, contextId, params.id, status);
      return { ok: true, vehicleId: params.id, status, contextId };
    },
  );

  // 6. GET /stores - list stores / outlets
  app.get(
    '/stores',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Stores'],
        summary: 'List stores / outlets reference records',
        querystring: Type.Object(
          {
            brand: Type.Optional(Type.String({ maxLength: 100 })),
            district: Type.Optional(Type.String({ maxLength: 100 })),
            depot: Type.Optional(Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')])),
            q: Type.Optional(Type.String({ maxLength: 120 })),
          },
          { additionalProperties: false },
        ),
        security: [{ cookieAuth: [] }],
      },
    },
    async (request) => {
      const query = request.query as {
        brand?: string;
        district?: string;
        depot?: string;
        q?: string;
      };
      const rows = await app.db.execute(
        sql`SELECT o.*,
                   b.name AS brand_name,
                   d.name AS district_name,
                   d.depot_id
            FROM outlets o
            JOIN brands b ON b.id = o.brand_id
            JOIN districts d ON d.id = o.district_id
            WHERE (${query.brand ?? null}::text IS NULL OR o.brand_id = ${query.brand ?? null} OR b.name = ${query.brand ?? null})
              AND (${query.district ?? null}::text IS NULL OR o.district_id = ${query.district ?? null} OR d.name = ${query.district ?? null})
              AND (${query.depot ?? null}::text IS NULL OR d.depot_id = ${query.depot ?? null})
              AND (${query.q ?? null}::text IS NULL OR (o.name ILIKE ${'%' + (query.q ?? '') + '%'} OR o.id ILIKE ${'%' + (query.q ?? '') + '%'}))
            ORDER BY d.id, o.brand_id, o.id`,
      );
      return [...rows];
    },
  );

  // 7. GET /tracker - trips live tracking
  app.get<{ Querystring: Page }>(
    '/tracker',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Operations', 'Tracker'],
        summary: 'Live trips tracking and progression',
        querystring: PageQuerySchema,
        security: [{ cookieAuth: [] }],
      },
    },
    (request) => listTrips(app.db, request.identity!.user.id, request.query),
  );

  app.get<{ Params: { id: string } }>(
    '/tracker/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Operations', 'Tracker'],
        summary: 'Single trip tracking and execution detail',
        params: IdParamsSchema,
        security: [{ cookieAuth: [] }],
      },
    },
    (request) => tripDetail(app.db, request.identity!.user.id, request.params.id),
  );
};
