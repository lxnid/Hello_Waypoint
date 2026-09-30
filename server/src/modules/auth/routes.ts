import type { FastifyPluginAsync } from 'fastify';
import { ErrorSchema, IdentitySchema, LoginSchema } from '@waypoint/contracts';
import { authenticate, revokeSession } from './service.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Authentication'],
        summary: 'Sign in with a seeded role account',
        description:
          'Creates an HttpOnly session cookie. Synthetic demo credentials are listed in the README.',
        body: LoginSchema,
        response: { 200: IdentitySchema, 400: ErrorSchema, 401: ErrorSchema, 429: ErrorSchema },
      },
    },
    async (request, reply) => {
      const credentials = request.body as { email: string; password: string };
      const identity = await authenticate(
        app.db,
        credentials.email,
        credentials.password,
        app.config.sessionTtlSeconds,
      );
      if (!identity)
        return reply.code(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          requestId: request.id,
        });
      const token = app.jwt.sign(
        { sub: identity.user.id, sid: identity.sessionId },
        { expiresIn: app.config.sessionTtlSeconds },
      );
      reply.setCookie('waypoint_session', token, app.sessionCookie);
      return { user: identity.user, expiresAt: identity.expiresAt.toISOString() };
    },
  );

  app.get(
    '/me',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['Authentication'],
        summary: 'Read the current session',
        security: [{ cookieAuth: [] }],
        response: { 200: IdentitySchema, 401: ErrorSchema },
      },
    },
    async (request) => ({
      user: request.identity!.user,
      expiresAt: request.identity!.expiresAt.toISOString(),
    }),
  );

  app.post(
    '/logout',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['Authentication'],
        summary: 'Revoke the current session',
        security: [{ cookieAuth: [] }],
        response: { 204: { type: 'null' }, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      await revokeSession(app.db, request.identity!.sessionId);
      reply.clearCookie('waypoint_session', { path: '/' });
      return reply.code(204).send();
    },
  );
};
