import { request } from '../http';
import type { ReplayCommand } from '@waypoint/contracts';
import type { SyncResult } from '@waypoint/contracts/workflows';

export const offlineApi = {
  sync: (commands: ReplayCommand[]) =>
    request<SyncResult>('/sync', {
      method: 'POST',
      body: JSON.stringify({ commands }),
    }),
};
