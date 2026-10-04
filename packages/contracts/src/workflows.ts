import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { DecimalSchema, DeliveryOutcomeSchema } from './operations.js';
const uuid = () => Type.String({ format: 'uuid' });
const date = () => Type.String({ format: 'date' });
const instant = () => Type.String({ format: 'date-time' });
const quantity = () => Type.Integer({ minimum: 0 });
const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
export const IdParamsSchema = object({ id: uuid() });
export const DepotSchema = Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')]);
export const PageQuerySchema = object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  cursor: Type.Optional(Type.String({ maxLength: 200 })),
  depot: Type.Optional(DepotSchema),
});
export const OrderQuerySchema = object({
  ...PageQuerySchema.properties,
  q: Type.Optional(Type.String({ maxLength: 120 })),
  brand: Type.Optional(Type.String({ maxLength: 100 })),
  district: Type.Optional(Type.String({ maxLength: 100 })),
  temperature: Type.Optional(Type.Union([Type.Literal('ambient'), Type.Literal('chilled')])),
  status: Type.Optional(
    Type.Union(
      ['DRAFT', 'SUBMITTED', 'COMPLETED', 'CLOSED_EXCEPTION', 'CANCELLED'].map((value) =>
        Type.Literal(value),
      ),
    ),
  ),
  deferred: Type.Optional(Type.Boolean()),
});
export const ContextInputSchema = object({ operatingDate: date() });
export const PlanInputSchema = object({ contextId: uuid(), depot: DepotSchema });
export const DeferInputSchema = object({
  orderId: uuid(),
  reasonCode: Type.String({ minLength: 1, maxLength: 100 }),
  rationale: Type.String({ minLength: 1, maxLength: 2000 }),
  nextEligibleDate: date(),
});
export const TripInputSchema = object({
  vehicleId: Type.String({ minLength: 1 }),
  driverId: uuid(),
  orderIds: Type.Array(uuid(), { minItems: 1, uniqueItems: true }),
});
export const PlanEditSchema = object({
  version: Type.Integer({ minimum: 1 }),
  trips: Type.Array(TripInputSchema),
  deferrals: Type.Array(DeferInputSchema),
});
export const GenerateSchema = object({ version: Type.Integer({ minimum: 1 }) });
export const StageOrdersSchema = object({
  version: Type.Integer({ minimum: 1 }),
  orderIds: Type.Array(uuid(), { uniqueItems: true }),
  deferrals: Type.Array(DeferInputSchema),
  acknowledgeDeferral: Type.Optional(Type.Boolean()),
});
export const TripOrderEditSchema = object({
  version: Type.Integer({ minimum: 1 }),
  tripId: uuid(),
  orderId: uuid(),
  action: Type.Union([Type.Literal('ADD'), Type.Literal('REMOVE')]),
});
export const TripCandidatesSchema = object({
  version: Type.Integer({ minimum: 1 }),
  items: Type.Array(
    object({
      orderId: uuid(),
      valid: Type.Boolean(),
      reason: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
});
const temperature = Type.Optional(Type.String({ pattern: '^-?\\d+(\\.\\d{1,2})?$' }));
export const LoadInputSchema = object({
  lines: Type.Optional(
    Type.Array(
      object({ orderLineId: uuid(), loadedQuantity: quantity(), damagedQuantity: quantity() }),
    ),
  ),
  aggregate: Type.Optional(
    object({ units: quantity(), weightKg: DecimalSchema, volumeM3: DecimalSchema }),
  ),
  temperatureC: temperature,
});
export const InspectionInputSchema = object({
  startingOdometerKm: DecimalSchema,
  fuelChecked: Type.Boolean(),
  chillerChecked: Type.Boolean(),
  temperatureC: temperature,
});
export const ReturnInputSchema = object({
  returnedAt: instant(),
  endingOdometerKm: DecimalSchema,
  actualFuelL: DecimalSchema,
});
export const ArrivalInputSchema = object({ capturedAt: instant() });
export const DeliveryInputSchema = object({
  outcome: DeliveryOutcomeSchema,
  completedAt: instant(),
  receiverName: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  temperatureC: temperature,
  deliveredUnits: Type.Optional(quantity()),
  deliveredWeightKg: Type.Optional(DecimalSchema),
  deliveredVolumeM3: Type.Optional(DecimalSchema),
  lines: Type.Optional(
    Type.Array(
      object({ orderLineId: uuid(), deliveredQuantity: quantity(), rejectedQuantity: quantity() }),
    ),
  ),
  proofIds: Type.Optional(Type.Array(uuid(), { uniqueItems: true, maxItems: 10 })),
});
export const ReceiptInputSchema = object({
  outcome: DeliveryOutcomeSchema,
  temperatureC: temperature,
  aggregate: Type.Optional(
    object({
      acceptedUnits: quantity(),
      missingUnits: quantity(),
      damagedUnits: quantity(),
      rejectedUnits: quantity(),
    }),
  ),
  lines: Type.Optional(
    Type.Array(
      object({
        orderLineId: uuid(),
        acceptedQuantity: quantity(),
        missingQuantity: quantity(),
        damagedQuantity: quantity(),
        rejectedQuantity: quantity(),
      }),
    ),
  ),
});
export const IssueInputSchema = object({
  stopId: uuid(),
  stage: Type.Union([Type.Literal('LOADING'), Type.Literal('DELIVERY'), Type.Literal('RECEIPT')]),
  type: Type.Union([
    Type.Literal('MISSING'),
    Type.Literal('DAMAGED'),
    Type.Literal('TEMPERATURE'),
    Type.Literal('REJECTED'),
  ]),
  affectedQuantity: Type.Integer({ minimum: 1 }),
  orderLineId: Type.Optional(uuid()),
  attemptId: Type.Optional(uuid()),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
});
export const ResolveIssueSchema = object({
  resolution: Type.String({ minLength: 1, maxLength: 2000 }),
});
const envelope = {
  clientOperationId: uuid(),
  capturedAt: instant(),
  planId: uuid(),
  planVersion: Type.Integer({ minimum: 1 }),
};
export const ReplayCommandSchema = Type.Union([
  object({ ...envelope, action: Type.Literal('ARRIVAL'), stopId: uuid() }),
  object({
    ...envelope,
    action: Type.Literal('DELIVERY'),
    attemptId: uuid(),
    payload: DeliveryInputSchema,
  }),
]);
export const ReplayBatchSchema = object({
  commands: Type.Array(ReplayCommandSchema, { minItems: 1, maxItems: 50 }),
});
export const AttachmentQuerySchema = object({
  ownerType: Type.Union([Type.Literal('attempt'), Type.Literal('receipt'), Type.Literal('issue')]),
  ownerId: uuid(),
  kind: Type.Union([Type.Literal('PHOTO'), Type.Literal('SIGNATURE')]),
});
export type PlanEdit = Static<typeof PlanEditSchema>;
export type ReplayCommand = Static<typeof ReplayCommandSchema>;

const nullable = (schema: TSchema) => Type.Union([schema, Type.Null()]);
const row = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: true });
export const OrderRowSchema = row({
  id: uuid(),
  public_reference: Type.String(),
  outlet_id: Type.String(),
  outlet_name: Type.Optional(nullable(Type.String())),
  brand_id: Type.Optional(Type.String()),
  brand_name: Type.Optional(Type.String()),
  district_id: Type.Optional(Type.String()),
  district_name: Type.Optional(Type.String()),
  depot_id: Type.Optional(DepotSchema),
  order_size: Type.Optional(Type.Integer({ minimum: 0 })),
  format: Type.Union([Type.Literal('ITEMIZED'), Type.Literal('AGGREGATE')]),
  temperature_requirement: Type.Union([Type.Literal('ambient'), Type.Literal('chilled')]),
  requested_date: date(),
  eligible_date: date(),
  status: Type.Union(
    ['DRAFT', 'SUBMITTED', 'COMPLETED', 'CLOSED_EXCEPTION', 'CANCELLED'].map((s) =>
      Type.Literal(s),
    ),
  ),
  created_at: instant(),
});
export const OrderCommandResultSchema = row({
  id: uuid(),
  publicReference: Type.String(),
  outletId: Type.String(),
  status: Type.String(),
  requestedDate: date(),
  eligibleDate: date(),
});
export const LineRowSchema = row({
  id: uuid(),
  order_id: uuid(),
  line_number: Type.Integer(),
  sku: Type.String(),
  name: Type.String(),
  quantity: Type.Integer(),
  unit_weight_kg: DecimalSchema,
  unit_volume_m3: DecimalSchema,
});
export const DecisionRowSchema = row({
  id: uuid(),
  plan_id: uuid(),
  order_id: uuid(),
  decision: Type.Union(['UNASSIGNED', 'ALLOCATED', 'DEFERRED'].map((s) => Type.Literal(s))),
  reason_code: nullable(Type.String()),
  rationale: nullable(Type.String()),
  next_eligible_date: nullable(date()),
});
export const TripRowSchema = row({
  id: uuid(),
  plan_id: uuid(),
  vehicle_id: Type.String(),
  driver_id: uuid(),
  trip_number: Type.Integer(),
  brand_id: Type.String(),
  district_id: Type.String(),
  status: Type.Union(
    ['PLANNED', 'DISPATCHED', 'AWAITING_RETURN', 'COMPLETED'].map((s) => Type.Literal(s)),
  ),
});
export const StopRowSchema = row({
  id: uuid(),
  trip_id: uuid(),
  plan_id: uuid(),
  order_id: uuid(),
  sequence: Type.Integer(),
  planned_arrival_at: instant(),
  planned_depart_at: instant(),
  planned_travel_minutes: DecimalSchema,
  service_allowance_minutes: DecimalSchema,
  window_open_at: instant(),
  window_close_at: instant(),
});
export const IssueRowSchema = row({
  id: uuid(),
  order_id: uuid(),
  stop_id: uuid(),
  stage: Type.String(),
  type: Type.String(),
  affected_quantity: Type.Integer(),
  created_at: instant(),
  estimated_credit_lkr: nullable(DecimalSchema),
  resolution: nullable(Type.String()),
  resolved_at: nullable(instant()),
});
export const IssueCommandResultSchema = row({
  id: uuid(),
  orderId: uuid(),
  stopId: uuid(),
  stage: Type.String(),
  type: Type.String(),
  affectedQuantity: Type.Integer(),
  estimatedCreditLkr: nullable(DecimalSchema),
});
export const AttemptRowSchema = row({
  id: uuid(),
  order_id: uuid(),
  stop_id: uuid(),
  outcome: nullable(DeliveryOutcomeSchema),
  arrived_at: nullable(instant()),
  completed_at: nullable(instant()),
});
export const PlanRowSchema = row({
  id: uuid(),
  context_id: uuid(),
  depot_id: DepotSchema,
  status: Type.String(),
  version: Type.Integer(),
});
export const PlanCommandResultSchema = row({
  id: uuid(),
  contextId: uuid(),
  depotId: DepotSchema,
  status: Type.String(),
  version: Type.Integer(),
});
export const ContextCommandResultSchema = row({
  id: uuid(),
  kind: Type.String(),
  operatingDate: date(),
});
export const ContextRowSchema = row({ id: uuid(), kind: Type.String(), operating_date: date() });
export const CatalogRowSchema = row({
  id: uuid(),
  sku: Type.String(),
  name: Type.String(),
  ordering_unit: Type.String(),
  temperature_requirement: Type.String(),
  unit_weight_kg: DecimalSchema,
  unit_volume_m3: DecimalSchema,
  estimated_unit_value_lkr: nullable(DecimalSchema),
});
export const PageResponse = (item: TSchema) =>
  object({ items: Type.Array(item), nextCursor: nullable(Type.String()) });
export const OrdersResponseSchema = object({
  ...PageResponse(OrderRowSchema).properties,
  summary: object({
    total: quantity(),
    chilled: quantity(),
    ambient: quantity(),
    fresh: quantity(),
    textile: quantity(),
    fragile: quantity(),
    deferred: quantity(),
  }),
  filters: object({
    brands: Type.Array(object({ id: Type.String(), name: Type.String() })),
    districts: Type.Array(object({ id: Type.String(), name: Type.String() })),
    statuses: Type.Array(Type.String()),
  }),
});
export const OrderDetailSchema = object({
  order: OrderRowSchema,
  outlet: Type.Record(Type.String(), Type.Unknown()),
  lines: Type.Array(LineRowSchema),
  aggregate: nullable(Type.Record(Type.String(), Type.Unknown())),
  decisions: Type.Array(DecisionRowSchema),
  stops: Type.Array(StopRowSchema),
  attempts: Type.Array(AttemptRowSchema),
  issues: Type.Array(IssueRowSchema),
  predictionStatus: Type.Literal('UNAVAILABLE'),
});
export const TripDetailSchema = object({
  trip: TripRowSchema,
  stops: Type.Array(StopRowSchema),
  packingStopIds: Type.Array(uuid()),
  manifest: nullable(Type.Record(Type.String(), Type.Unknown())),
  inspection: nullable(Type.Record(Type.String(), Type.Unknown())),
  closure: nullable(Type.Record(Type.String(), Type.Unknown())),
  predictionStatus: Type.Literal('UNAVAILABLE'),
});
export const PlanDetailSchema = object({
  plan: PlanRowSchema,
  decisions: Type.Array(DecisionRowSchema),
  trips: Type.Array(TripRowSchema),
});
export const PlanEditResultSchema = object({
  planId: uuid(),
  version: Type.Integer(),
  tripCount: Type.Integer(),
  deferredCount: Type.Integer(),
});
export const VehicleRowSchema = row({
  id: Type.String(),
  depot_id: DepotSchema,
  type: Type.String(),
  temp: Type.String(),
  weight_cap_kg: DecimalSchema,
  volume_cap_m3: DecimalSchema,
  status: Type.String(),
});
export const AvailabilitySchema = object({
  vehicleId: Type.String({ minLength: 1 }),
  status: Type.Union([Type.Literal('available'), Type.Literal('workshop')]),
});
export const SyncResultSchema = object({
  results: Type.Array(
    Type.Union([
      object({
        clientOperationId: uuid(),
        applied: Type.Literal(true),
        result: Type.Record(Type.String(), Type.Unknown()),
      }),
      object({
        clientOperationId: uuid(),
        applied: Type.Literal(false),
        error: object({ status: Type.Integer(), code: Type.String(), message: Type.String() }),
      }),
    ]),
  ),
});

export const PeakScenarioImportSchema = object({
  ordersCsv: Type.String({ minLength: 1, maxLength: 8_000_000 }),
  fleetCsv: Type.String({ minLength: 1, maxLength: 4_000_000 }),
  operatingDate: date(),
  version: Type.String({ minLength: 1, maxLength: 80 }),
});
export const HistoryImportSchema = object({
  ordersCsv: Type.String({ minLength: 1, maxLength: 8_000_000 }),
  legsCsv: Type.String({ minLength: 1, maxLength: 8_000_000 }),
  dataset: Type.String({ pattern: '^[A-Za-z0-9_-]{1,80}$' }),
  version: Type.String({ minLength: 1, maxLength: 80 }),
});
export const ImportResultSchema = object({ batchId: uuid(), imported: Type.Boolean() });
