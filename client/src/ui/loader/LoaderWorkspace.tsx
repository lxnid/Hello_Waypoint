import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  AlertCircle,
  Check,
  CheckCircle2,
  RefreshCw,
  PackageCheck,
  Boxes,
  Search,
} from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { request } from '../../api';

type Trip = {
  id: string;
  depot_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_number: number;
  operating_date: string;
  status: string;
  manifest_status?: string | null;
  stops_count?: number;
  orders_count?: number;
  created_at?: string;
};

type Stop = {
  id: string;
  trip_id: string;
  order_id: string;
  sequence: number;
  outlet_name?: string;
  public_reference?: string;
  planned_arrival_at: string;
  actual_arrival_at?: string | null;
  loaded_quantity?: number | null;
  temperature_requirement?: string;
  window_close_at?: string;
  lines?: OrderLine[];
  aggregate?: { units: number; weight_kg: string; volume_m3: string } | null;
  load?: { confirmed_at: string } | null;
  dock_damaged_quantity?: number | null;
};

type TripDetail = {
  trip: Trip;
  stops: Stop[];
  manifest: { id: string; status: string; signed_at?: string | null } | null;
};

type OrderLine = {
  id: string;
  sku?: string;
  name?: string;
  product_name?: string;
  quantity: number;
  temperature_requirement?: string;
};

type OrderDetail = {
  order: {
    id: string;
    public_reference: string;
    temperature_requirement: string;
    status: string;
    requested_date: string;
  };
  outlet?: {
    name?: string;
    window_open_time?: string;
    window_close_time?: string;
    dock_type?: string;
  };
  lines: OrderLine[];
  aggregate?: { units: number; weight_kg: string; volume_m3: string } | null;
};

function humanize(val?: string | null) {
  if (!val) return '—';
  return val
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function CategoryBadge({ value }: { value?: string }) {
  const cat = (value || 'AMBIENT').toUpperCase();
  const bg =
    cat.includes('CHILL') || cat.includes('REEF')
      ? 'bg-chilled text-[#094751]'
      : cat.includes('TEXTILE')
        ? 'bg-textile text-[#3b2d66]'
        : cat.includes('FRAGILE')
          ? 'bg-fragile text-[#5b4d32]'
          : 'bg-ambient text-[#1b5323]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-3.5 py-1 text-xs font-semibold ${bg}`}
    >
      {humanize(value)}
    </span>
  );
}

const LOAD_STEPS = ['To-do', 'Started', 'Finished'] as const;

function LoadStatusSlider({ status }: { status: string | null | undefined }) {
  const active = status === 'COMPLETED' ? 2 : status === 'LOADING' ? 1 : 0;
  return (
    <div
      role="img"
      aria-label={`Loading status: ${LOAD_STEPS[active]}`}
      className="relative grid w-full max-w-[17rem] grid-cols-3 rounded-full border border-border bg-surface p-0.5 text-[11px] font-medium"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-primary transition-transform duration-200"
        style={{ transform: `translateX(${active * 100}%)` }}
      />
      {LOAD_STEPS.map((step, index) => (
        <span
          key={step}
          className={`relative z-10 py-1 text-center transition-colors ${
            index === active ? 'text-white' : 'text-muted'
          }`}
        >
          {step}
        </span>
      ))}
    </div>
  );
}

export function LoaderWorkspace({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [search, setSearch] = useState('');
  const [temperatures, setTemperatures] = useState<Record<string, string>>({});

  // Query trips for loader
  const tripsQuery = useQuery({
    queryKey: ['loader', 'trips', user.depot],
    queryFn: () => request<{ items: Trip[] }>(`/trips?limit=50`),
    refetchInterval: 15000,
  });

  // Query details of selected trip
  const tripDetailQuery = useQuery({
    queryKey: ['loader', 'trip', selectedTripId],
    queryFn: () => request<TripDetail>(`/trips/${selectedTripId}`),
    enabled: !!selectedTripId,
  });

  // Sign loading manifest mutation
  const signManifestMutation = useMutation({
    mutationFn: (tripId: string) =>
      request<{ tripId: string; status: string }>(`/trips/${tripId}/sign-load`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loader'] });
    },
  });

  // Start loading mutation: marks the load as LOADING for the dispatcher dashboard
  const startLoadingMutation = useMutation({
    mutationFn: (tripId: string) =>
      request<{ tripId: string; status: string }>(`/trips/${tripId}/start-load`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loader'] });
    },
  });

  const trips = tripsQuery.data?.items ?? [];

  // View routing inside Loader
  if (activeStop && selectedTripId) {
    return (
      <ChecklistReportingView
        user={user}
        stop={activeStop}
        tripId={selectedTripId}
        temperature={temperatures[selectedTripId] ?? ''}
        onBack={() => setActiveStop(null)}
      />
    );
  }

  if (selectedTripId && tripDetailQuery.data) {
    return (
      <LoadDetailsView
        user={user}
        tripDetail={tripDetailQuery.data}
        availableTrips={trips}
        onSelectTrip={setSelectedTripId}
        onOpenStopChecklist={setActiveStop}
        onBack={() => setSelectedTripId(null)}
        isSigning={signManifestMutation.isPending}
        signError={signManifestMutation.error?.message ?? startLoadingMutation.error?.message ?? ''}
        temperature={temperatures[selectedTripId] ?? ''}
        onTemperatureChange={(value) =>
          setTemperatures((prev) => ({ ...prev, [selectedTripId]: value }))
        }
        isStarting={startLoadingMutation.isPending}
        onStartLoading={() => startLoadingMutation.mutate(selectedTripId)}
        onSignManifest={() => signManifestMutation.mutate(selectedTripId)}
      />
    );
  }

  // 1. Assigned Loads View
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Assigned Loads</h1>
          <p className="mt-1 text-sm text-muted">
            Warehouse dock · {user.depot ?? 'Central'} depot · Sequence loading from last to first
          </p>
        </div>
        <div className="relative w-full max-w-xs sm:w-auto">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search load, vehicle…"
            className="min-h-11 w-full rounded-control border border-border bg-white pl-10 pr-4 text-sm outline-none focus:border-primary"
            aria-label="Search loads"
          />
        </div>
      </div>

      {tripsQuery.isPending && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-card border border-border bg-white/60"
            />
          ))}
        </div>
      )}

      {tripsQuery.error && (
        <div className="rounded-card border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Unable to load assigned loads</p>
          <button
            onClick={() => void tripsQuery.refetch()}
            className="mt-2 inline-flex items-center gap-1.5 underline"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {!tripsQuery.isPending && trips.length === 0 && (
        <div className="rounded-card border border-dashed border-border bg-white/50 py-16 text-center">
          <Boxes size={36} className="mx-auto mb-3 text-muted" />
          <h2 className="text-base font-medium">No assigned loads right now</h2>
          <p className="mt-1 text-sm text-muted">
            New loads will appear here once the dispatcher releases an operational delivery plan.
          </p>
        </div>
      )}

      {trips.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-sm">
          {/* Table Header */}
          <div
            className="hidden grid-cols-[1.2fr_2fr_1.5fr_1fr_1fr_1fr] items-center gap-4 border-b border-border/80 px-6 py-4 text-xs font-semibold text-muted lg:grid"
            aria-hidden="true"
          >
            <span>Load ID</span>
            <span>Store Name</span>
            <span>Window</span>
            <span>Order Type</span>
            <span>Load Size</span>
            <span className="text-right">Loading</span>
          </div>

          <div className="divide-y divide-border/60">
            {[...trips]
              .sort(
                (a, b) =>
                  Number(a.manifest_status === 'COMPLETED') -
                  Number(b.manifest_status === 'COMPLETED'),
              )
              .filter((trip) => {
                if (!search) return true;
                const q = search.toLowerCase();
                return (
                  trip.id.toLowerCase().includes(q) || trip.vehicle_id.toLowerCase().includes(q)
                );
              })
              .map((trip) => {
                const loadId = `LDS-${trip.id.slice(0, 4).toUpperCase()}`;
                return (
                  <div
                    key={trip.id}
                    onClick={() => setSelectedTripId(trip.id)}
                    className="grid cursor-pointer grid-cols-2 items-center gap-4 p-5 transition-colors hover:bg-surface/60 lg:grid-cols-[1.2fr_2fr_1.5fr_1fr_1fr_1fr] lg:px-6 lg:py-5"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelectedTripId(trip.id);
                    }}
                  >
                    <div>
                      <span className="font-semibold tracking-wide text-primary">{loadId}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {trip.vehicle_id} · Trip {trip.trip_number}
                      </span>
                    </div>

                    <div className="text-sm font-medium text-primary">
                      {trip.depot_id} Dispatch Route
                      <span className="block text-xs font-normal text-muted">
                        Operating date {trip.operating_date}
                      </span>
                    </div>

                    <div className="text-sm text-muted">3:00am – 8:00am</div>

                    <div>
                      <CategoryBadge
                        value={trip.vehicle_id.includes('REEF') ? 'CHILLED' : 'AMBIENT'}
                      />
                    </div>

                    <div className="text-sm text-muted">{trip.stops_count ?? 'Multi'} Orders</div>

                    <div className="flex items-center justify-end">
                      <LoadStatusSlider status={trip.manifest_status} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// 2. Load Details · Expanded View
function LoadDetailsView({
  tripDetail,
  availableTrips,
  onSelectTrip,
  onOpenStopChecklist,
  onBack,
  isSigning,
  onSignManifest,
  signError,
  temperature,
  onTemperatureChange,
  isStarting,
  onStartLoading,
}: {
  user: User;
  tripDetail: TripDetail;
  availableTrips: Trip[];
  onSelectTrip: (id: string) => void;
  onOpenStopChecklist: (stop: Stop) => void;
  onBack: () => void;
  isSigning: boolean;
  onSignManifest: () => void;
  signError: string;
  temperature: string;
  onTemperatureChange: (value: string) => void;
  isStarting: boolean;
  onStartLoading: () => void;
}) {
  const { trip, manifest } = tripDetail;
  const stops = [...tripDetail.stops].reverse();
  const loadId = `LDS-${trip.id.slice(0, 4).toUpperCase()}`;
  const isManifestSigned = manifest?.status === 'COMPLETED';
  const isLoadStarted = manifest?.status === 'LOADING' || isManifestSigned;
  const hasChilled = stops.some((stop) => stop.temperature_requirement?.toLowerCase() === 'chilled');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Top Header */}
      <div className="sticky top-0 z-20 -mt-1 mb-4 flex items-center justify-between gap-4 bg-surface pb-4 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-white"
          aria-label="Back to assigned loads"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        {/* Load selector dropdown */}
        <div className="relative">
          <label htmlFor="load-select" className="sr-only">
            Switch Load
          </label>
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight text-primary">
            <span>{loadId}</span>
            <select
              id="load-select"
              value={trip.id}
              onChange={(e) => onSelectTrip(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Select load"
            >
              {availableTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  LDS-{t.id.slice(0, 4).toUpperCase()} ({t.vehicle_id})
                </option>
              ))}
            </select>
            <ChevronDown size={20} className="text-muted" />
          </div>
        </div>
      </div>

      {/* Load Metadata Cards */}
      <div className="grid grid-cols-2 gap-4 rounded-card border border-border bg-white p-6 sm:grid-cols-4">
        <div>
          <span className="text-xs text-muted">Order count</span>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{stops.length}</p>
        </div>

        <div>
          <span className="text-xs text-muted">Order IDs</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stops.map((stop) => (
              <span
                key={stop.id}
                className="rounded-full bg-chilled px-2.5 py-0.5 text-xs font-semibold text-[#094751]"
              >
                {stop.public_reference ?? stop.order_id.slice(0, 8).toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-muted">Earliest Window Close</span>
          <p className="mt-1 text-sm font-semibold text-primary">
            {stops
              .map((stop) => stop.window_close_at)
              .filter(Boolean)
              .sort()[0]
              ? new Date(
                  stops
                    .map((stop) => stop.window_close_at)
                    .filter(Boolean)
                    .sort()[0]!,
                ).toLocaleTimeString('en-GB', {
                  timeZone: 'Asia/Colombo',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </p>
        </div>

        <div>
          <span className="text-xs text-muted">Vehicle ID</span>
          <p className="mt-1 text-sm font-bold text-primary">{trip.vehicle_id}</p>
        </div>
      </div>

      {hasChilled && (
        <label className="block rounded-card border border-border bg-white p-6 text-sm">
          <span className="font-medium">Measured cargo temperature (°C)</span>
          <span className="mt-1 block text-xs text-muted">
            Applied to every chilled order in this load.
          </span>
          <input
            type="number"
            step="0.1"
            required
            value={temperature}
            onChange={(event) => onTemperatureChange(event.target.value)}
            className="mt-3 min-h-11 w-full rounded-control border border-border bg-white px-4 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
      )}

      {/* Orders List for Loading */}
      <div className="space-y-3">
        <div
          className="hidden grid-cols-[80px_1.5fr_2fr_1fr_1fr] items-center gap-4 px-6 text-xs font-semibold text-muted sm:grid"
          aria-hidden="true"
        >
          <span>Order</span>
          <span>Order ID</span>
          <span>Window / Destination</span>
          <span>Order Type</span>
          <span className="text-right">Order Size</span>
        </div>

        {stops.map((stop, index) => {
          const orderRef = stop.public_reference ?? stop.order_id.slice(0, 8).toUpperCase();
          const isStopLoaded = !!stop.load?.confirmed_at;

          return (
            <div
              key={stop.id}
              onClick={() => onOpenStopChecklist(stop)}
              className="grid cursor-pointer grid-cols-2 items-center gap-3 rounded-card border border-border bg-white p-5 transition hover:shadow-sm sm:grid-cols-[80px_1.5fr_2fr_1fr_1fr] sm:px-6"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenStopChecklist(stop);
              }}
            >
              <span className="text-lg font-bold text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span className="font-semibold text-primary">{orderRef}</span>

              <span className="text-sm text-muted">
                {stop.outlet_name ?? 'Waypoint Retail Outlet'}
              </span>

              <div>
                <CategoryBadge value={stop.temperature_requirement ?? 'ambient'} />
              </div>

              <div className="flex items-center justify-end gap-2 text-right">
                <span className="text-sm font-medium text-muted">
                  {stop.aggregate?.units ??
                    stop.lines?.reduce((sum, line) => sum + line.quantity, 0) ??
                    '—'}{' '}
                  items
                </span>
                {isStopLoaded && <CheckCircle2 size={18} className="text-emerald-600" />}
              </div>
            </div>
          );
        })}
      </div>

      {signError && (
        <p role="alert" className="rounded-control bg-red-50 p-4 text-sm text-red-800">
          {signError}
        </p>
      )}
      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        <button
          type="button"
          disabled={isLoadStarted || isStarting}
          onClick={onStartLoading}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-base font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted disabled:hover:bg-disabled"
        >
          <PackageCheck size={20} />
          {isLoadStarted ? 'Started Loading' : isStarting ? 'Starting…' : 'Start Loading'}
        </button>

        <button
          type="button"
          disabled={
            isManifestSigned ||
            isSigning ||
            !isLoadStarted ||
            !stops.every((stop) => stop.load?.confirmed_at)
          }
          onClick={onSignManifest}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-control text-base font-semibold transition ${
            isManifestSigned
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default'
              : 'bg-primary text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-[#e9e9e9] disabled:text-muted disabled:hover:bg-[#e9e9e9]'
          }`}
        >
          {isManifestSigned ? (
            <>
              <Check size={20} /> Loading Finished & Signed
            </>
          ) : (
            'Finish Loading'
          )}
        </button>
      </div>
    </div>
  );
}

// 3. Checklist - Reporting View
function ChecklistReportingView({
  stop,
  onBack,
  temperature,
}: {
  user: User;
  stop: Stop;
  tripId: string;
  onBack: () => void;
  temperature: string;
}) {
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [reportMessage, setReportMessage] = useState('');
  const [reportAction, setReportAction] = useState('Missing items');
  const [reportSaved, setReportSaved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSelected, setReportSelected] = useState<Record<string, boolean>>({});
  const [actual, setActual] = useState<Record<string, { loaded: number; damaged: number }>>({});
  const [aggregateActual, setAggregateActual] = useState<{
    units: string;
    weight: string;
    volume: string;
  } | null>(null);
  const [issueQuantity, setIssueQuantity] = useState(1);

  // Fetch actual order lines for this stop
  const orderQuery = useQuery({
    queryKey: ['order', stop.order_id],
    queryFn: () => request<OrderDetail>(`/orders/${encodeURIComponent(stop.order_id)}`),
  });

  // Load recording mutation
  const loadMutation = useMutation({
    mutationFn: () =>
      request<{ stopId: string; confirmed: boolean }>(`/stops/${stop.id}/load`, {
        method: 'PUT',
        body: JSON.stringify({
          ...(orderQuery.data?.aggregate
            ? {
                aggregate: {
                  units: aggregateActual
                    ? Number(aggregateActual.units)
                    : orderQuery.data.aggregate.units,
                  weightKg: aggregateActual?.weight ?? orderQuery.data.aggregate.weight_kg,
                  volumeM3: aggregateActual?.volume ?? orderQuery.data.aggregate.volume_m3,
                },
              }
            : {
                lines: (orderQuery.data?.lines ?? []).map((line) => ({
                  orderLineId: line.id,
                  loadedQuantity: actual[line.id]?.loaded ?? line.quantity,
                  damagedQuantity: actual[line.id]?.damaged ?? 0,
                })),
              }),
          ...(temperature ? { temperatureC: temperature } : {}),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loader'] });
    },
  });

  // Dock issue filing mutation
  const issueMutation = useMutation({
    mutationFn: () =>
      request<{ id: string }>(`/loading/issues`, {
        method: 'POST',
        body: JSON.stringify({
          stopId: stop.id,
          type: reportAction.includes('Damaged') ? 'DAMAGED' : 'MISSING',
          stage: 'LOADING',
          affectedQuantity: issueQuantity,
          notes: `${reportMessage}${
            selectedReportLines.length
              ? ` [Items: ${selectedReportLines.map((line) => line.sku ?? line.product_name ?? line.name ?? line.id.slice(0, 8)).join(', ')}]`
              : ''
          }`,
        }),
      }),
    onSuccess: () => {
      setReportSaved(true);
      setReportSelected({});
      setReportMessage('');
      void queryClient.invalidateQueries({ queryKey: ['loader'] });
    },
  });

  const orderRef = stop.public_reference ?? stop.order_id.slice(0, 8).toUpperCase();
  const lines = orderQuery.data?.lines ?? [];

  const selectedReportLines = lines.filter((line) => reportSelected[line.id]);

  function toggleReportItem(id: string) {
    setReportSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSaveReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportMessage.trim() || !selectedReportLines.length) return;
    issueMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 -mt-1 mb-4 flex flex-wrap items-center justify-between gap-4 bg-surface pb-4 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-control p-2 hover:bg-white"
            aria-label="Back to load details"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-primary">{orderRef}</h1>
        </div>
        <div className="text-sm text-muted">
          {stop.window_close_at
            ? new Date(stop.window_close_at).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })
            : 'Window unavailable'}
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-3">
        {lines.map((line) => {
          const isChecked = !!checkedItems[line.id];
          const lineItemId = line.sku ?? `ITM-${line.id.slice(0, 4).toUpperCase()}`;

          return (
            <div
              key={line.id}
              onClick={() => {
                if (!reportOpen) toggleItem(line.id);
              }}
              className={`flex items-center justify-between gap-4 rounded-card border bg-white p-5 transition ${
                reportOpen
                  ? 'border-border'
                  : 'cursor-pointer border-border hover:shadow-sm'
              } ${reportOpen && reportSelected[line.id] ? 'border-primary' : ''}`}
              role="checkbox"
              aria-checked={isChecked}
              aria-disabled={reportOpen}
              tabIndex={reportOpen ? -1 : 0}
              onKeyDown={(e) => {
                if (!reportOpen && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  toggleItem(line.id);
                }
              }}
            >
              <div className="flex items-center gap-4">
                {reportOpen && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!reportSelected[line.id]}
                    aria-label={`Select ${lineItemId} to report`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleReportItem(line.id);
                    }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      reportSelected[line.id]
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface'
                    }`}
                  >
                    {reportSelected[line.id] && <Check size={14} />}
                  </button>
                )}
                <div className={reportOpen ? 'opacity-40' : ''}>
                  <span className="font-semibold text-primary">{lineItemId}</span>
                  <span className="ml-4 text-sm font-medium text-primary">
                    {line.product_name ?? line.name ?? 'Standard Item'}
                  </span>
                </div>
              </div>

              <div className={`flex items-center gap-5 ${reportOpen ? 'opacity-40' : ''}`}>
                <CategoryBadge value={line.temperature_requirement ?? 'Ambient'} />
                <span className="text-base font-medium text-muted">X {line.quantity}</span>
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={reportOpen}
                  onChange={() => toggleItem(line.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-5 rounded border-border accent-primary"
                  aria-label={`Confirm loaded ${lineItemId}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {orderQuery.isPending && <p role="status">Loading order lines…</p>}
      {(orderQuery.error || loadMutation.error || issueMutation.error) && (
        <p role="alert" className="rounded-control bg-red-50 p-4 text-red-800">
          {(orderQuery.error ?? loadMutation.error ?? issueMutation.error)?.message}
        </p>
      )}
      {orderQuery.data?.aggregate && (
        <p className="rounded-card border border-border p-5">
          Aggregate consignment: {orderQuery.data.aggregate.units} units ·{' '}
          {orderQuery.data.aggregate.weight_kg} kg · {orderQuery.data.aggregate.volume_m3} m³.
          Confirm the physical totals before recording.
        </p>
      )}
      {orderQuery.data?.order.temperature_requirement === 'chilled' && (
        <p className="rounded-card border border-border bg-white p-5 text-sm">
          {temperature
            ? `Measured cargo temperature: ${temperature} °C (set on the load page)`
            : 'Enter the measured cargo temperature on the load page before confirming this order.'}
        </p>
      )}
      <details className="rounded-card border border-border bg-white p-5">
        <summary className="text-sm font-medium">Record actual quantities and damage</summary>
        <div className="mt-4 space-y-3">
          {lines.map((line) => (
            <div key={line.id}>
              <p className="text-sm">
                {line.name} · {line.quantity} requested
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  Loaded
                  <input
                    className="mt-2 min-h-11 w-full rounded-control border border-border px-3"
                    type="number"
                    min="0"
                    max={line.quantity}
                    step="1"
                    value={actual[line.id]?.loaded ?? line.quantity}
                    onChange={(event) =>
                      setActual({
                        ...actual,
                        [line.id]: {
                          loaded: Number(event.target.value),
                          damaged: actual[line.id]?.damaged ?? 0,
                        },
                      })
                    }
                  />
                </label>
                <label className="text-xs">
                  Damaged
                  <input
                    className="mt-2 min-h-11 w-full rounded-control border border-border px-3"
                    type="number"
                    min="0"
                    max={line.quantity}
                    step="1"
                    value={actual[line.id]?.damaged ?? 0}
                    onChange={(event) =>
                      setActual({
                        ...actual,
                        [line.id]: {
                          loaded: actual[line.id]?.loaded ?? line.quantity,
                          damaged: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          {orderQuery.data?.aggregate &&
            (['units', 'weight', 'volume'] as const).map((key) => (
              <label className="block text-xs" key={key}>
                Actual {key}
                <input
                  className="mt-2 min-h-11 w-full rounded-control border border-border px-3"
                  type="number"
                  min="0"
                  step={key === 'units' ? '1' : key === 'weight' ? '0.01' : '0.001'}
                  value={
                    (aggregateActual ?? {
                      units: String(orderQuery.data!.aggregate!.units),
                      weight: orderQuery.data!.aggregate!.weight_kg,
                      volume: orderQuery.data!.aggregate!.volume_m3,
                    })[key]
                  }
                  onChange={(event) =>
                    setAggregateActual({
                      ...(aggregateActual ?? {
                        units: String(orderQuery.data!.aggregate!.units),
                        weight: orderQuery.data!.aggregate!.weight_kg,
                        volume: orderQuery.data!.aggregate!.volume_m3,
                      }),
                      [key]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Loaded plus damaged units cannot exceed the requested quantity. File a report below for
          discrepancies.
        </p>
      </details>
      {/* Confirm cargo loaded button */}
      <button
        type="button"
        disabled={
          loadMutation.isPending ||
          lines.some(
            (line) =>
              (actual[line.id]?.loaded ?? line.quantity) + (actual[line.id]?.damaged ?? 0) >
              line.quantity,
          ) ||
          !orderQuery.data ||
          (orderQuery.data.order.temperature_requirement === 'chilled' && !temperature) ||
          (!orderQuery.data.aggregate && !lines.every((line) => checkedItems[line.id]))
        }
        onClick={() => loadMutation.mutate()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary text-sm font-semibold text-white transition hover:bg-primary/90"
      >
        <PackageCheck size={18} />
        {loadMutation.isSuccess ? 'Cargo Load Verified' : 'Confirm Items Staged on Vehicle'}
      </button>

      {/* Floating report button + expandable panel */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {reportOpen && (
          <div className="max-h-[70dvh] w-[min(24rem,calc(100vw-3rem))] overflow-y-auto rounded-card border border-border bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <AlertCircle size={20} />
              <span>Report</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Use the circles on the left of each item to choose what to report.
            </p>
            <p className="mt-3 rounded-control bg-surface p-3 text-sm font-medium">
              {selectedReportLines.length} of {lines.length} items selected
              {selectedReportLines.length > 0 && (
                <span className="mt-1 block text-xs font-normal text-muted">
                  {selectedReportLines
                    .map((line) => line.sku ?? line.product_name ?? line.name ?? line.id.slice(0, 8))
                    .join(', ')}
                </span>
              )}
            </p>
            <form onSubmit={handleSaveReport} className="mt-4 space-y-4 p-1">
              <div>
                <label htmlFor="report-message" className="block text-sm font-medium text-primary">
                  Message
                </label>
                <textarea
                  id="report-message"
                  rows={4}
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  placeholder="Record any dock discrepancy, package damage or shortage..."
                  className="mt-1 w-full rounded-card border border-border bg-white p-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <label className="block text-sm">
                Affected units
                <input
                  className="mt-2 min-h-11 w-full rounded-control border border-border bg-white px-4 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={issueQuantity}
                  onChange={(event) => setIssueQuantity(Number(event.target.value))}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <select
                  id="report-action"
                  aria-label="Action"
                  value={reportAction}
                  onChange={(e) => setReportAction(e.target.value)}
                  className="min-h-11 rounded-control border border-border bg-white px-4 text-sm font-medium text-primary outline-none focus:border-primary"
                >
                  <option value="Missing items">Missing items</option>
                  <option value="Damaged packaging">Damaged packaging</option>
                  <option value="Dock shortage">Dock shortage</option>
                </select>
                <button
                  type="submit"
                  disabled={
                    issueMutation.isPending || !reportMessage.trim() || !selectedReportLines.length
                  }
                  className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-8 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {issueMutation.isPending
                    ? 'Saving…'
                    : selectedReportLines.length
                      ? `Report ${selectedReportLines.length} item${selectedReportLines.length > 1 ? 's' : ''}`
                      : 'Save'}
                </button>
              </div>
              {reportSaved && (
                <p className="rounded-control bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                  Report filed and logged to warehouse dispatcher.
                </p>
              )}
            </form>
          </div>
        )}
        <button
          type="button"
          aria-expanded={reportOpen}
          onClick={() => {
            setReportOpen((open) => !open);
            setReportSaved(false);
          }}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-lg transition hover:bg-primary/90"
        >
          <AlertCircle size={18} />
          {reportOpen ? 'Close report' : 'Report'}
        </button>
      </div>
    </div>
  );
}
