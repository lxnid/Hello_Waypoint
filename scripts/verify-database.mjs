import { spawnSync } from 'node:child_process';

function docker(args) {
  const result = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
docker(['up', '-d', '--wait', 'database']);
docker(['build', 'app']);
// psql \gexec avoids resetting an existing test database and uses the container's credentials.
docker([
  'exec',
  '-T',
  'database',
  'sh',
  '-c',
  `printf "SELECT 'CREATE DATABASE waypoint_schema_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'waypoint_schema_test')\\n\\\\gexec\\n" | psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"`,
]);
docker([
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.test.yml',
  'run',
  '--rm',
  'app',
  'sh',
  '-c',
  'export DATABASE_URL="${DATABASE_URL%/*}/waypoint_schema_test"; pnpm db:migrate && pnpm db:seed && export TEST_DATABASE_URL="$DATABASE_URL" && pnpm --filter @waypoint/server test:integration',
]);
