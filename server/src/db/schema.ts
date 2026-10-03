import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').defaultRandom().primaryKey();
const created = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const instant = (name: string) => timestamp(name, { withTimezone: true });
const amount = (name: string) => numeric(name, { precision: 12, scale: 2 });
const volume = (name: string) => numeric(name, { precision: 12, scale: 3 });
export const roleEnum = pgEnum('user_role', ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER']);
// Retain the existing type and supplied codes during reference normalization.
export const depotEnum = pgEnum('depot', ['Peliyagoda', 'Kandy']);
export const temperatureEnum = pgEnum('temperature_requirement', ['ambient', 'chilled']);
export const orderFormatEnum = pgEnum('order_format', ['ITEMIZED', 'AGGREGATE']);
export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'SUBMITTED',
  'COMPLETED',
  'CLOSED_EXCEPTION',
  'CANCELLED',
]);
export const planStatusEnum = pgEnum('plan_status', ['DRAFT', 'RELEASED', 'COMPLETED']);
export const decisionEnum = pgEnum('planning_decision', ['UNASSIGNED', 'ALLOCATED', 'DEFERRED']);
export const tripStatusEnum = pgEnum('trip_status', [
  'PLANNED',
  'DISPATCHED',
  'AWAITING_RETURN',
  'COMPLETED',
]);
export const loadStatusEnum = pgEnum('load_status', ['WAITING', 'LOADING', 'COMPLETED']);
export const outcomeEnum = pgEnum('delivery_outcome', [
  'DELIVERED',
  'PARTIAL',
  'REJECTED',
  'FAILED',
]);

export const depots = pgTable('depots', {
  id: depotEnum('id').primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').default('Asia/Colombo').notNull(),
});
export const brands = pgTable('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});
export const districts = pgTable(
  'districts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    depotId: depotEnum('depot_id')
      .notNull()
      .references(() => depots.id),
  },
  (t) => [index('districts_depot_idx').on(t.depotId)],
);
export const outlets = pgTable(
  'outlets',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    name: text('name'),
    contact: text('contact'),
    dockType: text('dock_type').notNull(),
    parkingConstraint: text('parking_constraint').notNull(),
    mallOpenTime: time('mall_open_time'),
    mallCloseTime: time('mall_close_time'),
    windowOpenTime: time('window_open_time').notNull(),
    windowCloseTime: time('window_close_time').notNull(),
  },
  (t) => [
    index('outlets_district_brand_idx').on(t.districtId, t.brandId),
    index('outlets_brand_idx').on(t.brandId),
    check('outlets_dock_check', sql`${t.dockType} IN ('rear_dock','street','mall_bay')`),
    check(
      'outlets_parking_check',
      sql`${t.parkingConstraint} IN ('normal','van_only','mall_dock')`,
    ),
    check('outlets_window_check', sql`${t.windowOpenTime} < ${t.windowCloseTime}`),
    check(
      'outlets_mall_window_check',
      sql`(${t.mallOpenTime} IS NULL AND ${t.mallCloseTime} IS NULL AND ${t.parkingConstraint} <> 'mall_dock') OR (${t.mallOpenTime} IS NOT NULL AND ${t.mallCloseTime} IS NOT NULL AND ${t.mallOpenTime} < ${t.mallCloseTime})`,
    ),
  ],
);
export const vehicles = pgTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    depotId: depotEnum('depot_id')
      .notNull()
      .references(() => depots.id),
    type: text('type').notNull(),
    temperatureCapability: text('temp').notNull(),
    weightCapKg: amount('weight_cap_kg').notNull(),
    volumeCapM3: volume('volume_cap_m3').notNull(),
    fuelType: text('fuel_type').notNull(),
    kmPerL: amount('km_per_l').notNull(),
    weeklyFuelQuotaL: volume('weekly_fuel_quota_l').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (t) => [
    index('vehicles_depot_idx').on(t.depotId),
    check('vehicles_type_check', sql`${t.type} IN ('truck','van')`),
    check('vehicles_temp_check', sql`${t.temperatureCapability} IN ('reefer','ambient')`),
    check(
      'vehicles_capacity_check',
      sql`${t.weightCapKg} > 0 AND ${t.volumeCapM3} > 0 AND ${t.kmPerL} > 0 AND ${t.weeklyFuelQuotaL} >= 0`,
    ),
  ],
);
export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text('sku').notNull().unique(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    name: text('name').notNull(),
    orderingUnit: text('ordering_unit').notNull(),
    temperatureRequirement: temperatureEnum('temperature_requirement').notNull(),
    unitWeightKg: amount('unit_weight_kg').notNull(),
    unitVolumeM3: volume('unit_volume_m3').notNull(),
    estimatedUnitValueLkr: amount('estimated_unit_value_lkr'),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (t) => [
    index('products_catalog_idx')
      .on(t.brandId, t.temperatureRequirement)
      .where(sql`${t.isActive} = true`),
    check(
      'products_dimensions_check',
      sql`${t.unitWeightKg} > 0 AND ${t.unitVolumeM3} > 0 AND (${t.estimatedUnitValueLkr} IS NULL OR ${t.estimatedUnitValueLkr} >= 0)`,
    ),
  ],
);
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: roleEnum('role').notNull(),
    depotId: depotEnum('depot_id').references(() => depots.id),
    outletId: text('outlet_id').references(() => outlets.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('users_email_lower_unique').on(sql`lower(${t.email})`),
    index('users_depot_idx').on(t.depotId),
    index('users_outlet_idx').on(t.outletId),
    check(
      'users_scope_check',
      sql`(${t.role} = 'DISPATCHER' AND ${t.depotId} IS NULL AND ${t.outletId} IS NULL) OR (${t.role} IN ('LOADER','DRIVER') AND ${t.depotId} IS NOT NULL AND ${t.outletId} IS NULL) OR (${t.role} = 'STORE_MANAGER' AND ${t.depotId} IS NULL AND ${t.outletId} IS NOT NULL)`,
    ),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
);
export const importBatches = pgTable(
  'import_batches',
  {
    id: id(),
    dataset: text('dataset').notNull(),
    version: text('version').notNull(),
    checksum: text('checksum').notNull(),
    importedAt: created(),
    result: text('result').notNull(),
  },
  (t) => [unique('import_batches_identity_unique').on(t.dataset, t.version, t.checksum)],
);
export const orders = pgTable(
  'orders',
  {
    id: id(),
    publicReference: text('public_reference').notNull().unique(),
    outletId: text('outlet_id')
      .notNull()
      .references(() => outlets.id),
    format: orderFormatEnum('format').notNull(),
    temperatureRequirement: temperatureEnum('temperature_requirement').notNull(),
    requestedDate: date('requested_date').notNull(),
    eligibleDate: date('eligible_date').notNull(),
    submittedAt: instant('submitted_at'),
    status: orderStatusEnum('status').default('DRAFT').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    index('orders_outlet_history_idx').on(t.outletId, t.createdAt.desc(), t.id),
    index('orders_queue_idx')
      .on(t.eligibleDate, t.outletId)
      .where(sql`${t.status} = 'SUBMITTED'`),
    index('orders_creator_idx').on(t.createdBy),
    check(
      'orders_submission_check',
      sql`${t.status} = 'DRAFT' OR ${t.status} = 'CANCELLED' OR ${t.submittedAt} IS NOT NULL`,
    ),
  ],
);
export const orderLines = pgTable(
  'order_lines',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    lineNumber: integer('line_number').notNull(),
    quantity: integer('quantity').notNull(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    orderingUnit: text('ordering_unit').notNull(),
    temperatureRequirement: temperatureEnum('temperature_requirement').notNull(),
    unitWeightKg: amount('unit_weight_kg').notNull(),
    unitVolumeM3: volume('unit_volume_m3').notNull(),
    estimatedUnitValueLkr: amount('estimated_unit_value_lkr'),
  },
  (t) => [
    unique('order_lines_position_unique').on(t.orderId, t.lineNumber),
    unique('order_lines_order_id_unique').on(t.orderId, t.id),
    index('order_lines_product_idx').on(t.productId),
    check(
      'order_lines_values_check',
      sql`${t.lineNumber} >= 1 AND ${t.quantity} > 0 AND ${t.unitWeightKg} > 0 AND ${t.unitVolumeM3} > 0 AND (${t.estimatedUnitValueLkr} IS NULL OR ${t.estimatedUnitValueLkr} >= 0)`,
    ),
  ],
);
export const orderAggregates = pgTable(
  'order_aggregates',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id),
    units: integer('units').notNull(),
    weightKg: amount('weight_kg').notNull(),
    volumeM3: volume('volume_m3').notNull(),
  },
  (t) => [
    check(
      'order_aggregates_values_check',
      sql`${t.units} > 0 AND ${t.weightKg} > 0 AND ${t.volumeM3} > 0`,
    ),
  ],
);
export const orderSources = pgTable(
  'order_sources',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id),
    scenario: text('scenario').default('').notNull(),
    sourceReference: text('source_reference').notNull(),
    rowPosition: integer('row_position').notNull(),
    deferredYesterday: boolean('deferred_yesterday'),
    daysSinceLastServed: integer('days_since_last_served'),
    sourceContext: jsonb('source_context').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    unique('order_sources_identity_unique').on(t.batchId, t.scenario, t.sourceReference),
    unique('order_sources_row_unique').on(t.batchId, t.rowPosition),
    check(
      'order_sources_values_check',
      sql`${t.rowPosition} >= 0 AND (${t.daysSinceLastServed} IS NULL OR ${t.daysSinceLastServed} >= 0)`,
    ),
  ],
);
export const planningContexts = pgTable(
  'planning_contexts',
  {
    id: id(),
    kind: text('kind').notNull(),
    operatingDate: date('operating_date').notNull(),
    batchId: uuid('batch_id').references(() => importBatches.id),
    scenario: text('scenario'),
  },
  (t) => [
    check(
      'planning_contexts_kind_check',
      sql`(${t.kind} = 'LIVE' AND ${t.batchId} IS NULL AND ${t.scenario} IS NULL) OR (${t.kind} = 'SCENARIO' AND ${t.batchId} IS NOT NULL AND ${t.scenario} IS NOT NULL)`,
    ),
    uniqueIndex('planning_contexts_live_date_unique')
      .on(t.operatingDate)
      .where(sql`${t.kind} = 'LIVE'`),
    unique('planning_contexts_scenario_unique').on(t.batchId, t.scenario, t.operatingDate),
  ],
);
export const plans = pgTable(
  'plans',
  {
    id: id(),
    contextId: uuid('context_id')
      .notNull()
      .references(() => planningContexts.id),
    depotId: depotEnum('depot_id')
      .notNull()
      .references(() => depots.id),
    status: planStatusEnum('status').default('DRAFT').notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    releasedAt: instant('released_at'),
    policyNotes: text('policy_notes'),
    createdAt: created(),
  },
  (t) => [
    unique('plans_context_depot_unique').on(t.contextId, t.depotId),
    index('plans_depot_idx').on(t.depotId),
    index('plans_creator_idx').on(t.createdBy),
    check('plans_version_check', sql`${t.version} > 0`),
    check('plans_release_check', sql`${t.status} = 'DRAFT' OR ${t.releasedAt} IS NOT NULL`),
  ],
);
export const vehicleAvailability = pgTable(
  'vehicle_availability',
  {
    contextId: uuid('context_id')
      .notNull()
      .references(() => planningContexts.id),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    status: text('status').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contextId, t.vehicleId] }),
    index('vehicle_availability_vehicle_idx').on(t.vehicleId),
    check('vehicle_availability_status_check', sql`${t.status} IN ('available','in_workshop')`),
  ],
);
export const planOrders = pgTable(
  'plan_orders',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    decision: decisionEnum('decision').default('UNASSIGNED').notNull(),
    reasonCode: text('reason_code'),
    rationale: text('rationale'),
    nextEligibleDate: date('next_eligible_date'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: instant('decided_at'),
    // Legacy metadata is retained; new decisions use the typed snapshot below.
    prioritySnapshot: jsonb('priority_snapshot').$type<Record<string, unknown>>(),
    prioritySource: text('priority_source'),
    priorityAsOfDate: date('priority_as_of_date'),
    priorityEvaluatedAt: instant('priority_evaluated_at'),
    lastServedDate: date('last_served_date'),
    daysSinceLastServed: integer('days_since_last_served'),
    temperatureLastServedDate: date('temperature_last_served_date'),
    temperatureDaysSinceLastServed: integer('temperature_days_since_last_served'),
    previousOperatingDate: date('previous_operating_date'),
    deferredPreviousRun: boolean('deferred_previous_run'),
    requiresOverride: boolean('requires_override'),
    overrideAcknowledged: boolean('override_acknowledged').default(false).notNull(),
    overrideReason: text('override_reason'),
    overrideBy: uuid('override_by').references(() => users.id),
    overrideAt: instant('override_at'),
    createdAt: created(),
  },
  (t) => [
    unique('plan_orders_plan_order_unique').on(t.planId, t.orderId),
    unique('plan_orders_plan_id_unique').on(t.planId, t.id),
    unique('plan_orders_id_order_unique').on(t.id, t.orderId),
    index('plan_orders_order_history_idx').on(t.orderId, t.createdAt.desc()),
    index('plan_orders_actor_idx').on(t.decidedBy),
    index('plan_orders_override_actor_idx').on(t.overrideBy),
    index('plan_orders_deferred_plan_order_idx')
      .on(t.planId, t.orderId)
      .where(sql`${t.decision} = 'DEFERRED'`),
    check(
      'plan_orders_priority_values_check',
      sql`(${t.prioritySource} IS NULL OR ${t.prioritySource} IN ('LIVE','SCENARIO')) AND (${t.daysSinceLastServed} IS NULL OR ${t.daysSinceLastServed} >= 0) AND (${t.temperatureDaysSinceLastServed} IS NULL OR ${t.temperatureDaysSinceLastServed} >= 0)`,
    ),
    check(
      'plan_orders_priority_snapshot_check',
      sql`${t.priorityEvaluatedAt} IS NULL OR (${t.prioritySource} IS NOT NULL AND ${t.priorityAsOfDate} IS NOT NULL AND ${t.deferredPreviousRun} IS NOT NULL AND ${t.requiresOverride} IS NOT NULL)`,
    ),
    check(
      'plan_orders_override_check',
      sql`(${t.overrideAcknowledged} = false AND ${t.overrideReason} IS NULL AND ${t.overrideBy} IS NULL AND ${t.overrideAt} IS NULL) OR (${t.overrideAcknowledged} = true AND ${t.overrideReason} IS NOT NULL AND length(btrim(${t.overrideReason})) > 0 AND ${t.overrideBy} IS NOT NULL AND ${t.overrideAt} IS NOT NULL)`,
    ),
    check(
      'plan_orders_protected_deferral_check',
      sql`${t.decision} <> 'DEFERRED' OR ${t.requiresOverride} IS DISTINCT FROM true OR ${t.overrideAcknowledged} = true`,
    ),
    check(
      'plan_orders_deferral_check',
      sql`${t.decision} <> 'DEFERRED' OR (${t.reasonCode} IS NOT NULL AND ${t.rationale} IS NOT NULL AND ${t.nextEligibleDate} IS NOT NULL AND ${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
    ),
  ],
);
export const trips = pgTable(
  'trips',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    tripNumber: integer('trip_number').notNull(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    status: tripStatusEnum('status').default('PLANNED').notNull(),
    weightCapKg: amount('weight_cap_kg'),
    volumeCapM3: volume('volume_cap_m3'),
    kmPerL: amount('km_per_l'),
    vehicleType: text('vehicle_type'),
    vehicleTemperature: text('vehicle_temperature'),
  },
  (t) => [
    unique('trips_slot_unique').on(t.planId, t.vehicleId, t.tripNumber),
    unique('trips_plan_id_unique').on(t.planId, t.id),
    index('trips_vehicle_idx').on(t.vehicleId),
    index('trips_driver_plan_idx').on(t.driverId, t.planId),
    index('trips_district_idx').on(t.districtId),
    index('trips_brand_idx').on(t.brandId),
    check('trips_number_check', sql`${t.tripNumber} IN (1,2)`),
  ],
);
export const tripStops = pgTable(
  'trip_stops',
  {
    id: id(),
    planId: uuid('plan_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    planOrderId: uuid('plan_order_id').notNull().unique(),
    orderId: uuid('order_id').notNull(),
    sequence: integer('sequence').notNull(),
    plannedDepartAt: instant('planned_depart_at').notNull(),
    plannedTravelMinutes: amount('planned_travel_minutes').notNull(),
    plannedArrivalAt: instant('planned_arrival_at').notNull(),
    serviceAllowanceMinutes: amount('service_allowance_minutes').notNull(),
    distanceKm: amount('distance_km').notNull(),
    windowOpenAt: instant('window_open_at').notNull(),
    windowCloseAt: instant('window_close_at').notNull(),
    dockType: text('dock_type').notNull(),
    parkingConstraint: text('parking_constraint').notNull(),
  },
  (t) => [
    unique('trip_stops_sequence_unique').on(t.tripId, t.sequence),
    unique('trip_stops_id_order_unique').on(t.id, t.orderId),
    index('trip_stops_plan_idx').on(t.planId),
    index('trip_stops_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.planId, t.tripId],
      foreignColumns: [trips.planId, trips.id],
      name: 'trip_stops_trip_plan_fk',
    }),
    foreignKey({
      columns: [t.planId, t.planOrderId],
      foreignColumns: [planOrders.planId, planOrders.id],
      name: 'trip_stops_decision_plan_fk',
    }),
    foreignKey({
      columns: [t.planOrderId, t.orderId],
      foreignColumns: [planOrders.id, planOrders.orderId],
      name: 'trip_stops_decision_order_fk',
    }),
    check(
      'trip_stops_values_check',
      sql`${t.sequence} >= 0 AND ${t.plannedTravelMinutes} >= 0 AND ${t.serviceAllowanceMinutes} >= 0 AND ${t.distanceKm} >= 0 AND ${t.windowOpenAt} < ${t.windowCloseAt} AND ${t.plannedDepartAt} <= ${t.plannedArrivalAt}`,
    ),
  ],
);
export const vehicleWeekBudgets = pgTable(
  'vehicle_week_budgets',
  {
    id: id(),
    namespace: text('namespace').notNull(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    weekStart: date('week_start').notNull(),
    quotaL: volume('quota_l').notNull(),
    openingUsageL: volume('opening_usage_l').default('0').notNull(),
  },
  (t) => [
    unique('vehicle_week_budgets_identity_unique').on(t.namespace, t.vehicleId, t.weekStart),
    index('vehicle_week_budgets_vehicle_idx').on(t.vehicleId),
    check(
      'vehicle_week_budgets_values_check',
      sql`${t.quotaL} >= 0 AND ${t.openingUsageL} >= 0 AND EXTRACT(ISODOW FROM ${t.weekStart}) = 1`,
    ),
  ],
);
export const tripFuelReservations = pgTable(
  'trip_fuel_reservations',
  {
    tripId: uuid('trip_id')
      .primaryKey()
      .references(() => trips.id),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => vehicleWeekBudgets.id),
    distanceKm: amount('distance_km').notNull(),
    estimatedFuelL: volume('estimated_fuel_l').notNull(),
    actualFuelL: volume('actual_fuel_l'),
    state: text('state').default('RESERVED').notNull(),
  },
  (t) => [
    index('trip_fuel_budget_idx').on(t.budgetId),
    check(
      'trip_fuel_values_check',
      sql`${t.distanceKm} >= 0 AND ${t.estimatedFuelL} >= 0 AND (${t.actualFuelL} IS NULL OR ${t.actualFuelL} >= 0) AND ${t.state} IN ('RESERVED','CONSUMED','RELEASED')`,
    ),
  ],
);
export const loadManifests = pgTable(
  'load_manifests',
  {
    tripId: uuid('trip_id')
      .primaryKey()
      .references(() => trips.id),
    status: loadStatusEnum('status').default('WAITING').notNull(),
    bayLabel: text('bay_label'),
    startedAt: instant('started_at'),
    completedAt: instant('completed_at'),
    signedBy: uuid('signed_by').references(() => users.id),
    authorizedBy: uuid('authorized_by').references(() => users.id),
    authorizedAt: instant('authorized_at'),
  },
  (t) => [
    index('load_manifests_signer_idx').on(t.signedBy),
    index('load_manifests_authorizer_idx').on(t.authorizedBy),
    check(
      'load_manifests_completion_check',
      sql`${t.status} <> 'COMPLETED' OR (${t.completedAt} IS NOT NULL AND ${t.signedBy} IS NOT NULL)`,
    ),
    check(
      'load_manifests_authorization_check',
      sql`(${t.authorizedBy} IS NULL AND ${t.authorizedAt} IS NULL) OR (${t.authorizedBy} IS NOT NULL AND ${t.authorizedAt} IS NOT NULL AND ${t.status} = 'COMPLETED')`,
    ),
  ],
);
export const loadRecords = pgTable(
  'load_records',
  {
    stopId: uuid('stop_id')
      .primaryKey()
      .references(() => tripStops.id),
    confirmedBy: uuid('confirmed_by').references(() => users.id),
    confirmedAt: instant('confirmed_at'),
    temperatureC: amount('temperature_c'),
    loadedUnits: integer('loaded_units'),
    loadedWeightKg: amount('loaded_weight_kg'),
    loadedVolumeM3: volume('loaded_volume_m3'),
  },
  (t) => [
    index('load_records_actor_idx').on(t.confirmedBy),
    check(
      'load_records_values_check',
      sql`(${t.loadedUnits} IS NULL AND ${t.loadedWeightKg} IS NULL AND ${t.loadedVolumeM3} IS NULL) OR (${t.loadedUnits} IS NOT NULL AND ${t.loadedWeightKg} IS NOT NULL AND ${t.loadedVolumeM3} IS NOT NULL AND ${t.loadedUnits} >= 0 AND ${t.loadedWeightKg} >= 0 AND ${t.loadedVolumeM3} >= 0)`,
    ),
    check(
      'load_records_confirmation_check',
      sql`(${t.confirmedBy} IS NULL) = (${t.confirmedAt} IS NULL)`,
    ),
  ],
);
export const loadLineRecords = pgTable(
  'load_line_records',
  {
    stopId: uuid('stop_id')
      .notNull()
      .references(() => loadRecords.stopId),
    orderId: uuid('order_id').notNull(),
    orderLineId: uuid('order_line_id').notNull(),
    loadedQuantity: integer('loaded_quantity').notNull(),
    damagedQuantity: integer('damaged_quantity').default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stopId, t.orderLineId] }),
    index('load_line_records_line_idx').on(t.orderLineId),
    index('load_line_records_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.stopId, t.orderId],
      foreignColumns: [tripStops.id, tripStops.orderId],
    }),
    foreignKey({
      columns: [t.orderId, t.orderLineId],
      foreignColumns: [orderLines.orderId, orderLines.id],
    }),
    check(
      'load_line_records_values_check',
      sql`${t.loadedQuantity} >= 0 AND ${t.damagedQuantity} >= 0`,
    ),
  ],
);
export const tripInspections = pgTable(
  'trip_inspections',
  {
    tripId: uuid('trip_id')
      .primaryKey()
      .references(() => trips.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    startingOdometerKm: amount('starting_odometer_km').notNull(),
    fuelChecked: boolean('fuel_checked').notNull(),
    chillerChecked: boolean('chiller_checked').notNull(),
    temperatureC: amount('temperature_c'),
    inspectedAt: instant('inspected_at').notNull(),
  },
  (t) => [
    index('trip_inspections_driver_idx').on(t.driverId),
    check('trip_inspections_odometer_check', sql`${t.startingOdometerKm} >= 0`),
  ],
);
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: id(),
    stopId: uuid('stop_id').notNull(),
    orderId: uuid('order_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    outcome: outcomeEnum('outcome'),
    actualDepartAt: instant('actual_depart_at'),
    arrivedAt: instant('arrived_at'),
    completedAt: instant('completed_at'),
    temperatureC: amount('temperature_c'),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    receiverName: text('receiver_name'),
    receiverStaffId: text('receiver_staff_id'),
    deliveredUnits: integer('delivered_units'),
    deliveredWeightKg: amount('delivered_weight_kg'),
    deliveredVolumeM3: volume('delivered_volume_m3'),
    createdAt: created(),
  },
  (t) => [
    check(
      'delivery_attempts_aggregate_values_check',
      sql`num_nonnulls(${t.deliveredUnits},${t.deliveredWeightKg},${t.deliveredVolumeM3}) = 0 OR (num_nonnulls(${t.deliveredUnits},${t.deliveredWeightKg},${t.deliveredVolumeM3}) = 3 AND ${t.deliveredUnits} >= 0 AND ${t.deliveredWeightKg} >= 0 AND ${t.deliveredVolumeM3} >= 0)`,
    ),
    unique('delivery_attempts_number_unique').on(t.stopId, t.attemptNumber),
    unique('delivery_attempts_id_order_unique').on(t.id, t.orderId),
    index('delivery_attempts_driver_idx').on(t.driverId),
    index('delivery_attempts_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.stopId, t.orderId],
      foreignColumns: [tripStops.id, tripStops.orderId],
    }),
    check(
      'delivery_attempts_values_check',
      sql`${t.attemptNumber} >= 1 AND (${t.deliveredUnits} IS NULL OR ${t.deliveredUnits} >= 0) AND (${t.completedAt} IS NULL OR (${t.arrivedAt} IS NOT NULL AND ${t.completedAt} >= ${t.arrivedAt} AND ${t.outcome} IS NOT NULL)) AND (${t.actualDepartAt} IS NULL OR ${t.arrivedAt} IS NULL OR ${t.actualDepartAt} <= ${t.arrivedAt})`,
    ),
  ],
);
export const deliveryLineRecords = pgTable(
  'delivery_line_records',
  {
    attemptId: uuid('attempt_id').notNull(),
    orderId: uuid('order_id').notNull(),
    orderLineId: uuid('order_line_id').notNull(),
    deliveredQuantity: integer('delivered_quantity').notNull(),
    rejectedQuantity: integer('rejected_quantity').default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.orderLineId] }),
    index('delivery_line_records_line_idx').on(t.orderLineId),
    index('delivery_line_records_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.attemptId, t.orderId],
      foreignColumns: [deliveryAttempts.id, deliveryAttempts.orderId],
    }),
    foreignKey({
      columns: [t.orderId, t.orderLineId],
      foreignColumns: [orderLines.orderId, orderLines.id],
    }),
    check(
      'delivery_line_records_values_check',
      sql`${t.deliveredQuantity} >= 0 AND ${t.rejectedQuantity} >= 0`,
    ),
  ],
);
export const receipts = pgTable(
  'receipts',
  {
    attemptId: uuid('attempt_id').primaryKey(),
    orderId: uuid('order_id').notNull(),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id),
    outcome: outcomeEnum('outcome').notNull(),
    temperatureC: amount('temperature_c'),
    confirmedAt: instant('confirmed_at').notNull(),
    acceptedUnits: integer('accepted_units'),
    missingUnits: integer('missing_units'),
    damagedUnits: integer('damaged_units'),
    rejectedUnits: integer('rejected_units'),
  },
  (t) => [
    check(
      'receipts_aggregate_values_check',
      sql`num_nonnulls(${t.acceptedUnits},${t.missingUnits},${t.damagedUnits},${t.rejectedUnits}) = 0 OR (num_nonnulls(${t.acceptedUnits},${t.missingUnits},${t.damagedUnits},${t.rejectedUnits}) = 4 AND ${t.acceptedUnits} >= 0 AND ${t.missingUnits} >= 0 AND ${t.damagedUnits} >= 0 AND ${t.rejectedUnits} >= 0)`,
    ),
    unique('receipts_attempt_order_unique').on(t.attemptId, t.orderId),
    index('receipts_manager_idx').on(t.managerId),
    index('receipts_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.attemptId, t.orderId],
      foreignColumns: [deliveryAttempts.id, deliveryAttempts.orderId],
    }),
  ],
);
export const receiptLines = pgTable(
  'receipt_lines',
  {
    receiptId: uuid('receipt_id').notNull(),
    orderId: uuid('order_id').notNull(),
    orderLineId: uuid('order_line_id').notNull(),
    acceptedQuantity: integer('accepted_quantity').notNull(),
    missingQuantity: integer('missing_quantity').default(0).notNull(),
    damagedQuantity: integer('damaged_quantity').default(0).notNull(),
    rejectedQuantity: integer('rejected_quantity').default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.orderLineId] }),
    index('receipt_lines_line_idx').on(t.orderLineId),
    index('receipt_lines_order_idx').on(t.orderId),
    foreignKey({
      columns: [t.receiptId, t.orderId],
      foreignColumns: [receipts.attemptId, receipts.orderId],
    }),
    foreignKey({
      columns: [t.orderId, t.orderLineId],
      foreignColumns: [orderLines.orderId, orderLines.id],
    }),
    check(
      'receipt_lines_values_check',
      sql`${t.acceptedQuantity} >= 0 AND ${t.missingQuantity} >= 0 AND ${t.damagedQuantity} >= 0 AND ${t.rejectedQuantity} >= 0`,
    ),
  ],
);
export const issues = pgTable(
  'issues',
  {
    id: id(),
    stopId: uuid('stop_id').notNull(),
    orderId: uuid('order_id').notNull(),
    stage: text('stage').notNull(),
    orderLineId: uuid('order_line_id'),
    attemptId: uuid('attempt_id'),
    type: text('type').notNull(),
    affectedQuantity: integer('affected_quantity').notNull(),
    notes: text('notes'),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => users.id),
    createdAt: created(),
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: instant('resolved_at'),
    estimatedCreditLkr: amount('estimated_credit_lkr'),
  },
  (t) => [
    index('issues_unresolved_idx')
      .on(t.createdAt.desc(), t.id)
      .where(sql`${t.resolvedAt} IS NULL`),
    index('issues_stop_idx').on(t.stopId),
    index('issues_order_idx').on(t.orderId),
    index('issues_line_idx').on(t.orderLineId),
    index('issues_attempt_idx').on(t.attemptId),
    index('issues_reporter_idx').on(t.reportedBy),
    index('issues_resolver_idx').on(t.resolvedBy),
    foreignKey({
      columns: [t.stopId, t.orderId],
      foreignColumns: [tripStops.id, tripStops.orderId],
    }),
    foreignKey({
      columns: [t.orderId, t.orderLineId],
      foreignColumns: [orderLines.orderId, orderLines.id],
    }),
    foreignKey({
      columns: [t.attemptId, t.orderId],
      foreignColumns: [deliveryAttempts.id, deliveryAttempts.orderId],
    }),
    check(
      'issues_values_check',
      sql`${t.stage} IN ('LOADING','DELIVERY','RECEIPT') AND ${t.affectedQuantity} > 0 AND (${t.estimatedCreditLkr} IS NULL OR ${t.estimatedCreditLkr} >= 0) AND ((${t.resolvedAt} IS NULL AND ${t.resolvedBy} IS NULL AND ${t.resolution} IS NULL) OR (${t.resolvedAt} IS NOT NULL AND ${t.resolvedBy} IS NOT NULL AND ${t.resolution} IS NOT NULL))`,
    ),
  ],
);
export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    issueId: uuid('issue_id').references(() => issues.id),
    attemptId: uuid('attempt_id').references(() => deliveryAttempts.id),
    receiptId: uuid('receipt_id').references(() => receipts.attemptId),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksum: text('checksum').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    index('attachments_issue_idx').on(t.issueId),
    index('attachments_attempt_idx').on(t.attemptId),
    index('attachments_receipt_idx').on(t.receiptId),
    index('attachments_uploader_idx').on(t.uploadedBy),
    check(
      'attachments_owner_check',
      sql`num_nonnulls(${t.issueId},${t.attemptId},${t.receiptId}) = 1`,
    ),
    check(
      'attachments_values_check',
      sql`${t.byteSize} > 0 AND ${t.kind} IN ('PHOTO','SIGNATURE')`,
    ),
  ],
);
export const operatingCalendar = pgTable(
  'operating_calendar',
  {
    date: date('date').primaryKey(),
    isOperating: boolean('is_operating').notNull(),
    isHoliday: boolean('is_holiday').notNull(),
    isPayday: boolean('is_payday').notNull(),
    festival: text('festival'),
    festivalRamp: numeric('festival_ramp', { precision: 5, scale: 4 }).notNull(),
    monsoon: boolean('monsoon').notNull(),
  },
  (t) => [check('operating_calendar_ramp_check', sql`${t.festivalRamp} BETWEEN 0 AND 1`)],
);
export const districtTravel = pgTable(
  'district_travel',
  {
    districtId: text('district_id')
      .primaryKey()
      .references(() => districts.id),
    roadClass: text('road_class').notNull(),
    freeFlowKmh: amount('free_flow_kmh').notNull(),
    depotToDistrictKm: amount('depot_to_district_km').notNull(),
    depotToDistrictFreeflowMinutes: amount('depot_to_district_freeflow_minutes').notNull(),
    interStopKm: amount('inter_stop_km').notNull(),
    interStopFreeflowMinutes: amount('inter_stop_freeflow_minutes').notNull(),
  },
  (t) => [
    check(
      'district_travel_values_check',
      sql`${t.freeFlowKmh} > 0 AND ${t.depotToDistrictKm} >= 0 AND ${t.depotToDistrictFreeflowMinutes} >= 0 AND ${t.interStopKm} >= 0 AND ${t.interStopFreeflowMinutes} >= 0`,
    ),
  ],
);
export const serviceAllowances = pgTable(
  'service_allowances',
  {
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    dockType: text('dock_type').notNull(),
    minutes: amount('minutes').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.brandId, t.dockType] }),
    check(
      'service_allowances_values_check',
      sql`${t.minutes} >= 0 AND ${t.dockType} IN ('rear_dock','street','mall_bay')`,
    ),
  ],
);
export const trafficProfiles = pgTable(
  'traffic_profiles',
  {
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    hour: integer('hour').notNull(),
    monsoon: boolean('monsoon').notNull(),
    speedIndex: amount('speed_index').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.districtId, t.hour, t.monsoon] }),
    check('traffic_profiles_values_check', sql`${t.hour} BETWEEN 0 AND 23 AND ${t.speedIndex} > 0`),
  ],
);
export const roadConditions = pgTable(
  'road_conditions',
  {
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    date: date('date').notNull(),
    disruptionIndex: amount('disruption_index').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.districtId, t.date] }),
    index('road_conditions_date_idx').on(t.date),
    check('road_conditions_values_check', sql`${t.disruptionIndex} > 0`),
  ],
);
export const historicalRoutes = pgTable(
  'historical_routes',
  {
    id: id(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id),
    sourceRouteId: text('source_route_id').notNull(),
    date: date('date').notNull(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
  },
  (t) => [
    unique('historical_routes_source_unique').on(t.batchId, t.sourceRouteId, t.date),
    index('historical_routes_vehicle_idx').on(t.vehicleId),
    index('historical_routes_brand_idx').on(t.brandId),
    index('historical_routes_district_idx').on(t.districtId),
  ],
);
export const historicalStops = pgTable(
  'historical_stops',
  {
    id: id(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => historicalRoutes.id),
    sequence: integer('sequence').notNull(),
    sourceDeliveryId: text('source_delivery_id').notNull(),
    sourceLegId: text('source_leg_id').notNull(),
    rowPosition: integer('row_position').notNull(),
    outletId: text('outlet_id')
      .notNull()
      .references(() => outlets.id),
    requestedDate: date('requested_date').notNull(),
    dispatchStatus: text('dispatch_status').notNull(),
    temperatureRequirement: temperatureEnum('temperature_requirement').notNull(),
    units: integer('units').notNull(),
    weightKg: amount('weight_kg').notNull(),
    volumeM3: volume('volume_m3').notNull(),
    windowOpenAt: instant('window_open_at').notNull(),
    windowCloseAt: instant('window_close_at').notNull(),
    plannedDepartAt: instant('planned_depart_at').notNull(),
    plannedArrivalAt: instant('planned_arrival_at').notNull(),
    plannedTravelMinutes: amount('planned_travel_minutes').notNull(),
    distanceKm: amount('distance_km').notNull(),
    actualDepartAt: instant('actual_depart_at'),
    arrivedAt: instant('arrived_at'),
    completedAt: instant('completed_at'),
    actualTravelMinutes: amount('actual_travel_minutes'),
  },
  (t) => [
    unique('historical_stops_sequence_unique').on(t.routeId, t.sequence),
    index('historical_stops_outlet_idx').on(t.outletId),
    check(
      'historical_stops_values_check',
      sql`${t.sequence} >= 0 AND ${t.rowPosition} >= 0 AND ${t.units} > 0 AND ${t.weightKg} > 0 AND ${t.volumeM3} > 0 AND ${t.distanceKm} >= 0 AND ${t.plannedTravelMinutes} >= 0 AND (${t.actualTravelMinutes} IS NULL OR ${t.actualTravelMinutes} >= 0)`,
    ),
  ],
);
export const historicalUnrunOrders = pgTable(
  'historical_unrun_orders',
  {
    id: id(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id),
    sourceDeliveryId: text('source_delivery_id').notNull(),
    rowPosition: integer('row_position').notNull(),
    outletId: text('outlet_id')
      .notNull()
      .references(() => outlets.id),
    requestedDate: date('requested_date').notNull(),
    temperatureRequirement: temperatureEnum('temperature_requirement').notNull(),
    units: integer('units').notNull(),
    weightKg: amount('weight_kg').notNull(),
    volumeM3: volume('volume_m3').notNull(),
  },
  (t) => [
    unique('historical_unrun_orders_source_unique').on(t.batchId, t.sourceDeliveryId),
    index('historical_unrun_orders_outlet_idx').on(t.outletId),
    check(
      'historical_unrun_orders_values_check',
      sql`${t.rowPosition} >= 0 AND ${t.units} > 0 AND ${t.weightKg} > 0 AND ${t.volumeM3} > 0`,
    ),
  ],
);
export const predictionRuns = pgTable(
  'prediction_runs',
  {
    id: id(),
    task: text('task').notNull(),
    model: text('model').notNull(),
    version: text('version').notNull(),
    batchId: uuid('batch_id').references(() => importBatches.id),
    generatedAt: created(),
  },
  (t) => [index('prediction_runs_batch_idx').on(t.batchId)],
);
export const stopPredictions = pgTable(
  'stop_predictions',
  {
    id: id(),
    runId: uuid('run_id')
      .notNull()
      .references(() => predictionRuns.id),
    stopId: uuid('stop_id').references(() => tripStops.id),
    historicalStopId: uuid('historical_stop_id').references(() => historicalStops.id),
    serviceMinutes: amount('service_minutes').notNull(),
    lateProbability: numeric('late_probability', { precision: 7, scale: 6 }).notNull(),
  },
  (t) => [
    unique('stop_predictions_operational_unique').on(t.runId, t.stopId),
    unique('stop_predictions_historical_unique').on(t.runId, t.historicalStopId),
    index('stop_predictions_stop_idx').on(t.stopId),
    index('stop_predictions_historical_idx').on(t.historicalStopId),
    check(
      'stop_predictions_values_check',
      sql`num_nonnulls(${t.stopId},${t.historicalStopId}) = 1 AND ${t.serviceMinutes} >= 0 AND ${t.lateProbability} BETWEEN 0 AND 1`,
    ),
  ],
);
export const weeklyForecasts = pgTable(
  'weekly_forecasts',
  {
    id: id(),
    runId: uuid('run_id')
      .notNull()
      .references(() => predictionRuns.id),
    depotId: depotEnum('depot_id')
      .notNull()
      .references(() => depots.id),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id),
    weekStart: date('week_start').notNull(),
    totalVolumeM3: volume('total_volume_m3').notNull(),
    chilledVolumeM3: volume('chilled_volume_m3').notNull(),
    sourceRowId: text('source_row_id'),
    rowPosition: integer('row_position'),
  },
  (t) => [
    unique('weekly_forecasts_target_unique').on(t.runId, t.depotId, t.brandId, t.weekStart),
    index('weekly_forecasts_lookup_idx').on(t.depotId, t.brandId, t.weekStart),
    index('weekly_forecasts_brand_idx').on(t.brandId),
    check(
      'weekly_forecasts_values_check',
      sql`${t.totalVolumeM3} >= 0 AND ${t.chilledVolumeM3} BETWEEN 0 AND ${t.totalVolumeM3} AND EXTRACT(ISODOW FROM ${t.weekStart}) = 1 AND (${t.brandId} = 'Fresh' OR ${t.chilledVolumeM3} = 0) AND (${t.rowPosition} IS NULL OR ${t.rowPosition} >= 0)`,
    ),
  ],
);
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: created(),
  },
  (t) => [
    index('audit_events_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_events_actor_idx').on(t.actorId),
  ],
);
export const syncOperations = pgTable(
  'sync_operations',
  {
    id: id(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    clientOperationId: uuid('client_operation_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    capturedAt: instant('captured_at').notNull(),
    receivedAt: created(),
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [unique('sync_operations_replay_unique').on(t.actorId, t.clientOperationId)],
);

export const tripClosures = pgTable(
  'trip_closures',
  {
    tripId: uuid('trip_id')
      .primaryKey()
      .references(() => trips.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    returnedAt: instant('returned_at').notNull(),
    endingOdometerKm: amount('ending_odometer_km').notNull(),
    actualFuelL: volume('actual_fuel_l').notNull(),
    recordedAt: created(),
  },
  (t) => [
    check('trip_closures_values_check', sql`${t.endingOdometerKm} >= 0 AND ${t.actualFuelL} >= 0`),
  ],
);
