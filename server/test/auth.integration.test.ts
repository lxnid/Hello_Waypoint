import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config/env.js';
import { createDatabase } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { buildApp } from '../src/app.js';

const config = loadConfig();
const connection = createDatabase(config.databaseUrl);
let app: FastifyInstance;

beforeAll(async () => {
  await seed(config.databaseUrl, config.demoPassword);
  app = await buildApp({ ...config, serveClient: false, logLevel: 'silent' }, connection.db);
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await connection.sql.end();
});

async function login(email: string, password = config.demoPassword) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: config.appOrigin },
    payload: { email, password },
  });
}

describe('role sessions and documented API', () => {
  it.each([
    ['dispatcher@waypoint.lk', 'DISPATCHER', 'dispatcher', 120, 60],
    ['loader@waypoint.lk', 'LOADER', 'loader', 75, 38],
    ['driver@waypoint.lk', 'DRIVER', 'driver', 75, 38],
    ['manager.out001@waypoint.lk', 'STORE_MANAGER', 'store', 1, 0],
  ])('authenticates and scopes %s', async (email, role, path, outletCount, vehicleCount) => {
    const signedIn = await login(email);
    expect(signedIn.statusCode).toBe(200);
    const cookie = signedIn.cookies.find((item) => item.name === 'waypoint_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    const headers = { cookie: `waypoint_session=${cookie!.value}` };
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers });
    expect(me.json().user.role).toBe(role);
    expect(me.body).not.toContain('passwordHash');
    const overview = await app.inject({
      method: 'GET',
      url: `/api/v1/portal/${path}/overview`,
      headers,
    });
    expect(overview.json()).toMatchObject({ outletCount, vehicleCount });
    if (role !== 'DISPATCHER') {
      const forbidden = await app.inject({
        method: 'GET',
        url: '/api/v1/portal/dispatcher/overview',
        headers,
      });
      expect(forbidden.statusCode).toBe(403);
    }
  });

  it('rejects bad credentials and missing or forged sessions', async () => {
    expect((await login('dispatcher@waypoint.lk', 'incorrect')).statusCode).toBe(401);
    expect((await login('unknown@waypoint.lk', 'incorrect')).statusCode).toBe(401);
    expect((await app.inject('/api/v1/auth/me')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: 'waypoint_session=forged' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('revokes the session on logout', async () => {
    const signedIn = await login('dispatcher@waypoint.lk');
    const cookie = signedIn.cookies.find((item) => item.name === 'waypoint_session')!;
    const headers = { cookie: `waypoint_session=${cookie.value}`, origin: config.appOrigin };
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode,
    ).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers })).statusCode).toBe(
      401,
    );
  });

  it('blocks foreign-origin writes and publishes all stage 1 endpoints', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: 'https://foreign.example' },
          payload: { email: 'dispatcher@waypoint.lk', password: config.demoPassword },
        })
      ).statusCode,
    ).toBe(403);
    const docs = await app.inject('/docs/json');
    expect(docs.statusCode).toBe(200);
    expect(docs.json().paths).toHaveProperty('/api/v1/auth/login');
    expect(docs.json().paths).toHaveProperty('/api/v1/auth/me');
    expect(docs.json().components.securitySchemes).toHaveProperty('cookieAuth');
  });

  it('serves the built client assets as executable JavaScript', async () => {
    const publicApp = await buildApp(
      { ...config, serveClient: true, logLevel: 'silent' },
      connection.db,
    );
    try {
      await publicApp.ready();
      const page = await publicApp.inject('/');
      const script = page.body.match(/src="([^"]+\.js)"/)?.[1];
      expect(script).toBeTruthy();
      const asset = await publicApp.inject(script!);
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['content-type']).toContain('javascript');
      expect((await publicApp.inject('/api/v1/does-not-exist')).statusCode).toBe(404);
    } finally {
      await publicApp.close();
    }
  });
});
