import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from '../config/env.js';
import { createDatabase } from './client.js';

const { db, sql } = createDatabase(loadConfig().databaseUrl);
try {
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.info('Database migrations applied');
} finally {
  await sql.end();
}
