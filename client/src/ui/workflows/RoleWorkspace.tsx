import type { User } from '@waypoint/contracts';
import { LoaderWorkspace } from '../loader/LoaderWorkspace';
import { DriverWorkspace } from '../driver/DriverWorkspace';
import { StoreWorkspace } from '../store/StoreWorkspace';

export function RoleWorkspace({ user }: { user: User }) {
  switch (user.role) {
    case 'LOADER':
      return <LoaderWorkspace user={user} />;
    case 'DRIVER':
      return <DriverWorkspace user={user} />;
    case 'STORE_MANAGER':
      return <StoreWorkspace user={user} />;
    default:
      return null;
  }
}
