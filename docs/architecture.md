# Architecture

```mermaid
flowchart LR
  Browser[Responsive React client] --> App[Fastify application]
  App --> Auth[Authentication and authorization]
  App --> API[Versioned REST API]
  Auth --> DB[(PostgreSQL)]
  API --> DB
  Contract[Shared TypeBox contracts] --> Browser
  Contract --> App
  App --> Docs[Swagger UI and OpenAPI]
```

## Boundaries

- `client` owns interaction, responsive layout, and session bootstrap. It never decides resource ownership.
- `server` owns password verification, cookie issuance, session revocation, and resource scoping.
- `packages/contracts` owns public role and API schemas. Server responses are serialized from those schemas.
- `data/reference` holds immutable source records. The seed imports them idempotently through committed migrations.

The Stage 1 production app serves the built client and `/api/v1` from one origin. The client uses an HttpOnly, SameSite cookie. Mutating requests with an Origin header must match `APP_ORIGIN`. The server checks the session table on every authenticated request so logout can revoke a token immediately.

Future operational modules will be grouped by workflow: orders, planning, loading, delivery, receipt, and forecasting. Authorization will combine role checks with depot, outlet, or plan ownership in database queries. The allocation engine will be tested against the supplied `check_allocation.py` semantics, including combined vehicle day budgets.
