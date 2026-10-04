import { useMemo, useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Truck,
  X,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { api, request } from '../../api';
import type { Context, Deferral, PlanDetail, Priority, Reference, Vehicle } from './planning-types';

const panel = 'rounded-[20px] border border-border bg-white/30';
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-primary px-6 text-sm text-white disabled:opacity-35';
const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-border bg-white/60 px-6 text-sm disabled:opacity-35';
const field = 'min-h-11 rounded-xl border border-border bg-transparent px-3 text-sm';
const pillSelectClass =
  'h-11 w-full appearance-none rounded-xl border border-border bg-white/60 pl-4 pr-11 text-sm font-normal text-foreground outline-none transition-colors hover:bg-white focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer';
const reasons = [
  ['VEHICLE_UNAVAILABLE', 'No compatible vehicle available'],
  ['CAPACITY_LIMIT', 'Insufficient load capacity'],
  ['DELIVERY_WINDOW', 'Delivery window cannot be met'],
  ['STORE_UNAVAILABLE', 'Store unable to receive delivery'],
  ['STOCK_UNAVAILABLE', 'Stock not ready for dispatch'],
  ['OTHER', 'Other reason'],
] as const;
const label = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase());
const clusterId = (key: string) => {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `CLS-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
};

type Props = {
  detail: PlanDetail;
  context: Context;
  priorities: Priority[];
  reference: Reference;
  fleet: Vehicle[];
};
export function ClusterPlanner({ detail, context, priorities, reference, fleet }: Props) {
  const cache = useQueryClient();
  const [cluster, setCluster] = useState('');
  const [brand, setBrand] = useState('');
  const [district, setDistrict] = useState('');
  const [temperature, setTemperature] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [deferOpen, setDeferOpen] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [message, setMessage] = useState('');
  const [nextDate, setNextDate] = useState(
    reference.operatingDates.find((day) => day > context.operating_date) ?? '',
  );
  const [loadsView, setLoadsView] = useState(false);
  const editable = detail.plan.status === 'DRAFT';
  const decisions = new Map(detail.decisions.map((item) => [item.order_id, item]));
  const state = (order: Priority) => decisions.get(order.orderId)?.decision ?? 'UNASSIGNED';
  const groups = useMemo(() => {
    const result = new Map<string, Priority[]>();
    for (const order of priorities) {
      const key = `${order.district}|${order.brand}`;
      result.set(key, [...(result.get(key) ?? []), order]);
    }
    return [...result.entries()];
  }, [priorities]);
  const resolved = (orders: Priority[]) => orders.every((order) => state(order) !== 'UNASSIGNED');
  const unresolvedGroups = groups.filter(([, orders]) => !resolved(orders));
  const resolvedGroups = groups.filter(([, orders]) => resolved(orders));
  const current =
    cluster === 'ALL' ? priorities : (groups.find(([key]) => key === cluster)?.[1] ?? []);
  const pending = current.filter((order) => state(order) === 'UNASSIGNED');
  const currentIds = new Set(current.map((order) => order.orderId));
  const trips = detail.trips.filter((trip) =>
    trip.stops.some((stop) => currentIds.has(stop.order_id)),
  );
  const allResolved =
    priorities.length > 0 && priorities.every((order) => state(order) !== 'UNASSIGNED');
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      request(path, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      await Promise.all(
        ['plan', 'plans', 'priorities', 'trips', 'loads', 'orders', 'trip-candidates'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  async function stage(orderIds: string[], deferrals: Deferral[] = []) {
    try {
      await mutation.mutateAsync({
        path: `/planning/plans/${detail.plan.id}/stage`,
        body: {
          version: detail.plan.version,
          orderIds,
          deferrals,
          acknowledgeDeferral: deferrals.length > 0,
        },
      });
      setSelected([]);
      setDeferOpen(false);
      if (orderIds.length) {
        setAllocationOpen(true);
      }
    } catch {
      /* Mutation error is displayed in the workspace. */
    }
  }
  function openCluster(key: string) {
    setCluster(key);
    setSelected([]);
    setTemperature('');
    setStatus('');
    setLoadsView(!editable);
    const orders = groups.find(([id]) => id === key)?.[1] ?? [];
    const ids = new Set(orders.map((o) => o.orderId));
    setAllocationOpen(
      detail.trips.some((trip) => trip.stops.some((stop) => ids.has(stop.order_id))),
    );
  }
  const filtered = current.filter(
    (order) =>
      (!temperature || order.temperatureRequirement === temperature) &&
      (!status || state(order) === status),
  );
  const selectable = filtered.filter((order) => state(order) !== 'ALLOCATED');
  const selectedOrders = priorities.filter((order) => selected.includes(order.orderId));
  const protectedDeferrals = detail.decisions.filter(
    (decision) =>
      decision.decision === 'DEFERRED' &&
      (decision.requires_override ||
        priorities.find((order) => order.orderId === decision.order_id)?.requiresOverride) &&
      !decision.override_acknowledged,
  );
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden space-y-4">
      {mutation.error && (
        <p role="alert" className="shrink-0 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {mutation.error.message}
        </p>
      )}
      {!cluster ? (
        <>
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-medium">
              Clusters{' '}
              <span className="ml-4 text-sm font-normal text-muted">
                {groups.length} Clusters Identified
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="self-center text-sm text-muted">Filter by</span>
              <div className="relative min-w-[130px]">
                <select
                  aria-label="Brand"
                  className={pillSelectClass}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  <option value="">Brand</option>
                  {[...new Set(priorities.map((o) => o.brand))].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
              <div className="relative min-w-[130px]">
                <select
                  aria-label="District"
                  className={pillSelectClass}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                >
                  <option value="">District</option>
                  {[...new Set(priorities.map((o) => o.district))].map((value) => (
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
          <div className="flex min-h-0 flex-1 items-stretch gap-5 overflow-hidden">
            <div className="min-w-0 flex-1 h-full overflow-y-auto p-2 space-y-3">
              <div className="hidden grid-cols-[160px_1fr_1fr_80px] px-6 text-sm text-muted lg:grid">
                <span>Cluster ID</span>
                <span>Identity</span>
                <span>Orders</span>
                <span />
              </div>
              {[
                ['Unallocated clusters', unresolvedGroups],
                ['Resolved Clusters', resolvedGroups],
              ].map(([heading, list]) => (
                <section key={heading as string} className="space-y-3">
                  {heading === 'Resolved Clusters' && (
                    <h3 className="pt-8 text-lg font-medium">
                      Resolved Clusters{' '}
                      <span className="float-right text-sm text-muted">
                        {resolvedGroups.length} Resolved
                      </span>
                    </h3>
                  )}
                  {(list as typeof groups)
                    .filter(
                      ([, orders]) =>
                        (!brand || orders[0]?.brand === brand) &&
                        (!district || orders[0]?.district === district),
                    )
                    .map(([key, orders]) => (
                      <button
                        key={key}
                        onClick={() => openCluster(key)}
                        className={`${panel} flex min-h-20 w-full flex-wrap items-center gap-4 px-6 py-4 text-left hover:bg-white lg:grid lg:grid-cols-[160px_1fr_1fr_80px] ${resolved(orders) ? 'text-muted' : ''}`}
                      >
                        <strong className="font-medium">
                          {clusterId(`${context.id}|${detail.plan.depot_id}|${key}`)}
                        </strong>
                        <span className="font-medium">
                          {orders[0]?.district} – {orders[0]?.brand}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const stagedCount = orders.filter(
                              (o) => state(o) !== 'UNASSIGNED',
                            ).length;
                            if (stagedCount > 0 && stagedCount < orders.length) {
                              return (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                  Partial ({stagedCount}/{orders.length})
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {orders[0]?.brand === 'Fresh' ? (
                            <>
                              {['ambient', 'chilled'].map((temp) => (
                                <span
                                  key={temp}
                                  className={`rounded-full border border-border px-3 py-1 text-xs ${temp === 'chilled' ? 'bg-chilled' : 'bg-ambient'}`}
                                >
                                  {orders.filter((o) => o.temperatureRequirement === temp).length}{' '}
                                  {label(temp)}
                                </span>
                              ))}
                            </>
                          ) : (
                            <span
                              className={`rounded-full border border-border px-3 py-1 text-xs ${orders[0]?.brand === 'Style' ? 'bg-textile' : 'bg-fragile'}`}
                            >
                              {orders.length} {orders[0]?.brand === 'Style' ? 'Textile' : 'Fragile'}
                            </span>
                          )}
                          <span className="text-xs text-muted">Total {orders.length}</span>
                        </div>
                        <ArrowRight className="justify-self-end" size={20} />
                      </button>
                    ))}
                </section>
              ))}
              {!groups.length && (
                <p className={`${panel} p-6 text-sm text-muted`}>
                  No orders discovered for this planning date and depot.
                </p>
              )}
            </div>
            <aside
              className={`${panel} ${summaryOpen ? 'w-72 xl:w-80 p-5' : 'w-14 p-2.5'} hidden h-full shrink-0 flex-col overflow-y-auto transition-[width,padding] xl:flex`}
            >
              <button
                className={`${summaryOpen ? 'ml-auto' : 'mx-auto'} flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-foreground transition-colors`}
                aria-label={summaryOpen ? 'Collapse cluster summary' : 'Expand cluster summary'}
                onClick={() => setSummaryOpen(!summaryOpen)}
              >
                {summaryOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
              </button>
              {summaryOpen && (
                <div className="mt-2 flex-1 flex flex-col">
                  <h3 className="font-medium">Cluster Summary</h3>
                  <div className="my-8 flex items-center gap-5">
                    <span className="text-5xl">{String(groups.length).padStart(2, '0')}</span>
                    <span className="text-sm text-muted">
                      Total Clusters
                      <br />
                      Identified
                    </span>
                  </div>
                  <dl className="space-y-3 text-sm">
                    {[
                      [
                        'Unresolved Clusters',
                        unresolvedGroups.filter(([, orders]) =>
                          orders.every((o) => state(o) === 'UNASSIGNED'),
                        ).length,
                      ],
                      [
                        'Partialy Resolved Clusters',
                        unresolvedGroups.filter(([, orders]) =>
                          orders.some((o) => state(o) !== 'UNASSIGNED'),
                        ).length,
                      ],
                      ['Resolved Clusters', resolvedGroups.length],
                    ].map(([name, count]) => (
                      <div key={name} className="flex justify-between">
                        <dt className="text-muted">{name}</dt>
                        <dd className="font-semibold">{String(count).padStart(2, '0')}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-10 text-sm">
                    Cluster Resolve Progress{' '}
                    <span className="float-right font-medium">
                      {priorities.length
                        ? Math.round(
                            (priorities.filter((o) => state(o) !== 'UNASSIGNED').length /
                              priorities.length) *
                              100,
                          )
                        : 0}
                      %
                    </span>
                  </p>
                  <progress
                    aria-label="Cluster resolve progress"
                    className="mt-3 planning-progress h-2 w-full"
                    max={priorities.length || 1}
                    value={priorities.filter((o) => state(o) !== 'UNASSIGNED').length}
                  />
                  {allResolved && (
                    <button
                      className={`${button} mt-6 w-full`}
                      onClick={() => {
                        setCluster('ALL');
                        setLoadsView(true);
                      }}
                    >
                      Continue to loads <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 flex flex-wrap justify-between gap-3">
            <button
              onClick={() => {
                setCluster('');
                setSelected([]);
              }}
              className="flex items-center gap-5 font-medium"
            >
              <ArrowLeft size={20} />
              {cluster === 'ALL'
                ? 'All clusters'
                : clusterId(`${context.id}|${detail.plan.depot_id}|${cluster}`)}{' '}
              <span className="text-sm font-normal text-muted">
                {cluster === 'ALL' ? '' : cluster.replace('|', ' – ')}
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[130px]">
                <select
                  aria-label="Temperature"
                  className={pillSelectClass}
                  value={temperature}
                  onChange={(e) => {
                    setTemperature(e.target.value);
                    setSelected([]);
                  }}
                >
                  <option value="">Temperature</option>
                  <option value="ambient">Ambient</option>
                  <option value="chilled">Chilled</option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
              <div className="relative min-w-[130px]">
                <select
                  aria-label="Status"
                  className={pillSelectClass}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setSelected([]);
                  }}
                >
                  <option value="">Status</option>
                  <option value="UNASSIGNED">Unstaged</option>
                  <option value="ALLOCATED">Allocated</option>
                  <option value="DEFERRED">Deferred</option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>
            </div>
          </div>
          {!loadsView ? (
            <div
              className={`flex-1 min-h-0 grid items-stretch gap-5 overflow-hidden ${allocationOpen ? 'xl:grid-cols-2' : 'grid-cols-[minmax(0,1fr)_56px]'}`}
            >
              <section className={`${panel} flex h-full min-h-0 flex-col overflow-hidden`}>
                <header className="shrink-0 flex flex-wrap items-center gap-6 p-5">
                  <h2 className="text-lg font-medium">Stage Orders</h2>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      className="planning-checkbox"
                      disabled={!editable || !selectable.length || mutation.isPending}
                      checked={
                        selectable.length > 0 &&
                        selectable.every((o) => selected.includes(o.orderId))
                      }
                      onChange={(e) =>
                        setSelected(e.target.checked ? selectable.map((o) => o.orderId) : [])
                      }
                    />
                    Select all
                  </label>
                  <span className="ml-auto text-sm text-muted">{selected.length} Selected</span>
                </header>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 pt-1">
                  {filtered.map((order) => {
                    const store = reference.stores.find((item) => item.id === order.outletId);
                    return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected.includes(order.orderId)}
                        aria-label={`Select ${order.publicReference}`}
                        disabled={!editable || state(order) === 'ALLOCATED' || mutation.isPending}
                        onClick={() =>
                          setSelected((ids) =>
                            ids.includes(order.orderId)
                              ? ids.filter((id) => id !== order.orderId)
                              : [...ids, order.orderId],
                          )
                        }
                        key={order.orderId}
                        className={`flex w-full items-start gap-4 rounded-[20px] border bg-surface p-5 text-left disabled:cursor-default ${selected.includes(order.orderId) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`planning-checkbox mt-1 ${selected.includes(order.orderId) ? 'planning-checkbox-selected' : ''}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="font-medium">{order.publicReference}</strong>
                            {state(order) === 'ALLOCATED' && (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                Allocated
                              </span>
                            )}
                            {state(order) === 'DEFERRED' && (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                Deferred
                              </span>
                            )}
                          </div>
                          <p className="font-medium">
                            {store?.name ?? order.outletId} – Waypoint {order.brand}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {order.daysSinceLastServed === null
                              ? 'Service history unknown'
                              : `${order.daysSinceLastServed} days since last served`}
                          </p>
                          <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                            <span>
                              {order.volumeM3 ?? '—'} m³ · {order.weightKg ?? '—'} kg
                            </span>
                            <span>
                              {store?.window_open_time.slice(0, 5)} –{' '}
                              {store?.window_close_time.slice(0, 5)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border border-border px-3 py-1 text-xs ${order.temperatureRequirement === 'chilled' ? 'bg-chilled' : order.brand === 'Style' ? 'bg-textile' : order.brand === 'Tech' ? 'bg-fragile' : 'bg-ambient'}`}
                            >
                              {order.brand === 'Style'
                                ? 'Textile'
                                : order.brand === 'Tech'
                                  ? 'Fragile'
                                  : label(order.temperatureRequirement)}
                            </span>
                            <span className="rounded-full border border-border bg-fragile px-3 py-1 text-xs">
                              {store?.parking_constraint === 'van_only' ? 'Van only' : 'Any'}
                            </span>
                          </div>
                          {decisions.get(order.orderId)?.rationale &&
                            state(order) === 'UNASSIGNED' && (
                              <p className="mt-2.5 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                                {decisions.get(order.orderId)?.rationale}
                              </p>
                            )}
                          {decisions.get(order.orderId)?.rationale &&
                            state(order) === 'DEFERRED' && (
                              <p className="mt-2 text-xs text-muted">
                                Deferred: {decisions.get(order.orderId)?.rationale}
                              </p>
                            )}
                        </div>
                      </button>
                    );
                  })}
                  {!filtered.length && (
                    <p className="text-sm text-muted">
                      {!status && !temperature
                        ? 'All orders are allocated. Remove an order from a trip to return it to staging.'
                        : 'No orders match these filters.'}
                    </p>
                  )}
                </div>
                {editable && (
                  <footer className="shrink-0 flex justify-end gap-3 border-t border-border p-5">
                    <button
                      className={secondary}
                      disabled={!selected.length || mutation.isPending}
                      onClick={() => {
                        setMessage('');
                        setDeferOpen(true);
                      }}
                    >
                      Defer
                    </button>
                    <button
                      className={button}
                      disabled={!selected.length || mutation.isPending}
                      onClick={() => void stage(selected)}
                    >
                      Stage <ArrowRight size={16} />
                    </button>
                  </footer>
                )}
              </section>
              {!allocationOpen ? (
                <button
                  aria-label="Expand load assigning"
                  disabled={trips.length === 0 && pending.length > 0}
                  onClick={() => setAllocationOpen(true)}
                  className={`${panel} flex h-full items-start justify-center p-4 disabled:cursor-default`}
                >
                  <span className="flex items-center gap-4 text-sm [writing-mode:vertical-rl]">
                    <ArrowLeft size={18} />
                    Load Assigning
                  </span>
                </button>
              ) : (
                <section className={`${panel} flex h-full min-h-0 flex-col overflow-hidden`}>
                  <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-5">
                    <h2 className="text-lg font-medium">Load/Vehicle Assigning</h2>
                    <span className="text-xs text-muted">
                      {trips.reduce((sum, trip) => sum + trip.stops.length, 0)} Staged Orders ·{' '}
                      {fleet.filter((v) => v.status === 'available').length} Available Vehicles
                    </span>
                    <button
                      aria-label="Collapse load assigning"
                      onClick={() => setAllocationOpen(false)}
                    >
                      <PanelRightClose size={18} />
                    </button>
                  </header>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 pt-1">
                    {trips.map((trip) => {
                      const vehicle = fleet.find((v) => v.id === trip.vehicle_id);
                      const orders = trip.stops
                        .map((stop) => priorities.find((o) => o.orderId === stop.order_id))
                        .filter((o): o is Priority => !!o);
                      const weight = orders.reduce((sum, o) => sum + Number(o.weightKg), 0);
                      const volume = orders.reduce((sum, o) => sum + Number(o.volumeM3), 0);
                      return (
                        <article
                          key={trip.id}
                          className="overflow-hidden rounded-[20px] border border-border"
                        >
                          <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
                            <Truck size={24} />
                            <h3 className="font-medium">{trip.vehicle_id}</h3>
                            <span
                              className={`rounded-full px-3 py-1 text-xs ${vehicle?.temp === 'reefer' ? 'bg-chilled' : 'bg-ambient'}`}
                            >
                              {vehicle?.temp === 'reefer' ? 'Reefer' : 'Ambient'}
                            </span>
                            <span className="ml-auto text-xs text-muted">
                              Capacity {vehicle?.volume_cap_m3 ?? '—'} m³ /{' '}
                              {vehicle?.weight_cap_kg ?? '—'} kg
                            </span>
                          </header>
                          <div className="space-y-4 p-4">
                            <p className="text-sm font-medium">
                              TRIP {String(trip.trip_number).padStart(2, '0')}{' '}
                              <span className="float-right font-normal text-muted">
                                {trip.stops.length} stops
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {orders.map((order) => (
                                <span
                                  key={order.orderId}
                                  className="inline-flex items-center gap-2 rounded-full bg-textile px-3 py-1 text-xs"
                                >
                                  {order.publicReference}
                                  {editable && (
                                    <button
                                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                                      aria-label={`Remove ${order.publicReference} from ${trip.vehicle_id} trip ${trip.trip_number}`}
                                      disabled={mutation.isPending}
                                      onClick={() =>
                                        mutation.mutate({
                                          path: `/planning/plans/${detail.plan.id}/trip-orders`,
                                          body: {
                                            version: detail.plan.version,
                                            tripId: trip.id,
                                            orderId: order.orderId,
                                            action: 'REMOVE',
                                          },
                                        })
                                      }
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                            {editable && (
                              <TripOrderPicker
                                tripId={trip.id}
                                vehicleLabel={`${trip.vehicle_id} trip ${trip.trip_number}`}
                                planVersion={detail.plan.version}
                                priorities={priorities}
                                busy={mutation.isPending}
                                onAdd={(orderId, version) =>
                                  mutation.mutate({
                                    path: `/planning/plans/${detail.plan.id}/trip-orders`,
                                    body: { version, tripId: trip.id, orderId, action: 'ADD' },
                                  })
                                }
                              />
                            )}
                            {[
                              ['Volume', volume, Number(vehicle?.volume_cap_m3), 'm³'],
                              ['Weight', weight, Number(vehicle?.weight_cap_kg), 'kg'],
                            ].map(([name, used, cap, unit]) => (
                              <div key={name as string} className="text-xs">
                                <p>
                                  {name}{' '}
                                  <span className="ml-3 text-muted">
                                    {Number(used).toFixed(2)} / {cap || '—'} {unit}
                                  </span>
                                  <span className="float-right text-muted">
                                    {Math.max(0, Number(cap) - Number(used)).toFixed(2)} {unit}{' '}
                                    Remaining
                                  </span>
                                </p>
                                <progress
                                  aria-label={`${name} capacity used`}
                                  className="mt-2 planning-progress h-2 w-full"
                                  max={Number(cap) || 1}
                                  value={Number(used)}
                                />
                              </div>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                    {!trips.length && (
                      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
                        <p className="font-medium text-foreground">
                          No loads currently assigned in this cluster.
                        </p>
                        <p className="mt-2 text-xs leading-relaxed">
                          Select eligible orders on the left and click <strong>Stage</strong> to
                          allocate them to vehicles, or <strong>Defer</strong> to schedule for a
                          later operating date.
                        </p>
                      </div>
                    )}
                  </div>
                  <footer className="shrink-0 flex justify-end gap-3 border-t border-border p-5">
                    <span className="mr-auto self-center text-xs text-muted">
                      Assignments saved
                    </span>
                    <button
                      className={button}
                      disabled={mutation.isPending || trips.length === 0}
                      onClick={() => setLoadsView(true)}
                    >
                      Continue <ArrowRight size={16} />
                    </button>
                  </footer>
                </section>
              )}
            </div>
          ) : (
            <section className={`${panel} flex-1 min-h-0 h-full flex flex-col overflow-hidden p-5`}>
              <div className="shrink-0 mb-5 flex justify-between items-center">
                <h2 className="text-lg font-medium">Loads</h2>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-black px-6 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-35"
                  onClick={() => {
                    setLoadsView(false);
                    setCluster('');
                    setSelected([]);
                  }}
                >
                  <ArrowLeft size={16} />
                  Back to allocation
                </button>
              </div>
              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-2">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-border p-5"
                  >
                    <strong className="text-sm font-medium">
                      LDS-{trip.id.slice(0, 8).toUpperCase()}
                      <span className="mt-1 block text-xs font-normal text-muted">
                        {trip.vehicle_id} · Trip {trip.trip_number}
                      </span>
                    </strong>
                    <span className="text-sm">
                      Assignee:{' '}
                      {editable ? 'Depot loader pool' : (trip.loader_name ?? 'Depot loader pool')}
                    </span>
                    <span className="text-sm text-muted">{trip.stops.length} Orders</span>
                    <span className="text-sm text-muted">
                      {editable
                        ? 'Ready for release'
                        : trip.status !== 'PLANNED'
                          ? label(trip.status)
                          : trip.manifest_status === 'COMPLETED'
                            ? 'Loaded'
                            : trip.manifest_status === 'LOADING'
                              ? 'Loading'
                              : 'Assigned'}
                      {!editable &&
                        trip.status === 'PLANNED' &&
                        trip.manifest_status === 'COMPLETED' &&
                        trip.dispatch_block_reason && (
                          <span className="mt-1 block max-w-xs text-xs text-amber-800">
                            {trip.dispatch_block_reason}
                          </span>
                        )}
                    </span>
                    {!editable && (
                      <button
                        className={button}
                        disabled={
                          (mutation.isPending &&
                            (mutation.variables as { path?: string } | undefined)?.path ===
                              `/trips/${trip.id}/depart`) ||
                          trip.status !== 'PLANNED' ||
                          trip.dispatch_ready !== true
                        }
                        onClick={() =>
                          mutation.mutate({ path: `/trips/${trip.id}/depart`, body: {} })
                        }
                      >
                        Dispatch <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editable && (
                <div className="shrink-0 mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-end gap-4">
                  <p className="mr-auto text-sm text-muted">
                    {allResolved
                      ? 'All clusters resolved.'
                      : 'Resolve the remaining clusters before releasing loads.'}
                  </p>
                  <button
                    className={button}
                    disabled={!allResolved || mutation.isPending}
                    onClick={() => {
                      if (protectedDeferrals.length) {
                        setSelected(protectedDeferrals.map((d) => d.order_id));
                        setMessage('');
                        setDeferOpen(true);
                      } else
                        mutation.mutate({
                          path: `/planning/plans/${detail.plan.id}/release`,
                          body: { version: detail.plan.version },
                        });
                    }}
                  >
                    Release loads <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {deferOpen && (
        <DeferralDialog
          selectedOrders={selectedOrders}
          reference={reference}
          reason={reason}
          setReason={setReason}
          message={message}
          setMessage={setMessage}
          nextDate={nextDate}
          setNextDate={setNextDate}
          dates={reference.operatingDates.filter((day) => day > context.operating_date)}
          busy={mutation.isPending}
          error={mutation.error?.message ?? ''}
          onClose={() => setDeferOpen(false)}
          onConfirm={() =>
            void stage(
              [],
              selected.map((orderId) => ({
                orderId,
                reasonCode: reason,
                rationale: message.trim() || reasons.find(([code]) => code === reason)![1],
                nextEligibleDate: nextDate,
              })),
            )
          }
        />
      )}
    </div>
  );
}

function DeferralDialog({
  selectedOrders,
  reference,
  reason,
  setReason,
  message,
  setMessage,
  nextDate,
  setNextDate,
  dates,
  busy,
  onClose,
  onConfirm,
  error,
}: {
  selectedOrders: Priority[];
  reference: Reference;
  reason: string;
  setReason: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  nextDate: string;
  setNextDate: (value: string) => void;
  dates: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="deferral-dialog-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      className="m-auto w-[min(600px,calc(100%-32px))] rounded-[24px] border border-border bg-surface p-6 text-foreground backdrop:bg-black/30"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
        className="space-y-5"
      >
        <header className="flex items-center justify-between">
          <h2 id="deferral-dialog-title" className="text-xl font-medium">
            Defer selected orders
          </h2>
          <button type="button" aria-label="Close deferral" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <p className="text-sm text-muted">{selectedOrders.length} orders selected for deferral</p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <ul className="max-h-48 space-y-2 overflow-auto">
          {selectedOrders.map((order) => (
            <li key={order.orderId} className="rounded-xl border border-border p-3 text-sm">
              <strong className="font-medium">{order.publicReference}</strong>
              <span className="ml-3 text-muted">
                {reference.stores.find((s) => s.id === order.outletId)?.name ?? order.outletId}
              </span>
              {order.requiresOverride && (
                <p className="mt-1 text-xs text-red-700">
                  {order.deferredPreviousRun
                    ? 'Skipped on the previous operating run.'
                    : 'This store has not been served for at least two days.'}{' '}
                  Confirming will approve this further deferral with your chosen reason.
                </p>
              )}
            </li>
          ))}
        </ul>
        <label className="grid gap-2 text-sm">
          Deferral reason
          <div className="relative">
            <select
              aria-label="Deferral reason"
              required
              className={pillSelectClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {reasons.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
        </label>
        <label className="grid gap-2 text-sm">
          {reason === 'OTHER' ? 'Custom reason' : 'Additional message (optional)'}
          <textarea
            required={reason === 'OTHER'}
            className={`${field} min-h-24 p-3`}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm">
          Next eligible operating day
          <div className="relative">
            <select
              aria-label="Next eligible operating day"
              required
              className={pillSelectClass}
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            >
              <option value="">Choose operating day</option>
              {dates.map((date) => (
                <option key={date}>{date}</option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>
        </label>
        <footer className="flex justify-end gap-3">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className={button}
            disabled={busy || !nextDate || (reason === 'OTHER' && !message.trim())}
          >
            Confirm deferral
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function TripOrderPicker({
  tripId,
  vehicleLabel,
  planVersion,
  priorities,
  busy,
  onAdd,
}: {
  tripId: string;
  vehicleLabel: string;
  planVersion: number;
  priorities: Priority[];
  busy: boolean;
  onAdd: (orderId: string, version: number) => void;
}) {
  const [orderId, setOrderId] = useState('');
  const candidates = useQuery({
    queryKey: ['trip-candidates', tripId, planVersion],
    queryFn: () => api.planning.candidates(tripId),
    staleTime: 0,
  });
  const chosen = candidates.data?.items.find((item) => item.orderId === orderId);
  return (
    <div className="space-y-2">
      <label className="grid gap-2 text-xs">
        Add Order
        <div className="relative">
          <select
            aria-label={`Add order to ${vehicleLabel}`}
            className={pillSelectClass}
            value={orderId}
            disabled={busy || candidates.isFetching}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">Select Order</option>
            {candidates.data?.items.map((item) => (
              <option key={item.orderId} value={item.orderId} disabled={!item.valid}>
                {priorities.find((order) => order.orderId === item.orderId)?.publicReference ??
                  item.orderId}
                {item.valid ? '' : ` — ${item.reason}`}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
      </label>
      {candidates.error && (
        <p role="alert" className="text-xs text-red-700">
          {candidates.error.message}
        </p>
      )}
      <div className="flex justify-end">
        <button
          className={button}
          disabled={
            busy ||
            candidates.isFetching ||
            !chosen?.valid ||
            candidates.data?.version !== planVersion
          }
          onClick={() => {
            if (chosen?.valid && candidates.data) onAdd(orderId, candidates.data.version);
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
