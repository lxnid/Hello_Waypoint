import { lazy, Suspense } from 'react';
import type { User } from '@waypoint/contracts';
const LoaderWorkspace = lazy(() =>
  import('../loader/LoaderWorkspace').then((module) => ({ default: module.LoaderWorkspace })),
);
const DriverWorkspace = lazy(() =>
  import('../driver/DriverWorkspace').then((module) => ({ default: module.DriverWorkspace })),
);
const StoreWorkspace = lazy(() =>
  import('../store/StoreWorkspace').then((module) => ({ default: module.StoreWorkspace })),
);

export function RoleWorkspace({ user }: { user: User }) {
  switch (user.role) {
    case 'LOADER':
      return (
        <Suspense fallback={<p role="status">Loading assigned loads…</p>}>
          <LoaderWorkspace user={user} />
        </Suspense>
      );
    case 'DRIVER':
      return (
        <Suspense fallback={<p role="status">Loading driver routes…</p>}>
          <DriverWorkspace user={user} />
        </Suspense>
      );
    case 'STORE_MANAGER':
      return (
        <Suspense fallback={<p role="status">Loading store orders…</p>}>
          <StoreWorkspace user={user} />
        </Suspense>
      );
    default:
      return null;
  }
}
