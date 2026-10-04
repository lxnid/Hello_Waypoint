import { Type, type Static, type TSchema } from '@sinclair/typebox';
import type { FastifyPluginAsync, HTTPMethods } from 'fastify';
import { ErrorSchema, type Role } from '@waypoint/contracts';
import { CreateOrderSchema } from '@waypoint/contracts/operations';
import * as C from '@waypoint/contracts/workflows';
import { sql } from 'drizzle-orm';
import { createOrderDraft, submitOrder, authorizeDeparture, WorkflowError } from './service.js';
import { replaceDraft, deleteDraft } from './orders.js';
import {
  catalog,
  listOrders,
  listTrips,
  listIssues,
  orderDetail,
  tripDetail,
  planningRead,
  auditHistory,
} from './reads.js';
import {
  createContext,
  createPlan,
  replacePlan,
  generatePlan,
  setAvailability,
  tripCandidates,
  editTripOrder,
} from './planning-commands.js';
import { releasePlan } from './planning.js';
import {
  completeDelivery,
  recordArrival,
  recordLoad,
  completeLoading,
  startLoading,
  confirmReceipt,
} from './execution.js';
import { inspectTrip, returnTrip } from './lifecycle.js';
import { fileIssue, resolveIssue } from './claims.js';
import { uploadProof, downloadProof, verifyDeliveryProof } from './proof.js';
import { replay } from './replay.js';
import { importHistory, importPeakScenario, exportAllocation } from './imports.js';

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  const empty = Type.Object({}, { additionalProperties: false });
  const ok = Type.Object({ ok: Type.Literal(true) });
  function command<T extends TSchema>(
    method: HTTPMethods,
    path: string,
    role: Role,
    summary: string,
    input: T,
    response: TSchema,
    apply: (actorId: string, id: string, body: Static<T>) => Promise<unknown>,
    description?: string,
  ) {
    app.route<{ Params: { id: string }; Body: Static<T> }>({
      method,
      url: path,
      preHandler: [app.requireAuth, app.allowRole(role)],
      schema: {
        tags: [role, 'Operations'],
        summary,
        ...(description ? { description } : {}),
        security: [{ cookieAuth: [] }],
        ...(path.includes(':id') ? { params: C.IdParamsSchema } : {}),
        body: input,
        response: {
          200: response,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
      handler: (r) => apply(r.identity!.user.id, r.params.id, r.body),
    });
  }
  function read(
    path: string,
    summary: string,
    response: TSchema,
    apply: (
      actorId: string,
      id: string,
      query: Static<typeof C.PageQuerySchema>,
    ) => Promise<unknown>,
    role?: Role,
    description?: string,
  ) {
    app.get<{ Params: { id: string }; Querystring: Static<typeof C.PageQuerySchema> }>(
      path,
      {
        preHandler: role ? [app.requireAuth, app.allowRole(role)] : [app.requireAuth],
        schema: {
          tags: role ? [role, 'Operations'] : ['Operations'],
          summary,
          ...(description ? { description } : {}),
          security: [{ cookieAuth: [] }],
          ...(path.includes(':id') ? { params: C.IdParamsSchema } : {}),
          querystring: path === '/orders' ? C.OrderQuerySchema : C.PageQuerySchema,
          response: {
            200: response,
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
          },
        },
      },
      (r) => apply(r.identity!.user.id, r.params.id, r.query),
    );
  }
  app.post<{ Body: Static<typeof C.PeakScenarioImportSchema> }>('/imports/peak-scenario', {
    bodyLimit: 12 * 1024 * 1024,
    preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
    schema: {
      tags: ['DISPATCHER', 'Operations'],
      summary: 'Import versioned allocation scenario CSVs',
      description:
        'Imports the order scenario and vehicle availability CSV into an isolated, checksummed planning batch.',
      security: [{ cookieAuth: [] }],
      body: C.PeakScenarioImportSchema,
      response: {
        200: C.ImportResultSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        409: ErrorSchema,
      },
    },
    handler: (r) => importPeakScenario(app.db, r.body),
  });
  app.post<{ Body: Static<typeof C.HistoryImportSchema> }>('/imports/history', {
    bodyLimit: 16 * 1024 * 1024,
    preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
    schema: {
      tags: ['DISPATCHER', 'Operations'],
      summary: 'Import route and stop observations',
      description:
        'Validates exact delivery-to-route-leg joins and stores historical facts separately from executable plans.',
      security: [{ cookieAuth: [] }],
      body: C.HistoryImportSchema,
      response: {
        200: C.ImportResultSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        409: ErrorSchema,
      },
    },
    handler: (r) => importHistory(app.db, r.body),
  });
  app.get<{ Params: { id: string } }>(
    '/planning/contexts/:id/allocation.csv',
    {
      preHandler: [app.requireAuth, app.allowRole('DISPATCHER')],
      schema: {
        tags: ['DISPATCHER', 'Operations'],
        summary: 'Export released allocation in source order',
        description:
          'Exports the competition allocation columns after every source order has a released decision.',
        security: [{ cookieAuth: [] }],
        params: C.IdParamsSchema,
        response: {
          200: Type.String(),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (r, reply) =>
      reply
        .header('Content-Disposition', 'attachment; filename="allocation.csv"')
        .type('text/csv; charset=utf-8')
        .send(await exportAllocation(app.db, r.params.id)),
  );
  read(
    '/audit',
    'List audit trail of material transitions',
    C.PageResponse(
      Type.Object({
        id: Type.String({ format: 'uuid' }),
        actor_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
        action: Type.String(),
        entity_type: Type.String(),
        entity_id: Type.String(),
        details: Type.Record(Type.String(), Type.Unknown()),
        created_at: Type.String({ format: 'date-time' }),
      }),
    ),
    (a, _id, q) => auditHistory(app.db, a, q),
    'DISPATCHER',
    'Paginated log of operational mutations and state transitions across all entities',
  );
  read(
    '/planning/contexts/:id/plans',
    'List plans for a planning context',
    Type.Array(C.PlanRowSchema),
    async (_a, id) => [
      ...(await app.db.execute(sql`SELECT * FROM plans WHERE context_id=${id} ORDER BY depot_id`)),
    ],
    'DISPATCHER',
    'Returns depot plans associated with the specified planning context',
  );
  read(
    '/catalog',
    'List active replenishment catalog',
    Type.Array(C.CatalogRowSchema),
    (a) => catalog(app.db, a),
    'STORE_MANAGER',
    'Active products available for order placement by brand and temperature requirement',
  );
  read(
    '/orders',
    'List orders',
    C.OrdersResponseSchema,
    (a, _id, q) => listOrders(app.db, a, q),
    undefined,
    'Paginated order list scoped to caller role, depot, or outlet',
  );
  read(
    '/orders/:id',
    'Get order details',
    C.OrderDetailSchema,
    (a, id) => orderDetail(app.db, a, id),
    undefined,
    'Detailed order view with itemized lines or aggregate totals',
  );
  command(
    'POST',
    '/orders',
    'STORE_MANAGER',
    'Create draft replenishment order',
    CreateOrderSchema,
    C.OrderCommandResultSchema,
    (a, _id, b) => createOrderDraft(app.db, a, b),
    'Initializes an order draft before the 16:00 Asia/Colombo cutoff',
  );
  command(
    'PUT',
    '/orders/:id',
    'STORE_MANAGER',
    'Update draft order contents',
    CreateOrderSchema,
    C.OrderCommandResultSchema,
    (a, id, b) => replaceDraft(app.db, a, id, b),
    'Replaces draft lines and quantities prior to submission',
  );
  command(
    'DELETE',
    '/orders/:id',
    'STORE_MANAGER',
    'Delete draft order',
    empty,
    Type.Object({ deleted: Type.Boolean() }),
    (a, id) => deleteDraft(app.db, a, id),
    'Deletes an unsubmitted draft order',
  );
  command(
    'POST',
    '/orders/:id/submit',
    'STORE_MANAGER',
    'Submit order',
    empty,
    C.OrderCommandResultSchema,
    (a, id) => submitOrder(app.db, id, a),
    'Freezes order contents and locks quantities for dispatcher allocation',
  );
  command(
    'POST',
    '/planning/contexts',
    'DISPATCHER',
    'Create or retrieve planning context',
    C.ContextInputSchema,
    C.ContextCommandResultSchema,
    (a, _id, b) => createContext(app.db, a, b.operatingDate),
    'Initializes a live date or scenario planning context',
  );
  read(
    '/planning/contexts',
    'List planning contexts',
    Type.Array(C.ContextRowSchema),
    async () => [
      ...(await app.db.execute(
        sql`SELECT * FROM planning_contexts ORDER BY operating_date DESC LIMIT 100`,
      )),
    ],
    'DISPATCHER',
    'Returns recent live and simulation planning contexts',
  );
  read(
    '/planning/contexts/:id/fleet',
    'List vehicle availability',
    Type.Array(C.VehicleRowSchema),
    async (_a, id) => [
      ...(await app.db.execute(
        sql`SELECT v.*,av.status FROM vehicles v JOIN vehicle_availability av ON av.vehicle_id=v.id WHERE av.context_id=${id} ORDER BY v.id`,
      )),
    ],
    'DISPATCHER',
    'Returns vehicle status (available or workshop) for a planning context',
  );
  read(
    '/planning/contexts/:id/drivers',
    'List available drivers',
    Type.Array(
      Type.Object({
        id: Type.String({ format: 'uuid' }),
        name: Type.String(),
        depot_id: C.DepotSchema,
      }),
    ),
    async () => [
      ...(await app.db.execute(
        sql`SELECT id,display_name AS name,depot_id FROM users WHERE role='DRIVER' AND is_active ORDER BY depot_id,id`,
      )),
    ],
    'DISPATCHER',
    'Returns active drivers eligible for trip assignment',
  );
  command(
    'PUT',
    '/planning/contexts/:id/fleet',
    'DISPATCHER',
    'Set vehicle workshop availability',
    C.AvailabilitySchema,
    Type.Object({ contextId: Type.String(), vehicleId: Type.String(), status: Type.String() }),
    (a, id, b) => setAvailability(app.db, a, id, b.vehicleId, b.status),
    'Marks a vehicle as available or in_workshop for the context',
  );
  command(
    'POST',
    '/planning/plans',
    'DISPATCHER',
    'Create draft depot plan',
    C.PlanInputSchema,
    C.PlanCommandResultSchema,
    (a, _id, b) => createPlan(app.db, a, b.contextId, b.depot),
    'Initializes a draft operational delivery plan for a depot',
  );
  read(
    '/planning/plans/:id',
    'Get plan details',
    C.PlanDetailSchema,
    (a, id) => planningRead(app.db, a, id),
    'DISPATCHER',
    'Complete plan view with assigned trips, sequenced stops, and order deferrals',
  );
  command(
    'PUT',
    '/planning/plans/:id',
    'DISPATCHER',
    'Save plan modifications',
    C.PlanEditSchema,
    C.PlanEditResultSchema,
    (a, id, b) => replacePlan(app.db, a, id, b),
    'Updates trip assignments, stop sequences, and deferrals with optimistic locking',
  );
  command(
    'POST',
    '/planning/plans/:id/generate',
    'DISPATCHER',
    'Generate assisted plan allocation',
    C.GenerateSchema,
    C.PlanEditResultSchema,
    (a, id, b) => generatePlan(app.db, a, id, b.version),
    'Runs automated allocation engine adhering to Rules 1-7, capacity limits, and time budgets',
  );
  command(
    'POST',
    '/planning/plans/:id/stage',
    'DISPATCHER',
    'Stage selected orders or record explicit deferrals',
    C.StageOrdersSchema,
    C.PlanEditResultSchema,
    (a, id, b) =>
      generatePlan(app.db, a, id, b.version, {
        orderIds: b.orderIds,
        deferrals: b.deferrals,
        acknowledgeDeferral: b.acknowledgeDeferral,
      }),
    'Allocates selected staged orders under Rules 1-7 while preserving previous decisions; infeasible orders remain unassigned',
  );
  read(
    '/planning/trips/:id/candidates',
    'Check orders eligible for manual trip addition',
    C.TripCandidatesSchema,
    (a, id) => tripCandidates(app.db, a, id),
    'DISPATCHER',
  );
  command(
    'POST',
    '/planning/plans/:id/trip-orders',
    'DISPATCHER',
    'Add or remove an order from a draft trip',
    C.TripOrderEditSchema,
    C.PlanEditResultSchema,
    (a, id, b) => editTripOrder(app.db, a, id, b),
  );
  command(
    'POST',
    '/planning/plans/:id/release',
    'DISPATCHER',
    'Release operational plan',
    C.GenerateSchema,
    C.PlanCommandResultSchema,
    (a, id, b) => releasePlan(app.db, id, b.version, a),
    'Locks assignments, reserves weekly fuel quotas, and generates warehouse load manifests',
  );
  command(
    'POST',
    '/planning/plans/:id/validate',
    'DISPATCHER',
    'Validate plan feasibility',
    C.GenerateSchema,
    Type.Object({ valid: Type.Boolean(), message: Type.Optional(Type.String()) }),
    async (a, id, b) => {
      const rollback = new Error('VALIDATION_ROLLBACK');
      try {
        await app.db.transaction(async (tx) => {
          await releasePlan(tx, id, b.version, a);
          throw rollback;
        });
      } catch (error) {
        if (error === rollback) return { valid: true };
        if (error instanceof WorkflowError) return { valid: false, message: error.message };
        throw error;
      }
      return { valid: true };
    },
    'Dry-run validation of time budgets, vehicle capacities, and constraints without committing state',
  );
  read(
    '/trips',
    'List trips',
    C.PageResponse(C.TripRowSchema),
    (a, _id, q) => listTrips(app.db, a, q),
    undefined,
    'Paginated trip list filtered by caller role, depot, or driver assignment',
  );
  read(
    '/trips/:id',
    'Get trip details',
    C.TripDetailSchema,
    (a, id) => tripDetail(app.db, a, id),
    undefined,
    'Detailed trip manifest with assigned vehicle, driver, and stop progression',
  );
  command(
    'PUT',
    '/stops/:id/load',
    'LOADER',
    'Record loaded stop cargo',
    C.LoadInputSchema,
    Type.Object({ stopId: Type.String(), confirmed: Type.Boolean() }),
    (a, id, b) => app.db.transaction((tx) => recordLoad(tx, a, id, b)),
    'Records actual loaded quantities and dock damages for a stop',
  );
  command(
    'POST',
    '/trips/:id/start-load',
    'LOADER',
    'Start loading',
    empty,
    Type.Object({ tripId: Type.String(), status: Type.String() }),
    (a, id) => app.db.transaction((tx) => startLoading(tx, a, id)),
    'Marks the load manifest as in progress so dispatchers can see it is being loaded',
  );
  command(
    'POST',
    '/trips/:id/sign-load',
    'LOADER',
    'Sign loading manifest',
    empty,
    Type.Object({ tripId: Type.String(), status: Type.String() }),
    (a, id) => app.db.transaction((tx) => completeLoading(tx, a, id)),
    'Finalizes cargo loading and certifies LIFO sequence completion',
  );
  command(
    'PUT',
    '/trips/:id/inspection',
    'DRIVER',
    'Complete pre-trip inspection',
    C.InspectionInputSchema,
    Type.Object({ tripId: Type.String(), inspected: Type.Boolean() }),
    (a, id, b) => app.db.transaction((tx) => inspectTrip(tx, a, id, b)),
    'Logs starting odometer, fuel verification, and reefer hold temperature check',
  );
  command(
    'POST',
    '/trips/:id/depart',
    'DISPATCHER',
    'Authorize vehicle departure',
    empty,
    ok,
    async (a, id) => {
      await authorizeDeparture(app.db, id, a);
      return { ok: true };
    },
    'Authorizes wheels-up from warehouse dock after inspection and loading sign-off',
  );
  command(
    'POST',
    '/stops/:id/arrival',
    'DRIVER',
    'Log stop arrival',
    C.ArrivalInputSchema,
    Type.Object({ attemptId: Type.String() }),
    (a, id, b) => app.db.transaction((tx) => recordArrival(tx, a, id, new Date(b.capturedAt))),
    'Records driver arrival timestamp and GPS lock at delivery outlet',
  );
  command(
    'POST',
    '/attempts/:id/complete',
    'DRIVER',
    'Complete delivery stop',
    C.DeliveryInputSchema,
    Type.Object({ attemptId: Type.String(), outcome: Type.String() }),
    (a, id, b) =>
      app.db.transaction(async (tx) => {
        if (b.outcome !== 'FAILED' && !b.receiverName?.trim())
          throw new WorkflowError('Receiver name required', 400);
        await verifyDeliveryProof(tx, a, id, b.proofIds ?? [], b.outcome);
        return completeDelivery(tx, a, id, { ...b, completedAt: new Date(b.completedAt) });
      }),
    'Records delivered quantities, recipient identification, and attaches digital POD',
  );
  command(
    'POST',
    '/attempts/:id/receipt',
    'STORE_MANAGER',
    'Confirm goods receipt',
    C.ReceiptInputSchema,
    Type.Object({ attemptId: Type.String(), outcome: Type.String() }),
    (a, id, b) => app.db.transaction((tx) => confirmReceipt(tx, a, id, b)),
    'Store manager verifies delivered items, checks cold-chain temperature, and signs receipt',
  );
  command(
    'POST',
    '/trips/:id/return',
    'DRIVER',
    'Complete trip return to depot',
    C.ReturnInputSchema,
    Type.Object({ tripId: Type.String(), status: Type.String() }),
    (a, id, b) =>
      app.db.transaction((tx) =>
        returnTrip(tx, a, id, { ...b, returnedAt: new Date(b.returnedAt) }),
      ),
    'Logs final odometer reading, actual fuel consumed, and closes out trip',
  );
  read(
    '/issues',
    'List discrepancy issues',
    C.PageResponse(C.IssueRowSchema),
    (a, _id, q) => listIssues(app.db, a, q),
    undefined,
    'Returns logged shortfalls, damaged cargo records, and credit claims',
  );
  command(
    'POST',
    '/issues',
    'STORE_MANAGER',
    'File receipt discrepancy issue',
    C.IssueInputSchema,
    C.IssueCommandResultSchema,
    (a, _id, b) => app.db.transaction((tx) => fileIssue(tx, a, b)),
    'Store manager reports missing or damaged cargo post-delivery',
  );
  command(
    'POST',
    '/loading/issues',
    'LOADER',
    'File loading dock issue',
    C.IssueInputSchema,
    C.IssueCommandResultSchema,
    (a, _id, b) => app.db.transaction((tx) => fileIssue(tx, a, b)),
    'Loader reports broken packaging or dock shortages before departure',
  );
  command(
    'POST',
    '/delivery/issues',
    'DRIVER',
    'File curbside delivery issue',
    C.IssueInputSchema,
    C.IssueCommandResultSchema,
    (a, _id, b) => app.db.transaction((tx) => fileIssue(tx, a, b)),
    'Driver reports transit damage, store access obstruction, or customer rejection',
  );
  command(
    'POST',
    '/issues/:id/resolve',
    'DISPATCHER',
    'Resolve discrepancy issue',
    C.ResolveIssueSchema,
    C.IssueCommandResultSchema,
    (a, id, b) => app.db.transaction((tx) => resolveIssue(tx, a, id, b.resolution)),
    'Dispatcher reviews claim, authorizes resolution, and approves credit adjustment',
  );
  command(
    'POST',
    '/sync',
    'DRIVER',
    'Replay offline operation batch',
    C.ReplayBatchSchema,
    C.SyncResultSchema,
    (a, _id, b) => replay(app.db, a, b.commands),
    'Submits offline arrival and delivery commands with cryptographic hash idempotency',
  );
  app.addContentTypeParser(
    ['image/png', 'image/jpeg'],
    { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 },
    (_r, body, done) => done(null, body),
  );
  app.put<{
    Params: { id: string };
    Querystring: Static<typeof C.AttachmentQuerySchema>;
    Body: Buffer;
  }>(
    '/proof/:id',
    {
      bodyLimit: 5 * 1024 * 1024,
      preHandler: [app.requireAuth],
      schema: {
        tags: ['DRIVER', 'STORE_MANAGER', 'Operations'],
        summary: 'Upload proof attachment',
        description: 'Uploads digital signature or photo proof binary with sha256 checksum',
        security: [{ cookieAuth: [] }],
        params: C.IdParamsSchema,
        querystring: C.AttachmentQuerySchema,
        response: {
          200: Type.Object({
            id: Type.String(),
            checksum: Type.String(),
            byteSize: Type.Integer(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    (r) =>
      uploadProof(
        app.db,
        r.identity!.user.id,
        r.params.id,
        r.query,
        r.body,
        r.headers['content-type']?.split(';')[0] ?? '',
      ),
  );
  app.get<{ Params: { id: string } }>(
    '/proof/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['DRIVER', 'STORE_MANAGER', 'DISPATCHER', 'Operations'],
        summary: 'Download proof attachment',
        description: 'Retrieves private digital signature or photographic delivery record',
        security: [{ cookieAuth: [] }],
        params: C.IdParamsSchema,
      },
    },
    async (r, reply) => {
      const proof = await downloadProof(app.db, r.identity!.user.id, r.params.id);
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', 'attachment')
        .type(proof.mime)
        .send(proof.bytes);
    },
  );
};
