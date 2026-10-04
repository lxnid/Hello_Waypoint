import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  Clock3,
  FileCode2,
  History,
  LogOut,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Truck,
  UserCircle,
  TriangleAlert,
} from 'lucide-react';
import type { Overview, User } from '@waypoint/contracts';
import { Brand } from '../components/Brand';
import { OrdersWorkspace } from '../dispatcher/OrdersWorkspace';
import { PlanningWorkspace } from '../dispatcher/PlanningWorkspace';
import { RoleWorkspace } from '../workflows/RoleWorkspace';

const brand = {
  DISPATCHER: 'DISPATCH',
  LOADER: 'LOADER',
  DRIVER: 'DRIVER',
  STORE_MANAGER: 'STORE',
};
const navigation = [
  { path: 'orders', label: 'Live Orders', icon: ClipboardList, group: 'DISPATCH' },
  { path: 'deferred', label: 'Deferred Orders', icon: Clock3, group: 'DISPATCH' },
  { path: 'planning', label: 'Planning', icon: Boxes, group: 'DISPATCH' },
  { path: 'fleet', label: 'Fleet', icon: Truck, group: 'MANAGEMENT' },
  { path: 'stores', label: 'Stores', icon: Store, group: 'MANAGEMENT' },
  { path: 'tracker', label: 'Tracker', icon: MapPinned, group: 'MANAGEMENT' },
  { path: 'issues', label: 'Issues', icon: TriangleAlert, group: 'MANAGEMENT' },
  { path: 'audit', label: 'Audit Trail', icon: History, group: 'MANAGEMENT' },
];

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
  const clock = useColomboClock();
  const location = useLocation();
  const tab = location.pathname.split('/')[2] || 'orders';
  const dispatcher = user.role === 'DISPATCHER';
  return (
    <div className="min-h-dvh bg-surface px-3 pb-5 sm:px-6 lg:px-7">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-control focus:bg-white focus:p-4"
      >
        Skip to workspace
      </a>
      <header className="relative flex min-h-24 flex-wrap items-center justify-between gap-3 py-5">
        <Brand
          context={brand[user.role]}
          contextClassName="max-sm:text-xs"
          wordClassName="max-sm:text-xl"
        />
        <p className="hidden items-center gap-5 text-sm lg:flex">
          <span className="text-muted">Date</span>
          <time className="font-semibold">{clock.date}</time>
        </p>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted xl:block">{clock.cutoff}</p>
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface hover:text-primary"
            title="Open Swagger API documentation at /docs"
          >
            <FileCode2 size={14} className="text-primary" />
            <span>API Docs (/docs)</span>
          </a>
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen(!accountOpen)}
            className="rounded-full p-2 hover:bg-border/40 focus-visible:outline-2"
          >
            <UserCircle size={24} />
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
      {logoutError && (
        <p
          role="alert"
          className="mb-4 rounded-control border border-red-200 bg-red-50 p-3 text-red-800"
        >
          {logoutError}
        </p>
      )}
      <div className="flex items-start gap-5 xl:gap-8">
        {dispatcher && (
          <aside
            className={`${collapsed ? 'w-16' : 'w-60 xl:w-64 2xl:w-72'} sticky top-5 hidden min-h-[calc(100dvh-116px)] shrink-0 flex-col rounded-card border border-border bg-white p-3 transition-[width] duration-200 md:flex`}
          >
            <button
              className={`mb-3 w-fit rounded-control p-2 text-muted hover:bg-surface ${collapsed ? 'mx-auto' : ''}`}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={24} /> : <PanelLeftClose size={24} />}
            </button>
            <nav aria-label="Dispatcher navigation">
              {navigation.map((item, index) => (
                <div key={item.path}>
                  {!collapsed && (index === 0 || item.group !== navigation[index - 1]?.group) && (
                    <p className={`${index > 0 ? 'mt-9' : 'mt-2'} mb-3 px-4 text-xs text-muted`}>
                      {item.group}
                    </p>
                  )}
                  <NavLink
                    to={`/dispatcher/${item.path}`}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      collapsed
                        ? `my-1.5 flex h-10 w-10 mx-auto items-center justify-center rounded-full transition-colors ${isActive ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface hover:text-primary'}`
                        : `my-1 flex min-h-12 items-center gap-3 rounded-control px-3.5 text-sm transition-colors ${isActive ? 'bg-primary text-white font-semibold shadow-sm' : 'text-primary/80 hover:bg-surface hover:text-primary'}`
                    }
                  >
                    <item.icon size={20} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </div>
              ))}
            </nav>
            {!collapsed && (
              <p className="mt-auto px-4 pt-10 text-xs leading-5 text-muted">
                {user.authorizedDepots.join(' · ')}
                <br />
                Dispatch workspace
              </p>
            )}
          </aside>
        )}
        <main id="workspace" className="min-w-0 flex-1" tabIndex={-1}>
          {dispatcher && (
            <nav
              aria-label="Mobile dispatcher navigation"
              className="mb-5 flex gap-2 overflow-x-auto rounded-card border border-border bg-white p-2 md:hidden"
            >
              {navigation.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/dispatcher/${item.path}`}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-2 rounded-control px-3 py-3 text-sm ${isActive ? 'bg-primary text-white' : ''}`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          {dispatcher ? (
            tab === 'orders' || tab === 'deferred' ? (
              <OrdersWorkspace key={tab} user={user} deferred={tab === 'deferred'} />
            ) : (
              <PlanningWorkspace user={user} tab={tab} />
            )
          ) : (
            <RoleWorkspace user={user} />
          )}
        </main>
      </div>
    </div>
  );
}
