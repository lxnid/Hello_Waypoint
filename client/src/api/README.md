# Client API workspace

- `http.ts` owns the `/api/v1` prefix, session credentials, headers, errors, query encoding and HTTP response handling.
- `domains/` groups endpoint methods by feature. These modules contain no React state or query-cache invalidation.
- `index.ts` composes the public `api` object. `../api.ts` preserves existing imports and the original `me`, `login`, `logout` and `overview` shortcuts.
- `../types/api/` holds endpoint shapes not already supplied by shared contracts. Reuse schema-derived types from `@waypoint/contracts/workflows` and `@waypoint/contracts/operations` where available.
- `../types/` holds role-specific view models. They remain separate from wire contracts because existing screens consume enriched fields returned by the backend.

Components own React Query keys, invalidation and rendering. Existing dynamic commands can still use `request`; add named domain methods when introducing new endpoint usage. Keep component props beside their components.

Run `node --test client/tests/*.test.mjs` from the repository root, or the client's `test` script, to verify transport behavior and operational endpoint helpers.
