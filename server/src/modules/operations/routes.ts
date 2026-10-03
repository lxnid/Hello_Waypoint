import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
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

export const planningRoutes: FastifyPluginAsync = async (app) => {
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
};
