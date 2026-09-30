/** Browser-safe role metadata; validation schemas stay on the server path. */
export const ROLES = ['DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HOME: Record<Role, string> = {
  DISPATCHER: '/dispatcher/orders',
  LOADER: '/loader/loads',
  DRIVER: '/driver/routes',
  STORE_MANAGER: '/store/orders',
};
export const ROLE_LABEL: Record<Role, string> = {
  DISPATCHER: 'Dispatcher',
  LOADER: 'Warehouse loader',
  DRIVER: 'Delivery driver',
  STORE_MANAGER: 'Store manager',
};
export const ROLE_API: Record<Role, string> = {
  DISPATCHER: 'dispatcher',
  LOADER: 'loader',
  DRIVER: 'driver',
  STORE_MANAGER: 'store',
};
