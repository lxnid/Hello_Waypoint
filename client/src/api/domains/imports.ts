import { request } from '../http';
import type {
  PeakScenarioImport,
  HistoryImport,
  ImportResult,
} from '@waypoint/contracts/workflows';

export const importsApi = {
  peakScenario: (data: PeakScenarioImport) =>
    request<ImportResult>('/imports/peak-scenario', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  history: (data: HistoryImport) =>
    request<ImportResult>('/imports/history', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
