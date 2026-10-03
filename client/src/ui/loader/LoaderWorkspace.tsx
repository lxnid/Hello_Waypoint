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

export function LoaderWorkspace({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [search, setSearch] = useState('');
  const [loadingActive, setLoadingActive] = useState<Record<string, boolean>>({});

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

  const trips = tripsQuery.data?.items ?? [];
  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? tripDetailQuery.data?.trip;

  // View routing inside Loader
  if (activeStop && selectedTripId) {
    return (
      <ChecklistReportingView
        user={user}
        stop={activeStop}
        tripId={selectedTripId}
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
            {trips
              .filter((trip) => {
                if (!search) return true;
                const q = search.toLowerCase();
                return (
                  trip.id.toLowerCase().includes(q) || trip.vehicle_id.toLowerCase().includes(q)
                );
              })
              .map((trip) => {
                const loadId = `LDS-${trip.id.slice(0, 4).toUpperCase()}`;
                const isLoadingOn = loadingActive[trip.id] ?? trip.manifest_status === 'LOADING';
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

                    <div
                      className="flex items-center justify-end"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLoadingActive((prev) => ({ ...prev, [trip.id]: !isLoadingOn }));
                        setSelectedTripId(trip.id);
                      }}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isLoadingOn}
                        aria-label={`Toggle loading state for ${loadId}`}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-2 ${
                          isLoadingOn ? 'bg-primary' : 'bg-disabled'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            isLoadingOn ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
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
}: {
  user: User;
  tripDetail: TripDetail;
  availableTrips: Trip[];
  onSelectTrip: (id: string) => void;
  onOpenStopChecklist: (stop: Stop) => void;
  onBack: () => void;
  isSigning: boolean;
  onSignManifest: () => void;
}) {
  const { trip, stops, manifest } = tripDetail;
  const loadId = `LDS-${trip.id.slice(0, 4).toUpperCase()}`;
  const isManifestSigned = manifest?.status === 'COMPLETED';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
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

      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        <button
          type="button"
          onClick={() => {
            if (stops[0]) onOpenStopChecklist(stops[0]);
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-base font-semibold text-white transition hover:bg-primary/90"
        >
          <PackageCheck size={20} />
          Start Loading
        </button>

        <button
          type="button"
          disabled={
            isManifestSigned || isSigning || !stops.every((stop) => stop.load?.confirmed_at)
          }
          onClick={onSignManifest}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-control text-base font-semibold transition ${
            isManifestSigned
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default'
              : 'border border-border bg-[#e9e9e9] text-primary hover:bg-[#dedede]'
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
}: {
  user: User;
  stop: Stop;
  tripId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [reportMessage, setReportMessage] = useState('');
  const [reportAction, setReportAction] = useState('Missing items');
  const [reportSaved, setReportSaved] = useState(false);
  const [temperature, setTemperature] = useState('');

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
                  units: orderQuery.data.aggregate.units,
                  weightKg: orderQuery.data.aggregate.weight_kg,
                  volumeM3: orderQuery.data.aggregate.volume_m3,
                },
              }
            : {
                lines: (orderQuery.data?.lines ?? []).map((line) => ({
                  orderLineId: line.id,
                  loadedQuantity: checkedItems[line.id] ? line.quantity : 0,
                  damagedQuantity: 0,
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
          affectedQuantity: 1,
          notes: reportMessage,
        }),
      }),
    onSuccess: () => {
      setReportSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['loader'] });
    },
  });

  const orderRef = stop.public_reference ?? stop.order_id.slice(0, 8).toUpperCase();
  const lines = orderQuery.data?.lines ?? [];

  function toggleItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSaveReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportMessage.trim()) return;
    await issueMutation.mutateAsync();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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
              onClick={() => toggleItem(line.id)}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-card border border-border bg-white p-5 transition hover:shadow-sm"
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggleItem(line.id);
                }
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isChecked ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
                  }`}
                >
                  {isChecked && <Check size={14} />}
                </div>
                <div>
                  <span className="font-semibold text-primary">{lineItemId}</span>
                  <span className="ml-4 text-sm font-medium text-primary">
                    {line.product_name ?? line.name ?? 'Standard Item'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <CategoryBadge value={line.temperature_requirement ?? 'Ambient'} />
                <span className="text-base font-medium text-muted">X {line.quantity}</span>
                <input
                  type="checkbox"
                  checked={isChecked}
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
        <label className="block text-sm">
          Measured cargo temperature (°C)
          <input
            type="number"
            step="0.1"
            required
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-control border border-border bg-white px-4"
          />
        </label>
      )}
      {/* Confirm cargo loaded button */}
      <button
        type="button"
        disabled={
          loadMutation.isPending ||
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

      {/* Report Section */}
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <AlertCircle size={20} className="text-primary" />
          <span>Report</span>
        </div>

        <form onSubmit={handleSaveReport} className="mt-4 space-y-4">
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

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label htmlFor="report-action" className="text-sm font-medium text-primary">
                Action
              </label>
              <select
                id="report-action"
                value={reportAction}
                onChange={(e) => setReportAction(e.target.value)}
                className="min-h-11 rounded-control border border-border bg-white px-4 text-sm font-medium text-primary outline-none focus:border-primary"
              >
                <option value="Missing items">Missing items</option>
                <option value="Damaged packaging">Damaged packaging</option>
                <option value="Dock shortage">Dock shortage</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={issueMutation.isPending || !reportMessage.trim()}
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-8 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {issueMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>

          {reportSaved && (
            <p className="rounded-control bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
              Report filed and logged to warehouse dispatcher.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
