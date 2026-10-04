import type {
  ContextCommandResult,
  ContextRow,
  PlanCommandResult,
  PlanEditResult,
  PlanRow,
  VehicleRow,
} from '@waypoint/contracts/workflows';
export type PlanningListContextsItem = ContextRow;
export type PlanningCreateContextResponse = ContextCommandResult;
export type PlanningGetContextPlansItem = PlanRow;
export type PlanningGetContextFleetItem = VehicleRow;
export type PlanningSetVehicleAvailabilityResponse = {
  contextId: string;
  vehicleId: string;
  status: string;
};
export type PlanningGetContextDriversItem = { id: string; name: string; depot_id: string };
export type PlanningCreatePlanResponse = PlanCommandResult;
export type PlanningUpdatePlanResponse = PlanEditResult;
export type PlanningGenerateResponse = PlanEditResult;
export type PlanningValidateResponse = { valid: boolean; message?: string };
export type PlanningReleaseResponse = PlanCommandResult;
