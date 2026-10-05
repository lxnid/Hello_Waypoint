import type { Identity } from '@waypoint/contracts';
import { api, ApiError } from '../api';
import { readCached, saveCached } from './driver-store';
const key = 'active-driver-session';
export async function rememberDriver(identity: Identity) {
  await saveCached(key, identity.user.role === 'DRIVER' ? identity : null);
}
export async function forgetDriver() {
  await saveCached(key, null);
}
export async function loadSession(): Promise<Identity> {
  try {
    const identity = await api.me();
    // Failure to persist must not turn a valid online session into a login failure.
    await rememberDriver(identity).catch(() => undefined);
    return identity;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) await forgetDriver().catch(() => undefined);
      throw error;
    }
    if (error instanceof TypeError) {
      const identity = await readCached<Identity | null>(key).catch(() => undefined);
      if (identity?.user.role === 'DRIVER' && Date.parse(identity.expiresAt) > Date.now())
        return identity;
    }
    throw error;
  }
}
