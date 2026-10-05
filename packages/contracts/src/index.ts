import { Type, type Static } from '@sinclair/typebox';
import { ROLES } from './roles.js';
export { ROLES, ROLE_HOME, ROLE_LABEL, ROLE_API, type Role } from './roles.js';

/** Roles have independent permissions; depot and outlet scoping is enforced separately. */
export const RoleSchema = Type.Union(ROLES.map((role) => Type.Literal(role)));
export const DepotSchema = Type.Union([Type.Literal('Peliyagoda'), Type.Literal('Kandy')]);

export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  displayName: Type.String(),
  role: RoleSchema,
  depot: Type.Union([DepotSchema, Type.Null()]),
  authorizedDepots: Type.Array(DepotSchema),
  outletId: Type.Union([Type.String(), Type.Null()]),
});
export type User = Static<typeof UserSchema>;

export const LoginSchema = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 254 }),
    password: Type.String({ minLength: 1, maxLength: 72 }),
  },
  { additionalProperties: false },
);
export const IdentitySchema = Type.Object({
  user: UserSchema,
  expiresAt: Type.String({ format: 'date-time' }),
});
export type Identity = Static<typeof IdentitySchema>;
export const ErrorSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});
export const HealthSchema = Type.Object({
  status: Type.Literal('ok'),
  database: Type.Literal('connected'),
});
export const OverviewSchema = Type.Object({
  user: UserSchema,
  outletCount: Type.Integer({ minimum: 0 }),
  vehicleCount: Type.Integer({ minimum: 0 }),
  stage: Type.Literal('FOUNDATION'),
});
export type Overview = Static<typeof OverviewSchema>;

export type {
  CreateOrder,
  PriorityQuery,
  OrderPriority,
  DeferralOverride,
  DeferralOverrideAcknowledgement,
} from './operations.js';
export type { PlanEdit, ReplayCommand } from './workflows.js';
