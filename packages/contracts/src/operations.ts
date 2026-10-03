import { Type, type Static } from '@sinclair/typebox';

export const DecimalSchema = Type.String({ pattern: '^\\d+(\\.\\d+)?$' });
export const OrderFormatSchema = Type.Union([Type.Literal('ITEMIZED'), Type.Literal('AGGREGATE')]);
export const TemperatureSchema = Type.Union([Type.Literal('ambient'), Type.Literal('chilled')]);
export const OrderLineInputSchema = Type.Object(
  { productId: Type.String({ format: 'uuid' }), quantity: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export const CreateOrderSchema = Type.Object(
  {
    requestedDate: Type.String({ format: 'date' }),
    temperatureRequirement: TemperatureSchema,
    lines: Type.Array(OrderLineInputSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type CreateOrder = Static<typeof CreateOrderSchema>;
export const PlanVersionSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export const PlanningDecisionSchema = Type.Union([
  Type.Literal('UNASSIGNED'),
  Type.Literal('ALLOCATED'),
  Type.Literal('DEFERRED'),
]);
export const ManifestStatusSchema = Type.Union([
  Type.Literal('WAITING'),
  Type.Literal('LOADING'),
  Type.Literal('COMPLETED'),
]);
export const DeliveryOutcomeSchema = Type.Union([
  Type.Literal('DELIVERED'),
  Type.Literal('PARTIAL'),
  Type.Literal('REJECTED'),
  Type.Literal('FAILED'),
]);
export const SyncCommandSchema = Type.Object(
  {
    clientOperationId: Type.String({ format: 'uuid' }),
    capturedAt: Type.String({ format: 'date-time' }),
    stopId: Type.String({ format: 'uuid' }),
    action: Type.Union([Type.Literal('ARRIVAL'), Type.Literal('DELIVERY')]),
    payload: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export const SyncAcknowledgementSchema = Type.Object({
  clientOperationId: Type.String({ format: 'uuid' }),
  applied: Type.Boolean(),
  result: Type.Record(Type.String(), Type.Unknown()),
});

export const PriorityQuerySchema = Type.Object(
  {
    contextId: Type.String({ format: 'uuid' }),
    depot: Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')]),
  },
  { additionalProperties: false },
);
export type PriorityQuery = Static<typeof PriorityQuerySchema>;
const NullableDateSchema = Type.Union([Type.String({ format: 'date' }), Type.Null()]);
const NullableDaysSchema = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
export const OrderPrioritySchema = Type.Object({
  orderId: Type.String({ format: 'uuid' }),
  publicReference: Type.String(),
  outletId: Type.String(),
  brand: Type.String(),
  district: Type.String(),
  temperatureRequirement: TemperatureSchema,
  source: Type.Union([Type.Literal('LIVE'), Type.Literal('SCENARIO')]),
  asOfDate: Type.String({ format: 'date' }),
  previousOperatingDate: NullableDateSchema,
  lastServedDate: NullableDateSchema,
  daysSinceLastServed: NullableDaysSchema,
  temperatureLastServedDate: NullableDateSchema,
  temperatureDaysSinceLastServed: NullableDaysSchema,
  deferredPreviousRun: Type.Boolean(),
  outletDeferredPreviousRun: Type.Boolean(),
  requiresOverride: Type.Boolean(),
  historyStatus: Type.Union([Type.Literal('KNOWN'), Type.Literal('UNKNOWN')]),
});
export const DeferralOverrideSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }), reason: Type.String({ minLength: 1, maxLength: 2000 }) },
  { additionalProperties: false },
);
export type DeferralOverride = Static<typeof DeferralOverrideSchema>;
export const DeferralOverrideAcknowledgementSchema = Type.Object({
  planOrderId: Type.String({ format: 'uuid' }),
  version: Type.Integer({ minimum: 1 }),
  acknowledged: Type.Literal(true),
});
