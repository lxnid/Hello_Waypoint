import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  appOrigin: string;
  demoPassword: string;
  sessionTtlSeconds: number;
  serveClient: boolean;
  logLevel: string;
};

/**
 * Load developer-specific values from the ignored repository-root `.env` file.
 *
 * Node does not discover dotenv files by itself. Keeping this bootstrap beside
 * configuration validation gives the server, migrations, seed, and integration
 * tests one consistent source without adding a runtime dependency. Values that
 * are already supplied by Docker, CI, or the host environment take precedence.
 */
function loadProjectEnvironment(): void {
  const path = fileURLToPath(new URL('../../../.env', import.meta.url));

  try {
    loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

loadProjectEnvironment();

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const jwtSecret = source.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  if (nodeEnv === 'production' && jwtSecret.includes('local-demo-only'))
    throw new Error('Replace the demo JWT_SECRET for production');
  const databaseUrl = source.DATABASE_URL ?? '';
  if (!databaseUrl.startsWith('postgresql://'))
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  const appOrigin = source.APP_ORIGIN ?? '';
  if (!/^https?:\/\//.test(appOrigin)) throw new Error('APP_ORIGIN must be an absolute HTTP URL');
  if (nodeEnv === 'production' && !appOrigin.startsWith('https://'))
    throw new Error('Production APP_ORIGIN must use HTTPS');
  const port = Number(source.PORT ?? 8000);
  const sessionTtlSeconds = Number(source.SESSION_TTL_SECONDS ?? 43200);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 300 || sessionTtlSeconds > 86400)
    throw new Error('Invalid SESSION_TTL_SECONDS');
  return {
    nodeEnv: nodeEnv as Config['nodeEnv'],
    host: source.HOST ?? '0.0.0.0',
    port,
    databaseUrl,
    jwtSecret,
    appOrigin,
    demoPassword: source.DEMO_PASSWORD ?? '',
    sessionTtlSeconds,
    serveClient: source.SERVE_CLIENT === 'true',
    logLevel: source.LOG_LEVEL ?? 'info',
  };
}
