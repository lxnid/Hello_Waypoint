import { loadConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { buildApp } from './app.js';

const config = loadConfig();
const { db, sql } = createDatabase(config.databaseUrl);
const app = await buildApp(config, db);

async function shutdown(): Promise<void> {
  await app.close();
  await sql.end();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
