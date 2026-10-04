import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { PanelRightClose, PanelRightOpen, Search } from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { api, request } from '../../api';
import type { Page } from '../../types/store-workspace';
import { button, field, panel, Temperature } from './store-ui';
import { StoreCatalog } from './StoreCatalog';
import { OrderComposer } from './OrderComposer';
import { StoreOrderDetails } from './StoreOrderDetails';
import { formatOrderId, formatVehicleId, formatLoadId } from '../utils/idFormatters';

export function StoreWorkspace({ user }: { user: User }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [summaryOpen, setSummaryOpen] = useState(true);

  const tab = location.pathname.split('/')[2] || 'orders';
  const selected = params.get('orderId') ?? '';

  const [temperature, setTemperature] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setStatus('');
    setTemperature('');
    setSearch('');
  }, [tab]);

  const profile = useQuery({
    queryKey: ['store', user.id, 'profile'],
    queryFn: api.catalog.profile,
    refetchInterval: 30000,
  });

  const catalog = useQuery({
    queryKey: ['store', user.id, 'catalog'],
    queryFn: () => api.catalog.list(),
    refetchInterval: 30000,
  });

  const orders = useInfiniteQuery({
    queryKey: ['store', user.id, 'orders', tab, temperature, status, search],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: '30', view: tab === 'history' ? 'history' : 'live' });
      if (tab === 'deferred') q.set('deferred', 'true');
      else if (tab !== 'history') q.set('deferred', 'false');
      if (temperature) q.set('temperature', temperature);
      if (status) q.set('status', status);
      if (search) q.set('q', search);
      if (pageParam) q.set('cursor', pageParam);
      return request<Page>(`/orders?${q}`);
    },
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: ['orders', 'deferred', 'history', 'vehicles'].includes(tab),
    refetchInterval: 15000,
  });

  const vehicles = useQuery({
    queryKey: ['store', user.id, 'vehicles'],
    queryFn: api.catalog.vehicles,
    enabled: tab === 'vehicles',
    refetchInterval: 15000,
  });

  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['store', user.id] });
  };

  const products = catalog.data ?? [];
  const monthly = profile.data?.monthly_summary;

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
      {(profile.error || catalog.error) && (
        <p
          role="alert"
          className="mb-4 shrink-0 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {(profile.error ?? catalog.error)?.message}
        </p>
      )}

      {selected ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <StoreOrderDetails
            key={selected}
            id={selected}
            user={user}
            products={products}
            back={() => navigate(`/store/${tab}`)}
            refresh={refresh}
          />
        </div>
      ) : tab === 'create' ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {catalog.isPending ? (
            <p role="status" className="p-4 text-sm text-muted">
              Loading catalogue…
            </p>
          ) : (
            <OrderComposer
              products={products}
              done={(id) => {
                refresh();
                navigate(`/store/orders?orderId=${id}`);
              }}
            />
          )}
        </div>
      ) : tab === 'items' ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {catalog.isPending ? (
            <p role="status" className="p-4 text-sm text-muted">
              Loading catalogue…
            </p>
          ) : (
            <StoreCatalog products={products} />
          )}
        </div>
      ) : tab === 'vehicles' ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <section className={panel}>
            <h1 className="text-xl font-semibold">Delivery vehicles</h1>
            <p className="mt-3 text-sm text-muted">
              Released delivery assignments for your store · {profile.data?.depot_id}
            </p>
            {vehicles.isPending && (
              <p role="status" className="mt-5 text-sm text-muted">
                Loading assignments…
              </p>
            )}
            {vehicles.error && (
              <p role="alert" className="mt-5 text-sm text-red-600">
                {vehicles.error.message}
              </p>
            )}
            {vehicles.data?.length === 0 && (
              <p className="mt-6 text-sm text-muted">No delivery vehicle assigned yet.</p>
            )}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {vehicles.data?.map((v) => (
                <article key={v.load_id} className="rounded-[20px] border border-border p-5">
                  <div className="flex justify-between gap-4">
                    <strong>{formatVehicleId(v.vehicle_id)}</strong>
                    <span className="text-sm capitalize text-muted">
                      {v.trip_status.toLowerCase().replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-4 text-sm">
                    {v.driver_name} · {v.vehicle_type}
                  </p>
                  <p className="mt-2 text-sm text-muted">{v.operating_date}</p>
                  <p className="mt-4 break-all text-xs text-muted">
                    Load ID: {formatLoadId(v.load_id)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 h-full gap-5 overflow-hidden flex-col xl:flex-row">
          <section className="flex flex-1 min-h-0 flex-col overflow-y-auto rounded-card border border-border bg-white p-5 lg:p-7">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">Filter by</span>
              <select
                aria-label="Filter by temperature"
                className={`${field} !w-40`}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              >
                <option value="">Temperature</option>
                <option value="ambient">Ambient</option>
                <option value="chilled">Chilled</option>
              </select>
              <select
                aria-label="Filter by order status"
                className={`${field} !w-40`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Status</option>
                {(tab === 'history'
                  ? ['COMPLETED', 'CLOSED_EXCEPTION', 'CANCELLED']
                  : ['DRAFT', 'SUBMITTED']
                ).map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
              <label className="relative min-w-40 flex-1">
                <input
                  aria-label="Search store orders"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Order ID"
                  className={`${field} pr-10`}
                />
                <Search size={18} className="absolute right-3 top-3 text-muted" />
              </label>
              <button
                aria-label={summaryOpen ? 'Hide order summary' : 'Show order summary'}
                onClick={() => setSummaryOpen(!summaryOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-control border border-border p-2 text-muted hover:bg-surface xl:hidden"
              >
                {summaryOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
              </button>
            </div>
            <div className="mb-3 hidden grid-cols-[1.4fr_1.2fr_1fr_.7fr_.7fr] gap-4 px-6 text-sm text-muted xl:grid">
              <span>Order ID</span>
              <span>Created at</span>
              <span>Order type</span>
              <span>Order size</span>
              <span>Status</span>
            </div>
            {orders.isPending && (
              <p role="status" className="text-sm text-muted">
                Loading orders…
              </p>
            )}
            {orders.error && (
              <p role="alert" className="text-sm text-red-600">
                {orders.error.message}
              </p>
            )}
            <div className="space-y-3">
              {orders.data?.pages
                .flatMap((p) => p.items)
                .map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/store/${tab}?orderId=${o.id}`)}
                    className="grid min-h-20 w-full grid-cols-2 items-center gap-4 rounded-[22px] border border-border bg-white/40 px-6 py-4 text-left transition-colors hover:bg-white xl:grid-cols-[1.4fr_1.2fr_1fr_.7fr_.7fr]"
                  >
                    <strong className="break-all text-sm font-semibold">
                      {formatOrderId(o.public_reference, o.id)}
                    </strong>
                    <span className="text-sm">
                      {new Intl.DateTimeFormat('en-GB', {
                        timeZone: 'Asia/Colombo',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(o.created_at))}
                    </span>
                    <Temperature value={o.temperature_requirement} />
                    <span className="text-sm text-muted">{o.order_size} units</span>
                    <span className="text-sm text-right text-muted">
                      {o.deferred ? (
                        <span>
                          <span className="block font-medium text-amber-800">Deferred</span>
                          {(o.next_eligible_date || (o.eligible_date && o.eligible_date > o.requested_date ? o.eligible_date : null)) && (
                            <span className="block text-xs font-normal text-muted">
                              Next: {o.next_eligible_date || o.eligible_date}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="capitalize">{o.status.toLowerCase().replaceAll('_', ' ')}</span>
                      )}
                    </span>
                  </button>
                ))}
            </div>
            {orders.data?.pages[0]?.items.length === 0 && (
              <p className={`${panel} text-sm text-muted`}>
                {tab === 'deferred'
                  ? 'No deferred orders.'
                  : tab === 'history'
                    ? 'No completed orders yet.'
                    : 'No matching orders. Create an order to begin.'}
              </p>
            )}
            {orders.hasNextPage && (
              <button
                className={`${button} mt-5`}
                disabled={orders.isFetchingNextPage}
                onClick={() => void orders.fetchNextPage()}
              >
                {orders.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </section>

          {/* Right Orders Summary - matching OrdersWorkspace */}
          <aside
            className={`${
              summaryOpen ? 'w-64 2xl:w-72 p-5' : 'w-14 p-2.5'
            } hidden h-full shrink-0 flex-col rounded-card border border-border bg-white transition-[width,padding] xl:flex overflow-y-auto`}
          >
            {summaryOpen ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Orders Summary</h2>
                  <button
                    onClick={() => setSummaryOpen(false)}
                    aria-label="Collapse order summary"
                    aria-expanded={true}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
                  >
                    <PanelRightClose size={20} />
                  </button>
                </div>
                <div className="my-8 flex items-center gap-5">
                  <strong className="text-5xl font-semibold text-foreground">
                    {monthly?.total ?? '—'}
                  </strong>
                  <span className="text-xs text-muted leading-tight">
                    Orders
                    <br />
                    this month
                  </span>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-y-3.5 text-sm">
                  <dt className="text-muted">Chilled order count</dt>
                  <dd className="font-medium text-foreground">{monthly?.chilled ?? '—'}</dd>
                  <dt className="text-muted">Fresh order count</dt>
                  <dd className="font-medium text-foreground">{monthly?.fresh ?? '—'}</dd>
                  <dt className="text-muted">Fragile order count</dt>
                  <dd className="font-medium text-foreground">{monthly?.fragile ?? '—'}</dd>
                </dl>
              </>
            ) : (
              <button
                onClick={() => setSummaryOpen(true)}
                aria-label="Expand order summary"
                aria-expanded={false}
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
              >
                <PanelRightOpen size={20} />
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
