import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Boxes,
  Building2,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PackageCheck,
  Route,
  Truck,
} from 'lucide-react';
import type { Overview, User } from '@waypoint/contracts';
import { ROLE_LABEL, type Role } from '@waypoint/contracts/roles';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';

type RolePresentation = {
  icon: LucideIcon;
  eyebrow: string;
  heading: string;
  description: string;
  nextStep: string;
};

const ROLE_PRESENTATION: Record<Role, RolePresentation> = {
  DISPATCHER: {
    icon: ClipboardList,
    eyebrow: 'DISPATCH CONTROL',
    heading: 'Plan with the full picture.',
    description: 'Your delivery network and vehicle reference data are connected and ready.',
    nextStep: 'Order planning and allocation arrive in the next operational stage.',
  },
  LOADER: {
    icon: PackageCheck,
    eyebrow: 'LOADING CONTROL',
    heading: 'Prepare every load with clarity.',
    description: 'Your depot, vehicle reference data, and secure loader access are connected.',
    nextStep: 'Load sequencing and verification arrive in the next operational stage.',
  },
  DRIVER: {
    icon: Truck,
    eyebrow: 'DELIVERY CONTROL',
    heading: 'Keep every stop on course.',
    description: 'Your driver identity, depot, and delivery workspace are securely connected.',
    nextStep: 'Assigned routes and delivery confirmation arrive in the next operational stage.',
  },
  STORE_MANAGER: {
    icon: Building2,
    eyebrow: 'STORE CONTROL',
    heading: 'Stay ready for every arrival.',
    description: 'Your outlet identity and secure store workspace are connected.',
    nextStep: 'Ordering, tracking, and receipt confirmation arrive in the next operational stage.',
  },
};

type PortalViewProps = {
  user: User;
  overview: Overview | undefined;
  isOverviewLoading: boolean;
  overviewError: string;
  logoutError: string;
  isLoggingOut: boolean;
  onLogout: () => void;
};

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'chilled' | 'ambient' | 'textile';
  isLoading?: boolean;
};

function MetricCard({ icon: Icon, label, value, tone, isLoading = false }: MetricCardProps) {
  return (
    <article className="metric-card" data-tone={tone}>
      <div className="metric-icon">
        <Icon size={21} aria-hidden="true" />
      </div>
      <div>
        <p>{label}</p>
        {isLoading ? <span className="metric-skeleton" /> : <strong>{value}</strong>}
      </div>
    </article>
  );
}

function Sidebar({ role }: { role: Role }) {
  const RoleIcon = ROLE_PRESENTATION[role].icon;
  return (
    <aside className="portal-sidebar">
      <Brand context="OPERATIONS" inverse />
      <nav aria-label="Workspace navigation">
        <p className="nav-caption">WORKSPACE</p>
        <a className="nav-item" data-active="true" href="./">
          <RoleIcon size={19} aria-hidden="true" />
          <span>{ROLE_LABEL[role]}</span>
        </a>
        <a className="nav-item" href="/docs" target="_blank" rel="noreferrer">
          <FileText size={19} aria-hidden="true" />
          <span>API reference</span>
        </a>
      </nav>
      <div className="system-status">
        <span aria-hidden="true" />
        <div>
          <strong>Foundation online</strong>
          <small>Stage 1 · Connected</small>
        </div>
      </div>
    </aside>
  );
}

function MobileNavigation({ role }: { role: Role }) {
  const RoleIcon = ROLE_PRESENTATION[role].icon;
  return (
    <nav className="mobile-navigation" aria-label="Mobile workspace navigation">
      <a data-active="true" href="./">
        <RoleIcon size={20} aria-hidden="true" />
        <span>Workspace</span>
      </a>
      <a href="/docs" target="_blank" rel="noreferrer">
        <FileText size={20} aria-hidden="true" />
        <span>API</span>
      </a>
    </nav>
  );
}

export function PortalView({
  user,
  overview,
  isOverviewLoading,
  overviewError,
  logoutError,
  isLoggingOut,
  onLogout,
}: PortalViewProps) {
  const presentation = ROLE_PRESENTATION[user.role];
  const RoleIcon = presentation.icon;
  const locationLabel =
    user.outletId ?? (user.role === 'DISPATCHER' ? 'Both depots' : `${user.depot} depot`);
  const scopeValue = overviewError
    ? 'Unavailable'
    : user.role === 'STORE_MANAGER'
      ? `${overview?.outletCount ?? 0} outlet`
      : `${overview?.outletCount ?? 0} outlets`;
  const fleetValue = overviewError ? 'Unavailable' : `${overview?.vehicleCount ?? 0} vehicles`;

  return (
    <div className="portal-shell">
      <Sidebar role={user.role} />
      <div className="portal-workspace">
        <header className="portal-topbar">
          <div className="mobile-portal-brand">
            <Brand context="OPERATIONS" />
          </div>
          <div className="location-chip">
            <MapPinned size={17} aria-hidden="true" />
            <span>{locationLabel}</span>
          </div>
          <div className="account-actions">
            <div className="account-copy">
              <strong>{user.displayName}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isLoggingOut}
              onClick={onLogout}
              icon={<LogOut size={17} aria-hidden="true" />}
            >
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        <main className="portal-content">
          {logoutError ? (
            <p className="page-alert" role="alert">
              {logoutError}
            </p>
          ) : null}
          <div className="breadcrumb">
            <LayoutDashboard size={15} aria-hidden="true" />
            <span>Waypoint</span>
            <span aria-hidden="true">/</span>
            <strong>{ROLE_LABEL[user.role]}</strong>
          </div>

          <section className="hero-row">
            <div>
              <p className="caption">{presentation.eyebrow}</p>
              <h1>{presentation.heading}</h1>
              <p>{presentation.description}</p>
            </div>
            <span className="stage-chip">STAGE 1 READY</span>
          </section>

          <section className="metric-grid" aria-label="Workspace summary">
            <MetricCard
              icon={RoleIcon}
              label="Active role"
              value={ROLE_LABEL[user.role]}
              tone="chilled"
            />
            <MetricCard
              icon={MapPinned}
              label="Your location"
              value={locationLabel}
              tone="ambient"
            />
            <MetricCard
              icon={Database}
              label="Reference scope"
              value={scopeValue}
              tone="textile"
              isLoading={isOverviewLoading}
            />
            <MetricCard
              icon={Truck}
              label="Available fleet"
              value={fleetValue}
              tone="chilled"
              isLoading={isOverviewLoading}
            />
          </section>

          <section className="foundation-card">
            <div className="foundation-visual" aria-hidden="true">
              <Route size={30} />
              <span />
              <Boxes size={30} />
              <span />
              <Truck size={30} />
            </div>
            <div className="foundation-copy">
              <p className="caption">FOUNDATION CONNECTED</p>
              <h2>Your operational workspace is ready.</h2>
              <p>{presentation.nextStep}</p>
            </div>
            <a className="docs-link" href="/docs" target="_blank" rel="noreferrer">
              View API documentation <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </section>
        </main>
        <MobileNavigation role={user.role} />
      </div>
    </div>
  );
}
