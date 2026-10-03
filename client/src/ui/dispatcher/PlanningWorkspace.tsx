import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Package,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Truck,
  X,
} from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { request } from '../../api';
import type {
  Context,
  Decision,
  Deferral,
  DraftTrip,
  Issue,
  Page,
  Plan,
  PlanDetail,
  Priority,
  Reference,
  Trip,
  Vehicle,
} from './planning-types';

const panel = 'rounded-[20px] border border-border bg-white/60 p-5';
const field =
  'min-h-11 rounded-[12px] border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black';
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
  const [date, setDate] = useState('');
  const [notice, setNotice] = useState('');
  const contexts = useQuery({
    queryKey: ['planning-contexts'],
    queryFn: () => request<Context[]>('/planning/contexts'),
  });
  const reference = useQuery({
    queryKey: ['dispatch-reference'],
    queryFn: () => request<Reference>('/dispatch/reference'),
  });
  const selectedId = contextId || contexts.data?.[0]?.id || '';
  const context = contexts.data?.find((item) => item.id === selectedId);
  const plans = useQuery({
    queryKey: ['plans', selectedId],
    enabled: !!selectedId,
    queryFn: () => request<Plan[]>(`/planning/contexts/${selectedId}/plans`),
  });
  const planId = plans.data?.find((plan) => plan.depot_id === depot)?.id;
  const detail = useQuery({
    queryKey: ['plan', planId],
    enabled: !!planId,
    queryFn: () => request<PlanDetail>(`/planning/plans/${planId}`),
  });
  const priorities = useQuery({
    queryKey: ['priorities', selectedId, depot],
    enabled: !!selectedId && tab === 'planning',
    queryFn: () =>
      request<Priority[]>(`/planning/priorities?contextId=${selectedId}&depot=${depot}`),
  });
  const fleet = useQuery({
    queryKey: ['fleet', selectedId],
    enabled: !!selectedId,
    queryFn: () => request<Vehicle[]>(`/planning/contexts/${selectedId}/fleet`),
  });
  const drivers = useQuery({
    queryKey: ['drivers', selectedId],
    enabled: !!selectedId && tab === 'planning',
    queryFn: () =>
      request<{ id: string; name: string; depot_id: string }[]>(
        `/planning/contexts/${selectedId}/drivers`,
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
    contexts.error ??
    reference.error ??
    plans.error ??
    detail.error ??
    fleet.error ??
    priorities.error ??
    drivers.error;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{title(tab)}</h1>
          <p className="mt-1 text-sm text-muted">
            {tab === 'planning'
              ? 'Cluster orders, assign trips and prepare loads.'
              : 'Your operation, connected to live records.'}
          </p>
        </div>
        {['planning', 'fleet'].includes(tab) && (
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-xs text-muted">
              Planning date
              <select
                aria-label="Planning context"
                className={field}
                value={selectedId}
                onChange={(event) => {
                  setContextId(event.target.value);
                  setNotice('');
                }}
              >
                <option value="">Choose context</option>
                {contexts.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.operating_date} · {item.kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">
              Depot
              <select
                className={field}
                value={depot}
                onChange={(event) => setDepot(event.target.value as typeof depot)}
              >
                {user.authorizedDepots.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error.message}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-2xl border border-border bg-white p-4 text-sm">
          {notice}
        </div>
      )}
      {tab === 'planning' && (
        <>
          <details className={panel}>
            <summary className="cursor-pointer text-sm font-medium">Start a planning day</summary>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate(
                  { path: '/planning/contexts', body: { operatingDate: date } },
                  { onSuccess: (result) => setContextId(String(result.id)) },
                );
              }}
            >
              <label className="grid gap-1 text-xs text-muted">
                Operating date
                <select
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={field}
                >
                  <option value="">Choose operating day</option>
                  {reference.data?.operatingDates.map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </select>
              </label>
              <button className={button} disabled={!date || busy}>
                Open planning day
              </button>
            </form>
          </details>
          {selectedId && !planId && !plans.isLoading && (
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
          )}
          {detail.data && context && reference.data && (
            <PlanEditor
              key={`${detail.data.plan.id}:${detail.data.plan.version}`}
              detail={detail.data}
              context={context}
              priorities={priorities.data ?? []}
              reference={reference.data}
              fleet={(fleet.data ?? []).filter((vehicle) => vehicle.depot_id === depot)}
              drivers={(drivers.data ?? []).filter((driver) => driver.depot_id === depot)}
              busy={busy}
              run={run}
            />
          )}
        </>
      )}
      {tab === 'fleet' && (
        <FleetTable
          fleet={(fleet.data ?? reference.data?.vehicles ?? []).filter(
            (vehicle) => vehicle.depot_id === depot,
          )}
          busy={busy}
          editable={!!selectedId && !(plans.data ?? []).some((plan) => plan.status !== 'DRAFT')}
          onChange={(vehicleId, status) =>
            run(`/planning/contexts/${selectedId}/fleet`, { vehicleId, status }, 'PUT')
          }
        />
      )}
      {tab === 'stores' && <StoreTable reference={reference.data} />}
      {tab === 'tracker' && <TripTracker run={run} busy={busy} />}
      {tab === 'issues' && <Issues run={run} busy={busy} />}
      {(contexts.isLoading || reference.isLoading || detail.isLoading) && (
        <p role="status" className="p-6 text-sm text-muted">
          Loading operational records…
        </p>
      )}
    </div>
  );
}

type EditorProps = {
  detail: PlanDetail;
  context: Context;
  priorities: Priority[];
  reference: Reference;
  fleet: Vehicle[];
  drivers: { id: string; name: string }[];
  busy: boolean;
  run: (path: string, body?: unknown, method?: string) => void;
};
function PlanEditor({
  detail,
  context,
  priorities,
  reference,
  fleet,
  drivers,
  busy,
  run,
}: EditorProps) {
  const { plan } = detail;
  const [cluster, setCluster] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [brand, setBrand] = useState('');
  const [district, setDistrict] = useState('');
  const [trips, setTrips] = useState<DraftTrip[]>(
    detail.trips.map((trip) => ({
      vehicleId: trip.vehicle_id,
      driverId: trip.driver_id,
      orderIds: trip.stops.map((stop) => stop.order_id),
    })),
  );
  const [deferrals, setDeferrals] = useState<Deferral[]>(
    detail.decisions
      .filter((decision) => decision.decision === 'DEFERRED')
      .map((decision) => ({
        orderId: decision.order_id,
        reasonCode: decision.reason_code ?? '',
        rationale: decision.rationale ?? '',
        nextEligibleDate: decision.next_eligible_date ?? '',
      })),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [targetTrip, setTargetTrip] = useState('new');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [nextDate, setNextDate] = useState(
    reference.operatingDates.find((day) => day > context.operating_date) ?? '',
  );
  const [dirty, setDirty] = useState(false);
  const editable = plan.status === 'DRAFT';
  const groups = useMemo(() => {
    const map = new Map<string, Priority[]>();
    for (const item of priorities) {
      const key = `${item.district}|${item.brand}`;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [priorities]);
  const assigned = new Set(trips.flatMap((trip) => trip.orderIds));
  const deferred = new Set(deferrals.map((item) => item.orderId));
  const decided = priorities.filter(
    (item) => assigned.has(item.orderId) || deferred.has(item.orderId),
  ).length;
  const current = groups.find(([key]) => key === cluster)?.[1] ?? [];
  const save = () =>
    run(
      `/planning/plans/${plan.id}`,
      { version: plan.version, trips: trips.filter((trip) => trip.orderIds.length), deferrals },
      'PUT',
    );
  function move(kind: 'trip' | 'defer') {
    const without = trips.map((trip) => ({
      ...trip,
      orderIds: trip.orderIds.filter((id) => !selected.includes(id)),
    }));
    if (kind === 'trip') {
      if (targetTrip === 'new') without.push({ vehicleId, driverId, orderIds: selected });
      else without[Number(targetTrip)]!.orderIds.push(...selected);
    }
    setTrips(without);
    setDeferrals([
      ...deferrals.filter((item) => !selected.includes(item.orderId)),
      ...(kind === 'defer'
        ? selected.map((orderId) => ({
            orderId,
            reasonCode: 'DISPATCHER_DECISION',
            rationale: reason,
            nextEligibleDate: nextDate,
          }))
        : []),
    ]);
    setSelected([]);
    setDirty(true);
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
        <span className="text-sm">
          {context.operating_date} · {plan.depot_id} · <strong>{title(plan.status)}</strong> · v
          {plan.version}
        </span>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <button
                className={secondary}
                disabled={busy || dirty}
                onClick={() =>
                  run(`/planning/plans/${plan.id}/generate`, { version: plan.version })
                }
              >
                Auto assign
              </button>
              <button
                className={secondary}
                disabled={busy || dirty}
                onClick={() =>
                  run(`/planning/plans/${plan.id}/validate`, { version: plan.version })
                }
              >
                Validate
              </button>
              <button
                className={button}
                disabled={busy || dirty || !detail.decisions.length}
                onClick={() => run(`/planning/plans/${plan.id}/release`, { version: plan.version })}
              >
                Release loads
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {!editable && (
            <a
              className={secondary}
              href={`/api/v1/planning/contexts/${context.id}/allocation.csv`}
            >
              Export allocation
            </a>
          )}
        </div>
      </div>
      {dirty && (
        <p role="status" className="text-sm text-muted">
          Unsaved assignment changes. Decide every eligible order, then save before validating or
          releasing.
        </p>
      )}
      {!cluster ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-medium">
              Clusters{' '}
              <span className="ml-3 text-sm font-normal text-muted">
                {groups.length} identified
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted">Filter by</span>
              <div className="relative min-w-[140px]">
                <select
                  aria-label="Filter clusters by brand"
                  className="h-11 w-full appearance-none rounded-xl border border-border bg-white/60 pl-4 pr-11 text-sm font-normal text-foreground outline-none transition-colors hover:bg-white focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                >
                  <option value="">Brand</option>
                  {[...new Set(priorities.map((item) => item.brand))].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
              <div className="relative min-w-[140px]">
                <select
                  aria-label="Filter clusters by district"
                  className="h-11 w-full appearance-none rounded-xl border border-border bg-white/60 pl-4 pr-11 text-sm font-normal text-foreground outline-none transition-colors hover:bg-white focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  value={district}
                  onChange={(event) => setDistrict(event.target.value)}
                >
                  <option value="">District</option>
                  {[...new Set(priorities.map((item) => item.district))].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </div>
          </div>
          <div
            className={`grid gap-5 ${summaryOpen ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : 'xl:grid-cols-[minmax(0,1fr)_60px]'}`}
          >
            <div className="space-y-3">
              {groups
                .filter(
                  ([, items]) =>
                    (!brand || items[0]?.brand === brand) &&
                    (!district || items[0]?.district === district),
                )
                .map(([key, items]) => (
                  <button
                    key={key}
                    className={`${panel} flex min-h-24 w-full flex-wrap items-center justify-between gap-4 text-left hover:bg-white`}
                    onClick={() => setCluster(key)}
                  >
                    <span className="font-medium">
                      {items[0]?.district} – {items[0]?.brand}
                    </span>
                    <span className="flex gap-2">
                      <span className="rounded-full border border-border bg-ambient px-3 py-1 text-xs">
                        {items.filter((item) => item.temperatureRequirement === 'ambient').length}{' '}
                        Ambient
                      </span>
                      <span className="rounded-full border border-border bg-chilled px-3 py-1 text-xs">
                        {items.filter((item) => item.temperatureRequirement === 'chilled').length}{' '}
                        Chilled
                      </span>
                    </span>
                    <span className="text-sm text-muted">Total {items.length}</span>
                    <ArrowRight size={20} />
                  </button>
                ))}
              {!groups.length && (
                <div className={panel}>
                  {editable
                    ? 'No eligible orders for this planning day and depot.'
                    : 'This plan has been released. Review its loads below.'}
                </div>
              )}
            </div>
            <aside
              className={`${panel} ${summaryOpen ? 'p-5' : 'p-2.5 flex flex-col items-center'}`}
            >
              {summaryOpen ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Cluster Summary</h3>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-foreground transition-colors"
                      onClick={() => setSummaryOpen(false)}
                      aria-label="Collapse cluster summary"
                      aria-expanded={true}
                    >
                      <PanelRightClose size={20} />
                    </button>
                  </div>
                  <p className="mt-8 text-5xl font-medium tabular-nums">
                    {groups.length.toString().padStart(2, '0')}
                  </p>
                  <p className="mt-2 text-sm text-muted">Total clusters identified</p>
                  <dl className="mt-8 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted">Orders assigned</dt>
                      <dd className="font-medium tabular-nums">{assigned.size}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Deferred orders</dt>
                      <dd className="font-medium tabular-nums">{deferrals.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Awaiting decision</dt>
                      <dd className="font-medium tabular-nums">
                        {Math.max(0, priorities.length - decided)}
                      </dd>
                    </div>
                  </dl>
                  <label className="mt-8 block text-xs font-medium">
                    Decision progress
                    <progress
                      className="mt-2 h-2 w-full accent-black"
                      max={priorities.length || 1}
                      value={decided}
                    />
                  </label>
                </>
              ) : (
                <button
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-foreground transition-colors"
                  onClick={() => setSummaryOpen(true)}
                  aria-label="Expand cluster summary"
                  aria-expanded={false}
                >
                  <PanelRightOpen size={20} />
                </button>
              )}
            </aside>
          </div>
        </>
      ) : (
        <>
          <button
            className="flex items-center gap-3 font-medium"
            onClick={() => {
              setCluster('');
              setSelected([]);
            }}
          >
            <ArrowLeft size={20} /> {cluster.replace('|', ' – ')}
          </button>
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <section className={panel}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-medium">Stage Orders</h2>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={current.length > 0 && selected.length === current.length}
                    onChange={(event) =>
                      setSelected(event.target.checked ? current.map((item) => item.orderId) : [])
                    }
                  />
                  Select all
                </label>
              </div>
              <div className="max-h-[58vh] space-y-3 overflow-auto">
                {current.map((order) => {
                  const store = reference.stores.find((item) => item.id === order.outletId);
                  return (
                    <label
                      key={order.orderId}
                      className="flex cursor-pointer gap-4 rounded-[20px] border border-border bg-surface p-4"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-black"
                        checked={selected.includes(order.orderId)}
                        disabled={!editable}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, order.orderId]
                              : selected.filter((id) => id !== order.orderId),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap justify-between gap-2">
                          <strong className="font-medium">{order.publicReference}</strong>
                          <span
                            className={`rounded-full px-3 py-1 text-xs ${order.temperatureRequirement === 'chilled' ? 'bg-chilled' : 'bg-ambient'}`}
                          >
                            {title(order.temperatureRequirement)}
                          </span>
                        </span>
                        <span className="mt-1 block font-medium">
                          {store?.name || order.outletId}
                        </span>
                        <span
                          className={`mt-2 block text-xs ${order.requiresOverride ? 'text-red-700' : 'text-muted'}`}
                        >
                          {order.daysSinceLastServed === null
                            ? 'Service history unknown'
                            : `${order.daysSinceLastServed} days since last served`}
                          {order.requiresOverride && ' · Protected'}
                        </span>
                        <span className="mt-2 flex justify-between gap-2 text-xs text-muted">
                          <span>
                            {store?.window_open_time.slice(0, 5)}–
                            {store?.window_close_time.slice(0, 5)}
                          </span>
                          <span>{store ? title(store.parking_constraint) : ''}</span>
                        </span>
                        <span className="mt-2 block text-xs">
                          {assigned.has(order.orderId)
                            ? 'Assigned to trip'
                            : deferred.has(order.orderId)
                              ? 'Deferred'
                              : 'Awaiting decision'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {editable && (
                <div className="mt-5 space-y-3 border-t border-border pt-4">
                  <p className="text-xs text-muted">
                    {selected.length} selected · Stage into a trip using the assignment panel.
                  </p>
                  <label className="grid gap-1 text-xs">
                    Deferral rationale
                    <input
                      className={field}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Explain why these orders cannot be served"
                      maxLength={2000}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Next eligible operating day
                    <select
                      className={field}
                      value={nextDate}
                      onChange={(event) => setNextDate(event.target.value)}
                    >
                      {reference.operatingDates
                        .filter((day) => day > context.operating_date)
                        .map((day) => (
                          <option key={day}>{day}</option>
                        ))}
                    </select>
                  </label>
                  <button
                    className={secondary}
                    disabled={!selected.length || !reason.trim() || !nextDate || busy}
                    onClick={() => move('defer')}
                  >
                    Defer selected
                  </button>
                </div>
              )}
            </section>
            <section className={panel}>
              <h2 className="mb-5 text-lg font-medium">Load / Vehicle Assigning</h2>
              {editable && (
                <div className="mb-5 space-y-3 rounded-2xl border border-border p-4">
                  <label className="grid gap-1 text-xs">
                    Stage into
                    <select
                      className={field}
                      value={targetTrip}
                      onChange={(event) => setTargetTrip(event.target.value)}
                    >
                      <option value="new">New trip</option>
                      {trips.map((trip, index) => (
                        <option key={index} value={index}>
                          Trip {index + 1} · {trip.vehicleId}
                        </option>
                      ))}
                    </select>
                  </label>
                  {targetTrip === 'new' && (
                    <>
                      <label className="grid gap-1 text-xs">
                        Vehicle
                        <select
                          className={field}
                          value={vehicleId}
                          onChange={(event) => setVehicleId(event.target.value)}
                        >
                          <option value="">Choose available vehicle</option>
                          {fleet
                            .filter((vehicle) => vehicle.status === 'available')
                            .map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.id} · {vehicle.type} · {vehicle.temp} ·{' '}
                                {vehicle.volume_cap_m3} m³
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs">
                        Driver
                        <select
                          className={field}
                          value={driverId}
                          onChange={(event) => setDriverId(event.target.value)}
                        >
                          <option value="">Choose driver</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <button
                    className={button}
                    disabled={
                      !selected.length ||
                      (targetTrip === 'new' && (!vehicleId || !driverId)) ||
                      busy
                    }
                    onClick={() => move('trip')}
                  >
                    Stage selected
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              {trips.map((trip, index) => (
                <div key={index} className="mb-3 rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-3">
                    <Truck size={22} />
                    <h3 className="font-medium">{trip.vehicleId}</h3>
                    <span className="ml-auto text-xs text-muted">Trip {index + 1}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {drivers.find((driver) => driver.id === trip.driverId)?.name ?? trip.driverId} ·{' '}
                    {trip.orderIds.length} stops
                  </p>
                  <ol className="mt-3 space-y-2">
                    {trip.orderIds.map((id, stopIndex) => (
                      <li
                        key={id}
                        className="flex items-center justify-between rounded-xl bg-textile px-3 py-2 text-xs"
                      >
                        <span>
                          {stopIndex + 1}.{' '}
                          {priorities.find((item) => item.orderId === id)?.publicReference ??
                            id.slice(0, 8)}
                        </span>
                        {editable && (
                          <span className="flex gap-2">
                            <button
                              aria-label="Move stop earlier"
                              disabled={!stopIndex}
                              onClick={() => {
                                const ids = [...trip.orderIds];
                                [ids[stopIndex - 1], ids[stopIndex]] = [
                                  ids[stopIndex]!,
                                  ids[stopIndex - 1]!,
                                ];
                                setTrips(
                                  trips.map((item, i) =>
                                    i === index ? { ...item, orderIds: ids } : item,
                                  ),
                                );
                                setDirty(true);
                              }}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              aria-label="Move stop later"
                              disabled={stopIndex === trip.orderIds.length - 1}
                              onClick={() => {
                                const ids = [...trip.orderIds];
                                [ids[stopIndex + 1], ids[stopIndex]] = [
                                  ids[stopIndex]!,
                                  ids[stopIndex + 1]!,
                                ];
                                setTrips(
                                  trips.map((item, i) =>
                                    i === index ? { ...item, orderIds: ids } : item,
                                  ),
                                );
                                setDirty(true);
                              }}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              aria-label="Unassign order"
                              onClick={() => {
                                setTrips(
                                  trips.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          orderIds: item.orderIds.filter(
                                            (orderId) => orderId !== id,
                                          ),
                                        }
                                      : item,
                                  ),
                                );
                                setDirty(true);
                              }}
                            >
                              <X size={16} />
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              {!trips.length && (
                <p className="text-sm text-muted">
                  Choose orders, a compatible vehicle and a driver to build the first trip.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {decided} / {priorities.length} eligible orders have a decision. Server validation
            checks capacity, temperature and time windows.
          </p>
          <button
            className={button}
            disabled={busy || !dirty || decided !== priorities.length}
            onClick={save}
          >
            Save assignments
            <Check size={16} />
          </button>
        </div>
      )}
      {detail.decisions
        .filter((decision) => decision.decision === 'DEFERRED')
        .map((decision) => (
          <Override
            key={decision.id}
            decision={decision}
            priority={priorities.find((item) => item.orderId === decision.order_id)}
            version={plan.version}
            disabled={!editable || dirty || busy}
            run={run}
          />
        ))}
      {!editable && (
        <section className={panel}>
          <h2 className="mb-4 text-lg font-medium">Load Assigning</h2>
          <p className="mb-4 text-sm text-muted">
            Released loads are visible to loaders in the assigned depot. Departure requires signed
            loading and the driver's inspection.
          </p>
          {detail.trips.map((trip) => (
            <div
              key={trip.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4"
            >
              <span className="flex items-center gap-3">
                <Package size={20} />
                <span className="text-sm">
                  {trip.vehicle_id} · Trip {trip.trip_number}
                  <span className="block text-xs text-muted">
                    {trip.stops.length} orders · {title(trip.status)}
                  </span>
                </span>
              </span>
              <button
                className={secondary}
                disabled={busy || trip.status !== 'PLANNED'}
                onClick={() => run(`/trips/${trip.id}/depart`)}
              >
                Authorize departure
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Override({
  decision,
  priority,
  version,
  disabled,
  run,
}: {
  decision: Decision;
  priority?: Priority | undefined;
  version: number;
  disabled: boolean;
  run: EditorProps['run'];
}) {
  const [reason, setReason] = useState('');
  return (
    <div className={panel}>
      <p className="text-sm font-medium">
        Deferred · {priority?.publicReference ?? decision.order_id.slice(0, 8)}
      </p>
      <p className="mt-1 text-sm text-muted">
        {decision.rationale} · Next eligible {decision.next_eligible_date}
      </p>
      {(priority?.requiresOverride || decision.requires_override) && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(`/planning/decisions/${decision.id}/override`, { version, reason });
          }}
        >
          <label className="min-w-48 flex-1 text-xs">
            Protected outlet — explicit override rationale
            <input
              className={`${field} mt-1 w-full`}
              required
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className={`${secondary} self-end`} disabled={disabled || !reason.trim()}>
            Acknowledge override
          </button>
        </form>
      )}
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
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {fleet.map((vehicle) => (
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
          <label className="grid gap-1 text-xs">
            Availability
            <select
              className={field}
              disabled={!editable || busy}
              value={vehicle.status ?? 'available'}
              onChange={(event) => onChange(vehicle.id, event.target.value)}
            >
              <option value="available">Available</option>
              <option value="workshop">In workshop</option>
            </select>
          </label>
          {!editable && (
            <p className="mt-2 text-xs text-muted">
              Choose an unreleased planning day to change availability.
            </p>
          )}
        </section>
      ))}
      {!fleet.length && <p className={panel}>No fleet records for this depot.</p>}
    </div>
  );
}
function StoreTable({ reference }: { reference?: Reference | undefined }) {
  const [search, setSearch] = useState('');
  const stores =
    reference?.stores.filter((store) =>
      `${store.id} ${store.name} ${store.brand_name} ${store.district_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
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
          </article>
        ))}
      </div>
    </>
  );
}
function TripTracker({ run, busy }: { run: EditorProps['run']; busy: boolean }) {
  const [cursor, setCursor] = useState('');
  const [tripId, setTripId] = useState('');
  const trips = useQuery({
    queryKey: ['trips', 'dispatcher', cursor],
    queryFn: () =>
      request<Page<Trip>>(
        `/trips?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
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
      }>(`/trips/${tripId}`),
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
type StopInfo = {
  id: string;
  order_id: string;
  sequence: number;
  outlet_name?: string;
  public_reference?: string;
  planned_arrival_at: string;
  attempt?: { outcome: string | null } | null;
};
function Issues({ run, busy }: { run: EditorProps['run']; busy: boolean }) {
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
function IssueCard({ issue, run, busy }: { issue: Issue; run: EditorProps['run']; busy: boolean }) {
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
