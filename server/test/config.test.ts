import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://example:pass@localhost:5432/test',
  JWT_SECRET: 'a-secure-secret-with-more-than-32-characters',
  APP_ORIGIN: 'http://localhost:3000',
};

describe('environment configuration', () => {
  it('rejects a weak signing secret', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow('JWT_SECRET');
  });
  it('rejects demo secret and HTTP origin in production', () => {
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        JWT_SECRET: 'local-demo-only-change-this-secret-before-public-deployment-2026',
        APP_ORIGIN: 'https://example.com',
      }),
    ).toThrow('demo JWT_SECRET');
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow('HTTPS');
  });
});
