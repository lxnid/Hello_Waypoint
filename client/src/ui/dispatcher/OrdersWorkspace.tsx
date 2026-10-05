import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  PackageOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { request } from '../../api';

import type { OrdersPage, Detail } from '../../types/dispatcher-orders';
export type { Order } from '../../types/dispatcher-orders';
import { formatOrderId, formatStoreId, formatItemId } from '../utils/idFormatters';
const pillSelectClass =
  'h-11 w-full appearance-none rounded-xl border border-border bg-white/60 pl-4 pr-11 text-sm font-normal text-foreground outline-none transition-colors hover:bg-white focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer';
export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
export function CategoryBadge({ value }: { value: string }) {
  const category = value.toUpperCase();
  const color =
    category.includes('CHILL') || category.includes('REFRIG')
      ? 'bg-chilled'
      : category.includes('TEXTILE')
        ? 'bg-textile'
        : category.includes('FRAGILE')
          ? 'bg-fragile'
          : 'bg-ambient';
  return (
    <span
      className={`inline-flex min-w-20 items-center justify-center rounded-full border border-black/10 px-3 py-1 text-xs font-medium ${color}`}
    >
      {humanize(value)}
    </span>
  );
}
function ErrorNotice({ error, retry }: { error: Error | null; retry: () => void }) {
  return error ? (
    <div
      role="alert"
      className="my-4 rounded-control border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p>{error.message}</p>
      <button onClick={retry} className="mt-2 flex items-center gap-2 font-semibold underline">
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  ) : null;
}
export function OrdersWorkspace({ user, deferred }: { user: User; deferred: boolean }) {
  const navigate = useNavigate();
  const route = useParams();
  const orderId = route['*']?.split('/')[1];
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ brand: '', district: '', temperature: '', status: '' });
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const orders = useInfiniteQuery({
    queryKey: ['orders', user.id, deferred, query, filters],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (deferred) params.set('deferred', 'true');
      if (query) params.set('q', query);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      if (pageParam) params.set('cursor', pageParam);
      return request<OrdersPage>(`/orders?${params}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  if (orderId)
    return (
      <div className="flex-1 min-h-0 h-full overflow-y-auto p-2">
        <OrderDetails
          user={user}
          id={orderId}
          back={() => navigate(`/dispatcher/${deferred ? 'deferred' : 'orders'}`)}
        />
      </div>
    );
  const rows = orders.data?.pages.flatMap((page) => page.items) ?? [];
  const first = orders.data?.pages[0];
  const setFilter = (key: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="flex h-full min-h-0 items-stretch gap-5 xl:gap-8 overflow-hidden">
      <section
        className="min-w-0 flex-1 h-full overflow-y-auto p-2"
        aria-label={deferred ? 'Deferred orders' : 'Live orders'}
      >
        <div className="mb-5 flex items-center justify-between gap-3 md:hidden">
          <h1 className="text-xl font-semibold">{deferred ? 'Deferred Orders' : 'Live Orders'}</h1>
          <button
            onClick={() => setSummaryOpen(!summaryOpen)}
            className="rounded-xl border border-border p-2"
            aria-label="Toggle order summary"
          >
            <PanelRightOpen size={20} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted shrink-0">Filter by</span>
          <div className="grid flex-1 grid-cols-2 items-center gap-3 lg:grid-cols-4">
            <div className="relative">
              <label className="sr-only" htmlFor="brand-filter">
                Brand
              </label>
              <select
                id="brand-filter"
                value={filters.brand}
                onChange={(e) => setFilter('brand', e.target.value)}
                className={pillSelectClass}
              >
                <option value="">Brand</option>
                {first?.filters?.brands?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
            <div className="relative">
              <label className="sr-only" htmlFor="district-filter">
                District
              </label>
              <select
                id="district-filter"
                value={filters.district}
                onChange={(e) => setFilter('district', e.target.value)}
                className={pillSelectClass}
              >
                <option value="">District</option>
                {first?.filters?.districts?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
            <div className="relative">
              <label className="sr-only" htmlFor="temperature-filter">
                Temperature
              </label>
              <select
                id="temperature-filter"
                value={filters.temperature}
                onChange={(e) => setFilter('temperature', e.target.value)}
                className={pillSelectClass}
              >
                <option value="">Temperature</option>
                <option value="chilled">Chilled</option>
                <option value="ambient">Ambient</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
            <div className="relative">
              <label className="sr-only" htmlFor="status-filter">
                Status
              </label>
              <select
                id="status-filter"
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
                className={pillSelectClass}
              >
                <option value="">Status</option>
                {first?.filters?.statuses?.map((status) => (
                  <option key={status} value={status}>
                    {humanize(status)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
              />
            </div>
          </div>
        </div>
        {deferred && (
          <div className="mt-5 flex items-center gap-3 rounded-control border border-border bg-white p-4 text-sm">
            <ShieldAlert size={20} className="shrink-0" />
            <p>
              Orders deferred by their latest released plan. Review service history before deferring
              again.
            </p>
          </div>
        )}
        <div className="relative my-5">
          <Search
            size={18}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            aria-label="Search orders"
            placeholder="Search order ref, outlet name, outlet ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-16 w-full rounded-card border border-border bg-transparent pl-13 pr-5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <ErrorNotice error={orders.error} retry={() => void orders.refetch()} />
        <div
          className="mb-3 hidden grid-cols-[1fr_2fr_1fr_.8fr_1fr] gap-3 px-5 pt-4 text-xs text-muted lg:grid"
          aria-hidden="true"
        >
          <span>Order ID</span>
          <span>Store Name</span>
          <span>Order Type</span>
          <span>Order Size</span>
          <span className="text-right">Order Status</span>
        </div>
        {orders.isPending ? (
          <div role="status" className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-card border border-border bg-border/20"
              />
            ))}
            <span className="sr-only">Loading orders</span>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((order) => (
              <button
                key={order.id}
                onClick={() =>
                  navigate(`/dispatcher/${deferred ? 'deferred' : 'orders'}/${order.id}`)
                }
                className="grid min-h-20 w-full grid-cols-[1fr_auto] items-center gap-3 rounded-card border border-border bg-white/20 px-5 py-4 text-left transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 lg:grid-cols-[1fr_2fr_1fr_.8fr_1fr]"
              >
                <span className="text-sm font-semibold">{formatOrderId(order.public_reference, order.id)}</span>
                <span className="row-start-2 text-sm font-medium lg:row-auto">
                  {order.outlet_name ??
                    `${order.district_name ?? ''} · ${order.brand_name ?? ''} · ${formatStoreId(order.outlet_id)}`}
                  {order.days_since_last_served != null && order.days_since_last_served >= 2 && (
                    <span className="mt-1 block text-xs text-amber-800">
                      {order.days_since_last_served} days unserved
                      {order.history_status?.includes('SNAPSHOT') ? ' · planning snapshot' : ''}
                    </span>
                  )}
                </span>
                <span className="col-start-2 row-start-1 lg:col-auto lg:row-auto">
                  <CategoryBadge
                    value={
                      order.brand_name?.includes('Style')
                        ? 'Textile'
                        : order.brand_name?.includes('Tech')
                          ? 'Fragile'
                          : order.temperature_requirement
                    }
                  />
                </span>
                <span className="text-xs text-muted">{order.order_size ?? '—'} items</span>
                <span className="text-right text-xs text-muted">
                  {order.status === 'SUBMITTED' ? (
                    order.deferred ? (
                      <div>
                        <span className="font-semibold text-amber-800">Deferred</span>
                        {(order.next_eligible_date || (order.eligible_date > order.requested_date ? order.eligible_date : null)) && (
                          <span className="mt-0.5 block text-xs font-medium text-foreground">
                            Next: {order.next_eligible_date || order.eligible_date}
                          </span>
                        )}
                      </div>
                    ) : order.latest_decision === 'ALLOCATED' ? (
                      'Assigned'
                    ) : (
                      'Unassigned'
                    )
                  ) : (
                    humanize(order.status)
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        {!orders.isPending && !orders.error && rows.length === 0 && (
          <div className="rounded-card border border-dashed border-border py-20 text-center">
            <PackageOpen className="mx-auto mb-4 text-muted" size={32} />
            <h2 className="font-medium">No orders found</h2>
            <p className="mt-2 text-sm text-muted">Try adjusting your search or filters.</p>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between text-xs text-muted">
          <span>
            {rows.length} of {first?.summary?.total ?? rows.length} orders
          </span>
          {orders.hasNextPage && (
            <button
              disabled={orders.isFetchingNextPage}
              onClick={() => void orders.fetchNextPage()}
              className="rounded-xl border border-border px-4 py-3 text-primary disabled:opacity-50"
            >
              {orders.isFetchingNextPage ? 'Loading…' : 'Load more orders'}
            </button>
          )}
        </div>
      </section>
      <aside
        className={`${summaryOpen ? 'w-60 2xl:w-72 p-5' : 'w-14 p-2.5'} hidden h-full shrink-0 flex-col rounded-card border border-border bg-white/20 transition-[width,padding] xl:flex overflow-y-auto`}
      >
        {summaryOpen ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Orders Summary</h2>
              <button
                onClick={() => setSummaryOpen(false)}
                aria-label="Collapse order summary"
                aria-expanded={true}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-foreground transition-colors"
              >
                <PanelRightClose size={20} />
              </button>
            </div>
            <SummaryContent data={first?.summary} />
          </>
        ) : (
          <button
            onClick={() => setSummaryOpen(true)}
            aria-label="Expand order summary"
            aria-expanded={false}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-foreground transition-colors"
          >
            <PanelRightOpen size={20} />
          </button>
        )}
      </aside>
      {summaryOpen && (
        <div className="fixed inset-x-4 bottom-4 z-20 rounded-card border border-border bg-white p-5 shadow-lg md:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Orders Summary</h2>
            <button
              onClick={() => setSummaryOpen(false)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface"
              aria-label="Close order summary"
            >
              <PanelRightClose size={20} />
            </button>
          </div>
          <SummaryContent data={first?.summary} compact />
        </div>
      )}
    </div>
  );
}
function SummaryContent({
  data,
  compact = false,
}: {
  data?: OrdersPage['summary'] | undefined;
  compact?: boolean | undefined;
}) {
  return (
    <>
      <div className={`${compact ? 'my-3' : 'my-8'} flex items-center gap-5`}>
        <strong className="text-6xl font-medium tabular-nums">{data?.total ?? '—'}</strong>
        <span className="text-xs text-muted">
          Matching
          <br />
          orders
        </span>
      </div>
      <dl className="space-y-3 text-sm">
        {[
          ['Chilled orders', data?.chilled],
          ['Fresh orders', data?.fresh],
          ['Fragile orders', data?.fragile],
          ['Deferred orders', data?.deferred],
        ].map(([label, count]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium tabular-nums">{count ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function OrderDetails({ user, id, back }: { user: User; id: string; back: () => void }) {
  const query = useQuery({
    queryKey: ['order', user.id, id],
    queryFn: ({ signal }) => request<Detail>(`/orders/${encodeURIComponent(id)}`, { signal }),
  });
  const data = query.data;
  const outlet = data?.outlet;
  const units = data?.aggregate?.units ?? data?.lines.reduce((sum, line) => sum + line.quantity, 0);
  const meta = (key: string) => (outlet?.[key] == null ? '—' : String(outlet[key]));
  const deferredDecision = (
    data?.decisions as {
      id?: string;
      decision?: string;
      rationale?: string;
      reason_code?: string;
      next_eligible_date?: string;
      operating_date?: string;
    }[]
  )?.find((d) => d.decision === 'DEFERRED');
  const isDeferred =
    data?.order.status === 'SUBMITTED' &&
    (data.order.deferred || !!deferredDecision || (data.order.eligible_date > data.order.requested_date));
  const nextProcessingDate =
    deferredDecision?.next_eligible_date ??
    data?.order.next_eligible_date ??
    (data && data.order.eligible_date > data.order.requested_date ? data.order.eligible_date : null);
  return (
    <div>
      <div className="sticky top-0 z-20 -mt-1 mb-4 bg-surface pb-5 pt-1">
        <button
          onClick={back}
          className="mb-2 flex min-h-11 items-center gap-2 rounded-control px-3 hover:bg-white"
        >
          <ArrowLeft size={20} />
          Back to orders
        </button>
        {data && (
          <header className="flex flex-wrap items-center justify-between gap-3 px-3">
            <h1 className="text-xl font-semibold">{formatOrderId(data.order.public_reference, data.order.id)}</h1>
            <span className="text-sm text-muted">{humanize(data.order.status)}</span>
          </header>
        )}
      </div>
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      {query.isPending && (
        <p role="status" className="p-8 text-muted">
          Loading order details…
        </p>
      )}
      {data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            {isDeferred && (
              <section className="mb-5 rounded-[22px] border border-red-200 bg-red-50/50 p-6 text-foreground">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-red-600">Deferred Notes</h2>
                  <AlertCircle size={20} className="text-red-500" />
                </div>
                <p className="mt-4 text-sm leading-relaxed">
                  {deferredDecision?.rationale ??
                    (deferredDecision?.reason_code
                      ? String(deferredDecision.reason_code).replaceAll('_', ' ')
                      : 'This order was deferred for a later operating date.')}
                </p>
                {deferredDecision?.reason_code && (
                  <p className="mt-2 text-xs text-muted">
                    Reason: {String(deferredDecision.reason_code).replaceAll('_', ' ')}
                  </p>
                )}
                {nextProcessingDate && (
                  <div className="mt-6 text-right">
                    <span className="text-xs text-muted">Next processing date</span>
                    <p className="font-semibold text-foreground">{nextProcessingDate}</p>
                  </div>
                )}
              </section>
            )}
            <div className="min-h-[65dvh] rounded-card border border-border p-5 sm:p-8">
              <div className="mb-4 hidden grid-cols-[1fr_2fr_1fr_1fr] gap-4 px-5 text-xs text-muted md:grid">
                <span>Item ID</span>
                <span>Item Name</span>
                <span>Order Type</span>
                <span className="text-right">Item count</span>
              </div>
              <div className="space-y-4">
                {data.lines.map((line) => (
                  <div
                    key={line.id}
                    className="grid grid-cols-2 items-center gap-4 rounded-card border border-border p-5 md:grid-cols-[1fr_2fr_1fr_1fr]"
                  >
                    <span className="break-all text-xs text-muted">
                      {formatItemId(line.sku, line.product_id, line.id)}
                    </span>
                    <span className="text-sm font-medium">
                      {line.product_name ?? line.name ?? 'Order item'}
                    </span>
                    <CategoryBadge
                      value={line.temperature_requirement ?? data.order.temperature_requirement}
                    />
                    <span className="text-right text-lg text-muted">× {line.quantity}</span>
                  </div>
                ))}
              </div>
              {data.aggregate && (
                <div className="rounded-card border border-border bg-white p-6">
                  <h2 className="font-semibold">Aggregate order</h2>
                  <p className="mt-2 text-sm text-muted">
                    Imported order with total quantities. Individual product lines were not
                    supplied.
                  </p>
                  <dl className="mt-6 grid grid-cols-3 gap-4">
                    <div>
                      <dt className="text-xs text-muted">Units</dt>
                      <dd className="mt-1 text-xl">{data.aggregate.units}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Weight</dt>
                      <dd className="mt-1">{data.aggregate.weight_kg} kg</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Volume</dt>
                      <dd className="mt-1">{data.aggregate.volume_m3} m³</dd>
                    </div>
                  </dl>
                </div>
              )}
              {data.decisions.length > 0 && (
                <div className="mt-8">
                  <h2 className="mb-3 text-sm font-semibold">Planning history</h2>
                  {data.decisions.map((decision, index) => {
                    const dec = decision as {
                      id?: string;
                      operating_date?: string;
                      decision?: string;
                      status?: string;
                      rationale?: string;
                      next_eligible_date?: string;
                    };
                    return (
                      <div
                        key={String(dec.id ?? index)}
                        className="mb-3 rounded-control bg-white p-4 text-sm"
                      >
                        <p className="font-medium">
                          {String(dec.operating_date)} ·{' '}
                          {humanize(String(dec.decision ?? dec.status ?? 'Planned'))}
                        </p>
                        {dec.rationale != null && (
                          <p className="mt-1 text-muted">{String(dec.rationale)}</p>
                        )}
                        {dec.decision === 'DEFERRED' && dec.next_eligible_date != null && (
                          <p className="mt-1.5 text-xs text-amber-800">
                            Next processing date: <strong>{String(dec.next_eligible_date)}</strong>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          <aside className="rounded-card border border-border bg-white/30 p-6">
            <h2 className="font-semibold">Order Details</h2>
            <div className="my-10 flex items-center gap-4">
              <strong className="text-6xl font-medium">{units ?? '—'}</strong>
              <span className="text-sm text-muted">
                Total
                <br />
                units
              </span>
            </div>
            <dl className="space-y-5 text-sm">
              {[
                [
                  'Store',
                  outlet?.name
                    ? meta('name')
                    : `${meta('district_name')} · ${meta('brand_name')} · ${formatStoreId(data.order.outlet_id)}`,
                ],
                ['Requested date', data.order.requested_date],
                ['Eligible date', data.order.eligible_date],
                ...(nextProcessingDate ? [['Next processing date', nextProcessingDate]] : []),
                ['Delivery window', `${meta('window_open_time')} – ${meta('window_close_time')}`],
                [
                  'Estimated weight',
                  `${(data.aggregate ? Number(data.aggregate.weight_kg) : data.lines.reduce((sum, line) => sum + line.quantity * Number(line.unit_weight_kg ?? 0), 0)).toFixed(2)} kg`,
                ],
                [
                  'Estimated volume',
                  `${(data.aggregate ? Number(data.aggregate.volume_m3) : data.lines.reduce((sum, line) => sum + line.quantity * Number(line.unit_volume_m3 ?? 0), 0)).toFixed(3)} m³`,
                ],
                ['Dock type', humanize(meta('dock_type'))],
                ['Parking', humanize(meta('parking_constraint'))],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Order type</dt>
                <dd>
                  <CategoryBadge value={data.order.temperature_requirement} />
                </dd>
              </div>
            </dl>
            <ol
              aria-label="Order progress"
              className="mt-10 flex border-t border-border pt-5 text-[11px]"
            >
              {[
                { label: 'Received', done: data.order.status !== 'DRAFT' },
                {
                  label: 'Processing',
                  done: data.decisions.some(
                    (decision) =>
                      decision.decision === 'ALLOCATED' && decision.plan_status !== 'DRAFT',
                  ),
                },
                {
                  label: 'Dispatched',
                  done: data.stops.some((stop) => stop.trip_status !== 'PLANNED'),
                },
                {
                  label: 'Delivered',
                  done: data.attempts.some(
                    (attempt) =>
                      attempt.completed_at &&
                      (attempt.outcome === 'DELIVERED' || attempt.outcome === 'PARTIAL'),
                  ),
                },
              ].map((stage, index) => (
                <li key={stage.label} className="relative flex flex-1 flex-col items-center gap-2">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className={`absolute right-1/2 top-[5px] h-0.5 w-full ${stage.done ? 'bg-primary' : 'bg-border'}`}
                    />
                  )}
                  <span
                    className={`relative z-10 h-3 w-3 rounded-full ${stage.done ? 'bg-primary' : 'bg-border'}`}
                    aria-label={stage.done ? 'Completed' : 'Pending'}
                  />
                  {stage.label}
                </li>
              ))}
            </ol>
            <h3 className="mt-10 text-sm font-semibold">Activity</h3>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted">
              <PackageOpen size={18} />
              {data.stops.length} scheduled stops
              <ArrowRight size={14} />
              {data.attempts.length} delivery attempts
            </div>
            {data.issues.length > 0 && (
              <p className="mt-4 rounded-control bg-amber-50 p-3 text-sm text-amber-900">
                {data.issues.length} reported issue(s)
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
