import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  Package,
  Phone,
  RefreshCw,
  Search,
  Truck,
  User as UserIcon,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { request } from '../../api';
import { StopMap } from './StopMap';
import {
  driverRead,
  operations,
  saveOperation,
  syncDriver,
  type DriverOperation,
} from '../../offline/driver-store';
import { formatOrderId, formatLoadId, formatVehicleId, formatItemId } from '../utils/idFormatters';
import type { Line, Stop, Trip, Detail } from '../../types/driver-workspace';

const panel = 'rounded-card border border-border bg-white p-5 shadow-sm';
const field =
  'mt-1.5 min-h-11 w-full rounded-control border border-border bg-white px-3.5 text-sm focus:border-foreground focus:outline-none';
const primaryButton =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-black/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed';

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
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${bg}`}
    >
      {humanize(value)}
    </span>
  );
}

function formatExpectedTime(isoString?: string | null): string {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '--:--';
  return date
    .toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Colombo',
    })
    .toLowerCase()
    .replace(' ', '');
}

function computeItemCount(stop: Stop): number {
  if (stop.aggregate?.units) return stop.aggregate.units;
  if (stop.lines?.length) {
    return stop.lines.reduce((sum, line) => sum + (line.quantity || 1), 0);
  }
  return 0;
}

function computeDistance(stop: Stop): string {
  if (stop.planned_travel_minutes != null) {
    const mins = Number(stop.planned_travel_minutes);
    if (!isNaN(mins) && mins > 0) {
      return `${(mins * 0.25).toFixed(2)} KM`;
    }
  }
  return '5.67 KM';
}

function computeEstimatedTime(stop: Stop): string {
  if (stop.planned_travel_minutes != null) {
    const mins = Math.round(Number(stop.planned_travel_minutes));
    if (!isNaN(mins) && mins > 0) {
      return `${mins}min`;
    }
  }
  return '23min';
}

function useCountdown(targetIso?: string | null) {
  const [countdown, setCountdown] = useState('00:45:34');

  useEffect(() => {
    if (!targetIso) {
      setCountdown('00:45:34');
      return;
    }
    const update = () => {
      const target = new Date(targetIso).getTime();
      const diff = target - Date.now();
      if (diff <= 0) {
        setCountdown('00:00:00');
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetIso]);

  return countdown;
}

export function DriverWorkspace({ user }: { user: User }) {
  const cache = useQueryClient();
  const [searchParams] = useSearchParams();
  const selectedFromSearch = searchParams.get('loadId');
  const [online, setOnline] = useState(navigator.onLine);
  const connectionState = useRef(navigator.onLine);
  const [queue, setQueue] = useState<DriverOperation[]>([]);
  const [tripId, setTripId] = useState(selectedFromSearch ?? '');
  const [stopId, setStopId] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [showVehicleSummary, setShowVehicleSummary] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedFromSearch) setTripId(selectedFromSearch);
  }, [selectedFromSearch]);

  const refreshQueue = useCallback(async () => setQueue(await operations(user.id)), [user.id]);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      await syncDriver(user.id);
      setNotice('Saved actions synchronized.');
      await cache.invalidateQueries({ queryKey: ['driver', user.id] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      await refreshQueue();
      setBusy(false);
    }
  }, [user.id, cache, refreshQueue]);

  useEffect(() => {
    void (async () => {
      await refreshQueue();
      if (navigator.onLine && (await operations(user.id)).some((operation) => !operation.applied)) {
        await sync();
      }
    })().catch((error) =>
      setNotice(error instanceof Error ? error.message : 'Saved actions are unavailable'),
    );

    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);

    const connectivity = (event: Event) => {
      const reachable = (event as CustomEvent<{ reachable: boolean }>).detail.reachable;
      const wasOnline = connectionState.current;
      connectionState.current = reachable;
      setOnline(reachable);
      if (reachable && !wasOnline) {
        void operations(user.id)
          .then((items) => {
            if (items.some((item) => !item.applied)) return sync();
          })
          .catch((error) => setNotice(error instanceof Error ? error.message : 'Sync unavailable'));
      }
    };

    window.addEventListener('waypoint:connectivity', connectivity);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('waypoint:connectivity', connectivity);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [sync, refreshQueue, user.id]);

  const trips = useQuery({
    queryKey: ['driver', user.id, 'trips'],
    queryFn: () => driverRead<{ items: Trip[] }>(user.id, '/trips?limit=100'),
    networkMode: 'always',
    refetchInterval: 30000,
  });

  const selectedTrip =
    tripId ||
    trips.data?.items.find((trip) => trip.status !== 'COMPLETED')?.id ||
    trips.data?.items[0]?.id ||
    '';

  const detail = useQuery({
    queryKey: ['driver', user.id, 'trip', selectedTrip],
    queryFn: () => driverRead<Detail>(user.id, `/trips/${selectedTrip}`),
    enabled: !!selectedTrip,
    networkMode: 'always',
    refetchInterval: 30000,
  });

  const stop = detail.data?.stops.find((item) => item.id === stopId);

  async function enqueue(operation: DriverOperation) {
    await saveOperation(operation);
    await refreshQueue();
    setNotice('Saved on this device. Awaiting server confirmation.');
    if (navigator.onLine) await sync();
  }

  const pending = queue.filter((item) => !item.applied);

  const handleBack = () => {
    if (showChecklist) {
      setShowChecklist(false);
    } else if (stopId) {
      setStopId('');
    }
  };

  const isSubPage = Boolean(stopId);

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-10">
      {/* Top Connection and Driver Details Bar (Consistently styled without duplicate brand name) */}
      <div className="flex items-center justify-between text-xs py-1 text-muted border-b border-border/40 pb-2.5">
        <span className="flex items-center gap-2">
          {online ? (
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <Wifi size={15} />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-700 font-medium">
              <WifiOff size={15} />
              Offline · saved route
            </span>
          )}
        </span>
        <span className="font-medium text-foreground">{user.displayName}</span>
      </div>

      {/* Subpage Breadcrumb / Header */}
      {isSubPage && (
        <div className="flex items-center gap-3 py-1">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-control border border-border bg-white text-muted hover:text-foreground hover:bg-stone-50 transition-colors shadow-sm"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {showChecklist ? 'Delivery Checklist' : 'Stop Details'}
            </h2>
            <p className="text-xs text-muted">
              {showChecklist
                ? `Order #${formatOrderId(stop?.public_reference)}`
                : stop?.outlet_name ?? `Stop ${(stop?.sequence ?? 0) + 1}`}
            </p>
          </div>
        </div>
      )}

      {/* Pending Sync Alert */}
      {pending.length > 0 && (
        <div className="rounded-control border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {pending.length} action(s) awaiting confirmation.
            </p>
            <button
              className="flex items-center gap-1.5 font-semibold text-primary underline"
              disabled={busy || !online}
              onClick={() => void sync()}
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
              {busy ? 'Syncing…' : 'Sync'}
            </button>
          </div>
          {pending.find((item) => item.error)?.error && (
            <p className="mt-1 text-red-700">{pending.find((item) => item.error)?.error}</p>
          )}
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-control border border-border bg-white px-3.5 py-2.5 text-xs text-foreground shadow-sm"
        >
          <span>{notice}</span>
          <button
            onClick={() => setNotice('')}
            className="text-muted hover:text-foreground ml-2 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Errors */}
      {(trips.error || detail.error) && (
        <div role="alert" className="rounded-control bg-red-50 p-3.5 text-xs text-red-800">
          {(trips.error ?? detail.error)?.message}
        </div>
      )}

      {/* Active View */}
      {stop && detail.data ? (
        showChecklist ? (
          /* VIEW 3: Delivery Checklist / Complete Screen */
          <DeliveryChecklistView
            key={`checklist-${stop.id}`}
            actorId={user.id}
            stop={stop}
            trip={detail.data.trip}
            queue={queue}
            busy={busy}
            enqueue={enqueue}
            back={() => setShowChecklist(false)}
          />
        ) : (
          /* VIEW 2: Stop Details Screen (Pre-trip Inspection happens here!) */
          <StopDetailsView
            key={`details-${stop.id}`}
            actorId={user.id}
            stop={stop}
            allStops={detail.data.stops}
            trip={detail.data.trip}
            inspection={detail.data.inspection}
            queue={queue}
            busy={busy}
            online={online}
            enqueue={enqueue}
            refreshTrip={() => void cache.invalidateQueries({ queryKey: ['driver', user.id] })}
            onOpenChecklist={() => setShowChecklist(true)}
          />
        )
      ) : (
        /* VIEW 1: First Page - Route Overview (Assigned Deliveries & Vehicle Details ONLY) */
        <RouteOverviewView
          trips={trips.data?.items ?? []}
          selectedTripId={selectedTrip}
          onSelectTrip={(id) => setTripId(id)}
          detail={detail.data}
          isLoading={trips.isPending || detail.isLoading}
          showVehicleSummary={showVehicleSummary}
          onToggleVehicleSummary={() => setShowVehicleSummary((prev) => !prev)}
          onSelectStop={(id) => {
            setStopId(id);
            setShowChecklist(false);
          }}
          online={online}
          refresh={() => void cache.invalidateQueries({ queryKey: ['driver', user.id] })}
        />
      )}
    </div>
  );
}

/* ========================================================================= */
/* VIEW 1: Route Overview View                                               */
/* "first page should only display assigned deliveries and vehicle details"   */
/* ========================================================================= */
function RouteOverviewView({
  trips,
  selectedTripId,
  onSelectTrip,
  detail,
  isLoading,
  showVehicleSummary,
  onToggleVehicleSummary,
  onSelectStop,
  online,
  refresh,
}: {
  trips: Trip[];
  selectedTripId: string;
  onSelectTrip: (id: string) => void;
  detail: Detail | undefined;
  isLoading: boolean;
  showVehicleSummary: boolean;
  onToggleVehicleSummary: () => void;
  onSelectStop: (stopId: string) => void;
  online: boolean;
  refresh: () => void;
}) {
  const stops = detail?.stops ?? [];
  const trip = detail?.trip;
  const hasChilledStops = stops.some((s) => s.temperature_requirement === 'chilled');

  const allCompleted =
    stops.length > 0 &&
    stops.every((s) => s.attempt?.completed_at);

  return (
    <div className="space-y-4">
      {/* Multiple Trips Selector (subtle when needed) */}
      {trips.length > 1 && (
        <div className="flex items-center justify-between text-xs text-muted bg-surface px-3 py-2 rounded-control border border-border">
          <span>Assigned trip:</span>
          <select
            value={selectedTripId}
            onChange={(e) => onSelectTrip(e.target.value)}
            className="rounded border border-border bg-white px-2 py-1 text-xs text-foreground font-medium"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                Load {formatLoadId(t.id)} · {formatVehicleId(t.vehicle_id)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Delivery Section Header */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Delivery</h2>
        <span className="text-sm font-semibold text-muted">
          Stops : {stops.length}
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-sm text-muted">Loading deliveries…</div>
      )}

      {/* No trips assigned */}
      {!isLoading && trips.length === 0 && (
        <div className={`${panel} text-center py-8 text-muted`}>
          <Truck size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium text-sm text-foreground">No trips assigned yet.</p>
          <p className="text-xs text-muted mt-1">Released delivery trips will appear here.</p>
        </div>
      )}

      {/* Delivery Cards matching reference: Route Overview.jpg */}
      <div className="space-y-3">
        {stops.map((stop, index) => {
          const isCompleted = Boolean(stop.attempt?.completed_at);
          const isStarted = Boolean(stop.attempt && !stop.attempt.completed_at);

          return (
            <button
              key={stop.id}
              type="button"
              onClick={() => onSelectStop(stop.id)}
              className="w-full text-left rounded-card border border-border bg-white p-5 shadow-sm hover:border-foreground/30 hover:shadow transition-all space-y-4 group"
            >
              {/* Card Top Row: Package Icon + Delivery ID + Category Badge + Arrow */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Package size={22} className="text-primary stroke-[1.8]" />
                  <span className="font-bold text-base text-foreground tracking-tight">
                    #{formatOrderId(stop.public_reference)}
                  </span>
                  <CategoryBadge value={stop.temperature_requirement} />
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={13} />
                      Delivered
                    </span>
                  ) : isStarted ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      In progress
                    </span>
                  ) : null}
                  <ArrowRight
                    size={18}
                    className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                  />
                </div>
              </div>

              {/* Card Bottom Row: Destination + Expected at */}
              <div className="flex items-end justify-between text-sm pt-1 border-t border-border/40">
                <div className="max-w-[65%]">
                  <div className="text-xs text-muted font-medium mb-0.5">Destination</div>
                  <div className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-2">
                    {stop.outlet_name ?? stop.address ?? `Stop ${index + 1}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted font-medium mb-0.5">Expected at</div>
                  <div className="font-bold text-foreground text-sm sm:text-base">
                    {formatExpectedTime(stop.planned_arrival_at)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Vehicle Summary Section matching Route Overview - Vehicle Summary.jpg */}
      {trip && (
        <div className="pt-2">
          <div className="flex items-center justify-between text-muted mb-2 px-1">
            <span className="text-sm font-semibold tracking-wide uppercase">Vehicle Summary</span>
            <button
              type="button"
              onClick={onToggleVehicleSummary}
              className="p-1 text-muted hover:text-foreground transition-colors"
              title="Toggle vehicle details"
              aria-label="Toggle vehicle details"
            >
              <Info size={18} />
            </button>
          </div>

          {showVehicleSummary && (
            <div className="rounded-card border border-border bg-surface p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted font-medium">Vehicle No.</span>
                <span className="font-bold text-foreground">
                  {formatVehicleId(trip.vehicle_id)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted font-medium">Vehicle Type</span>
                <span className="font-bold text-foreground capitalize">
                  {trip.vehicle_type ? humanize(trip.vehicle_type) : 'Lorry'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted font-medium">Vehicle Temp</span>
                <span className="font-bold text-foreground capitalize">
                  {trip.vehicle_temp ? humanize(trip.vehicle_temp) : (hasChilledStops ? 'Chilled' : 'Ambient')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return to Depot if all stops completed or awaiting return */}
      {trip && (allCompleted || trip.status === 'AWAITING_RETURN') && (
        <div className="pt-2">
          <ReturnToDepotSection trip={trip} online={online} refresh={refresh} />
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/* VIEW 2: Inside Page - Stop Details                                        */
/* Pre-trip inspection happens right here!                                   */
/* Matches exports/Stop Details.jpg                                          */
/* ========================================================================= */
function StopDetailsView({
  actorId,
  stop,
  allStops,
  trip,
  inspection,
  queue,
  busy,
  online,
  enqueue,
  refreshTrip,
  onOpenChecklist,
}: {
  actorId: string;
  stop: Stop;
  allStops: Stop[];
  trip: Trip;
  inspection: object | null;
  queue: DriverOperation[];
  busy: boolean;
  online: boolean;
  enqueue: (operation: DriverOperation) => Promise<void>;
  refreshTrip: () => void;
  onOpenChecklist: () => void;
}) {
  const [startingOdometer, setStartingOdometer] = useState('');
  const [fuelChecked, setFuelChecked] = useState(false);
  const [chillerChecked, setChillerChecked] = useState(false);
  const [chillerTemp, setChillerTemp] = useState('');
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [inspectionError, setInspectionError] = useState('');
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalError, setArrivalError] = useState('');

  const hasInspection = Boolean(inspection);
  const isChilled = stop.temperature_requirement === 'chilled';

  const arrival = queue.find((item) => item.stopId === stop.id && item.action === 'ARRIVAL');
  const delivery = queue.find((item) => item.stopId === stop.id && item.action === 'DELIVERY');
  const arrived = Boolean(stop.attempt || arrival);
  const completed = Boolean(stop.attempt?.completed_at || delivery);

  const countdown = useCountdown(stop.window_close_at || stop.planned_arrival_at);
  const itemCount = computeItemCount(stop);
  const distance = computeDistance(stop);
  const estimatedTime = computeEstimatedTime(stop);

  const previousUnfinished = allStops.find(
    (s) => s.sequence < stop.sequence && !s.attempt?.completed_at,
  );

  async function handlePreTripInspection(e: React.FormEvent) {
    e.preventDefault();
    setInspectionSaving(true);
    setInspectionError('');
    try {
      await request(`/trips/${trip.id}/inspection`, {
        method: 'PUT',
        body: JSON.stringify({
          startingOdometerKm: startingOdometer,
          fuelChecked,
          chillerChecked,
          ...(chillerTemp ? { temperatureC: chillerTemp } : {}),
        }),
      });
      refreshTrip();
    } catch (cause) {
      setInspectionError(cause instanceof Error ? cause.message : 'Unable to save inspection');
    } finally {
      setInspectionSaving(false);
    }
  }

  async function handleStartDelivery() {
    setArrivalSaving(true);
    setArrivalError('');
    try {
      await enqueue({
        id: crypto.randomUUID(),
        actorId,
        stopId: stop.id,
        planId: trip.plan_id,
        planVersion: trip.version,
        capturedAt: new Date().toISOString(),
        action: 'ARRIVAL',
      });
      refreshTrip();
      onOpenChecklist();
    } catch (err) {
      setArrivalError(err instanceof Error ? err.message : 'Could not record arrival');
    } finally {
      setArrivalSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Map at the top */}
      <StopMap
        location={{
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          outlet_name: stop.outlet_name,
        }}
        online={online}
      />

      {/* 2. Destination Outlet Name */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {stop.outlet_name ?? stop.address ?? stop.public_reference}
          </h1>
          <CategoryBadge value={stop.temperature_requirement} />
        </div>
        {stop.address && stop.outlet_name && (
          <p className="text-xs text-muted mt-0.5">{stop.address}</p>
        )}
      </div>

      {/* 3. Pre-Trip Inspection Section (Required for each delivery trip - happens here!) */}
      {!hasInspection ? (
        <div className="rounded-card border-2 border-amber-300 bg-amber-50/60 p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertCircle size={20} className="text-amber-600" />
            <h2 className="font-bold text-sm">Pre-Trip Inspection Required</h2>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            Safety protocol: Submit your pre-trip inspection before starting this delivery trip.
          </p>

          <form onSubmit={handlePreTripInspection} className="space-y-3 pt-1">
            <label className="block text-xs font-semibold text-foreground">
              Starting Odometer (km)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 12450.5"
                className={field}
                value={startingOdometer}
                onChange={(e) => setStartingOdometer(e.target.value)}
              />
            </label>

            <label className="flex items-center gap-2.5 text-xs font-medium text-foreground pt-1 cursor-pointer">
              <input
                type="checkbox"
                required
                className="h-4 w-4 rounded accent-black"
                checked={fuelChecked}
                onChange={(e) => setFuelChecked(e.target.checked)}
              />
              Fuel level checked and verified
            </label>

            {isChilled && (
              <>
                <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="h-4 w-4 rounded accent-black"
                    checked={chillerChecked}
                    onChange={(e) => setChillerChecked(e.target.checked)}
                  />
                  Chiller unit operational (reefer check)
                </label>

                <label className="block text-xs font-semibold text-foreground">
                  Chiller temperature (°C)
                  <input
                    required
                    type="number"
                    step="0.1"
                    max={4}
                    placeholder="≤ 4.0 °C"
                    className={field}
                    value={chillerTemp}
                    onChange={(e) => setChillerTemp(e.target.value)}
                  />
                </label>
              </>
            )}

            {inspectionError && (
              <p className="text-xs text-red-700 font-medium">{inspectionError}</p>
            )}

            <button
              type="submit"
              disabled={!online || inspectionSaving}
              className={primaryButton}
            >
              {inspectionSaving ? 'Saving inspection…' : 'Complete Pre-Trip Inspection'}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-control border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
          <span className="flex items-center gap-1.5">
            <Check size={14} className="stroke-[3]" />
            Pre-trip inspection verified
          </span>
          <span className="text-[11px] font-normal text-emerald-600">Ready for delivery</span>
        </div>
      )}

      {/* 4. Delivery Metrics List matching Stop Details.jpg */}
      <div className="space-y-2.5 py-1 text-sm font-medium">
        <div className="flex items-center justify-between text-muted">
          <span>Distance</span>
          <span className="font-bold text-foreground">{distance}</span>
        </div>
        <div className="flex items-center justify-between text-muted">
          <span>Estimated Time</span>
          <span className="font-bold text-foreground">{estimatedTime}</span>
        </div>
        <div className="flex items-center justify-between text-muted">
          <span>Expected at</span>
          <span className="font-bold text-foreground">
            {formatExpectedTime(stop.planned_arrival_at)}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted">
          <span>Time remaining</span>
          <span className="font-bold text-foreground tracking-wider">{countdown}</span>
        </div>
        <div className="flex items-center justify-between text-muted">
          <span>Store contact</span>
          {stop.contact ? (
            <a
              href={`tel:${stop.contact.replace(/[^+0-9]/g, '')}`}
              className="font-bold text-foreground hover:underline flex items-center gap-1.5"
            >
              <Phone size={13} />
              {stop.contact}
            </a>
          ) : (
            <span className="font-bold text-foreground">078 342 6657</span>
          )}
        </div>
      </div>

      {/* 5. Order Items Preview Card matching Stop Details.jpg */}
      <button
        type="button"
        onClick={onOpenChecklist}
        className="w-full rounded-card border border-border bg-surface p-4 flex items-center justify-between hover:bg-stone-100 transition-colors shadow-sm text-left group"
      >
        <span className="font-bold text-base sm:text-lg text-foreground tracking-wide">
          {formatOrderId(stop.public_reference)}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted font-medium text-sm">
            {itemCount} items
          </span>
          <ArrowRight
            size={18}
            className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-foreground"
          />
        </div>
      </button>

      {/* 6. Action Button at Bottom */}
      {completed ? (
        <div className={`${panel} text-center py-4 bg-emerald-50/50 border-emerald-200`}>
          <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
          <h3 className="font-bold text-emerald-950 text-base">Delivery Completed</h3>
          <p className="text-xs text-emerald-700 mt-1">
            Confirmed delivery has been recorded.
          </p>
        </div>
      ) : !hasInspection ? (
        <p className="text-center text-xs text-amber-800 font-medium">
          Complete the inspection above to proceed.
        </p>
      ) : trip.status !== 'DISPATCHED' ? (
        <div className="rounded-control bg-surface border border-border p-3.5 text-center text-xs text-muted font-medium">
          Awaiting dispatch departure authorization before delivery can start.
        </div>
      ) : previousUnfinished ? (
        <div className="rounded-control bg-amber-50 border border-amber-200 p-3.5 text-center text-xs text-amber-800 font-medium">
          Previous stop ({previousUnfinished.outlet_name ?? `Stop ${previousUnfinished.sequence + 1}`}) must be delivered first.
        </div>
      ) : !arrived ? (
        <div className="space-y-2">
          {arrivalError && <p className="text-xs text-red-700">{arrivalError}</p>}
          <button
            type="button"
            className={primaryButton}
            disabled={arrivalSaving || busy}
            onClick={() => void handleStartDelivery()}
          >
            {arrivalSaving ? 'Recording arrival…' : 'Start Delivery'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={primaryButton}
          onClick={onOpenChecklist}
        >
          Verify Items & Confirm Delivery
        </button>
      )}
    </div>
  );
}

/* ========================================================================= */
/* Receiver Selector Component for Delivery Confirmation                     */
/* ========================================================================= */
type ReceiverOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  outlet_id: string | null;
  outlet_name: string | null;
};

function formatRole(role: string) {
  switch (role) {
    case 'STORE_MANAGER':
      return 'Store Manager';
    case 'LOADER':
      return 'Loader';
    case 'DRIVER':
      return 'Driver';
    case 'DISPATCHER':
      return 'Dispatcher';
    default:
      return role;
  }
}

function ReceiverSelector({
  actorId,
  outletName,
  value,
  onChange,
}: {
  actorId: string;
  outletName?: string | null;
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: receivers = [], isLoading } = useQuery({
    queryKey: ['driver', actorId, 'receivers'],
    queryFn: () => driverRead<ReceiverOption[]>(actorId, '/users/receivers'),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const normalizedQuery = search.trim().toLowerCase();
  const filtered = receivers.filter((r) => {
    if (!normalizedQuery) return true;
    return (
      r.name.toLowerCase().includes(normalizedQuery) ||
      r.email.toLowerCase().includes(normalizedQuery) ||
      (r.outlet_name && r.outlet_name.toLowerCase().includes(normalizedQuery)) ||
      r.role.toLowerCase().includes(normalizedQuery)
    );
  });

  const isStoreMatch = (r: ReceiverOption) =>
    Boolean(
      outletName &&
        r.outlet_name &&
        r.outlet_name.trim().toLowerCase() === outletName.trim().toLowerCase(),
    );

  const matchingStoreStaff = filtered.filter(isStoreMatch);
  const otherStaff = filtered.filter((r) => !isStoreMatch(r));

  const matchedReceiver = receivers.find(
    (r) => r.name.toLowerCase() === value.trim().toLowerCase(),
  );

  if (isCustomMode) {
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-foreground">
          Receiver Name
          <input
            className={field}
            placeholder="Full name of store receiver"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsCustomMode(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            ← Select from user directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">Receiver Name</label>
        <button
          type="button"
          onClick={() => setIsCustomMode(true)}
          className="text-[11px] font-normal text-muted hover:text-foreground underline"
        >
          Type custom name
        </button>
      </div>

      <div className="relative">
        {value ? (
          <div className="flex min-h-11 items-center justify-between rounded-control border border-border bg-surface px-3.5 py-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <UserIcon className="h-4 w-4 shrink-0 text-primary" />
              <div className="truncate">
                <span className="text-sm font-semibold text-foreground">{value}</span>
                {matchedReceiver && (
                  <span className="ml-2 text-xs text-muted">
                    ({formatRole(matchedReceiver.role)}
                    {matchedReceiver.outlet_name ? ` • ${matchedReceiver.outlet_name}` : ''})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(true);
                  setSearch('');
                }}
                className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-black/5"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(true);
                  setSearch('');
                }}
                className="rounded p-1 text-muted hover:text-foreground hover:bg-black/5"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsOpen((prev) => !prev);
              setSearch('');
            }}
            className="flex min-h-11 w-full items-center justify-between rounded-control border border-border bg-white px-3.5 text-sm text-muted hover:border-foreground focus:border-foreground focus:outline-none"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted" />
              <span>Select store receiver...</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        )}

        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-card border border-border bg-white p-2 shadow-lg">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search staff by name, store, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-9 w-full rounded-control border border-border bg-surface pl-8 pr-7 text-xs focus:border-foreground focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
              {isLoading && (
                <div className="py-4 text-center text-xs text-muted">Loading receivers...</div>
              )}

              {!isLoading && filtered.length === 0 && (
                <div className="py-3 text-center text-xs text-muted">
                  No matching personnel found
                </div>
              )}

              {/* Outlet Staff Section */}
              {matchingStoreStaff.length > 0 && (
                <div className="pb-1.5">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 rounded">
                    Assigned Store Staff ({outletName})
                  </div>
                  {matchingStoreStaff.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        onChange(r.name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded hover:bg-slate-100 flex items-center justify-between transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary">
                          {r.name}
                        </div>
                        <div className="text-[11px] text-muted truncate">
                          {formatRole(r.role)} • {r.outlet_name || 'No outlet'}
                        </div>
                      </div>
                      {value === r.name && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Other Staff Section */}
              {otherStaff.length > 0 && (
                <div className="pt-1.5">
                  {matchingStoreStaff.length > 0 && (
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                      Other Personnel
                    </div>
                  )}
                  {otherStaff.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        onChange(r.name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-100 flex items-center justify-between transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground group-hover:text-primary">
                          {r.name}
                        </div>
                        <div className="text-[11px] text-muted truncate">
                          {formatRole(r.role)} {r.outlet_name ? `• ${r.outlet_name}` : ''}
                        </div>
                      </div>
                      {value === r.name && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick option to use searched text as custom name if not in list */}
              {search.trim().length > 1 &&
                !receivers.some(
                  (r) => r.name.toLowerCase() === search.trim().toLowerCase(),
                ) && (
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChange(search.trim());
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded bg-amber-50/70 hover:bg-amber-100/70 text-amber-900 flex items-center justify-between text-xs"
                    >
                      <span>
                        Use &ldquo;<strong>{search.trim()}</strong>&rdquo; as receiver name
                      </span>
                      <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-200/60 px-1.5 py-0.5 rounded">
                        Custom
                      </span>
                    </button>
                  </div>
                )}
            </div>

            <div className="mt-2 border-t border-border pt-2 flex items-center justify-between px-1 text-[11px] text-muted">
              <span>{receivers.length} registered staff</span>
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true);
                  setIsOpen(false);
                }}
                className="text-primary hover:underline font-medium"
              >
                Enter custom name manually
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* VIEW 3: Delivery Complete / Items Checklist Screen                        */
/* Matches exports/Delivery Complete.jpg                                     */
/* ========================================================================= */
function DeliveryChecklistView({
  actorId,
  stop,
  trip,
  queue,
  busy,
  enqueue,
  back,
}: {
  actorId: string;
  stop: Stop;
  trip: Trip;
  queue: DriverOperation[];
  busy: boolean;
  enqueue: (operation: DriverOperation) => Promise<void>;
  back: () => void;
}) {
  const [receiver, setReceiver] = useState('');
  const [temperature, setTemperature] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);
  const [outcome, setOutcome] = useState<'DELIVERED' | 'PARTIAL' | 'REJECTED' | 'FAILED'>(
    'DELIVERED',
  );
  const [actual, setActual] = useState<Record<string, { delivered: number; rejected: number }>>({});
  const [aggregateUnits, setAggregateUnits] = useState(String(stop.aggregate?.units ?? 0));
  const [aggregateWeight, setAggregateWeight] = useState(stop.aggregate?.weight_kg ?? '0');
  const [aggregateVolume, setAggregateVolume] = useState(stop.aggregate?.volume_m3 ?? '0');

  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const sigId = useId();

  const arrival = queue.find((item) => item.stopId === stop.id && item.action === 'ARRIVAL');
  const delivery = queue.find((item) => item.stopId === stop.id && item.action === 'DELIVERY');
  const completed = Boolean(stop.attempt?.completed_at || delivery);

  const countdown = useCountdown(stop.window_close_at || stop.planned_arrival_at);
  const itemCount = computeItemCount(stop);

  const quantityFor = (line: Line) => actual[line.id] ?? { delivered: line.quantity, rejected: 0 };
  const validQuantities = stop.lines.every((line) => {
    const values = quantityFor(line);
    const maximum =
      stop.load_lines?.find((record) => record.order_line_id === line.id)?.loaded_quantity ??
      line.quantity;
    return (
      values.delivered >= 0 &&
      values.rejected >= 0 &&
      Number.isInteger(values.delivered) &&
      Number.isInteger(values.rejected) &&
      values.delivered + values.rejected <= maximum
    );
  });

  const envelope = () => ({
    id: crypto.randomUUID(),
    actorId,
    stopId: stop.id,
    planId: trip.plan_id,
    planVersion: trip.version,
    capturedAt: new Date().toISOString(),
  });

  async function act(kind: 'ARRIVAL' | 'DELIVERY') {
    setSaving(true);
    setError('');
    try {
      if (kind === 'ARRIVAL') {
        await enqueue({ ...envelope(), action: kind });
      } else {
        const proof =
          outcome === 'FAILED'
            ? undefined
            : await new Promise<Blob>((resolve, reject) =>
                canvas.current?.toBlob(
                  (blob) => (blob ? resolve(blob) : reject(new Error('Could not save signature.'))),
                  'image/png',
                ),
              );
        const proofId = crypto.randomUUID();
        const base = envelope();
        const attemptId = stop.attempt?.id ?? arrival?.attemptId;

        await enqueue({
          ...base,
          action: kind,
          ...(attemptId ? { attemptId } : {}),
          ...(proof ? { proof, proofId } : {}),
          payload: {
            outcome,
            completedAt: base.capturedAt,
            ...(receiver.trim() ? { receiverName: receiver.trim() } : {}),
            proofIds: proof ? [proofId] : [],
            ...(temperature ? { temperatureC: temperature } : {}),
            ...(stop.aggregate
              ? {
                  deliveredUnits:
                    outcome === 'FAILED' || outcome === 'REJECTED' ? 0 : Number(aggregateUnits),
                  deliveredWeightKg:
                    outcome === 'FAILED' || outcome === 'REJECTED' ? '0' : aggregateWeight,
                  deliveredVolumeM3:
                    outcome === 'FAILED' || outcome === 'REJECTED' ? '0' : aggregateVolume,
                }
              : {
                  lines: stop.lines.map((line) => ({
                    orderLineId: line.id,
                    deliveredQuantity:
                      outcome === 'FAILED' || outcome === 'REJECTED'
                        ? 0
                        : quantityFor(line).delivered,
                    rejectedQuantity:
                      outcome === 'FAILED'
                        ? 0
                        : outcome === 'REJECTED'
                          ? (stop.load_lines?.find((record) => record.order_line_id === line.id)
                              ?.loaded_quantity ?? line.quantity)
                          : quantityFor(line).rejected,
                  })),
                }),
          },
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save delivery');
    } finally {
      setSaving(false);
    }
  }

  const toggleLineChecked = (lineId: string) => {
    setChecked((prev) => ({ ...prev, [lineId]: !prev[lineId] }));
  };

  return (
    <div className="space-y-4">
      {/* Time Remaining Bar */}
      <div className="flex items-center justify-between text-sm font-semibold text-muted">
        <span>Time remaining</span>
        <span className="font-bold text-foreground tracking-wider">{countdown}</span>
      </div>

      {/* Order Banner Card matching Delivery Complete.jpg */}
      <div className="rounded-card border border-border bg-surface p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-base sm:text-lg text-foreground tracking-wide">
            {formatOrderId(stop.public_reference)}
          </span>
          <CategoryBadge value={stop.temperature_requirement} />
        </div>
        <span className="text-muted font-medium text-sm">
          {itemCount} items
        </span>
      </div>

      {/* Checklist Items matching Delivery Complete.jpg */}
      <div className="space-y-2.5">
        {stop.lines.map((line) => {
          const isItemChecked = Boolean(checked[line.id]);
          return (
            <div
              key={line.id}
              onClick={() => toggleLineChecked(line.id)}
              className="rounded-card border border-border bg-white px-4 py-3.5 flex items-center justify-between shadow-sm cursor-pointer hover:border-foreground/30 transition-all select-none"
            >
              <div className="flex flex-col">
                <span className="font-bold text-sm text-foreground tracking-wide">
                  {formatItemId(line.sku, undefined, line.id)}
                </span>
                <span className="text-xs text-muted mt-0.5 line-clamp-1">{line.name}</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-muted font-semibold text-sm">
                  X {line.quantity}
                </span>
                {/* Rounded checkbox toggle button */}
                <button
                  type="button"
                  aria-label={`Check ${line.name}`}
                  className={`h-7 w-7 rounded-control flex items-center justify-center transition-all ${
                    isItemChecked
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-border bg-surface hover:bg-stone-200'
                  }`}
                >
                  {isItemChecked && <Check size={15} className="stroke-[3]" />}
                </button>
              </div>
            </div>
          );
        })}

        {stop.aggregate && (
          <div
            onClick={() => setChecked((prev) => ({ ...prev, aggregate: !prev.aggregate }))}
            className="rounded-card border border-border bg-white px-4 py-3.5 flex items-center justify-between shadow-sm cursor-pointer select-none"
          >
            <div className="text-xs">
              <span className="font-bold text-foreground">Cargo aggregate</span>
              <span className="block text-muted">
                {stop.aggregate.units} units · {stop.aggregate.weight_kg} kg · {stop.aggregate.volume_m3} m³
              </span>
            </div>
            <button
              type="button"
              className={`h-7 w-7 rounded-control flex items-center justify-center ${
                checked.aggregate ? 'bg-primary text-white' : 'border border-border bg-surface'
              }`}
            >
              {checked.aggregate && <Check size={15} className="stroke-[3]" />}
            </button>
          </div>
        )}
      </div>

      {/* Delivery Confirmation Controls */}
      {completed ? (
        <div className={`${panel} text-center py-6 bg-emerald-50/50 border-emerald-200 space-y-2`}>
          <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-1" />
          <h2 className="text-lg font-bold text-emerald-950">
            {stop.attempt?.completed_at || delivery?.applied
              ? 'Delivery Confirmed'
              : 'Delivery Saved Locally'}
          </h2>
          <p className="text-xs text-muted max-w-xs mx-auto">
            {stop.attempt?.completed_at || delivery?.applied
              ? 'The server has confirmed proof of delivery.'
              : 'Saved on device. Will synchronize when connected.'}
          </p>
          <button
            type="button"
            onClick={back}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline"
          >
            Return to stop overview
          </button>
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          {/* Outcome Select */}
          <label className="block text-xs font-semibold text-foreground">
            Delivery Outcome
            <select
              className={field}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="DELIVERED">Full delivery</option>
              <option value="PARTIAL">Partial delivery</option>
              <option value="REJECTED">Receiver rejected goods</option>
              <option value="FAILED">Delivery failed</option>
            </select>
          </label>

          {/* Partial Details if outcome is PARTIAL */}
          {outcome === 'PARTIAL' && (
            <div className="space-y-3 bg-surface p-3.5 rounded-card border border-border">
              <h4 className="text-xs font-bold text-foreground">Specify delivered quantities</h4>
              {stop.lines.map((line) => (
                <div key={line.id} className="text-xs space-y-1.5">
                  <div className="font-semibold text-foreground">{line.name} (Max {line.quantity})</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      Delivered
                      <input
                        className={field}
                        type="number"
                        min="0"
                        max={line.quantity}
                        value={quantityFor(line).delivered}
                        onChange={(e) =>
                          setActual({
                            ...actual,
                            [line.id]: {
                              ...quantityFor(line),
                              delivered: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Rejected
                      <input
                        className={field}
                        type="number"
                        min="0"
                        max={line.quantity}
                        value={quantityFor(line).rejected}
                        onChange={(e) =>
                          setActual({
                            ...actual,
                            [line.id]: {
                              ...quantityFor(line),
                              rejected: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              {!validQuantities && (
                <p className="text-xs text-red-700">
                  Delivered and rejected quantities must fit the order line total.
                </p>
              )}
            </div>
          )}

          {/* Temperature for Chilled */}
          {stop.temperature_requirement === 'chilled' && (
            <label className="block text-xs font-semibold text-foreground">
              Measured Cargo Temperature (°C)
              <input
                className={field}
                type="number"
                step="0.1"
                placeholder="e.g. 3.2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
          )}

          {/* Receiver Name */}
          <ReceiverSelector
            actorId={actorId}
            outletName={stop.outlet_name}
            value={receiver}
            onChange={setReceiver}
          />

          {/* Receiver Signature */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <label htmlFor={sigId}>Receiver Signature</label>
              <button
                type="button"
                className="text-muted hover:text-foreground underline font-normal text-[11px]"
                onClick={() => {
                  canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 200);
                  setSigned(false);
                }}
              >
                Clear
              </button>
            </div>
            <canvas
              id={sigId}
              ref={canvas}
              width={600}
              height={200}
              aria-label="Receiver signature pad"
              className="h-28 w-full touch-none rounded-control border border-border bg-white"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const ctx = e.currentTarget.getContext('2d')!;
                ctx.beginPath();
                ctx.moveTo(
                  ((e.clientX - rect.left) * 600) / rect.width,
                  ((e.clientY - rect.top) * 200) / rect.height,
                );
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ctx = e.currentTarget.getContext('2d')!;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineTo(
                  ((e.clientX - rect.left) * 600) / rect.width,
                  ((e.clientY - rect.top) * 200) / rect.height,
                );
                ctx.stroke();
                setSigned(true);
              }}
              onPointerUp={() => {
                drawing.current = false;
              }}
              onPointerCancel={() => {
                drawing.current = false;
              }}
            />
          </div>

          {error && <p className="text-xs text-red-700 font-medium">{error}</p>}

          {/* "Mark Delivered" action button matching Delivery Complete.jpg */}
          <button
            type="button"
            className={primaryButton}
            disabled={
              saving ||
              busy ||
              (outcome !== 'FAILED' && (!signed || !receiver.trim())) ||
              (outcome === 'PARTIAL' && !validQuantities) ||
              (stop.temperature_requirement === 'chilled' && !temperature) ||
              (outcome !== 'FAILED' &&
                (stop.aggregate
                  ? !checked.aggregate
                  : !stop.lines.every((line) => checked[line.id])))
            }
            onClick={() => void act('DELIVERY')}
          >
            {saving ? 'Recording delivery…' : 'Mark Delivered'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ========================================================================= */
/* Return to Depot Helper Component                                          */
/* ========================================================================= */
function ReturnToDepotSection({
  trip,
  online,
  refresh,
}: {
  trip: Trip;
  online: boolean;
  refresh: () => void;
}) {
  const [odometer, setOdometer] = useState('');
  const [fuel, setFuel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={`${panel} space-y-3.5 bg-surface border-border`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await request(`/trips/${trip.id}/return`, {
            method: 'POST',
            body: JSON.stringify({
              returnedAt: new Date().toISOString(),
              endingOdometerKm: odometer,
              actualFuelL: fuel,
            }),
          });
          refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to record return');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Truck size={18} className="text-primary" />
        <h3 className="font-bold text-sm text-foreground">Return to Depot</h3>
      </div>
      <p className="text-xs text-muted">
        All stops completed. Record final odometer and fuel used to close this trip.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-foreground">
          Ending Odometer (km)
          <input
            required
            type="number"
            min="0"
            step="0.01"
            className={field}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-foreground">
          Actual Fuel Used (L)
          <input
            required
            type="number"
            min="0"
            step="0.01"
            className={field}
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-700 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={!online || busy}
        className={primaryButton}
      >
        {busy ? 'Saving return…' : 'Record Trip Return'}
      </button>
    </form>
  );
}
