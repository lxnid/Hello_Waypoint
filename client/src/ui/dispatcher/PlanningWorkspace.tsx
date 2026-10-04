import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, Plus, Truck } from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { api, request } from '../../api';
import { ClusterPlanner } from './ClusterPlanner';
import type { Issue, Page, Reference, Store, StopInfo, Trip, Vehicle } from './planning-types';

const panel = 'rounded-[20px] border border-border bg-white/60 p-5';
const field =
  'min-h-11 rounded-[12px] border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black';
const pillSelectClass =
  'h-11 w-full appearance-none rounded-xl border border-border bg-white/60 pl-4 pr-11 text-sm font-normal text-foreground outline-none transition-colors hover:bg-white focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer';
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-primary px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-35';
const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-border bg-white px-4 text-sm disabled:opacity-35';
const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) });
const title = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase());

export function PlanningWorkspace({ user, tab }: { user: User; tab: string }) {
  const cache = useQueryClient();
  const [contextId, setContextId] = useState('');
  const [depot, setDepot] = useState(user.depot ?? user.authorizedDepots[0] ?? 'Peliyagoda');
  const [notice, setNotice] = useState('');
  const contexts = useQuery({
    queryKey: ['planning-contexts'],
    queryFn: () => api.planning.listContexts(),
  });
  const reference = useQuery({
    queryKey: ['dispatch-reference'],
    queryFn: () => api.dispatch.reference(),
  });
  const selectedId = contextId || contexts.data?.[0]?.id || '';
  const context = contexts.data?.find((item) => item.id === selectedId);
  const plans = useQuery({
    queryKey: ['plans', selectedId],
    enabled: !!selectedId,
    queryFn: () => api.planning.getContextPlans(selectedId),
  });
  const planId = plans.data?.find((plan) => plan.depot_id === depot)?.id;
  const detail = useQuery({
    queryKey: ['plan', planId],
    enabled: !!planId,
    refetchInterval: tab === 'planning' ? 5000 : false,
    queryFn: () => api.planning.getPlan(planId!),
  });
  const priorities = useQuery({
    queryKey: ['priorities', selectedId, depot],
    enabled: !!selectedId && tab === 'planning',
    queryFn: () => api.planning.getPriorities({ contextId: selectedId, depot }),
  });
  const fleet = useQuery({
    queryKey: ['fleet', selectedId],
    enabled: !!selectedId,
    queryFn: () =>
      request<Vehicle[]>(`/fleet?contextId=${selectedId}`).catch(() =>
        request<Vehicle[]>(`/planning/contexts/${selectedId}/fleet`),
      ),
  });
  const action = useMutation({
    mutationFn: async ({
      path,
      body,
      method,
    }: {
      path: string;
      body: unknown;
      method?: string | undefined;
    }) => request<Record<string, unknown>>(path, json(body, method)),
    onSuccess: async (result) => {
      setNotice(
        result.valid === false
          ? String(result.message ?? 'Plan requires attention')
          : result.valid === true
            ? 'Plan is feasible. Ready to release.'
            : 'Changes saved.',
      );
      await Promise.all(
        ['planning-contexts', 'plans', 'plan', 'priorities', 'fleet', 'trips', 'issues'].map(
          (key) => cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function run(path: string, body: unknown = {}, method?: string) {
    setNotice('');
    action.mutate({ path, body, method });
  }
  const busy = action.isPending;
  const error =
    action.error ??
    (tab === 'planning'
      ? (contexts.error ??
        reference.error ??
        plans.error ??
        detail.error ??
        priorities.error ??
        fleet.error)
      : tab === 'fleet'
        ? (contexts.error ?? fleet.error)
        : null);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden space-y-4">
      <div className="shrink-0 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{title(tab)}</h1>
          <p className="mt-1 text-sm text-muted">
            {tab === 'planning'
              ? 'Cluster orders, assign trips and prepare loads.'
              : 'Your operation, connected to live records.'}
          </p>
        </div>
        {['planning', 'fleet'].includes(tab) && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-muted">
              Planning date
              <div className="relative min-w-[160px]">
                <select
                  aria-label="Planning context"
                  className={pillSelectClass}
                  value={selectedId}
                  onChange={(event) => {
                    setContextId(event.target.value);
                    setNotice('');
                  }}
                >
                  <option value="">Choose context</option>
                  {contexts.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.operating_date}
                      {item.kind === 'SCENARIO' ? ' · Demo' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </label>
            <label className="grid gap-1 text-xs text-muted">
              Depot
              <div className="relative min-w-[140px]">
                <select
                  className={pillSelectClass}
                  value={depot}
                  onChange={(event) => setDepot(event.target.value as typeof depot)}
                >
                  {user.authorizedDepots.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </label>
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="shrink-0 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error.message}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="shrink-0 rounded-2xl border border-border bg-white p-4 text-sm"
        >
          {notice}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'planning' && (
          <>
            {selectedId && !planId && !plans.isLoading && (
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <div className={panel}>
                  <h2 className="font-medium">No {depot} plan yet</h2>
                  <p className="my-3 text-sm text-muted">
                    Create a draft to begin allocating eligible orders.
                  </p>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => run('/planning/plans', { contextId: selectedId, depot })}
                  >
                    <Plus size={18} />
                    Create plan
                  </button>
                </div>
              </div>
            )}
            {detail.data && context && reference.data && (
              <ClusterPlanner
                key={detail.data.plan.id}
                detail={detail.data}
                context={context}
                priorities={priorities.data ?? []}
                reference={reference.data}
                fleet={(fleet.data ?? []).filter((vehicle) => vehicle.depot_id === depot)}
              />
            )}
          </>
        )}
        {tab === 'fleet' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <FleetTable
              fleet={(fleet.data ?? reference.data?.vehicles ?? []).filter(
                (vehicle) => vehicle.depot_id === depot,
              )}
              busy={busy}
              editable={!!selectedId && !(plans.data ?? []).some((plan) => plan.status !== 'DRAFT')}
              onChange={(vehicleId, status) =>
                run(`/fleet/${vehicleId}`, { vehicleId, status, contextId: selectedId }, 'PUT')
              }
            />
          </div>
        )}
        {tab === 'stores' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <StoreTable reference={reference.data} />
          </div>
        )}
        {tab === 'tracker' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <TripTracker run={run} busy={busy} />
          </div>
        )}
        {tab === 'issues' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <Issues run={run} busy={busy} />
          </div>
        )}
        {(contexts.isLoading || reference.isLoading || detail.isLoading) && (
          <p role="status" className="shrink-0 p-6 text-sm text-muted">
            Loading operational records…
          </p>
        )}
      </div>
    </div>
  );
}

function FleetTable({
  fleet,
  editable,
  busy,
  onChange,
}: {
  fleet: Vehicle[];
  editable: boolean;
  busy: boolean;
  onChange: (id: string, status: string) => void;
}) {
  const [type, setType] = useState('');
  const [temp, setTemp] = useState('');
  const [status, setStatus] = useState('');

  const types = [...new Set(fleet.map((v) => v.type).filter(Boolean))];
  const temps = [...new Set(fleet.map((v) => v.temp).filter(Boolean))];

  const filtered = fleet.filter((vehicle) => {
    if (type && vehicle.type !== type) return false;
    if (temp && vehicle.temp !== temp) return false;
    if (status && (vehicle.status ?? 'available') !== status) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted shrink-0">Filter by</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[130px]">
            <select
              aria-label="Vehicle type"
              className={pillSelectClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Vehicle type</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {title(item)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
          <div className="relative min-w-[130px]">
            <select
              aria-label="Temperature"
              className={pillSelectClass}
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            >
              <option value="">Temperature</option>
              {temps.map((item) => (
                <option key={item} value={item}>
                  {title(item)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
          <div className="relative min-w-[130px]">
            <select
              aria-label="Availability"
              className={pillSelectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Availability</option>
              <option value="available">Available</option>
              <option value="workshop">In workshop</option>
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((vehicle) => (
          <section key={vehicle.id} className={panel}>
            <div className="flex items-center gap-3">
              <Truck size={24} />
              <h2 className="font-medium">{vehicle.id}</h2>
              <span
                className={`ml-auto rounded-full px-3 py-1 text-xs ${vehicle.temp === 'reefer' ? 'bg-chilled' : 'bg-ambient'}`}
              >
                {title(vehicle.temp)}
              </span>
            </div>
            <p className="my-5 text-sm text-muted">
              {title(vehicle.type)} · {vehicle.depot_id}
              <br />
              {vehicle.volume_cap_m3} m³ · {vehicle.weight_cap_kg} kg capacity
            </p>
            <label className="grid gap-1 text-xs text-muted">
              Availability
              <div className="relative">
                <select
                  className={pillSelectClass}
                  disabled={!editable || busy}
                  value={vehicle.status ?? 'available'}
                  onChange={(event) => onChange(vehicle.id, event.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="workshop">In workshop</option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </label>
            {!editable && (
              <p className="mt-2 text-xs text-muted">
                Choose an unreleased planning day to change availability.
              </p>
            )}
          </section>
        ))}
        {!filtered.length && <p className={panel}>No fleet records matching these filters.</p>}
      </div>
    </div>
  );
}
function StoreTable({ reference }: { reference?: Reference | undefined }) {
  const [search, setSearch] = useState('');
  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => request<Store[]>('/stores'),
  });
  const allStores: Store[] = storesQuery.data ?? reference?.stores ?? [];
  const stores = allStores.filter((store) =>
    `${store.id} ${store.name ?? ''} ${store.brand_name} ${store.district_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <input
        className={`${field} w-full max-w-md`}
        placeholder="Search stores, brands or districts"
        aria-label="Search stores"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p className="text-sm text-muted">{stores.length} stores</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {stores.map((store) => (
          <article className={panel} key={store.id}>
            <h2 className="font-medium">{store.name || store.id}</h2>
            <p className="mt-1 text-sm text-muted">
              {store.id} · {store.brand_name} · {store.district_name}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Delivery window</dt>
                <dd>
                  {store.window_open_time.slice(0, 5)}–{store.window_close_time.slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Vehicle access</dt>
                <dd>{title(store.parking_constraint)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Depot</dt>
                <dd>{store.depot_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Contact</dt>
                <dd>{store.contact || 'Not recorded'}</dd>
              </div>
            </dl>
            <StoreLocation store={store} />
          </article>
        ))}
      </div>
    </>
  );
}
function TripTracker({
  run,
  busy,
}: {
  run: (path: string, body?: unknown, method?: string) => void;
  busy: boolean;
}) {
  const [cursor, setCursor] = useState('');
  const [tripId, setTripId] = useState('');
  const trips = useQuery({
    queryKey: ['trips', 'dispatcher', cursor],
    queryFn: () =>
      request<Page<Trip>>(
        `/tracker?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ).catch(() =>
        request<Page<Trip>>(
          `/trips?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ),
      ),
    refetchInterval: 30000,
  });
  const detail = useQuery({
    queryKey: ['trip', tripId],
    enabled: !!tripId,
    queryFn: () =>
      request<{
        trip: Trip;
        stops: StopInfo[];
        manifest: { status: string } | null;
        inspection: object | null;
      }>(`/tracker/${tripId}`).catch(() =>
        request<{
          trip: Trip;
          stops: StopInfo[];
          manifest: { status: string } | null;
          inspection: object | null;
        }>(`/trips/${tripId}`),
      ),
    refetchInterval: 30000,
  });
  return (
    <>
      <p className="text-sm text-muted">
        Operational status refreshes every 30 seconds. Location telemetry is not available.
      </p>
      {(trips.error || detail.error) && (
        <p role="alert" className="text-red-700">
          {(trips.error ?? detail.error)?.message}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          {trips.data?.items.map((trip) => (
            <button
              key={trip.id}
              className={`${panel} flex w-full items-center gap-4 text-left`}
              onClick={() => setTripId(trip.id)}
            >
              <Truck size={24} />
              <span className="flex-1">
                <strong className="block font-medium">
                  {trip.vehicle_id} · Trip {trip.trip_number}
                </strong>
                <span className="text-xs text-muted">
                  {trip.operating_date} · {title(trip.status)} · Load{' '}
                  {title(trip.manifest_status ?? 'WAITING')}
                </span>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
          {trips.data?.items.length === 0 && <p className={panel}>No released trips yet.</p>}
          <div className="flex gap-2">
            {cursor && (
              <button className={secondary} onClick={() => setCursor('')}>
                First page
              </button>
            )}
            {trips.data?.nextCursor && (
              <button className={secondary} onClick={() => setCursor(trips.data!.nextCursor!)}>
                Next page
              </button>
            )}
          </div>
        </section>
        {detail.data && (
          <aside className={panel}>
            <h2 className="text-lg font-medium">
              {detail.data.trip.vehicle_id} · Trip {detail.data.trip.trip_number}
            </h2>
            <p className="my-3 text-sm text-muted">
              Load {title(detail.data.manifest?.status ?? 'WAITING')} · Inspection{' '}
              {detail.data.inspection ? 'completed' : 'pending'}
            </p>
            <ol className="space-y-3">
              {detail.data.stops.map((stop) => (
                <li className="rounded-2xl border border-border p-4" key={stop.id}>
                  <p className="text-sm font-medium">
                    {stop.sequence}. {stop.outlet_name || stop.public_reference || stop.order_id}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Planned arrival{' '}
                    {new Date(stop.planned_arrival_at).toLocaleString('en-GB', {
                      timeZone: 'Asia/Colombo',
                    })}
                  </p>
                  <p className="mt-2 text-xs">
                    {stop.attempt?.outcome
                      ? title(stop.attempt.outcome)
                      : stop.attempt
                        ? 'Driver arrived'
                        : 'Awaiting arrival'}
                  </p>
                </li>
              ))}
            </ol>
            <button
              className={`${button} mt-5`}
              disabled={
                busy ||
                detail.data.trip.status !== 'PLANNED' ||
                detail.data.manifest?.status !== 'COMPLETED' ||
                !detail.data.inspection
              }
              onClick={() => run(`/trips/${tripId}/depart`)}
            >
              Authorize departure
            </button>
          </aside>
        )}
      </div>
    </>
  );
}
function Issues({
  run,
  busy,
}: {
  run: (path: string, body?: unknown, method?: string) => void;
  busy: boolean;
}) {
  const [cursor, setCursor] = useState('');
  const issues = useQuery({
    queryKey: ['issues', 'dispatcher', cursor],
    queryFn: () =>
      request<Page<Issue>>(
        `/issues?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
  });
  return (
    <>
      {issues.error && (
        <p role="alert" className="text-red-700">
          {issues.error.message}
        </p>
      )}
      <div className="space-y-3">
        {issues.data?.items.map((issue) => (
          <IssueCard key={issue.id} issue={issue} run={run} busy={busy} />
        ))}
        {issues.data?.items.length === 0 && (
          <p className={panel}>No operational issues reported.</p>
        )}
      </div>
      <div className="flex gap-2">
        {cursor && (
          <button className={secondary} onClick={() => setCursor('')}>
            First page
          </button>
        )}
        {issues.data?.nextCursor && (
          <button className={secondary} onClick={() => setCursor(issues.data!.nextCursor!)}>
            Next page
          </button>
        )}
      </div>
    </>
  );
}
function IssueCard({
  issue,
  run,
  busy,
}: {
  issue: Issue;
  run: (path: string, body?: unknown, method?: string) => void;
  busy: boolean;
}) {
  const [resolution, setResolution] = useState('');
  return (
    <article className={panel}>
      <div className="flex justify-between">
        <h2 className="font-medium">
          {title(issue.type)} · {title(issue.stage)}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs ${issue.resolved_at ? 'bg-ambient' : 'bg-fragile'}`}
        >
          {issue.resolved_at ? 'Resolved' : 'Open'}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Order {issue.order_id.slice(0, 8)} · {issue.affected_quantity} affected units
      </p>
      <p className="mt-3 text-sm">{issue.notes || 'No additional notes'}</p>
      {issue.resolved_at ? (
        <p className="mt-3 text-sm">Resolution: {issue.resolution}</p>
      ) : (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(`/issues/${issue.id}/resolve`, { resolution });
          }}
        >
          <input
            className={`${field} min-w-48 flex-1`}
            aria-label="Issue resolution"
            placeholder="Describe the agreed resolution"
            required
            value={resolution}
            maxLength={2000}
            onChange={(event) => setResolution(event.target.value)}
          />
          <button className={button} disabled={busy || !resolution.trim()}>
            Resolve issue
          </button>
        </form>
      )}
    </article>
  );
}

function StoreLocation({ store }: { store: Store }) {
  const cache = useQueryClient();
  const [address, setAddress] = useState(store.address ?? '');
  const [latitude, setLatitude] = useState(store.latitude ?? '');
  const [longitude, setLongitude] = useState(store.longitude ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      request(`/stores/${encodeURIComponent(store.id)}/location`, {
        method: 'PUT',
        body: JSON.stringify({
          address: address.trim() || null,
          latitude: latitude === '' ? null : Number(latitude),
          longitude: longitude === '' ? null : Number(longitude),
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['stores'] }),
        cache.invalidateQueries({ queryKey: ['dispatch-reference'] }),
      ]);
    },
  });
  return (
    <details className="mt-5 border-t border-border pt-4">
      <summary className="cursor-pointer text-sm font-medium">
        Navigation location {store.address || store.latitude ? '· recorded' : '· missing'}
      </summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-xs text-muted">
          Use a verified delivery entrance address or coordinates. Drivers use this destination for
          navigation.
        </p>
        <label className="grid gap-1 text-xs">
          Street address
          <input
            className={field}
            value={address}
            maxLength={500}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs">
            Latitude
            <input
              className={`${field} w-full min-w-0`}
              type="number"
              step="0.0000001"
              min="-90"
              max="90"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Longitude
            <input
              className={`${field} w-full min-w-0`}
              type="number"
              step="0.0000001"
              min="-180"
              max="180"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
        </div>
        {mutation.error && (
          <p role="alert" className="text-xs text-red-800">
            {mutation.error.message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-xs">
            Location saved.
          </p>
        )}
        <button
          className={secondary}
          disabled={mutation.isPending || (latitude === '') !== (longitude === '')}
        >
          Save location
        </button>
      </form>
    </details>
  );
}
