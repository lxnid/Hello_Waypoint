# Waypoint Logistics

Waypoint Logistics connects ordering, assisted fleet planning, loading, delivery, receipt, proof, and claims across four roles. The backend runs as Docker services with PostgreSQL and Drizzle migrations.

## Quick start

Install Docker Desktop, then run:

```sh
docker compose up --build
```

Open [Waypoint](http://localhost:3000) or [Swagger UI](http://localhost:3000/docs). Compose waits for PostgreSQL and the Drizzle migration service before starting the app. In another terminal, seed reference data and demo accounts with `docker compose --profile demo run --rm seed`.

## Demo accounts

These accounts use synthetic competition data. All four use the demo password `Peliyagoda2026!`.

| Role          | Email                        | Scope            |
| ------------- | ---------------------------- | ---------------- |
| Dispatcher    | `dispatcher@waypoint.lk`     | Both depots      |
| Loader        | `loader@waypoint.lk`         | Peliyagoda depot |
| Driver        | `driver@waypoint.lk`         | Peliyagoda depot |
| Store manager | `manager.out001@waypoint.lk` | OUT001           |

The role cards fill an email address; each sign-in still verifies the password against the database. Change `JWT_SECRET`, `DEMO_PASSWORD`, and the database credentials before public deployment. `APP_ORIGIN` must be the HTTPS public origin in production.

## Local development

Use Node.js 24 and pnpm 10.32.1. Copy `.env.example` to `.env`, then start PostgreSQL using Docker or another local instance. Install and run:

```sh
corepack enable
cp .env.example .env
pnpm install
pnpm dev:setup
pnpm dev
```

`dev:setup` starts only PostgreSQL in Docker, waits for it to be healthy, applies migrations, and safely reseeds the synthetic data. Run it again whenever a migration or seed changes. The Vite client runs at port 3000 with hot module replacement and proxies `/api` and `/docs` to the Fastify watch server at port 8000. Source changes therefore do not require an image rebuild.

If the full Docker application is already running, stop its app container before local development so Vite can use port 3000:

```sh
docker compose stop app
pnpm dev
```

The server loads the repository-root `.env` automatically while preserving any environment variables supplied by Docker or CI. Check changes with `pnpm verify`; `pnpm format` applies the shared Prettier style. Run `pnpm verify:database` for Drizzle migration and integration checks using the Docker PostgreSQL service and an isolated test database.

## Architecture and API

The client, server, and shared contracts are pnpm workspaces. The same TypeBox schemas describe validation, responses, TypeScript types, and OpenAPI. PostgreSQL stores normalized network/catalog references, orders, dated plans, trip load manifests, fulfillment, receipts, claims, forecasts, users, and revocable sessions. [Architecture](docs/architecture.md) and [data model](docs/data-model.md) document the boundaries.

The API is under `/api/v1`. Use `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, and the role-specific `/api/v1/portal/{role}/overview` endpoints. Swagger UI is at `/docs`; the generated document is at `/docs/json`.

## Stage 1 judge walkthrough

1. Run `docker compose up --build` and open the application.
2. Select each role card, enter the demo password, and sign in. Each account opens its own workspace.
3. Check the role, depot or outlet, and scoped reference counts; sign out between roles.
4. Open `/docs`, call login, then call `/api/v1/auth/me` in the same browser session.

The complete cross-role operational walkthrough will replace this section as later stages deliver orders, plans, loading, delivery, and receipt.

## Design continuity

The submitted Designathon PDF and live prototype are the visual and workflow baseline. Stage 1 carries its dark Waypoint navigation, restrained white surfaces, and role separation into a real application. The prototype's role picker previously simulated sign-in; this implementation adds real account verification. Operational screens will follow the submitted flow. Any material departures will be listed here.

## Competition data

`data/reference` contains the source CSVs needed for reference seeding. They are synthetic competition data and should be handled according to the challenge booklet's publication rules. Do not publish this repository or the data without organizer authorization.

## Operational data foundation

The backend exposes role-scoped APIs for orders, assisted planning, manifests, loading, dispatch, delivery, receipts, proof, exception claims, replay, and return/fuel closure. Proof files persist on a private Docker volume. Operational browser screens and durable browser-side offline storage remain to be connected. Run `docker compose --profile demo run --rm seed` to create the synthetic released-plan walkthrough. See [the data model](docs/data-model.md) for lifecycles, constraints, indexes, CSV import/export, and Docker verification.
