import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Package,
  RefreshCw,
  Truck,
  Wifi,
  WifiOff,
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

const panel = 'rounded-card border border-border bg-white p-5';
const field = 'mt-2 min-h-12 w-full rounded-control border border-border bg-white px-4 text-sm';
const button =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-medium text-white disabled:opacity-40';
import type { Line, Stop, Trip, Detail } from '../../types/driver-workspace';
const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export function DriverWorkspace({ user }: { user: User }) {
  const cache = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const connectionState = useRef(navigator.onLine);
  const [queue, setQueue] = useState<DriverOperation[]>([]);
  const [tripId, setTripId] = useState('');
  const [stopId, setStopId] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
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
      if (navigator.onLine && (await operations(user.id)).some((operation) => !operation.applied))
        await sync();
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
      if (reachable && !wasOnline)
        void operations(user.id)
          .then((items) => {
            if (items.some((item) => !item.applied)) return sync();
          })
          .catch((error) => setNotice(error instanceof Error ? error.message : 'Sync unavailable'));
    };
    window.addEventListener('waypoint:connectivity', connectivity);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('waypoint:connectivity', connectivity);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [sync, refreshQueue]);
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
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-8">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          {online ? <Wifi size={17} /> : <WifiOff size={17} />}{' '}
          {online ? 'Connected' : 'Offline · saved route'}
        </span>
        <span className="text-muted">{user.displayName}</span>
      </div>
      {pending.length > 0 && (
        <div className="rounded-control border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>
            {pending.length} action(s) awaiting confirmation. Keep this device’s data until synced.
          </p>
          <button
            className="mt-3 flex items-center gap-2 font-medium underline"
            disabled={busy || !online}
            onClick={() => void sync()}
          >
            <RefreshCw size={16} />
            {busy ? 'Synchronizing…' : 'Retry synchronization'}
          </button>
          {pending.find((item) => item.error)?.error && (
            <p className="mt-2 text-red-800">{pending.find((item) => item.error)?.error}</p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-control border border-border bg-white p-4 text-sm">
          {notice}
        </p>
      )}
      {(trips.error || detail.error) && (
        <p role="alert" className="rounded-control bg-red-50 p-4 text-sm text-red-800">
          {(trips.error ?? detail.error)?.message}
        </p>
      )}
      {stop && detail.data ? (
        <DeliveryStop
          key={stop.id}
          actorId={user.id}
          stop={stop}
          trip={detail.data.trip}
          queue={queue}
          busy={busy}
          enqueue={enqueue}
          back={() => setStopId('')}
        />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Your routes</h1>
          <label className="block text-sm">
            Assigned trip
            <select
              className={field}
              value={selectedTrip}
              onChange={(event) => setTripId(event.target.value)}
            >
              <option value="">Choose a trip</option>
              {trips.data?.items.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.operating_date} · {trip.vehicle_id} · Trip {trip.trip_number}
                </option>
              ))}
            </select>
          </label>
          {(trips.isPending || detail.isLoading) && <p role="status">Loading routes…</p>}
          {trips.data?.items.length === 0 && (
            <div className={panel}>No trips assigned yet. Released trips will appear here.</div>
          )}
          {detail.data && (
            <>
              <div className={`${panel} flex items-center gap-4`}>
                <Truck size={28} />
                <div>
                  <h2 className="font-semibold">{detail.data.trip.vehicle_id}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {detail.data.trip.status.replaceAll('_', ' ')} · {detail.data.stops.length}{' '}
                    stops
                  </p>
                  <p className="text-xs text-muted">
                    Load {detail.data.manifest?.status ?? 'WAITING'} · Inspection{' '}
                    {detail.data.inspection ? 'recorded' : 'pending'}
                  </p>
                </div>
              </div>
              <TripActions
                key={selectedTrip}
                trip={detail.data.trip}
                online={online}
                chilled={detail.data.stops.some(
                  (stop) => stop.temperature_requirement === 'chilled',
                )}
                refresh={() => void cache.invalidateQueries({ queryKey: ['driver', user.id] })}
              />
              {detail.data.stops.map((item, index) => (
                <button
                  key={item.id}
                  className={`${panel} flex w-full items-center gap-4 text-left`}
                  onClick={() => setStopId(item.id)}
                >
                  <Package size={26} />
                  <div className="flex-1">
                    <strong>{item.public_reference}</strong>
                    <p className="mt-1 text-sm">{item.outlet_name ?? `Stop ${index + 1}`}</p>
                    <p className="mt-2 text-xs text-muted">
                      Planned arrival {formatDate(item.planned_arrival_at)}
                    </p>
                    <p className="mt-1 text-xs">
                      {item.attempt?.outcome ??
                        (item.attempt ? 'Delivery in progress' : 'Awaiting arrival')}
                    </p>
                  </div>
                  {item.attempt?.completed_at ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <ArrowRight size={22} />
                  )}
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
function TripActions({
  trip,
  online,
  chilled,
  refresh,
}: {
  trip: Trip;
  online: boolean;
  chilled: boolean;
  refresh: () => void;
}) {
  const [odometer, setOdometer] = useState('');
  const [fuel, setFuel] = useState('');
  const [temperature, setTemperature] = useState('');
  const [fuelChecked, setFuelChecked] = useState(false);
  const [chillerChecked, setChillerChecked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!['PLANNED', 'AWAITING_RETURN'].includes(trip.status)) return null;
  const returning = trip.status === 'AWAITING_RETURN';
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          await request(`/trips/${trip.id}/${returning ? 'return' : 'inspection'}`, {
            method: returning ? 'POST' : 'PUT',
            body: JSON.stringify(
              returning
                ? {
                    returnedAt: new Date().toISOString(),
                    endingOdometerKm: odometer,
                    actualFuelL: fuel,
                  }
                : {
                    startingOdometerKm: odometer,
                    fuelChecked,
                    chillerChecked,
                    ...(temperature ? { temperatureC: temperature } : {}),
                  },
            ),
          });
          refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to save');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">{returning ? 'Return to depot' : 'Pre-trip inspection'}</h2>
      {!returning && (
        <p className="text-sm text-muted">
          Complete these checks so the dispatcher can dispatch your loaded trip.
        </p>
      )}
      <label className="block text-sm">
        {returning ? 'Ending' : 'Starting'} odometer (km)
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
      {returning ? (
        <label className="block text-sm">
          Actual fuel used (L)
          <input
            required
            min="0"
            type="number"
            step="0.01"
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            className={field}
          />
        </label>
      ) : (
        <>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              required
              checked={fuelChecked}
              onChange={(e) => setFuelChecked(e.target.checked)}
            />
            Fuel checked
          </label>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              required={chilled}
              checked={chillerChecked}
              onChange={(e) => setChillerChecked(e.target.checked)}
            />
            Chiller checked (reefer vehicles)
          </label>
          <label className="block text-sm">
            Chiller temperature (°C)
            <input
              type="number"
              step="0.1"
              required={chilled}
              max={chilled ? 4 : undefined}
              className={field}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <button disabled={!online || busy} className={button}>
        {busy ? 'Saving…' : returning ? 'Record return' : 'Save inspection'}
      </button>
    </form>
  );
}
function DeliveryStop({
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const arrival = queue.find((item) => item.stopId === stop.id && item.action === 'ARRIVAL');
  const delivery = queue.find((item) => item.stopId === stop.id && item.action === 'DELIVERY');
  const arrived = !!stop.attempt || !!arrival;
  const completed = !!stop.attempt?.completed_at || !!delivery;
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
      if (kind === 'ARRIVAL') await enqueue({ ...envelope(), action: kind });
      else {
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
      setError(cause instanceof Error ? cause.message : 'Could not save action');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <button
        onClick={back}
        className="sticky top-0 z-20 -mt-1 flex min-h-11 w-full items-center gap-2 bg-surface py-1"
      >
        <ArrowLeft size={20} />
        Route overview
      </button>
      <div className={panel}>
        <MapPin size={26} />
        <h1 className="mt-4 text-xl font-semibold">{stop.outlet_name ?? stop.public_reference}</h1>
        <p className="mt-2 text-sm text-muted">
          Planned arrival {formatDate(stop.planned_arrival_at)}
        </p>
        <p className="text-sm text-muted">Window closes {formatDate(stop.window_close_at)}</p>
        <div className="mt-4">
          <StopMap location={stop} online={navigator.onLine} />
        </div>
        {stop.contact && (
          <a
            className="mt-4 block text-sm underline"
            href={`tel:${stop.contact.replace(/[^+0-9]/g, '')}`}
          >
            Call store · {stop.contact}
          </a>
        )}
      </div>
      <h2 className="font-semibold">
        {stop.public_reference} · {stop.temperature_requirement}
      </h2>
      {trip.status !== 'DISPATCHED' && !completed && (
        <p className="rounded-control bg-amber-50 p-4 text-sm">
          Dispatch must authorize departure before arrival can be recorded.
        </p>
      )}
      {completed ? (
        <div className={`${panel} text-center`}>
          <CheckCircle2 size={40} className="mx-auto mb-4" />
          <h2 className="text-xl font-semibold">
            {stop.attempt?.completed_at || delivery?.applied
              ? 'Delivery confirmed'
              : 'Delivery saved on this device'}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {stop.attempt?.completed_at || delivery?.applied
              ? 'The server has recorded the delivery.'
              : 'Awaiting synchronization. Keep this device’s data until confirmed.'}
          </p>
        </div>
      ) : !arrived ? (
        <button
          className={button}
          disabled={saving || busy || trip.status !== 'DISPATCHED'}
          onClick={() => void act('ARRIVAL')}
        >
          Record arrival · Start delivery
        </button>
      ) : (
        <>
          <label className="block text-sm">
            Delivery outcome
            <select
              className={field}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            >
              <option value="DELIVERED">Full delivery</option>
              <option value="PARTIAL">Partial delivery</option>
              <option value="REJECTED">Receiver rejected goods</option>
              <option value="FAILED">Delivery failed</option>
            </select>
          </label>
          <div className="space-y-3">
            {stop.lines.map((line) => (
              <label key={line.id} className={`${panel} flex items-center gap-3`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-black"
                  checked={!!checked[line.id]}
                  onChange={(e) => setChecked({ ...checked, [line.id]: e.target.checked })}
                />
                <span className="flex-1">
                  <strong className="text-sm">{line.name}</strong>
                  <span className="block text-xs text-muted">{line.sku}</span>
                </span>
                <span>× {line.quantity}</span>
              </label>
            ))}
            {stop.aggregate && (
              <label className={`${panel} flex gap-3`}>
                <input
                  type="checkbox"
                  checked={!!checked.aggregate}
                  onChange={(e) => setChecked({ ...checked, aggregate: e.target.checked })}
                />
                Confirm {stop.aggregate.units} units · {stop.aggregate.weight_kg} kg ·{' '}
                {stop.aggregate.volume_m3} m³ received
              </label>
            )}
          </div>
          {outcome === 'PARTIAL' && (
            <div className="space-y-3">
              {stop.lines.map((line) => (
                <div key={line.id} className={panel}>
                  <p className="text-sm font-medium">{line.name}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs">
                      Delivered
                      <input
                        className={field}
                        min="0"
                        max={line.quantity}
                        type="number"
                        step="1"
                        value={quantityFor(line).delivered}
                        onChange={(event) =>
                          setActual({
                            ...actual,
                            [line.id]: {
                              ...quantityFor(line),
                              delivered: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Rejected
                      <input
                        className={field}
                        min="0"
                        max={line.quantity}
                        type="number"
                        step="1"
                        value={quantityFor(line).rejected}
                        onChange={(event) =>
                          setActual({
                            ...actual,
                            [line.id]: {
                              ...quantityFor(line),
                              rejected: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              {stop.aggregate && (
                <div className={panel}>
                  <label className="block text-xs">
                    Delivered units
                    <input
                      className={field}
                      min="0"
                      max={stop.aggregate.units}
                      type="number"
                      step="1"
                      value={aggregateUnits}
                      onChange={(event) => setAggregateUnits(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs">
                    Delivered weight (kg)
                    <input
                      className={field}
                      min="0"
                      max={stop.aggregate.weight_kg}
                      type="number"
                      step="0.01"
                      value={aggregateWeight}
                      onChange={(event) => setAggregateWeight(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs">
                    Delivered volume (m³)
                    <input
                      className={field}
                      min="0"
                      max={stop.aggregate.volume_m3}
                      type="number"
                      step="0.001"
                      value={aggregateVolume}
                      onChange={(event) => setAggregateVolume(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {!validQuantities && (
                <p className="text-sm text-red-800">
                  Delivered and rejected quantities must fit the recorded load.
                </p>
              )}
            </div>
          )}
          <label className="block text-sm">
            Receiver name
            <input
              className={field}
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              maxLength={200}
            />
          </label>
          {stop.temperature_requirement === 'chilled' && (
            <label className="block text-sm">
              Measured temperature (°C)
              <input
                className={field}
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
          )}
          <div>
            <p className="mb-2 text-sm">Receiver signature</p>
            <canvas
              ref={canvas}
              width={600}
              height={220}
              aria-label="Receiver signature pad"
              className="h-36 w-full touch-none rounded-control border border-border bg-white"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const ctx = e.currentTarget.getContext('2d')!;
                ctx.beginPath();
                ctx.moveTo(
                  ((e.clientX - rect.left) * 600) / rect.width,
                  ((e.clientY - rect.top) * 220) / rect.height,
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
                  ((e.clientY - rect.top) * 220) / rect.height,
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
            <button
              className="mt-2 text-xs underline"
              onClick={() => {
                canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 220);
                setSigned(false);
              }}
            >
              Clear signature
            </button>
          </div>
          <button
            className={button}
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
            {saving ? 'Saving…' : `Confirm ${outcome.toLowerCase()} outcome`}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
