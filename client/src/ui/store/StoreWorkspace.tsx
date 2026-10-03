import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Package,
  Plus,
  Send,
  TriangleAlert,
} from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { request } from '../../api';

const panel = 'rounded-card border border-border bg-white p-5';
const field = 'mt-2 min-h-11 w-full rounded-control border border-border bg-white px-4 text-sm';
const button =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm text-white disabled:opacity-40';
type Order = {
  id: string;
  public_reference: string;
  status: string;
  requested_date: string;
  temperature_requirement: string;
  order_size: number;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  temperature_requirement: 'ambient' | 'chilled';
  ordering_unit: string;
};
type Line = { id: string; name: string; quantity: number; product_id: string };
type Attempt = {
  id: string;
  stop_id: string;
  outcome: string | null;
  completed_at: string | null;
  receipt: object | null;
  lines: { order_line_id: string; delivered_quantity: number; rejected_quantity: number }[] | null;
  delivered_units: number | null;
};
type Detail = {
  order: Order;
  lines: Line[];
  aggregate: { units: number } | null;
  attempts: Attempt[];
  stops: { id: string }[];
  issues: { id: string; type: string; notes: string | null; resolution: string | null }[];
};
type Page = { items: Order[]; nextCursor: string | null };
const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) });
export function StoreWorkspace({ user }: { user: User }) {
  const cache = useQueryClient();
  const [tab, setTab] = useState<'orders' | 'new'>('orders');
  const [selected, setSelected] = useState('');
  const orders = useInfiniteQuery({
    queryKey: ['store', user.id, 'orders'],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      request<Page>(
        `/orders?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['store', user.id] });
  };
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Store orders</h1>
          <p className="mt-1 text-sm text-muted">
            {user.outletId} · Replenishment and goods receipts
          </p>
        </div>
        <button
          className={button}
          onClick={() => {
            setSelected('');
            setTab(tab === 'new' ? 'orders' : 'new');
          }}
        >
          {tab === 'new' ? <ArrowLeft size={18} /> : <Plus size={18} />}{' '}
          {tab === 'new' ? 'Back to orders' : 'New order'}
        </button>
      </header>
      {selected ? (
        <StoreOrder
          key={selected}
          id={selected}
          user={user}
          back={() => setSelected('')}
          refresh={refresh}
        />
      ) : tab === 'new' ? (
        <NewOrder
          user={user}
          done={(id) => {
            setTab('orders');
            setSelected(id);
            refresh();
          }}
        />
      ) : (
        <>
          {orders.error && (
            <p role="alert" className="text-red-800">
              {orders.error.message}
            </p>
          )}
          {orders.isPending && <p role="status">Loading orders…</p>}
          <div className="space-y-3">
            {orders.data?.pages
              .flatMap((page) => page.items)
              .map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelected(order.id)}
                  className={`${panel} flex w-full items-center gap-4 text-left`}
                >
                  <Package size={24} />
                  <div className="flex-1">
                    <strong>{order.public_reference}</strong>
                    <p className="mt-2 text-sm text-muted">
                      {order.requested_date} · {order.order_size} items ·{' '}
                      {order.temperature_requirement}
                    </p>
                  </div>
                  <span className="text-xs text-muted">{order.status}</span>
                  <ArrowRight size={20} />
                </button>
              ))}
          </div>
          {orders.data?.pages[0]?.items.length === 0 && (
            <p className={panel}>No orders yet. Create your first replenishment order.</p>
          )}
          {orders.hasNextPage && (
            <button
              className={button}
              disabled={orders.isFetchingNextPage}
              onClick={() => void orders.fetchNextPage()}
            >
              Load more orders
            </button>
          )}
        </>
      )}
    </div>
  );
}
function NewOrder({ user, done }: { user: User; done: (id: string) => void }) {
  const catalog = useQuery({
    queryKey: ['store', user.id, 'catalog'],
    queryFn: () => request<Product[]>('/catalog'),
  });
  const [temperature, setTemperature] = useState<'ambient' | 'chilled'>('ambient');
  const [date, setDate] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const create = useMutation({
    mutationFn: () =>
      request<{ id: string }>(
        '/orders',
        json({
          requestedDate: date,
          temperatureRequirement: temperature,
          lines: Object.entries(quantities)
            .filter(
              ([id, quantity]) =>
                quantity > 0 &&
                catalog.data?.some(
                  (product) => product.id === id && product.temperature_requirement === temperature,
                ),
            )
            .map(([productId, quantity]) => ({ productId, quantity })),
        }),
      ),
    onSuccess: (result) => done(result.id),
  });
  const products =
    catalog.data?.filter((product) => product.temperature_requirement === temperature) ?? [];
  return (
    <form
      className={`${panel} space-y-5`}
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-xl font-semibold">Create replenishment order</h2>
      <p className="text-sm text-muted">
        Save a draft, review its quantities, then submit for dispatch. Ambient and chilled products
        use separate orders.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Requested delivery date
          <input
            type="date"
            className={field}
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Temperature
          <select
            className={field}
            value={temperature}
            onChange={(event) => setTemperature(event.target.value as typeof temperature)}
          >
            <option value="ambient">Ambient</option>
            <option value="chilled">Chilled</option>
          </select>
        </label>
      </div>
      {products.map((product) => (
        <label
          key={product.id}
          className="flex items-center justify-between gap-4 rounded-control border border-border p-4"
        >
          <span>
            <strong className="text-sm">{product.name}</strong>
            <span className="mt-1 block text-xs text-muted">
              {product.sku} · {product.ordering_unit}
            </span>
          </span>
          <input
            aria-label={`Quantity of ${product.name}`}
            type="number"
            min="0"
            step="1"
            className="min-h-11 w-24 rounded-xl border border-border px-3"
            value={quantities[product.id] ?? 0}
            onChange={(event) =>
              setQuantities({ ...quantities, [product.id]: Number(event.target.value) })
            }
          />
        </label>
      ))}
      {(catalog.error || create.error) && (
        <p role="alert" className="text-sm text-red-800">
          {(catalog.error ?? create.error)?.message}
        </p>
      )}
      <button
        className={button}
        disabled={
          create.isPending || !products.some((product) => (quantities[product.id] ?? 0) > 0)
        }
      >
        {create.isPending ? 'Saving…' : 'Save draft'}
      </button>
    </form>
  );
}
function StoreOrder({
  id,
  user,
  back,
  refresh,
}: {
  id: string;
  user: User;
  back: () => void;
  refresh: () => void;
}) {
  const detail = useQuery({
    queryKey: ['store', user.id, 'order', id],
    queryFn: () => request<Detail>(`/orders/${id}`),
  });
  const submit = useMutation({
    mutationFn: () => request(`/orders/${id}/submit`, json({})),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => request(`/orders/${id}`, json({}, 'DELETE')),
    onSuccess: () => {
      refresh();
      back();
    },
  });
  const data = detail.data;
  return (
    <div className="space-y-5">
      <button onClick={back} className="flex min-h-11 items-center gap-2">
        <ArrowLeft size={20} />
        Back to orders
      </button>
      {(detail.error || submit.error || remove.error) && (
        <p role="alert" className="text-red-800">
          {(detail.error ?? submit.error ?? remove.error)?.message}
        </p>
      )}
      {data && (
        <>
          <section className={panel}>
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">{data.order.public_reference}</h2>
              <span className="text-sm text-muted">{data.order.status}</span>
            </div>
            <ul className="my-5 divide-y divide-border">
              {data.lines.map((line) => (
                <li key={line.id} className="flex justify-between py-4">
                  <span>{line.name}</span>
                  <span>× {line.quantity}</span>
                </li>
              ))}
            </ul>
            {data.aggregate && <p>{data.aggregate.units} aggregate units</p>}
            {data.order.status === 'DRAFT' && (
              <div className="flex gap-3">
                <button
                  className={button}
                  disabled={submit.isPending || remove.isPending}
                  onClick={() => submit.mutate()}
                >
                  <Send size={18} />
                  Submit order
                </button>
                <button
                  className="min-h-12 rounded-control border border-border px-4"
                  disabled={submit.isPending || remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Delete draft
                </button>
              </div>
            )}
          </section>
          {data.attempts
            .filter((attempt) => attempt.completed_at)
            .map((attempt) => (
              <Receipt key={attempt.id} attempt={attempt} data={data} refresh={refresh} />
            ))}
          {data.stops.length > 0 && <IssueReport data={data} refresh={refresh} />}
          <section className={panel}>
            <h2 className="font-semibold">Reported issues</h2>
            {data.issues.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No issues reported for this order.</p>
            ) : (
              data.issues.map((issue) => (
                <div key={issue.id} className="mt-4 border-t border-border pt-4 text-sm">
                  <strong>{issue.type}</strong>
                  <p>{issue.notes}</p>
                  <p className="mt-2 text-muted">
                    {issue.resolution ?? 'Awaiting dispatcher resolution'}
                  </p>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
function Receipt({
  attempt,
  data,
  refresh,
}: {
  attempt: Attempt;
  data: Detail;
  refresh: () => void;
}) {
  const [temperature, setTemperature] = useState('');
  const [verified, setVerified] = useState(false);
  const receipt = useMutation({
    mutationFn: () =>
      request(
        `/attempts/${attempt.id}/receipt`,
        json({
          outcome: attempt.outcome,
          ...(temperature ? { temperatureC: temperature } : {}),
          ...(data.aggregate
            ? {
                aggregate: {
                  acceptedUnits: attempt.delivered_units ?? 0,
                  missingUnits: Math.max(0, data.aggregate.units - (attempt.delivered_units ?? 0)),
                  damagedUnits: 0,
                  rejectedUnits: 0,
                },
              }
            : {
                lines: data.lines.map((line) => {
                  const delivered = attempt.lines?.find(
                    (record) => record.order_line_id === line.id,
                  );
                  return {
                    orderLineId: line.id,
                    acceptedQuantity: delivered?.delivered_quantity ?? 0,
                    missingQuantity: Math.max(
                      0,
                      line.quantity -
                        (delivered?.delivered_quantity ?? 0) -
                        (delivered?.rejected_quantity ?? 0),
                    ),
                    damagedQuantity: 0,
                    rejectedQuantity: delivered?.rejected_quantity ?? 0,
                  };
                }),
              }),
        }),
      ),
    onSuccess: refresh,
  });
  return (
    <section className={`${panel} space-y-4`}>
      <h2 className="flex items-center gap-2 font-semibold">
        <ClipboardCheck size={20} />
        Goods receipt · {attempt.outcome}
      </h2>
      {attempt.receipt ? (
        <p className="text-sm">Receipt confirmed.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Confirm the driver's recorded quantities below. Report discrepancies before confirming.
          </p>
          {data.lines.map((line) => (
            <p key={line.id} className="flex justify-between text-sm">
              <span>{line.name}</span>
              <span>
                {attempt.lines?.find((record) => record.order_line_id === line.id)
                  ?.delivered_quantity ?? 0}{' '}
                delivered
              </span>
            </p>
          ))}
          {data.aggregate && <p>{attempt.delivered_units ?? 0} units delivered</p>}
          {data.order.temperature_requirement === 'chilled' && (
            <label className="block text-sm">
              Measured receipt temperature (°C)
              <input
                className={field}
                type="number"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
            </label>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            I checked the goods against these quantities.
          </label>
          {receipt.error && (
            <p role="alert" className="text-sm text-red-800">
              {receipt.error.message}
            </p>
          )}
          <button
            className={button}
            disabled={
              receipt.isPending ||
              !verified ||
              (data.order.temperature_requirement === 'chilled' && !temperature)
            }
            onClick={() => receipt.mutate()}
          >
            Confirm receipt
          </button>
        </>
      )}
    </section>
  );
}
function IssueReport({ data, refresh }: { data: Detail; refresh: () => void }) {
  const [stopId, setStopId] = useState(data.stops[0]?.id ?? '');
  const [type, setType] = useState('DAMAGED');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const issue = useMutation({
    mutationFn: () =>
      request(
        '/issues',
        json({ stopId, stage: 'RECEIPT', type, affectedQuantity: quantity, notes }),
      ),
    onSuccess: () => {
      setNotes('');
      refresh();
    },
  });
  return (
    <details className={panel}>
      <summary className="cursor-pointer font-semibold">
        <TriangleAlert size={18} className="mr-2 inline" />
        Report a receipt issue
      </summary>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          issue.mutate();
        }}
      >
        <label className="block text-sm">
          Delivery stop
          <select
            className={field}
            value={stopId}
            onChange={(event) => setStopId(event.target.value)}
          >
            {data.stops.map((stop, index) => (
              <option key={stop.id} value={stop.id}>
                Stop {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Issue type
          <select className={field} value={type} onChange={(event) => setType(event.target.value)}>
            {['DAMAGED', 'MISSING', 'TEMPERATURE', 'REJECTED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Affected units
          <input
            type="number"
            min="1"
            step="1"
            required
            className={field}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
        <label className="block text-sm">
          Details
          <textarea
            className={`${field} p-4`}
            required
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {issue.error && (
          <p role="alert" className="text-sm text-red-800">
            {issue.error.message}
          </p>
        )}
        {issue.isSuccess && (
          <p role="status" className="text-sm">
            Issue recorded.
          </p>
        )}
        <button className={button} disabled={issue.isPending}>
          Report issue
        </button>
      </form>
    </details>
  );
}
