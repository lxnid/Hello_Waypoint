import type { OrderCommandResult } from '@waypoint/contracts/workflows';
export type OrdersCreateResponse = OrderCommandResult;
export type OrdersUpdateResponse = OrderCommandResult;
export type OrdersDeleteResponse = { deleted: boolean };
export type OrdersSubmitResponse = { id: string; status: string };
