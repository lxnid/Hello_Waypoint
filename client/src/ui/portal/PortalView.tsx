import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, request } from '../../api';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  Clock3,
  History,
  LogOut,
  MapPinned,
  Package,
  PackageCheck,
  PackageSearch,
  Search,
  Store,
  Truck,
  CircleUserRound,
  TriangleAlert,
} from 'lucide-react';
import type { Overview, User } from '@waypoint/contracts';
import { Brand } from '../components/Brand';
import { UniversalSearch, type SearchTarget } from './UniversalSearch';
import { WorkspaceSidebar, WorkspaceMobileNav, type NavItem } from '../components/WorkspaceNav';
const OrdersWorkspace = lazy(() =>
  import('../dispatcher/OrdersWorkspace').then((module) => ({ default: module.OrdersWorkspace })),
);
const PlanningWorkspace = lazy(() =>
  import('../dispatcher/PlanningWorkspace').then((module) => ({
    default: module.PlanningWorkspace,
  })),
);
const CatalogWorkspace = lazy(() =>
  import('../dispatcher/CatalogWorkspace').then((module) => ({
    default: module.CatalogWorkspace,
  })),
);
const RoleWorkspace = lazy(() =>
  import('../workflows/RoleWorkspace').then((module) => ({ default: module.RoleWorkspace })),
);

const brand = {
  DISPATCHER: 'DISPATCH',
  LOADER: 'LOADER',
  DRIVER: 'DRIVER',
  STORE_MANAGER: 'STORE',
};

function useColomboClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);
  const remaining = 16 * 3600 - ((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0));
  const cutoff =
    remaining > 0
      ? `Orders close in ${[Math.floor(remaining / 3600), Math.floor((remaining % 3600) / 60), remaining % 60].map((n) => String(n).padStart(2, '0')).join(':')}`
      : 'Order cutoff passed · Planning open';
  return {
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(now),
    cutoff,
  };
}

type Props = {
  user: User;
  overview?: Overview | undefined;
  isOverviewLoading: boolean;
  overviewError: string;
  logoutError: string;
  isLoggingOut: boolean;
  onLogout: () => void;
};
export function PortalView({ user, logoutError, isLoggingOut, onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const clock = useColomboClock();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.split('/')[2] || 'orders';
  const dispatcher = user.role === 'DISPATCHER';
  const store = user.role === 'STORE_MANAGER';
  const storeProfile = useQuery({
    queryKey: ['store', user.id, 'profile'],
    queryFn: api.catalog.profile,
    enabled: store,
  });
  const deferred = useQuery({
    queryKey: ['store', user.id, 'deferred-count'],
    queryFn: () => request<{ summary?: { deferred?: number } }>('/orders?limit=1&deferred=true'),
    enabled: store,
    refetchInterval: 30000,
  });
  const deferredCount = deferred.data?.summary?.deferred ?? 0;

  const loadsSummary = useQuery({
    queryKey: ['dispatcher', 'loads-summary'],
    queryFn: () =>
      request<{ items: { id: string; status: string; manifest_status?: string | null }[] }>(
        '/trips?limit=50',
      ),
    enabled: dispatcher,
    refetchInterval: 5000,
  });

  const hasLoads = (loadsSummary.data?.items?.length ?? 0) > 0 || tab === 'loads';
  const readyLoadsCount =
    loadsSummary.data?.items?.filter(
      (item) => item.manifest_status === 'COMPLETED' && item.status === 'PLANNED',
    ).length ?? 0;
  const inProgressLoadsCount =
    loadsSummary.data?.items?.filter(
      (item) => item.manifest_status === 'LOADING',
    ).length ?? 0;
  const activeLoadsCount =
    loadsSummary.data?.items?.filter(
      (item) => item.status === 'PLANNED',
    ).length ?? 0;

  const loadsBadgeColor: 'emerald' | 'amber' | 'primary' =
    readyLoadsCount > 0 ? 'emerald' : inProgressLoadsCount > 0 ? 'amber' : 'primary';

  const dispatcherNavigation: NavItem[] = [
    { path: 'orders', label: 'Live Orders', icon: ClipboardList, group: 'DISPATCH' },
    { path: 'deferred', label: 'Deferred Orders', icon: Clock3, group: 'DISPATCH' },
    { path: 'planning', label: 'Planning', icon: Boxes, group: 'DISPATCH' },
    ...(hasLoads
      ? [
          {
            path: 'loads',
            label: 'Loads',
            icon: PackageCheck,
            group: 'DISPATCH',
            isSubItem: true,
            badge:
              readyLoadsCount > 0
                ? readyLoadsCount
                : inProgressLoadsCount > 0
                  ? '•'
                  : activeLoadsCount > 0
                    ? activeLoadsCount
                    : null,
            badgeColor: loadsBadgeColor,
          },
        ]
      : []),
    { path: 'fleet', label: 'Fleet', icon: Truck, group: 'MANAGEMENT' },
    { path: 'stores', label: 'Stores', icon: Store, group: 'MANAGEMENT' },
    { path: 'tracker', label: 'Tracker', icon: MapPinned, group: 'MANAGEMENT' },
    { path: 'issues', label: 'Issues', icon: TriangleAlert, group: 'MANAGEMENT' },
    { path: 'catalog', label: 'Catalogue', icon: PackageSearch, group: 'MANAGEMENT' },
  ];

  const storeNavigation: NavItem[] = [
    { path: 'orders', label: 'Live Orders', icon: ClipboardList, group: 'ORDER MANAGEMENT' },
    {
      path: 'deferred',
      label: 'Deferred Orders',
      icon: Clock3,
      group: 'ORDER MANAGEMENT',
      badge: deferredCount > 0 ? deferredCount : null,
    },
    { path: 'history', label: 'Order History', icon: History, group: 'ORDER MANAGEMENT' },
    { path: 'items', label: 'Items', icon: Package, group: 'CATALOGUE' },
    { path: 'vehicles', label: 'Vehicles', icon: Truck, group: 'LOGISTICS' },
  ];
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface px-3 pb-3 sm:px-6 sm:pb-4 lg:px-7 lg:pb-5">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-control focus:bg-white focus:p-4"
      >
        Skip to workspace
      </a>
      <header className="relative flex shrink-0 min-h-20 sm:min-h-24 flex-wrap items-center justify-between gap-3 py-3 sm:py-5">
        <Brand
          context={brand[user.role]}
          contextClassName="max-sm:text-xs"
          wordClassName="max-sm:text-xl"
        />
        {store ? (
          <div className="hidden items-center gap-4 text-sm md:flex">
            <span className="font-medium">
              {storeProfile.data?.name ?? user.outletId} ·{' '}
              {storeProfile.data?.brand_name ?? 'Waypoint Store'}
            </span>
            {storeProfile.data && (
              <span className="rounded-full bg-[#cdeff0] px-5 py-1">
                {storeProfile.data.brand_id}
              </span>
            )}
          </div>
        ) : (
          <p className="hidden items-center gap-5 text-sm lg:flex">
            <span className="text-muted">Date</span>
            <time className="font-semibold">{clock.date}</time>
          </p>
        )}
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted xl:block">
            {store
              ? clock.cutoff.replace(
                  'Order cutoff passed · Planning open',
                  'After 4 PM · Next eligible run',
                )
              : clock.cutoff}
          </p>
          {store && (
            <button
              className="min-h-11 rounded-full bg-primary px-6 text-sm text-white"
              onClick={() => navigate('/store/create')}
            >
              Create Order
            </button>
          )}
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
            className="rounded-full p-2 text-muted hover:bg-border/40 hover:text-foreground focus-visible:outline-2"
          >
            <Search size={22} />
          </button>
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen(!accountOpen)}
            className="rounded-full p-2 text-muted hover:bg-border/40 hover:text-foreground focus-visible:outline-2"
          >
            <CircleUserRound size={26} />
          </button>
        </div>
        {accountOpen && (
          <div className="absolute right-0 top-20 z-30 w-72 rounded-card border border-border bg-white p-5 shadow-lg">
            <p className="font-semibold">{user.displayName}</p>
            <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
            <p className="mt-3 text-sm">{clock.date} · Sri Lanka</p>
            <button
              disabled={isLoggingOut}
              onClick={onLogout}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-white disabled:opacity-50"
            >
              <LogOut size={18} />
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </header>
      <UniversalSearch
        open={searchOpen}
        canSearchFleet={dispatcher}
        canSearchOrders={dispatcher || user.role === 'STORE_MANAGER'}
        onClose={() => setSearchOpen(false)}
        onSelect={(target: SearchTarget) => {
          setSearchOpen(false);
          if (dispatcher) {
            navigate(
              target.kind === 'order'
                ? `/dispatcher/orders/${target.id}`
                : target.kind === 'vehicle'
                  ? `/dispatcher/fleet?vehicleId=${encodeURIComponent(target.id)}`
                  : `/dispatcher/loads?loadId=${encodeURIComponent(target.id)}`,
            );
          } else if (target.kind === 'load') {
            navigate(
              user.role === 'LOADER'
                ? `/loader/loads?loadId=${encodeURIComponent(target.id)}`
                : `/driver/routes?loadId=${encodeURIComponent(target.id)}`,
            );
          } else if (target.kind === 'order' && user.role === 'STORE_MANAGER') {
            navigate(`/store/orders?orderId=${encodeURIComponent(target.id)}`);
          }
        }}
      />
      {logoutError && (
        <p
          role="alert"
          className="mb-3 shrink-0 rounded-control border border-red-200 bg-red-50 p-3 text-red-800"
        >
          {logoutError}
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-stretch gap-5 xl:gap-8 overflow-hidden">
        {(dispatcher || store) && (
          <WorkspaceSidebar
            items={store ? storeNavigation : dispatcherNavigation}
            basePath={store ? '/store' : '/dispatcher'}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            ariaLabel={store ? 'Store navigation' : 'Dispatcher navigation'}
            footer={
              store ? (
                <div>
                  <span className="font-semibold text-foreground/80">
                    {storeProfile.data?.name ?? user.outletId}
                  </span>
                  <br />
                  Store workspace
                </div>
              ) : (
                <div>
                  {user.authorizedDepots.join(' · ')}
                  <br />
                  Dispatch workspace
                </div>
              )
            }
          />
        )}
        <main
          id="workspace"
          className="min-w-0 flex-1 h-full overflow-hidden flex flex-col"
          tabIndex={-1}
        >
          {(dispatcher || store) && (
            <WorkspaceMobileNav
              items={store ? storeNavigation : dispatcherNavigation}
              basePath={store ? '/store' : '/dispatcher'}
              ariaLabel={store ? 'Mobile store navigation' : 'Mobile dispatcher navigation'}
            />
          )}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <Suspense
              fallback={
                <p
                  role="status"
                  className="rounded-card border border-border bg-white p-8 text-sm text-muted"
                >
                  Opening workspace…
                </p>
              }
            >
              {dispatcher ? (
                tab === 'orders' || tab === 'deferred' ? (
                  <OrdersWorkspace key={tab} user={user} deferred={tab === 'deferred'} />
                ) : tab === 'catalog' ? (
                  <CatalogWorkspace />
                ) : (
                  <PlanningWorkspace user={user} tab={tab} />
                )
              ) : store ? (
                <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
                  <RoleWorkspace user={user} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-2">
                  <RoleWorkspace user={user} />
                </div>
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
