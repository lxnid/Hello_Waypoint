# Waypoint team handover and development guide

Updated: October 1, 2026, Asia/Colombo. Foundation baseline: commit `a984b55`.

This is the starting point for every teammate or coding agent joining the project. It explains the working foundation, how to run it, the engineering standards, and the remaining delivery plan. Read this alongside the [README](../README.md), [architecture](architecture.md), and [data model](data-model.md). Update this guide as stages are completed; future work described here is not a claim that it already exists.

## 1. Objective, requirements, and scope

Build one responsive delivery operations system for Waypoint Fresh, Style, and Tech, serving 120 outlets with 60 vehicles across Peliyagoda and Kandy. The complete workflow is:

```text
Store places order → dispatcher allocates or records deferral → loader packs
→ driver records delivery, including offline → store confirms receipt
                          ↓
                  dispatcher sees progress and exceptions
```

Every handoff must use persisted, connected records. Four attractive dashboards without this workflow are not the end goal. Engineering quality and architecture carry the largest individual rubric weight, but functional completeness and allocation together account for 40%.

| Hackathon criterion                       | Weight | Evidence we need                                                                              |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Engineering quality and architecture      | 25%    | Clear boundaries, typed contracts, meaningful tests, readable code, migrations, documentation |
| Functional completeness across four roles | 20%    | One reproducible order-to-receipt walkthrough                                                 |
| Planning and allocation                   | 20%    | Feasible plans, explicit deferrals, explainable constraints                                   |
| Offline operation and recovery            | 10%    | Driver can work offline, reload, reconnect, and reconcile safely                              |
| Fidelity to submitted design              | 10%    | Submitted workflows and consistent visual system; departures recorded                         |
| Demo video                                | 10%    | Five-to-eight-minute walkthrough plus code and architecture tour                              |
| Creativity                                | 5%     | Useful refinements after the required workflow works                                          |

The Hackathon deadline is **October 4, 2026, at 11:59 PM Asia/Colombo**. Required deliverables: public working URL, four seeded role accounts, GitHub monorepo named `TeamName_SolutionName`, root Docker Compose and `.env.example`, setup and judge walkthrough in README, architecture/data-model/AI disclosure documents, and an unlisted five-to-eight-minute YouTube demo. Code pushed after the deadline is excluded. Keep the deployment available for the review period.

### Source of truth and known corrections

Use the official Challenge Booklet for competition rules and the actual Day 5 submitted design/PDF/style guide for UI and workflow fidelity. Use running source, package manifests, and migrations for the implementation's current behavior. The earlier master plan is implementation guidance and contains outdated examples; resolve conflicts using the official requirements, then record the decision.

The original workspace has these files **outside this Git repository**, in its parent folder:

- `Challenge Booklet.md`: official brief, Hackathon requirements, constraints, data publication rules, and Datathon specifications.
- `HACKATHON_MASTER_PLAN.md`: earlier proposed stack, schedule, sample schema and allocation code.
- `DESIGNATHON_SUBMISSION_REPORT.md` and `DESIGNATHON_USER_ROLES.md`: screen rationale and role flows. These contain draft/placeholder material; compare them to the actual submitted artifact.
- `tech-triathlon-phase-1-designathalon-report.pdf`: available design report; verify against the actual Day 5 submission.
- `check_allocation.py` and the full `data/` directory: allocation checker and supplied competition data.
- The supplied login and style-guide screenshots: not currently bundled as repository assets.

A clone of `Hello_Waypoint` does **not** include those parent-folder files. Before work depends on them, the project lead must give team members access through the competition-authorized channel and record the approved design/prototype location. Preserve original data and checker versions. This guide captures the implementation essentials but does not replace those artifacts.

The booklet restricts dataset use, sharing, and publication. Follow its terms and organizer authorization when choosing repository visibility or distributing supporting files; do not assume a GitHub submission requirement authorizes publishing raw datasets or derivatives. Two reference CSVs are already tracked here, so check the approved sharing arrangement before making the repository public.

Current decisions overriding stale master-plan examples:

- React **19**, Fastify **5**, shared **TypeBox** contracts, and PostgreSQL **16** are implemented. Do not switch to React 18 or introduce a second Zod validation system to match an older document.
- Authentication uses an HttpOnly cookie plus a database session that can be revoked immediately. It is not a seven-day bearer token in browser storage. Default session lifetime is 12 hours.
- The common login uses abstract Waypoint branding for every role. No demo role picker is implemented; type the seeded account credentials.
- Drizzle migrations are committed and applied, rather than relying on schema push.
- Allocation time budgets apply to the **sum of daily trips per vehicle**, not to each trip independently.
- Trained predictions and Datathon integration are not required for Hackathon submission. If a forecast screen remains a preview, label it accurately and record the design departure; do not present invented predictions as live results.

## 2. What exists at handover

| Area                  | Implemented foundation                                                        | Still to build                                                                                      |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace and tooling | pnpm monorepo, TypeScript, ESLint, Prettier, Docker, quality CI               | Expand checks as operational modules arrive                                                         |
| Data                  | 120 outlets, 60 vehicles, four users, revocable sessions; idempotent seed     | Realistic delivery day, calendar/travel/handling data, dated fleet availability, operational tables |
| Authentication        | Login, identity, role overview, ownership context, logout/session revocation  | Resource authorization for new order/plan/trip endpoints                                            |
| API docs              | Swagger `/docs`, OpenAPI `/docs/json`                                         | Document every new operational endpoint                                                             |
| UI                    | Common responsive login, reusable controls, role-specific foundation overview | Real order, planning, loading, driver, and receipt pages                                            |
| Planning              | Architecture direction only                                                   | Validator, allocation persistence, daily budgets, fuel/windows, deferrals                           |
| Field work            | No offline implementation yet                                                 | Cached manifest, durable outbox, proof of delivery, reconciliation                                  |
| Submission            | Basic architecture/data-model/AI documents                                    | Public deployment, final walkthrough, video, full disclosure                                        |

The role landing paths (`/dispatcher/orders`, `/loader/loads`, `/driver/routes`, `/store/orders`) currently lead to foundation views, not completed operational workflows. Do not mark a feature complete because its route or button exists.

## 3. First setup on a new machine

Prerequisites: Git, Docker Desktop with Compose, Node.js **24**, and pnpm **10.32.1**. The manifest allows Node >=24, but `.nvmrc`, CI, and Docker standardize on Node 24. Use that version across the team. All commands below run from the cloned **repository root**, where `package.json` lives, unless explicitly stated otherwise.

```sh
git clone <team-repository-url>
cd <cloned-repository-folder>
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.32.1 --activate
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

`nvm` is optional if another Node version manager already supplies Node 24. Copy `.env.example` only for first setup; preserve an existing `.env`. If Corepack is unavailable in your Node distribution, install the pinned pnpm version using your normal package-manager setup, then check `node --version` and `pnpm --version`.

`dev:setup` starts only PostgreSQL in Docker, waits for health, applies migrations, and seeds records. `dev` starts Vite with hot reload and Fastify with watch/restart. Both processes should remain running while developing.

| Address                               | Purpose                                |
| ------------------------------------- | -------------------------------------- |
| `http://localhost:3000`               | Frontend and normal browser origin     |
| `http://localhost:3000/docs`          | Swagger through the development proxy  |
| `http://localhost:3000/docs/json`     | Generated OpenAPI document             |
| `http://localhost:8000/api/v1/health` | Backend/database health                |
| `localhost:5432`                      | PostgreSQL for local development tools |

Vite proxies `/api` and `/docs` to port 8000. Client requests stay relative to `/api/v1`; avoid hardcoded backend hosts in UI code. Use `localhost:3000` consistently with the example `APP_ORIGIN`; switching to `127.0.0.1` changes the origin and may reject writes.

### Accounts and configuration

| Role          | Seeded email                 | Scope                                                |
| ------------- | ---------------------------- | ---------------------------------------------------- |
| Dispatcher    | `dispatcher@waypoint.lk`     | Peliyagoda                                           |
| Loader        | `loader@waypoint.lk`         | Peliyagoda                                           |
| Driver        | `driver@waypoint.lk`         | Peliyagoda; future trips must be explicitly assigned |
| Store manager | `manager.out001@waypoint.lk` | OUT001                                               |

The local synthetic demo password is `Peliyagoda2026!`. `.env` is ignored; `.env.example` documents configuration. Server, migrations, seed, and integration tests load root `.env`; externally supplied values take precedence.

- `DATABASE_URL`: local host URL for local server; container hostname `database` inside Compose.
- `APP_ORIGIN`: exact frontend origin. Use the real HTTPS origin in production.
- `JWT_SECRET`: at least 32 characters; replace the demo secret for deployment.
- `DEMO_PASSWORD`: initial seed password. **Changing it and rerunning seed does not update existing accounts** because seed uses `onConflictDoNothing`. Use an explicit reviewed account update if needed.
- `SESSION_TTL_SECONDS`: defaults to 43200; validated range 300–86400.
- `SERVE_CLIENT=false`: local Vite workflow. Built deployment uses `true`.
- `PORT=8000`: local API. Compose serves the built app on port 3000.

Do not commit real secrets, session cookies, uploaded proof, or production `.env` files.

### Docker mode versus development mode

```sh
# Reproducible built stack: database, migrations, seed, built frontend and API.
docker compose up --build

# Switch to local hot reload if the built app occupies port 3000.
docker compose stop app
pnpm dev:setup
pnpm dev
```

The app image is a build snapshot: it does **not** update automatically when source changes. Rebuild it with `docker compose up --build app`. Use local `pnpm dev` for daily changes. Database-only Docker is sufficient for that workflow. Avoid running both app modes on port 3000 simultaneously.

### Common setup failures

| Symptom                                              | Check and recovery                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unsupported Node engine or environment loader errors | Switch to Node 24 and reopen the terminal if necessary                                                        |
| Database unavailable                                 | Start Docker; inspect `docker compose ps` and `docker compose logs database`; verify `.env` credentials       |
| Port 3000 occupied                                   | Stop the project's built `app` container or identify the other local dev process                              |
| Port 5432 occupied                                   | Identify existing PostgreSQL; choose another Compose host port using `POSTGRES_PORT` and match `DATABASE_URL` |
| Login rejects correct-looking credentials            | Confirm database was seeded and whether its original password differs from the current `DEMO_PASSWORD`        |
| Foreign-origin write rejected                        | Match browser hostname, port, and protocol to `APP_ORIGIN`                                                    |
| New tables missing                                   | Pull merged migrations, then run `pnpm db:migrate`                                                            |
| API proxy unavailable                                | Confirm both Vite and the server started; inspect API logs and health                                         |
| API returns HTML or assets fail                      | Check production static routing; keep unknown `/api` routes as API 404s and deep links as SPA routes          |

Do not fix setup problems by deleting shared data. `docker compose down` stops containers; adding `-v` also destroys the project's database volume. Fresh-install checks belong in an isolated environment with disposable data.

## 4. Architecture and code ownership

```text
client/src/
  api.ts                 Shared HTTP transport and typed API calls
  ui/App.tsx             Session bootstrap, routing, current stateful controllers
  ui/components/         Shared presentational controls
  ui/login/              Stateless login view
  ui/portal/             Stateless foundation workspace view
  style.css              Current visual tokens, shared styles, breakpoints
packages/contracts/src/  Public API schemas, inferred types, browser-safe role metadata
server/src/
  app.ts                 Application factory, plugins, API registration, auth enforcement
  config/env.ts          Environment loading and validation
  db/                    Schema, connection, migrations entry point, seed
  modules/auth/          Authentication routes and service
  modules/portal/        Scoped foundation overview routes
server/drizzle/          Committed SQL migrations and metadata
server/test/             Unit and database-backed integration tests
data/reference/          Immutable foundation CSV inputs
docs/                    Handover, architecture, data model, AI disclosure
```

For new work, group backend modules by `orders`, `planning`, `loading`, `delivery`, and `receipt`. Add matching frontend feature folders as needed. These are proposed additions, not existing folders. Keep allocation calculations in a pure domain module with explicit inputs and results.

Use this dependency direction:

```text
View → feature controller/query hooks → API client → route → service → database
                                                    ↓
                                           pure domain calculations
```

Routes validate HTTP input, apply authentication/role checks, call services, and serialize responses. Services enforce business transitions and transactions. Extract scoped database queries into a repository when complexity warrants it; avoid layers that only forward a single call. Domain calculations should not import Fastify, React, environment variables, or a live database.

`packages/contracts` is the shared public boundary. Define request/response/error schemas there and derive TypeScript types with `Static<typeof Schema>`. Do not copy interfaces between client and server or return raw database rows. Use the browser-safe `@waypoint/contracts/roles` entry point for role metadata and type-only imports for types.

## 5. Engineering standards

### Formatting, typing, and naming

The repository owns formatting. Enable format-on-save using its Prettier configuration; do not use personal formatting settings to override it.

| Setting          | Team value                     |
| ---------------- | ------------------------------ |
| Indentation      | Two spaces, no tabs            |
| Quotes           | Single quotes where applicable |
| Semicolons       | Required                       |
| Trailing commas  | All supported locations        |
| Print width      | 100                            |
| Line endings     | LF                             |
| Arrow parameters | Always parenthesized           |

Use `pnpm format` to apply formatting and `pnpm format:check` to check it. Review the diff after formatting; avoid unrelated file churn. Commit `pnpm-lock.yaml` when dependencies change, use pnpm consistently, and install dependencies in the correct workspace.

TypeScript is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. ESLint rejects explicit `any` and requires consistent type imports. Narrow unknown inputs; avoid using casts or non-null assertions to bypass validation. Use descriptive business names, `camelCase` functions/variables, `PascalCase` components/types, and explicit units such as `volumeM3`, `weightKg`, and `durationMin`. Match CSV field names only at import/export boundaries. Backend ESM relative imports follow the existing `.js` convention.

### Maintainable code and comments

- Keep functions focused on one responsibility. Split large views by meaningful UI sections and shared patterns, not arbitrary line counts.
- Keep state minimal; derive totals/status indicators instead of storing duplicate state that can drift.
- Give business states and reason codes shared definitions. Do not scatter status strings, thresholds, and time constants across screens.
- Validate at the server boundary, including IDs, ranges, dates, payload size, permitted fields, and meaningful business transitions.
- Explain **why** in comments: a constraint's source, ordering invariant, transaction boundary, retry behavior, or non-obvious tradeoff. Avoid narrating obvious statements.
- Use short TSDoc on exported domain/service functions when it clarifies inputs, units, invariants, or errors. Link relevant rule numbers in allocation code.
- A TODO should have a linked task and completion condition. Do not leave misleading success alerts or silent placeholder behavior.
- Keep logs structured; include request IDs and resource IDs, without credentials or proof-of-delivery content.

### Reusable, stateless UI components

Presentational components receive values and callbacks through typed props. They render loading/error/empty/disabled states without fetching, navigating, or implementing allocation rules. Session, network, and business state live in feature controllers/hooks, following the current `LoginView`/`PortalView` split. Stateful widgets such as a signature pad may own local interaction state; expose a narrow callback and keep persistence outside them.

Reuse `Button`, `FormField`, `Brand`, and other shared controls before introducing another variant. Add shared components only when they have a real common use. Keep server state in TanStack Query; after mutations, invalidate/update affected order, trip, and role queries. Key caches by the scope that changes the data, including user/depot/plan/date as appropriate. Expand logout cleanup to include new operational caches and persisted offline data with an explicit pending-work policy.

Every operational screen needs a useful empty state, visible validation, retryable errors, and a clear submission state. Do not equate an optimistic update or queued offline event with confirmed server success. Use semantic labels, keyboard focus, accessible status feedback, and buttons for actions. Provide click/select alternatives for drag-and-drop planning on phones and keyboards.

### Design consistency and responsive behavior

The submitted style guide specifies Google Sans Flex, restrained surfaces, rounded forms/cards, and pastel cargo accents. `style.css` currently names Google Sans Flex but there is **no bundled font or font download in `index.html`**. Add a permitted font asset/loading method before claiming exact typography; test with the font actually loaded.

Reuse current CSS tokens: primary `#111111`, surface `#f7f7f7`, border `#d9d9d9`, muted `#747474`, chilled `#cef1f5`, ambient `#cef2d2`, textile `#e8e2f6`, fragile `#f7f2e9`, warning `#ff3e45`. Cards use 20px radius; controls 16px; chips pill radii. UI styling and icon standardizations are maintained with Tailwind CSS v4 and `lucide-react` in [`ui-standards.md`](ui-standards.md). The screenshot palette and current tokens are not perfectly identical: compare against the final submitted style guide and make any correction centrally. Preserve its 8px spacing rhythm and 20/24px panel padding conventions.

Current viewport rules: mobile through 760px; tablet 761–1080px; compact desktop adjustments through 1100px; wider-screen adjustments from 1500px. Login tablet artwork hides marketing copy; desktop login fills the viewport width with fluid artwork and a bounded form. Avoid reintroducing a fixed outer-page width. Keep readable text widths within fluid containers.

Validate operational pages at phone widths 360/390px, tablet 834px portrait and 1024px landscape, and desktop 1440/1920/2560px. Also check the 760/761 and 1080/1081 transitions. The official brief says **both loader and driver are judged on phone-sized screens**, even though loader designs emphasize tablets. Use at least 44px general touch targets and the design's 56px loader controls, safe-area padding, and no accidental horizontal overflow. Provide phone-friendly alternatives to wide tables.

### Authentication and resource authorization

Keep the existing `waypoint_session` HttpOnly cookie, server session validation, origin protection, and logout revocation. Do not move JWTs into local storage. UI route guards help navigation; they do not authorize access.

Each new endpoint must enforce both role and resource scope in server queries/services: managers only their outlet, warehouse users only their depot, and drivers only assigned trips. Never trust `outletId`, depot, driver assignment, plan status, or a client-calculated feasibility flag from an unvalidated payload. Use the current authentication helpers and add adversarial cross-role/cross-resource tests.

### Data, transactions, migrations, and API documentation

Store operating dates explicitly and use Asia/Colombo for cutoff/calendar rules. Store event timestamps as timezone-aware UTC instants and render them in the business timezone. Test the exact 16:00 cutoff: orders received after it go to the following eligible run, not silently into a closed plan. Do not use a developer laptop timezone for scheduling.

Keep source order identity with scenario/date; an outlet can have more than one order, including separate ambient/chilled orders. Key trips by dated plan + vehicle + trip number. Preserve original requested quantities, planned quantities, loaded quantities, delivered quantities, and received quantities as separate facts. Do not overwrite discrepancies or dispatcher reasons.

Use foreign keys, unique constraints, and transactions for linked changes. Plan release must revalidate the complete plan atomically; two concurrent requests must not allocate the same order or vehicle capacity twice. Use version checks or appropriate locking. Use idempotency keys for retryable events, especially offline delivery records, and make duplicate requests return the original result rather than creating duplicates.

When changing the schema:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Review generated SQL and commit it with Drizzle metadata, schema, service changes, and updated docs. Do not edit already-applied migrations. Coordinate shared schema changes before generating migrations on parallel branches. Seeds should be repeatable and must not reset completed operational work on ordinary startup; implement any demo reset as a separate explicit operation.

Every endpoint uses `/api/v1`, shared request/response schemas, Swagger tags/summary/security, and appropriate response status/error schemas. Preserve the `{ code, message, requestId }` error shape. Do not attach JSON `Content-Type` to empty requests; existing logout returns 204 without a body. Verify Swagger calls in the same cookie session and never expose password hashes/internal session values in responses.

## 6. Four-person team process

The following ownership split is recommended for the remaining sprint. Assign actual names in the task board before starting. Each owner delivers frontend, backend, and checks for their slice. Teammates may provide feedback; the team lead reviews and merges all pull requests.

| Owner                        | Primary work                                                                                                        | Coordination                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A: integration/planning lead | Shared contracts/schema coordination, allocation validator, dispatcher planning/release, integration and deployment | Reviews business constraints and migrations                          |
| B: store/orders              | Order submission and cutoff, order API, store tracking, receipt/discrepancy flow                                    | Agrees order and receipt contracts with A and D                      |
| C: loading                   | Staging views, reverse packing checklist, shortfall reporting, ready-to-dispatch transition                         | Consumes released trips; agrees manifest with A and D                |
| D: driver/offline            | Assigned manifest, stop events, proof of delivery, persistent offline outbox/reconciliation                         | Agrees event/idempotency contracts with A and receipt linkage with B |

Orders/contracts and dated operational schema are prerequisites for planning and the other roles. Agree the minimal shared interfaces first, then let UI owners develop against typed fixtures while real APIs arrive. Fixtures must be isolated to development/testing and replaced in the judge workflow. Do not make four incompatible versions of a trip.

`main` contains the scaffolding baseline. `dev`, created from `main`, is the shared integration branch for all ongoing development. Create short-lived branches from the latest `dev` and include your initials or unique developer identifier, for example `feat/loading-feature-hd`. Follow the complete [Git branching strategy](#10-git-branching-strategy) at the end of this guide. A contributor can start with:

```sh
git status
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/loading-feature-hd
```

Start from an up-to-date `dev` checkout and preserve local work before switching/pulling. Use small pull requests for one coherent feature, targeting **only `dev`**. Include the problem, implemented behavior, linked task, screenshots for UI, migration/config impact, and verification evidence. The team lead reviews and merges after required checks pass and comments are resolved. Developers must not push directly to `dev`, open PRs against `main`, merge their own PRs, or modify `main`.

The team lead chooses the merge method; squash merging is recommended for a coherent feature history. Keep commits descriptive, for example `feat(planning): enforce daily vehicle time budgets`. Assign ownership of `schema.ts`, shared contracts, `App.tsx`, and `style.css` edits in the task board; these are likely merge-conflict hotspots. Move feature logic into its own module instead of repeatedly expanding `App.tsx`.

At the start of each day, agree today's integrated milestone and dependencies, and synchronize your feature branch with the latest `origin/dev`. Before ending, leave a reviewable PR for the team lead with status, checks, remaining risks, and the exact next task. Keep `dev` demonstrable daily, not just on submission night.

### Repeatable implementation sequence

1. Read the related official rule and submitted screen; define a concrete acceptance scenario.
2. Agree public contracts, authorization scope, states/transitions, and migration ownership with affected teammates.
3. Implement domain/service logic and persistence, then thin documented routes.
4. Implement controller/query hooks and reusable presentational UI, including responsive and failure states.
5. Test meaningful behavior: domain boundaries, unauthorized access, invalid transitions, retries, and the cross-role handoff.
6. Run quality checks, inspect Swagger and UI, update relevant docs, and open the PR.
7. Reviewer follows the acceptance scenario. Merge and run the integrated walkthrough before starting dependent work.

## 7. Development plan through submission

This is the execution plan for the remaining days, based on the earlier master plan and corrected implementation. It is a target schedule, not evidence of completion. If behind schedule, reduce optional polish/automation while preserving validated allocation, four-role continuity, and offline recovery.

### Stage 1 — foundation: implemented

Scaffolding, tooling, reference seed, authentication, scoped overview, Swagger, responsive common login and foundation UI are present. New contributors should complete setup and verify this baseline before branching. Remaining foundation follow-ups are accurate font loading, portable source/design references, and documentation maintenance.

### Stage 2 — orders and feasible planning: October 1

Owners A and B lead; C and D agree contracts and begin their views against typed fixtures.

- Add operating dates/calendar, order records, dated plans/trips/stop sequence/driver assignments, fleet availability, handling/travel reference data, and audit/deferral records through reviewed migrations.
- Extend repeatable seed with one realistic delivery day and constrained demand. Keep 120 outlets and 60 vehicles, but use scenario-day availability rather than assuming all vehicles are usable.
- Implement store order confirmation and 16:00 cutoff routing, dispatcher intake filters, priority indicators, validated assignment, capacity/time indicators, and explicit deferral reasons/next run.
- Support assisted or manual allocation with server validation first. Automatic optimization is optional. The official brief permits all three approaches.
- Release a versioned plan only when every order has a decision, served assignments are feasible, and deferred orders have an explanation. Released plans become the loader's source of truth.

Completion gate: a store submission appears in dispatch; valid orders can be assigned and persisted; invalid depot/temperature/access/capacity/time assignments fail clearly; two individually valid Fresh trips whose combined duration exceeds 270 minutes are rejected; a capacity-shortage day includes explained deferrals; the released manifest reloads correctly.

### Allocation rules and their limits

| Rule/source                     | Required implementation                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Task 2B rule 1                  | One brand and district per trip                                                                                  |
| Rule 2                          | Chilled requires reefer; reefers may carry ambient                                                               |
| Rule 3                          | `van_only` requires a van                                                                                        |
| Rule 4                          | Vehicle home depot matches served outlet depot                                                                   |
| Rule 5                          | Whole orders; one vehicle/trip per served order; no duplicate assignments                                        |
| Rule 6                          | Both summed weight and volume fit each trip                                                                      |
| Rule 7                          | At most two trips per vehicle/day; summed Fresh duration <=270 minutes, summed Style+Tech duration <=480 minutes |
| Scenario fleet                  | Only vehicles available on that scenario day; reject workshop vehicles                                           |
| Hackathon operating constraints | Validate outlet and mall windows, eligible operating days, and weekly fuel quota separately                      |

For checker-compatible planning, use `outbound + (number of orders - 1) × inter-stop + sum(brand/dock handling allowances)`. Do not add return travel to this published Task 2B formula; its budgets already account for it. Count orders as the checker does, even when an outlet repeats. Reject missing lookup data rather than inventing a 15-minute default. Keep calculations at full precision and apply consistent boundary tolerance (checker: `1e-6`).

Example regression: two Fresh trips of 150 minutes each must fail the daily 270-minute budget. One Fresh trip of 200 minutes plus one Style trip of 300 minutes fits the two separate time pools, subject to all other rules.

The supplied `check_allocation.py` validates Task 2B assignment/time rules; it **does not validate actual outlet arrival windows, fuel quotas, cutoff rules, or UI workflow**. Passing it is useful evidence, not full Hackathon acceptance. Document route-distance/fuel accounting, service waiting, weekly quota period, and sequence-based arrival calculation; validate these independently. Keep planned ETA deterministic and distinguish it from later trained predictions.

When an allocation export exists and authorized source files are available, run from the original competition workspace (Python with pandas required):

```sh
python3 check_allocation.py <allocation-export.csv>
```

The checker locates its sibling `data/` directory. It is not shipped in this repository. Preserve source scenario/order identifiers and use lowercase `served`/`deferred`; deferred rows should have blank vehicle/trip fields.

### Stage 3 — loading, delivery, receipt, and offline: October 2

Owners C and D lead field workflows; B completes receipt/tracking; A integrates and starts deployment preparation.

- Loader: released-trip staging; packing order reversed from delivery sequence (stop 3 first/deep front, stop 1 last/rear doors); quantity checks; persisted missing/damaged goods; readiness and dispatch gates; dispatch sees exceptions before departure.
- Driver: only assigned trips, manifest and sequential stop detail, access/windows, arrival and completion events, receiver identity/signature/photo proof as specified by the submitted design, timestamps and discrepancy recording.
- Store: inbound status and planned ETA, visible deferral reason, quantities received and issues; connect receipt to the actual delivery record rather than merely duplicating driver completion.
- Dispatcher: progress and exception feed derived from the same persisted records. Start with scoped query refresh/polling where suitable; live sockets are not a prerequisite for connected status.
- Offline: cache the app shell and assigned manifest; persist events and proof attachments in IndexedDB; show connectivity, queued count, and last successful sync. Introduce a service worker/PWA dependency deliberately; neither it nor a durable outbox is implemented yet.
- Recovery: stable event UUID/idempotency key, plan version, local occurrence time, server received time, retry/backoff, acknowledged-event cleanup, visible conflicts. Auth expiry must preserve pending work for the same user without exposing it to another login.

Do not rely on an in-memory TanStack Query mutation queue alone: it does not establish survival across reloads. Define what happens on logout with queued work; avoid silently discarding delivery evidence. Do not call local timestamps tamper-proof or IndexedDB encrypted without actually implementing and verifying those guarantees. Record such departures from the design claims.

Completion gate: load in reverse order, flag a shortfall, dispatch, complete a delivery offline, reload while still offline, reconnect without duplicate events, and confirm receipt from the store. A changed plan or expired session during offline work must produce a recoverable visible state. Loader and driver must remain usable on phones.

### Stage 4 — integrated verification and deployment: October 3

- Merge the complete workflow and run it across all accounts on clean seeded data. Include shortage/deferral, loader shortfall, rejected allocation, offline reload, retry, and receipt discrepancy cases.
- Add domain boundary tests and scoped route integration tests. Check simultaneous release/assignment and duplicate delivery submissions.
- Build and start the full stack in a separate disposable environment. Verify migrations/seed need no manual intervention, assets execute, deep links work, and `/api` failures do not serve HTML.
- Deploy frontend and API behind one HTTPS origin using the existing Fastify static-serving model unless a reviewed architecture decision changes it. A split-origin deployment requires deliberate cookie/CORS/CSRF changes; do not assume the current same-origin client will work unchanged.
- Supply production environment values and persistent storage; inspect the Compose development-mode override before using it for public deployment. Test secure cookies and production origin checks.
- Provide persistent proof attachment storage if photos are part of the shipped flow. Ephemeral container files are insufficient. Verify demo credentials and all four roles on the actual deployed URL.
- Document a release/rollback procedure and avoid public API exposure of reference data beyond intended role access.

Completion gate: a fresh setup and the deployed URL both complete the same walkthrough, quality checks pass, resource isolation holds, and deployment stays healthy after restart.

### Stage 5 — submission and handover: October 4

- Freeze feature scope early enough for a final complete rehearsal. Reserve time for fixes, video upload, and submission; do not leave the first deployment to this day.
- Replace the foundation judge walkthrough with exact operational steps and seeded IDs. List actual design departures and implemented limitations honestly.
- Update architecture diagram, operational ERD, setup/configuration, deployment URL/accounts, and AI disclosure with each contributor's actual use and verification.
- Record an unlisted five-to-eight-minute video: all four roles, allocation rejection/deferral, offline recovery, then code architecture and engineering standards.
- Confirm the repository naming requirement, permitted sharing arrangement, public URL, credentials, docs, video visibility/runtime, and submission form fields.
- Tag the tested submission commit and push required code before **11:59 PM Asia/Colombo**. Keep deployment available through review. Retain a handover note for unfinished Datathon work.

Datathon submissions are due October 9 at 11:59 PM Asia/Colombo and are judged separately. After the Hackathon freeze, plan service-time/lateness prediction and demand forecasting work without destabilizing the demonstrated operational system.

## 8. Quality gates and definition of done

For normal feature work:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Or the combined equivalent:
pnpm verify
```

For authentication, authorization, persistence, or cross-role changes, also run database-backed checks after migrations and a client build:

```sh
pnpm dev:setup
pnpm build
pnpm test:integration
```

Current CI runs `pnpm verify`, which **does not include integration tests** and does not start PostgreSQL. The current `test:integration` script targets only `test/auth.integration.test.ts`; broaden it when adding operational integration tests and add a database CI job. Do not assume a new `*.integration.test.ts` file will be picked up automatically. Unit tests deliberately exclude those files. The auth integration suite seeds accounts, opens sessions, and tests built client assets, so use a local/test database and build first.

A feature is done only when:

- Its acceptance scenario works against the real API and survives reload.
- Its role/resource scope and invalid transitions are checked server-side.
- Schema migrations, contracts, Swagger, and docs match the implementation.
- Loading, empty, error, retry, pending, and confirmed states are honest and usable.
- It follows the submitted style and works at the role's judged viewport sizes.
- Relevant tests and required quality checks pass, the team lead reviews and merges the PR into `dev`, and its cross-role handoff works after merge.

Prioritize tests for allocation invariants, cutoff/date handling, access isolation, transactions, idempotency, and offline recovery. UI screenshots/manual responsive checks suit visual refinements; avoid tests that merely repeat component implementation. Do not skip business failure cases to make the build green.

## 9. Handover protocol for a person or agent

Before editing: read this guide and the relevant requirements/design; inspect `git status`, recent commits, and open work. Confirm which stages are actually done, pick one scoped acceptance scenario, and coordinate changes to shared files. Preserve another contributor's uncommitted work.

During work: follow existing contracts, modules, cookie authentication, style tokens, and commands. Keep a visible task/PR record of decisions, especially deviations from the design. Do not change the stack or claim a scaffolded route is implemented functionality.

At handoff, record:

```text
Task and acceptance scenario:
Branch / PR / commit:
Implemented behavior and relevant files:
Schema / contract / configuration changes:
Checks actually run and results:
Manual or deployed verification:
Known gaps and dependencies:
Exact next step and owner:
```

Never mark unrun checks as passing. When blocked by missing design/data access or a business decision, describe the exact dependency and continue independent work. Keep this guide's status table, README walkthrough, architecture/data model, and AI disclosure current so the next contributor can start from evidence.

## 10. Git branching strategy

This strategy applies to every team member and coding agent working on the repository.

### Branch roles and ownership

| Branch           | Purpose                                             | Allowed workflow                                                                                     |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `main`           | Scaffolding baseline                                | Do not modify, push to, or target with development PRs                                               |
| `dev`            | Shared development integration; created from `main` | Receives feature/fix PRs reviewed and merged by the team lead                                        |
| Developer branch | One scoped feature, fix, or documentation task      | Start from latest `dev`, keep synchronized with `origin/dev`, push work here, and open a PR to `dev` |

All development follows `latest dev → developer branch → PR to dev → team-lead review and merge`. There is no developer PR path to `main`. Any future release change involving `main` is a separate team-lead decision, outside this development workflow.

### Branch naming

Use `<type>/<short-task-description>-<developer-id>` in lowercase with hyphens. The identifier can be your initials or another unique, consistent team identifier. If initials overlap, agree distinct identifiers before creating branches.

Examples:

- `feat/loading-feature-hd`
- `feat/order-cutoff-ab`
- `fix/driver-sync-conflict-cd`
- `docs/team-handover-hd`
- `refactor/planning-service-ef`

Use one branch per coherent task. Replace the example identifier with your own; do not reuse another developer's branch name or work on their branch without coordination.

### Start work from the latest dev

First inspect `git status`. Commit your existing work on its own branch or stash it deliberately before changing branches. Do not discard files to make the working tree clean.

```sh
git status
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/loading-feature-hd
```

If your clone has no local `dev` branch yet, use `git switch --track origin/dev` in place of `git switch dev`. If the fast-forward pull fails, inspect the divergence and coordinate with the team lead; do not force-reset `dev` or push local divergence into it.

### Keep your branch current throughout development

Fetch and merge the latest remote `dev` at the start of each work session, after relevant dependency PRs merge, before opening/updating a PR, and whenever the team lead requests an update. Run these commands while on your developer branch with your work committed or deliberately stashed:

```sh
git status
git branch --show-current
git fetch origin
git merge origin/dev
```

Merging `origin/dev` into your feature branch keeps shared commits intact and does not require a force push. Resolve conflicts carefully with the affected owner, stage only the intended resolutions, and complete the merge. If you need to stop an unresolved merge, use `git merge --abort`; do not erase your work. Reapply any deliberately stashed changes and resolve them before proceeding.

After synchronization, rerun `pnpm verify` and relevant integration/manual checks. Schema, lockfile, contracts, and UI conflicts require checking behavior as well as removing conflict markers. If `dev` advances again during review, synchronize and rerun affected checks before the lead merges.

### Push and open a PR only to dev

Review the diff, stage your task's files explicitly, and commit them on your developer branch. For its first push:

```sh
git push -u origin feat/loading-feature-hd
```

For later commits on the same tracked branch, use `git push`. In GitHub, select **base: `dev`** and **compare: your developer branch**. Double-check the base before submitting; the repository default may still be `main`.

Include the task and acceptance scenario, implemented behavior, screenshots where relevant, migration/configuration changes, checks actually run, and any remaining limitations. Request review from the team lead. Address review feedback on the same branch, keep it current with `origin/dev`, and push updates. Teammate feedback is welcome, but approval and merging belong to the team lead.

Do not self-merge, push directly to `dev` or `main`, force-push shared branches, or change the PR base to `main`. If a PR accidentally targets `main`, correct its base to `dev` before review.

### After the team lead merges

Fetch the merged result, update local `dev`, and start the next task on a new branch from that updated baseline:

```sh
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feat/next-task-hd
```

Confirm the merged behavior works with the other roles. Do not continue new work on an already-merged branch. Keep the PR/commit link in your handover note so another person or agent can find the reviewed implementation.
