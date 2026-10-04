import type { ReplayCommand } from '@waypoint/contracts/workflows';
import { api, request } from '../api';

type Delivery = Extract<ReplayCommand, { action: 'DELIVERY' }>['payload'];
export type DriverOperation = {
  id: string;
  actorId: string;
  stopId: string;
  planId: string;
  planVersion: number;
  capturedAt: string;
  action: 'ARRIVAL' | 'DELIVERY';
  attemptId?: string;
  payload?: Delivery;
  proof?: Blob;
  proofId?: string;
  applied?: boolean;
  error?: string;
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('waypoint-driver', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('operations', { keyPath: 'id' });
      open.result.createObjectStore('cache');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const operation = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(operation.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const saveOperation = (operation: DriverOperation) =>
  transact('operations', 'readwrite', (store) => store.put(operation));
export async function operations(actorId: string) {
  const all = await transact<DriverOperation[]>('operations', 'readonly', (store) =>
    store.getAll(),
  );
  return all
    .filter((operation) => operation.actorId === actorId)
    .sort(
      (a, b) =>
        a.capturedAt.localeCompare(b.capturedAt) ||
        (a.action === b.action ? a.id.localeCompare(b.id) : a.action === 'ARRIVAL' ? -1 : 1),
    );
}
export const saveCached = (key: string, value: unknown) =>
  transact('cache', 'readwrite', (store) => store.put(value, key));
export const readCached = <T>(key: string) =>
  transact<T | undefined>('cache', 'readonly', (store) => store.get(key));
export async function driverRead<T>(actorId: string, path: string): Promise<T> {
  const key = `${actorId}:${path}`;
  try {
    const result = await request<T>(path);
    window.dispatchEvent(new CustomEvent('waypoint:connectivity', { detail: { reachable: true } }));
    await saveCached(key, result).catch(() => undefined);
    return result;
  } catch (error) {
    if (error instanceof TypeError || !navigator.onLine) {
      window.dispatchEvent(
        new CustomEvent('waypoint:connectivity', { detail: { reachable: false } }),
      );
      const cached = await readCached<T>(key);
      if (cached) return cached;
    }
    throw error;
  }
}
const running = new Map<string, Promise<void>>();
export function syncDriver(actorId: string) {
  const existing = running.get(actorId);
  if (existing) return existing;
  const task = (
    navigator.locks
      ? navigator.locks.request(`waypoint-sync:${actorId}`, () => synchronize(actorId))
      : synchronize(actorId)
  )
    .then(() => undefined)
    .finally(() => {
      running.delete(actorId);
    });
  running.set(actorId, task);
  return task;
}
async function synchronize(actorId: string) {
  const queue = await operations(actorId);
  for (const item of queue.filter((operation) => !operation.applied)) {
    try {
      const envelope = {
        clientOperationId: item.id,
        capturedAt: item.capturedAt,
        planId: item.planId,
        planVersion: item.planVersion,
      };
      let command: ReplayCommand;
      if (item.action === 'ARRIVAL')
        command = { ...envelope, action: 'ARRIVAL', stopId: item.stopId };
      else {
        const arrival = queue.find(
          (operation) =>
            operation.stopId === item.stopId && operation.action === 'ARRIVAL' && operation.applied,
        );
        const attemptId = item.attemptId ?? arrival?.attemptId;
        if (!attemptId || !item.payload)
          throw new Error('Arrival must be confirmed before delivery can sync.');
        if (item.proof && item.proofId) {
          await request(
            `/proof/${item.proofId}?ownerType=attempt&ownerId=${attemptId}&kind=SIGNATURE`,
            { method: 'PUT', headers: { 'Content-Type': item.proof.type }, body: item.proof },
          );
        }
        command = { ...envelope, action: 'DELIVERY', attemptId, payload: item.payload };
      }
      const response = await api.offline.sync([command]);
      const result = response.results[0];
      if (!result?.applied)
        throw new Error(result?.error?.message ?? 'Operation was not accepted.');
      item.applied = true;
      if (typeof result.result.attemptId === 'string') item.attemptId = result.result.attemptId;
      delete item.error;
      delete item.proof;
      await saveOperation(item);
    } catch (error) {
      item.error = error instanceof Error ? error.message : 'Sync failed';
      await saveOperation(item);
      // Preserve all later operations: their stop sequence or arrival may depend on this one.
      throw error;
    }
  }
}
