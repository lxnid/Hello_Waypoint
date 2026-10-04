import { useState, useMemo } from 'react';
import { useSearchParams, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Truck,
  ArrowRight,
  Search,
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Boxes,
  UserCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { request } from '../../api';
import type { User } from '@waypoint/contracts';
import type { Context, PlanDetail, Reference, Trip, Vehicle } from './planning-types';
import { formatOrderId, formatLoadId, formatVehicleId } from '../utils/idFormatters';
import { LoadStatus } from '../components/LoadStatus';

type Props = {
  user: User;
  depot: string;
  context?: Context | null | undefined;
  detail?: PlanDetail | null | undefined;
  reference?: Reference | null | undefined;
  fleet?: Vehicle[] | undefined;
  busy: boolean;
  run: (path: string, body?: unknown, method?: string) => void;
};

export function LoadsReviewView({
  depot,
  context,
  detail,
  fleet = [],
  busy,
  run,
}: Props) {
  const [searchParams] = useSearchParams();
  const selectedLoadParam = searchParams.get('loadId');
  const [searchTerm, setSearchTerm] = useState(selectedLoadParam ?? '');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOADING' | 'COMPLETED' | 'READY' | 'DISPATCHED'>('ALL');
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});

  // Query all trips for this depot to ensure loads across plans are available
  const tripsQuery = useQuery({
    queryKey: ['dispatcher', 'loads-view-trips', depot, context?.operating_date],
    queryFn: () =>
      request<{ items: Trip[] }>(`/trips?limit=50&depot=${encodeURIComponent(depot)}`),
    refetchInterval: 5000,
  });

  // Combine trips from active plan detail and tripsQuery
  const allTrips: Trip[] = useMemo(() => {
    const map = new Map<string, Trip>();

    // Add plan trips first (richer stop data)
    for (const trip of detail?.trips ?? []) {
      map.set(trip.id, trip);
    }

    // Add any released trips from tripsQuery not in active plan
    for (const trip of tripsQuery.data?.items ?? []) {
      if (!map.has(trip.id)) {
        map.set(trip.id, trip);
      } else {
        // Merge in any manifest status or driver info
        const existing = map.get(trip.id)!;
        const updated: Trip = { ...existing };
        if (trip.manifest_status) updated.manifest_status = trip.manifest_status;
        if (trip.status) updated.status = trip.status;
        if (trip.driver_name) updated.driver_name = trip.driver_name;
        map.set(trip.id, updated);
      }
    }

    return Array.from(map.values());
  }, [detail?.trips, tripsQuery.data?.items]);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return allTrips.filter((trip) => {
      // Status filter
      if (statusFilter === 'LOADING' && trip.manifest_status !== 'LOADING') return false;
      if (statusFilter === 'COMPLETED' && trip.manifest_status !== 'COMPLETED') return false;
      if (statusFilter === 'READY' && !(trip.dispatch_ready && trip.status === 'PLANNED')) return false;
      if (statusFilter === 'DISPATCHED' && trip.status !== 'DISPATCHED') return false;

      // Text search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const loadFormatted = formatLoadId(trip.id).toLowerCase();
        const vehicleFormatted = formatVehicleId(trip.vehicle_id).toLowerCase();
        const driver = (trip.driver_name ?? trip.driver_id).toLowerCase();
        const loader = (trip.loader_name ?? '').toLowerCase();
        const hasOrder = trip.stops?.some((stop) => {
          const ref = (stop.public_reference ?? stop.order_id).toLowerCase();
          const outlet = (stop.outlet_name ?? '').toLowerCase();
          return ref.includes(term) || outlet.includes(term);
        });

        return (
          loadFormatted.includes(term) ||
          vehicleFormatted.includes(term) ||
          driver.includes(term) ||
          loader.includes(term) ||
          hasOrder
        );
      }

      return true;
    });
  }, [allTrips, statusFilter, searchTerm]);

  // Counts for KPIs
  const totalCount = allTrips.length;
  const inProgressCount = allTrips.filter((t) => t.manifest_status === 'LOADING').length;
  const completedCount = allTrips.filter((t) => t.manifest_status === 'COMPLETED').length;
  const readyCount = allTrips.filter((t) => t.dispatch_ready && t.status === 'PLANNED').length;
  const dispatchedCount = allTrips.filter((t) => t.status === 'DISPATCHED').length;

  const isDraftPlan = detail?.plan.status === 'DRAFT';

  function toggleStops(tripId: string) {
    setExpandedStops((prev) => ({ ...prev, [tripId]: !prev[tripId] }));
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden space-y-4 p-1.5">
      {/* Draft Plan Notice */}
      {isDraftPlan && (
        <div
          role="status"
          className="shrink-0 flex items-center justify-between gap-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-700 shrink-0" />
            <div>
              <strong>Current plan is in Draft.</strong> Staged loads below will appear on the loading dock once released.
            </div>
          </div>
          <NavLink
            to="/dispatcher/planning"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            Go to Planning <ArrowRight size={14} />
          </NavLink>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0 p-1">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`flex flex-col rounded-card border p-4 text-left transition ${
            statusFilter === 'ALL'
              ? 'border-primary bg-primary/5 ring-1 ring-inset ring-primary'
              : 'border-border bg-white hover:bg-surface'
          }`}
        >
          <span className="text-xs font-medium text-muted">Total Loads</span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-foreground">{totalCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('LOADING')}
          className={`flex flex-col rounded-card border p-4 text-left transition ${
            statusFilter === 'LOADING'
              ? 'border-primary bg-primary/5 ring-1 ring-inset ring-primary'
              : 'border-border bg-white hover:bg-surface'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            {inProgressCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
            Loading in Progress
          </div>
          <span className="mt-1 text-2xl font-bold tracking-tight text-amber-800">{inProgressCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('COMPLETED')}
          className={`flex flex-col rounded-card border p-4 text-left transition ${
            statusFilter === 'COMPLETED'
              ? 'border-primary bg-primary/5 ring-1 ring-inset ring-primary'
              : 'border-border bg-white hover:bg-surface'
          }`}
        >
          <span className="text-xs font-medium text-emerald-700">Loaded & Signed</span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-emerald-800">{completedCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('READY')}
          className={`flex flex-col rounded-card border p-4 text-left transition ${
            statusFilter === 'READY'
              ? 'border-primary bg-primary/5 ring-1 ring-inset ring-primary'
              : 'border-border bg-white hover:bg-surface'
          }`}
        >
          <span className="text-xs font-medium text-primary">Ready to Dispatch</span>
          <span className="mt-1 text-2xl font-bold tracking-tight text-primary">{readyCount}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'LOADING', 'COMPLETED', 'READY', 'DISPATCHED'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                statusFilter === filter
                  ? 'bg-primary text-white shadow-xs'
                  : 'border border-border bg-white text-muted hover:bg-surface hover:text-foreground'
              }`}
            >
              {filter === 'ALL'
                ? 'All'
                : filter === 'LOADING'
                  ? 'In Loading'
                  : filter === 'COMPLETED'
                    ? 'Loading Complete'
                    : filter === 'READY'
                      ? 'Ready to Dispatch'
                      : 'Dispatched'}
            </button>
          ))}
        </div>

        <div className="relative w-full max-w-xs sm:w-auto">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search load, vehicle, order…"
            className="min-h-10 w-full rounded-control border border-border bg-white pl-9 pr-4 text-xs outline-none focus:border-primary"
            aria-label="Search loads"
          />
        </div>
      </div>

      {/* Loads List Container */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-1">
        {filteredTrips.map((trip) => {
          const loadId = formatLoadId(trip.id);
          const vehicleId = formatVehicleId(trip.vehicle_id);
          const vehicle = fleet.find((v) => v.id === trip.vehicle_id);
          const isExpanded = !!expandedStops[trip.id];
          const stopsCount = trip.stops?.length ?? 0;
          const isLoaded = trip.manifest_status === 'COMPLETED';
          const isLoading = trip.manifest_status === 'LOADING';
          const isDispatched = trip.status === 'DISPATCHED';
          const isPlanned = trip.status === 'PLANNED';
          const isHighlighted = selectedLoadParam && trip.id.includes(selectedLoadParam);

          return (
            <article
              key={trip.id}
              className={`rounded-card border bg-white p-5 transition-shadow hover:shadow-sm ${
                isHighlighted ? 'border-primary ring-2 ring-primary/20' : 'border-border'
              }`}
            >
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-bold text-primary">{loadId}</h2>
                    <LoadStatus
                      status={trip.status}
                      manifestStatus={trip.manifest_status}
                      draft={isDraftPlan}
                    />
                    {isLoaded && isPlanned && trip.dispatch_ready && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                        <CheckCircle2 size={13} /> Ready to Dispatch
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      Vehicle: <strong className="font-medium text-foreground">{vehicleId}</strong>
                    </span>
                    <span>·</span>
                    <span>Trip {trip.trip_number}</span>
                    <span>·</span>
                    <span>
                      Driver: <strong className="font-medium text-foreground">{trip.driver_name ?? trip.driver_id}</strong>
                    </span>
                    {vehicle && (
                      <>
                        <span>·</span>
                        <span className="uppercase">{vehicle.temp}</span>
                        <span>·</span>
                        <span>
                          Cap: {vehicle.volume_cap_m3 ?? '—'} m³ / {vehicle.weight_cap_kg ?? '—'} kg
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Assignee / Loader Section */}
                <div className="rounded-control bg-surface px-4 py-2 text-right">
                  <span className="text-[11px] font-medium text-muted block uppercase tracking-wider">
                    Dock Assignee
                  </span>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    {trip.loader_name ? (
                      <>
                        <UserCheck size={16} className="text-emerald-600 shrink-0" />
                        <span className="text-sm font-semibold text-primary">{trip.loader_name}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted">Depot loader pool</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress & Stops Summary */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleStops(trip.id)}
                    className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>
                      {stopsCount} {stopsCount === 1 ? 'Order' : 'Orders'} in this load
                    </span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  <div className="text-xs text-muted">
                    {isLoaded ? (
                      <span className="text-emerald-700 font-medium">All cargo staged & confirmed on dock</span>
                    ) : isLoading ? (
                      <span className="text-amber-700 font-medium">Loader verifying items at dock…</span>
                    ) : (
                      <span>Awaiting dock loading</span>
                    )}
                  </div>
                </div>

                {/* Stops List */}
                {isExpanded && trip.stops && (
                  <div className="mt-3 space-y-2 rounded-control bg-surface p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Consignment Staging Sequence
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {trip.stops.map((stop, idx) => {
                        const orderRef = formatOrderId(stop.public_reference, stop.order_id);
                        return (
                          <div
                            key={stop.id}
                            className="flex items-start justify-between gap-2 rounded-card border border-border bg-white p-3 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-primary">{orderRef}</span>
                              <p className="mt-0.5 text-muted">{stop.outlet_name ?? 'Waypoint Outlet'}</p>
                            </div>
                            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted shrink-0">
                              #{idx + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Bar & Clearances */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div className="text-xs">
                  {isPlanned && isLoaded && !trip.dispatch_ready && trip.dispatch_block_reason && (
                    <div className="flex items-center gap-2 rounded-control border border-amber-200 bg-amber-50 px-3.5 py-2 text-amber-900">
                      <AlertCircle size={16} className="text-amber-700 shrink-0" />
                      <span>{trip.dispatch_block_reason}</span>
                    </div>
                  )}
                  {isPlanned && isLoading && (
                    <span className="text-muted">
                      Loading in progress. Dispatch will unlock once loader signs the manifest.
                    </span>
                  )}
                  {isPlanned && !isLoading && !isLoaded && (
                    <span className="text-muted">
                      Waiting for warehouse dock loader to begin loading.
                    </span>
                  )}
                  {isDispatched && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                      <Truck size={16} /> Vehicle dispatched and en route.
                    </span>
                  )}
                </div>

                {isPlanned && !isDraftPlan && (
                  <button
                    type="button"
                    disabled={busy || !isLoaded || !trip.dispatch_ready}
                    onClick={() => run(`/trips/${trip.id}/depart`)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted"
                  >
                    <Truck size={18} />
                    {isLoaded ? 'Dispatch Load' : 'Awaiting Load Sign-off'}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {filteredTrips.length === 0 && (
          <div className="rounded-card border border-border bg-white p-12 text-center">
            <Boxes size={40} className="mx-auto text-muted mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-foreground">No loads match your criteria</h3>
            <p className="mt-1 text-sm text-muted">
              {allTrips.length === 0
                ? `No loads have been created yet for depot ${depot}.`
                : 'Try adjusting your search terms or filter selection.'}
            </p>
            {allTrips.length === 0 && (
              <NavLink
                to="/dispatcher/planning"
                className="mt-4 inline-flex items-center gap-2 rounded-control bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
              >
                <PackageCheck size={18} /> Go to Planning to Create Loads
              </NavLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
