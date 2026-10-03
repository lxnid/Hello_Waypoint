import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest as FastifyHttpRequest,
} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ErrorSchema, HealthSchema, type Role } from '@waypoint/contracts';
import type { Config } from './config/env.js';
import type { Database } from './db/client.js';
import type { SessionIdentity } from './modules/auth/service.js';
import { getSession } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { workflowRoutes } from './modules/operations/api.js';
import { planningRoutes } from './modules/operations/routes.js';
import { portalRoutes } from './modules/portal/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Database;
    sessionCookie: {
      path: string;
      httpOnly: true;
      secure: boolean;
      sameSite: 'lax';
      maxAge: number;
    };
    requireAuth: (request: FastifyHttpRequest, reply: FastifyReply) => Promise<void>;
    allowRole: (role: Role) => (request: FastifyHttpRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    identity?: SessionIdentity;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; sid: string };
    user: { sub: string; sid: string };
  }
}

export async function buildApp(config: Config, db: Database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers.set-cookie',
        'body.password',
      ],
    },
  });
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('sessionCookie', {
    path: '/',
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: config.sessionTtlSeconds,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'waypoint_session', signed: false },
  });
  await app.register(rateLimit, { global: false });
  await app.register(helmet, { contentSecurityPolicy: false });

  // Swagger must see route registration; register it before every application route.
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Waypoint Delivery Planning & Operations API',
        version: '1.0.0',
        description:
          'Multi-role logistics API connecting Store Managers, Dispatchers, Loaders, and Drivers for daily order intake, feasibility-guarded fleet allocation, reverse LIFO loading, digital POD delivery, and receipt verification.',
      },
      servers: [{ url: config.appOrigin, description: 'Current application origin' }],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'waypoint_session',
            description: 'HttpOnly session cookie issued upon login via POST /api/v1/auth/login',
          },
        },
      },
      tags: [
        {
          name: 'Authentication',
          description: 'Session issuance, identity inspection, and logout revocation',
        },
        {
          name: 'DISPATCHER',
          description:
            'Order intake queue, fleet availability, assisted planning (Rules 1-7), and departure authorization',
        },
        {
          name: 'LOADER',
          description: 'Dock bay staging, reverse-sequence LIFO loading, and manifest sign-off',
        },
        {
          name: 'DRIVER',
          description:
            'Pre-trip vehicle inspections, stop progression, digital POD, offline sync, and depot return',
        },
        {
          name: 'STORE_MANAGER',
          description:
            'Catalog ordering before 16:00 cutoff, inbound delivery tracking, and digital receipt verification',
        },
        {
          name: 'Planning',
          description: 'Priority metrics calculation and protected deferral overrides',
        },
        {
          name: 'Operations',
          description: 'Consolidated operational queries, audit history, and proof attachments',
        },
        {
          name: 'System',
          description: 'Application health, database connectivity, and role portal overviews',
        },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.decorate('requireAuth', async (request, reply) => {
    try {
      // cookie-only verification prevents an unrelated bearer token overriding browser identity.
      const token = request.cookies.waypoint_session;
      if (!token) throw new Error('Missing session');
      const claims = app.jwt.verify<{ sub: string; sid: string }>(token);
      const identity = await getSession(db, claims.sid, claims.sub);
      if (!identity) throw new Error('Revoked session');
      request.identity = identity;
    } catch {
      reply
        .code(401)
        .send({ code: 'UNAUTHENTICATED', message: 'Sign in to continue', requestId: request.id });
    }
  });
  app.decorate('allowRole', (role: Role) => async (request, reply) => {
    if (request.identity?.user.role !== role) {
      reply.code(403).send({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        requestId: request.id,
      });
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    // Same-origin writes protect cookie sessions against cross-site form submissions.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && origin !== config.appOrigin)
        reply.code(403).send({
          code: 'INVALID_ORIGIN',
          message: 'Request origin is not allowed',
          requestId: request.id,
        });
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.identity) reply.header('Cache-Control', 'private, no-store');
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const failure = error as Error & { statusCode?: number };
    const status =
      failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500
        ? failure.statusCode
        : 500;
    if (status >= 500) request.log.error(error);
    reply.code(status).send({
      code:
        status === 400
          ? 'VALIDATION_ERROR'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'WORKFLOW_CONFLICT'
                : status === 429
                  ? 'RATE_LIMITED'
                  : 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected error occurred' : failure.message,
      requestId: request.id,
    });
  });

  app.get(
    '/api/v1/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Application and database health',
        response: { 200: HealthSchema, 503: ErrorSchema },
      },
    },
    async (_request, reply) => {
      try {
        await db.execute('select 1');
        return { status: 'ok' as const, database: 'connected' as const };
      } catch {
        return reply.code(503).send({
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database unavailable',
          requestId: _request.id,
        });
      }
    },
  );
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(portalRoutes, { prefix: '/api/v1/portal' });
  await app.register(planningRoutes, { prefix: '/api/v1/planning' });
  await app.register(workflowRoutes, { prefix: '/api/v1' });

  if (config.serveClient) {
    const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
    await app.register(staticPlugin, { root, wildcard: false });
    // The SPA fallback must not intercept Vite's built assets.
    app.get('/assets/*', { schema: { hide: true } }, async (request, reply) => {
      const asset = (request.params as { '*': string })['*'];
      return reply.sendFile(`assets/${asset}`);
    });
    app.get('/*', { schema: { hide: true } }, async (request, reply) => {
      const path = request.url.split('?')[0] ?? '';
      const pageRoute =
        path === '/' || path === '/login' || /^\/(dispatcher|loader|driver|store)(\/|$)/.test(path);
      if (!pageRoute)
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: request.id,
        });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
