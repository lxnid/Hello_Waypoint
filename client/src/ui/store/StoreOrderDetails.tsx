import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send, AlertCircle } from 'lucide-react';
import type { User } from '@waypoint/contracts';
import { api, request } from '../../api';
import type { Detail, Product } from '../../types/store-workspace';
import { button, panel, Temperature } from './store-ui';
import { Receipt, IssueReport } from './StoreFulfillment';
import { OrderComposer } from './OrderComposer';
import { formatOrderId } from '../utils/idFormatters';
export function StoreOrderDetails({
  id,
  user,
  products,
  back,
  refresh,
}: {
  id: string;
  user: User;
  products: Product[];
  back: () => void;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ['store', user.id, 'order', id],
    queryFn: () => request<Detail>(`/orders/${encodeURIComponent(id)}`),
    refetchInterval: 15000,
  });
  const submit = useMutation({ mutationFn: () => api.orders.submit(id), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.orders.delete(id),
    onSuccess: () => {
      refresh();
      back();
    },
  });
  const data = detail.data;
  if (editing && data)
    return (
      <>
        <button className="mb-6 flex min-h-11 items-center gap-2" onClick={() => setEditing(false)}>
          <ArrowLeft size={20} />
          Cancel editing
        </button>
        <OrderComposer
          products={products}
          initial={data}
          done={() => {
            setEditing(false);
            refresh();
          }}
        />
      </>
    );
  const decision = data?.decisions.find((d) => d.decision === 'DEFERRED') ?? data?.decisions[0];
  const deferred =
    data?.order.status === 'SUBMITTED' &&
    (decision?.decision === 'DEFERRED' ||
      data?.order.deferred ||
      (data?.order.eligible_date != null &&
        data.order.requested_date != null &&
        data.order.eligible_date > data.order.requested_date));
  const nextProcessingDate =
    decision?.next_eligible_date ??
    data?.order.next_eligible_date ??
    (data && data.order.eligible_date && data.order.requested_date && data.order.eligible_date > data.order.requested_date
      ? data.order.eligible_date
      : null);
  const units = data?.aggregate?.units ?? data?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;
  const weight =
    data?.lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_weight_kg), 0) ?? 0;
  const volume =
    data?.lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_volume_m3), 0) ?? 0;
  const dispatched = data?.stops.some((s) => ['IN_TRANSIT', 'COMPLETED'].includes(s.trip_status));
  const progress =
    data?.order.status === 'COMPLETED' ? 3 : dispatched ? 2 : data?.stops.length ? 1 : 0;
  return (
    <>
      <button className="mb-5 flex min-h-11 items-center gap-2" onClick={back}>
        <ArrowLeft size={20} />
        Back to orders
      </button>
      {detail.isPending && <p role="status">Loading order…</p>}
      {(detail.error || submit.error || remove.error) && (
        <p role="alert" className="mb-5 text-red-600">
          {(detail.error ?? submit.error ?? remove.error)?.message}
        </p>
      )}
      {data && (
        <div className="grid gap-6 xl:grid-cols-[2.2fr_1fr]">
          <div className="space-y-5">
            {deferred && (
              <section className={`${panel} min-h-52`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-red-500">Deferred notes</h2>
                  <AlertCircle size={20} className="text-red-500" />
                </div>
                <p className="mt-5 text-sm leading-relaxed">
                  {decision?.rationale ?? decision?.reason_code ?? data.order.deferral_reason ?? 'No notes supplied'}
                </p>
                {decision?.reason_code && (
                  <p className="mt-3 text-sm text-muted">
                    Reason: {decision.reason_code.replaceAll('_', ' ')}
                  </p>
                )}
                <div className="mt-8 text-right text-sm">
                  <span className="text-xs text-muted">Next processing date</span>
                  <p className="font-semibold text-foreground">
                    {nextProcessingDate ?? 'Awaiting scheduling'}
                  </p>
                </div>
              </section>
            )}
            <div className="flex items-center justify-between gap-4 px-4">
              <h1 className="break-all font-semibold">
                {formatOrderId(data.order.public_reference, data.order.id)}
              </h1>
              <span className="text-sm capitalize text-muted">
                {deferred ? 'Deferred' : data.order.status.replaceAll('_', ' ').toLowerCase()}
              </span>
            </div>
            <section className={`${panel} min-h-72`}>
              <div className="mb-4 hidden grid-cols-[1fr_1.5fr_1fr_auto] gap-4 px-5 text-sm text-muted sm:grid">
                <span>Item ID</span>
                <span>Item name</span>
                <span>Order type</span>
                <span>Item count</span>
              </div>
              <div className="space-y-3">
                {data.lines.map((l) => (
                  <div
                    key={l.id}
                    className="grid grid-cols-2 items-center gap-4 rounded-[20px] border border-border p-5 sm:grid-cols-[1fr_1.5fr_1fr_auto]"
                  >
                    <strong className="break-all text-sm">{l.sku ?? l.product_id}</strong>
                    <span>{l.name}</span>
                    <Temperature
                      value={l.temperature_requirement ?? data.order.temperature_requirement}
                    />
                    <span className="text-right text-xl text-muted">× {l.quantity}</span>
                  </div>
                ))}
              </div>
              {data.aggregate && <p>{data.aggregate.units} aggregate units</p>}
              {data.order.status === 'DRAFT' && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    className={button}
                    disabled={submit.isPending || remove.isPending}
                    onClick={() => submit.mutate()}
                  >
                    <Send size={18} />
                    {submit.isPending ? 'Submitting…' : 'Submit order'}
                  </button>
                  <button
                    className="min-h-11 rounded-full border border-border px-5"
                    disabled={submit.isPending || remove.isPending}
                    onClick={() => setEditing(true)}
                  >
                    Edit draft
                  </button>
                  <button
                    className="min-h-11 rounded-full border border-border px-5 text-red-600"
                    disabled={submit.isPending || remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Delete draft
                  </button>
                </div>
              )}
            </section>
            {data.attempts
              .filter((a) => a.completed_at)
              .map((a) => (
                <Receipt key={a.id} attempt={a} data={data} refresh={refresh} />
              ))}
            {data.stops.length > 0 && <IssueReport data={data} refresh={refresh} />}{' '}
            {!!data.issues.length && (
              <section className={panel}>
                <h2 className="font-semibold">Reported issues</h2>
                {data.issues.map((i) => (
                  <div key={i.id} className="mt-4 text-sm">
                    <strong>{i.type}</strong>
                    <p>{i.notes}</p>
                    <p className="text-muted">{i.resolution ?? 'Awaiting dispatcher resolution'}</p>
                  </div>
                ))}
              </section>
            )}
          </div>
          <aside className={`${panel} flex min-h-[65vh] flex-col`}>
            <h2 className="text-xl font-semibold">Order details</h2>
            <div className="my-8 flex items-center gap-5">
              <strong className="text-6xl font-medium">{units}</strong>
              <span className="text-sm text-muted">
                Total
                <br />
                units
              </span>
            </div>
            <dl className="grid grid-cols-[1fr_1.2fr] items-center gap-x-4 gap-y-5 text-sm">
              <dt className="text-muted">Handler</dt>
              <dd>Warehouse · {data.outlet.depot_id}</dd>
              <dt className="text-muted">Order type</dt>
              <dd>
                <Temperature value={data.order.temperature_requirement} />
              </dd>
              <dt className="text-muted">Order size</dt>
              <dd>
                {data.lines.length} items · {units} units
              </dd>
              <dt className="text-muted">Estimated weight</dt>
              <dd>{weight.toFixed(2)} kg</dd>
              <dt className="text-muted">Estimated volume</dt>
              <dd>{volume.toFixed(3)} m³</dd>
              {data.stops.length > 0 && (
                <>
                  <dt className="text-muted">Vehicle</dt>
                  <dd className="break-all">{data.stops.at(-1)?.vehicle_id}</dd>
                  <dt className="text-muted">Driver</dt>
                  <dd>{data.stops.at(-1)?.driver_name}</dd>
                  <dt className="text-muted">Load ID</dt>
                  <dd className="break-all text-xs">{data.stops.at(-1)?.load_id}</dd>
                </>
              )}
              <dt className="text-muted">Requested date</dt>
              <dd>{data.order.requested_date}</dd>
              {nextProcessingDate && (
                <>
                  <dt className="text-muted">Next processing date</dt>
                  <dd className="font-semibold text-foreground">{nextProcessingDate}</dd>
                </>
              )}
            </dl>
            <div className="mt-auto pt-12" aria-label="Order progress">
              <div className="flex justify-between text-xs text-muted">
                {['Created', 'Processing', 'Dispatched', 'Delivered'].map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-4">
                    <span>{label}</span>
                    <span
                      className={`h-3 w-3 rounded-full ${i <= progress ? 'bg-primary' : 'bg-border'}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
