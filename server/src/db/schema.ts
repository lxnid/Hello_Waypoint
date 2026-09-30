import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const roleEnum = pgEnum('user_role', ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER']);
export const depotEnum = pgEnum('depot', ['Peliyagoda', 'Kandy']);

export const outlets = pgTable(
  'outlets',
  {
    id: text('id').primaryKey(),
    brand: text('brand').notNull(),
    district: text('district').notNull(),
    depot: depotEnum('depot').notNull(),
    dockType: text('dock_type').notNull(),
    parkingConstraint: text('parking_constraint').notNull(),
    mallWindow: text('mall_window'),
    windowOpenTime: text('window_open_time').notNull(),
    windowCloseTime: text('window_close_time').notNull(),
  },
  (table) => [index('outlets_depot_idx').on(table.depot)],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    temperatureCapability: text('temp').notNull(),
    weightCapKg: numeric('weight_cap_kg', { precision: 12, scale: 2 }).notNull(),
    volumeCapM3: numeric('volume_cap_m3', { precision: 12, scale: 3 }).notNull(),
    fuelType: text('fuel_type').notNull(),
    kmPerL: numeric('km_per_l', { precision: 8, scale: 2 }).notNull(),
    weeklyFuelQuotaL: numeric('weekly_fuel_quota_l', { precision: 12, scale: 2 }).notNull(),
    depot: depotEnum('depot').notNull(),
  },
  (table) => [index('vehicles_depot_idx').on(table.depot)],
);

/** Operational vehicle assignments belong to a dated plan, so they do not live on users. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: roleEnum('role').notNull(),
    depot: depotEnum('depot').notNull(),
    outletId: text('outlet_id').references(() => outlets.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)],
);

/** A server-side session record lets logout revoke a JWT immediately. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);
