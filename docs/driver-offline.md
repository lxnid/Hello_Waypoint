# Driver offline operation

Development runs the API and Vite locally, with PostgreSQL in Docker. The service worker is registered only in a production frontend build, so Vite development supports queued actions in an already open page but does not provide a cold offline reload.

Before leaving connectivity, the driver must sign in and open the assigned trip. The built app caches its shell and bundles; IndexedDB stores the driver identity until its session expiry, fetched routes, arrival events, delivery events, and signature blobs. An explicit server authentication rejection prevents reuse of the cached identity.

Arrival and delivery are saved locally with stable operation IDs and the plan version. Reconnection replays them in order. Delivery proof uploads after the arrival receives its server attempt ID. Events remain pending on failure; they are marked applied only after server acknowledgment. Concurrent tabs serialize replay using Web Locks where supported. Inspection and depot return still require connectivity.

The server remains authoritative for ownership, plan versions, workflow state, and quantity validation. A saved local delivery is not yet a confirmed server delivery. Keep the device's site data until pending operations have synchronized; clearing browser storage removes unsynchronized events and proof.

## Navigation

Dispatchers can record verified store addresses and coordinates in Stores. Directions links use those destinations. For embedded maps, copy `client/.env.example` to `client/.env.local`, configure `VITE_GOOGLE_MAPS_EMBED_KEY`, and rebuild. Frontend environment files are separate from the server `.env`. Map tiles are not cached by this app; offline navigation requires a separately prepared navigation app.

## Validation

The built driver workspace was tested on an isolated local preview against the test database: sign in, fetch a route, stop the server, and reload. The shell, identity, and saved route restored with an offline indicator. Backend integration tests cover replay and workflow validation. Full device-level delivery/signature replay across a network interruption remains a separate acceptance check.
