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
import { ICON_SIZE } from '../icons';

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

const TONE_BG: Record<'chilled' | 'ambient' | 'textile', string> = {
  chilled: 'bg-chilled',
  ambient: 'bg-ambient',
  textile: 'bg-textile',
};

function MetricCard({ icon: Icon, label, value, tone, isLoading = false }: MetricCardProps) {
  return (
    <article
      className="flex items-start gap-[15px] min-h-[150px] min-[1500px]:min-h-[168px] max-[760px]:min-h-[116px] p-[22px] min-[1500px]:p-[26px] bg-white border border-border rounded-card"
      data-tone={tone}
    >
      <div className={`grid shrink-0 place-items-center w-11 h-11 rounded-[14px] ${TONE_BG[tone]}`}>
        <Icon size={ICON_SIZE.card} aria-hidden="true" />
      </div>
      <div>
        <p className="mt-[3px] mb-3 text-muted text-[11px]">{label}</p>
        {isLoading ? (
          <span className="block w-[100px] h-[22px] bg-[#ececec] rounded-full" />
        ) : (
          <strong className="block text-lg font-semibold leading-[1.25]">{value}</strong>
        )}
      </div>
    </article>
  );
}

function Sidebar({ role }: { role: Role }) {
  const RoleIcon = ROLE_PRESENTATION[role].icon;
  return (
    <aside className="sticky top-0 flex flex-col h-[100dvh] pt-[30px] px-5 pb-6 text-white bg-primary min-[1500px]:px-6 max-[1080px]:hidden">
      <Brand context="OPERATIONS" inverse contextClassName="max-[1100px]:hidden" />
      <nav aria-label="Workspace navigation" className="mt-[72px]">
        <p className="mx-3.5 mb-3 text-[#858585] text-[11px]">WORKSPACE</p>
        <a
          className="flex items-center gap-3 min-h-[48px] px-3.5 rounded-[14px] text-sm no-underline text-primary bg-white"
          data-active="true"
          href="./"
        >
          <RoleIcon size={ICON_SIZE.nav} aria-hidden="true" />
          <span>{ROLE_LABEL[role]}</span>
        </a>
        <a
          className="flex items-center gap-3 min-h-[48px] px-3.5 rounded-[14px] text-sm no-underline text-[#bcbcbc] hover:text-white"
          href="/docs"
          target="_blank"
          rel="noreferrer"
        >
          <FileText size={ICON_SIZE.nav} aria-hidden="true" />
          <span>API reference</span>
        </a>
      </nav>
      <div className="flex items-center gap-[11px] mt-auto py-4 px-3 text-white border border-[#333333] rounded-2xl">
        <span aria-hidden="true" className="shrink-0 w-[9px] h-[9px] bg-ambient rounded-full" />
        <div>
          <strong className="block mb-[3px] text-xs font-bold">Foundation online</strong>
          <small className="block text-[#919191] text-[10px]">Stage 1 · Connected</small>
        </div>
      </div>
    </aside>
  );
}

function MobileNavigation({ role }: { role: Role }) {
  const RoleIcon = ROLE_PRESENTATION[role].icon;
  return (
    <nav
      className="hidden min-[761px]:max-[1080px]:sticky min-[761px]:max-[1080px]:bottom-0 min-[761px]:max-[1080px]:grid min-[761px]:max-[1080px]:grid-cols-[repeat(2,minmax(0,220px))] min-[761px]:max-[1080px]:justify-center min-[761px]:max-[1080px]:gap-2.5 min-[761px]:max-[1080px]:py-2.5 min-[761px]:max-[1080px]:px-7 min-[761px]:max-[1080px]:pb-[max(10px,env(safe-area-inset-bottom))] min-[761px]:max-[1080px]:bg-white min-[761px]:max-[1080px]:border-t min-[761px]:max-[1080px]:border-border max-[760px]:sticky max-[760px]:bottom-0 max-[760px]:grid max-[760px]:grid-cols-2 max-[760px]:py-2 max-[760px]:px-4 max-[760px]:pb-[max(8px,env(safe-area-inset-bottom))] max-[760px]:bg-white max-[760px]:border-t max-[760px]:border-border"
      aria-label="Mobile workspace navigation"
    >
      <a
        data-active="true"
        href="./"
        className="flex items-center justify-center gap-2 min-[761px]:max-[1080px]:min-h-[50px] min-[761px]:max-[1080px]:text-xs max-[760px]:gap-[7px] max-[760px]:min-h-[48px] max-[760px]:text-[11px] rounded-[14px] no-underline text-primary bg-chilled"
      >
        <RoleIcon size={ICON_SIZE.nav} aria-hidden="true" />
        <span>Workspace</span>
      </a>
      <a
        href="/docs"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 min-[761px]:max-[1080px]:min-h-[50px] min-[761px]:max-[1080px]:text-xs max-[760px]:gap-[7px] max-[760px]:min-h-[48px] max-[760px]:text-[11px] rounded-[14px] no-underline text-muted hover:text-primary"
      >
        <FileText size={ICON_SIZE.nav} aria-hidden="true" />
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
    <div className="min-h-[100dvh] bg-surface grid grid-cols-[264px_minmax(0,1fr)] max-[1100px]:grid-cols-[220px_minmax(0,1fr)] min-[1500px]:grid-cols-[292px_minmax(0,1fr)] max-[1080px]:block">
      <Sidebar role={user.role} />
      <div className="min-w-0">
        <header className="flex items-center justify-between min-h-[80px] py-3 px-[clamp(32px,4vw,64px)] bg-white border-b border-border max-[1100px]:px-7 min-[761px]:max-[1080px]:grid min-[761px]:max-[1080px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[761px]:max-[1080px]:gap-[18px] min-[761px]:max-[1080px]:min-h-[82px] min-[761px]:max-[1080px]:py-4 min-[761px]:max-[1080px]:px-7 max-[760px]:grid max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-4 max-[760px]:min-h-[76px] max-[760px]:py-3.5 max-[760px]:px-5">
          <div className="hidden max-[1080px]:block">
            <Brand
              context="OPERATIONS"
              wordClassName="max-[760px]:text-[18px]"
              contextClassName="max-[760px]:text-[12px]"
            />
          </div>
          <div className="inline-flex items-center gap-[9px] min-h-[38px] px-3.5 text-[#555555] bg-surface border border-border rounded-full text-xs max-[760px]:hidden">
            <MapPinned size={ICON_SIZE.chip} aria-hidden="true" />
            <span>{locationLabel}</span>
          </div>
          <div className="flex items-center gap-[22px] max-[760px]:gap-0">
            <div className="text-right max-[760px]:hidden">
              <strong className="block mb-[3px] text-[13px] font-semibold">
                {user.displayName}
              </strong>
              <span className="block text-muted text-[11px]">{ROLE_LABEL[user.role]}</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isLoggingOut}
              onClick={onLogout}
              icon={<LogOut size={ICON_SIZE.action} aria-hidden="true" />}
              className="min-h-[42px] px-[15px] text-xs max-[760px]:w-[44px] max-[760px]:min-h-[44px] max-[760px]:p-0 max-[760px]:[&>span]:hidden"
            >
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        <main className="w-[min(100%,1480px)] mx-auto p-[clamp(36px,4vw,64px)] max-[1100px]:px-7 min-[761px]:max-[1080px]:pt-10 min-[761px]:max-[1080px]:px-7 min-[761px]:max-[1080px]:pb-24 max-[760px]:pt-7 max-[760px]:px-5 max-[760px]:pb-9">
          {logoutError ? (
            <p
              className="mb-[22px] py-3 px-3.5 text-[#9e1018] bg-[#fff0f0] border border-[#ffc7ca] rounded-xl text-[13px] leading-[1.45]"
              role="alert"
            >
              {logoutError}
            </p>
          ) : null}
          <div className="flex items-center gap-2 mb-[50px] min-[761px]:max-[1080px]:mb-[42px] max-[760px]:mb-9 text-[#999999] text-[11px] [&>strong]:text-[#5f5f5f] [&>strong]:font-medium">
            <LayoutDashboard size={ICON_SIZE.inline} aria-hidden="true" />
            <span>Waypoint</span>
            <span aria-hidden="true">/</span>
            <strong>{ROLE_LABEL[user.role]}</strong>
          </div>

          <section className="flex items-end justify-between gap-8 min-[761px]:max-[1080px]:flex-col min-[761px]:max-[1080px]:items-start min-[761px]:max-[1080px]:gap-6 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-[22px]">
            <div className="max-w-[720px]">
              <p className="mb-3 text-muted text-xs font-semibold leading-[1.4]">
                {presentation.eyebrow}
              </p>
              <h1 className="mb-3.5 text-[clamp(38px,5vw,64px)] min-[761px]:max-[1080px]:max-w-[680px] min-[761px]:max-[1080px]:text-[52px] max-[760px]:text-[42px] max-[390px]:text-[36px] font-[650] leading-[1.03] text-balance">
                {presentation.heading}
              </h1>
              <p className="max-w-[590px] mb-0 text-muted text-base leading-[1.55] text-pretty">
                {presentation.description}
              </p>
            </div>
            <span className="shrink-0 py-[9px] px-[13px] text-[#275f34] bg-ambient rounded-full text-[10px] font-bold">
              STAGE 1 READY
            </span>
          </section>

          <section
            className="grid grid-cols-4 max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1 gap-4 min-[1500px]:gap-5 mt-11 max-[760px]:mt-[34px]"
            aria-label="Workspace summary"
          >
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

          <section className="grid items-center mt-5 p-6 bg-white border border-border rounded-card gap-7 max-[760px]:gap-[22px] grid-cols-[220px_minmax(0,1fr)_auto] max-[1100px]:grid-cols-[180px_minmax(0,1fr)] min-[761px]:max-[1080px]:grid-cols-[minmax(160px,220px)_minmax(0,1fr)] max-[760px]:grid-cols-1">
            <div
              className="flex items-center justify-center min-h-[110px] max-[760px]:min-h-[96px] p-5 bg-fragile rounded-2xl"
              aria-hidden="true"
            >
              <Route size={ICON_SIZE.display} aria-hidden="true" />
              <span className="w-6 h-px mx-2 bg-[#bdb7af]" />
              <Boxes size={ICON_SIZE.display} aria-hidden="true" />
              <span className="w-6 h-px mx-2 bg-[#bdb7af]" />
              <Truck size={ICON_SIZE.display} aria-hidden="true" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold leading-[1.4] text-muted">
                FOUNDATION CONNECTED
              </p>
              <h2 className="mb-[7px] text-2xl font-semibold">
                Your operational workspace is ready.
              </h2>
              <p className="mb-0 text-muted text-[13px] leading-[1.5]">{presentation.nextStep}</p>
            </div>
            <a
              className="inline-flex items-center gap-2 py-3 text-[13px] font-semibold no-underline whitespace-nowrap text-primary hover:opacity-80 transition-opacity max-[1100px]:col-start-2 max-[1100px]:justify-self-start max-[1100px]:p-0 max-[760px]:col-start-1"
              href="/docs"
              target="_blank"
              rel="noreferrer"
            >
              View API documentation <ArrowUpRight size={ICON_SIZE.action} aria-hidden="true" />
            </a>
          </section>
        </main>
        <MobileNavigation role={user.role} />
      </div>
    </div>
  );
}
