import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Minus, Plus, Search, Send, X } from 'lucide-react';
import { api } from '../../api';
import type { Detail, Product } from '../../types/store-workspace';
import { button, field, panel, ProductPreview, Temperature } from './store-ui';
import { formatOrderId } from '../utils/idFormatters';
export function OrderComposer({
  products,
  done,
  initial,
}: {
  products: Product[];
  done: (id: string) => void;
  initial?: Detail | undefined;
}) {
  const [temperature, setTemperature] = useState<'ambient' | 'chilled'>(
    initial?.order.temperature_requirement === 'chilled' ? 'chilled' : 'ambient',
  );
  const [date, setDate] = useState(
    initial?.order.requested_date ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial?.lines.map((l) => [l.product_id, l.quantity]) ?? []),
  );
  const [selected, setSelected] = useState(''),
    [adding, setAdding] = useState(false),
    [search, setSearch] = useState(''),
    [count, setCount] = useState(1);
  const [submittingAction, setSubmittingAction] = useState<'draft' | 'submit' | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (adding) dialog.current?.showModal();
    else dialog.current?.close();
  }, [adding]);
  const chosen = products.filter((p) => (quantities[p.id] ?? 0) > 0);
  const available = products.filter(
    (p) =>
      p.temperature_requirement === temperature &&
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  const product = products.find((p) => p.id === selected) ?? (adding ? available[0] : chosen[0]);
  const invalid =
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > (product?.available_quantity ?? 0) ||
    (product?.max_order_quantity != null && count > product.max_order_quantity);
  const valid =
    chosen.length > 0 &&
    chosen.every(
      (p) =>
        Number.isSafeInteger(quantities[p.id]) &&
        quantities[p.id]! <= p.available_quantity &&
        (p.max_order_quantity === null || quantities[p.id]! <= p.max_order_quantity),
    );
  const handleSave = async (submitAfterSave: boolean) => {
    if (!valid) return;
    setComposerError(null);
    setSubmittingAction(submitAfterSave ? 'submit' : 'draft');
    try {
      const body = {
        requestedDate: date,
        temperatureRequirement: temperature,
        lines: chosen.map((p) => ({ productId: p.id, quantity: quantities[p.id]! })),
      };
      const res = initial
        ? await api.orders.update(initial.order.id, body)
        : await api.orders.create(body);

      if (submitAfterSave) {
        await api.orders.submit(res.id);
      }
      done(res.id);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while saving the order';
      setComposerError(message);
    } finally {
      setSubmittingAction(null);
    }
  };
  function edit(p: Product) {
    setSelected(p.id);
    setCount(quantities[p.id] ?? 1);
    setAdding(true);
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !submittingAction) void handleSave(true);
        }}
        className="grid gap-6 xl:grid-cols-[1.8fr_1fr]"
      >
        <div>
          <p className="mb-8 text-muted">{initial ? 'Edit draft' : 'Create new order'}</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="break-all text-sm text-muted">
              {initial
                ? formatOrderId(initial.order.public_reference, initial.order.id)
                : 'Order ID generated when saved'}
            </p>
            <p className="text-sm">
              Item count{' '}
              <span className="ml-6 text-muted">
                {chosen.reduce((s, p) => s + quantities[p.id]!, 0)} units
              </span>
            </p>
          </div>
          <div className="my-6 flex flex-wrap items-end gap-6">
            <label className="text-sm">
              Order type
              <select
                className={`${field} mt-2 block !w-48`}
                value={temperature}
                onChange={(e) => {
                  const t = e.target.value as typeof temperature;
                  setTemperature(t);
                  setQuantities({});
                  setSelected('');
                }}
                disabled={chosen.length > 0}
              >
                <option value="ambient">Ambient</option>
                <option value="chilled">Chilled</option>
              </select>
            </label>
            <label className="text-sm">
              Requested delivery date
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${field} mt-2`}
              />
            </label>
            <button
              type="button"
              className={`${button} ml-auto`}
              onClick={() => {
                setSelected('');
                setSearch('');
                setCount(1);
                setAdding(true);
              }}
            >
              Add Item
            </button>
          </div>
          <p className="mb-5 text-xs text-muted">
            Ambient and chilled items require separate orders. Requested dates are checked against
            the operating calendar on submission.
          </p>
          <div className="space-y-3">
            {chosen.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-[22px] border border-border p-5"
              >
                <button
                  type="button"
                  className="grid flex-1 grid-cols-2 sm:grid-cols-[1fr_1.3fr_auto_auto] items-center gap-4 text-left"
                  onClick={() => {
                    setSelected(p.id);
                  }}
                >
                  <strong className="break-all text-sm">{p.sku}</strong>
                  <span>{p.name}</span>
                  <Temperature value={p.temperature_requirement} />
                  <span className="text-xl text-muted">× {quantities[p.id]}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => edit(p)}
                  className="p-2"
                >
                  <ArrowRight size={20} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setQuantities({ ...quantities, [p.id]: 0 })}
                  className="p-2"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          {!chosen.length && (
            <p className={`${panel} text-sm text-muted`}>
              Add items from your store’s catalogue to start this order.
            </p>
          )}
          {composerError && (
            <p
              role="alert"
              className="mt-5 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {composerError}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="min-h-11 rounded-control border border-border bg-white px-6 font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              disabled={!valid || submittingAction !== null}
              onClick={() => void handleSave(false)}
            >
              {submittingAction === 'draft'
                ? 'Saving draft…'
                : initial
                  ? 'Save changes'
                  : 'Save draft'}
            </button>
            <button
              type="button"
              className={`${button} !mt-0`}
              disabled={!valid || submittingAction !== null}
              onClick={() => void handleSave(true)}
            >
              <Send size={18} />
              {submittingAction === 'submit'
                ? 'Submitting…'
                : initial
                  ? 'Submit order'
                  : 'Save & Submit'}
            </button>
          </div>
        </div>
        <aside className={panel}>
          <ProductPreview product={product} />
          {product && (quantities[product.id] ?? 0) > 0 && (
            <>
              <p className="mt-6 text-sm text-muted">Item count: {quantities[product.id]}</p>
              <button
                type="button"
                className={`${button} mt-6 w-full`}
                onClick={() => edit(product)}
              >
                Edit
              </button>
            </>
          )}
        </aside>
      </form>
      <dialog
        aria-labelledby="store-add-item-title"
        ref={dialog}
        onCancel={() => setAdding(false)}
        onClose={() => setAdding(false)}
        className="fixed left-1/2 top-1/2 m-0 max-h-[90dvh] w-[min(1120px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-0 shadow-xl backdrop:bg-black/40"
      >
        <div className="grid lg:grid-cols-[1.6fr_1fr]">
          <div className="p-6 sm:p-10">
            <h2 id="store-add-item-title" className="mb-6 text-xl font-semibold">
              Add Item
            </h2>
            <label className="relative block">
              <input
                className={`${field} pr-12`}
                aria-label="Search items to add"
                placeholder="Search item or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={20} className="absolute right-4 top-3" />
            </label>
            <p className="my-6 text-sm text-muted">
              {available.length} results · {temperature}
            </p>
            <div className="max-h-[55dvh] space-y-3 overflow-y-auto">
              {available.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setCount(quantities[p.id] ?? 1);
                  }}
                  className={`flex min-h-20 w-full flex-wrap items-center gap-4 rounded-[20px] border border-border px-5 text-left ${product?.id === p.id ? 'bg-white' : ''}`}
                >
                  <strong className="break-all text-sm">{p.sku}</strong>
                  <span className="flex-1">{p.name}</span>
                  <Temperature value={p.temperature_requirement} />
                  <span className="text-xs text-muted">
                    {p.available_quantity} {p.ordering_unit} · available
                  </span>
                  <span className="text-muted">
                    {quantities[p.id] ? `× ${quantities[p.id]}` : '+'}
                  </span>
                </button>
              ))}
              {!available.length && <p className="text-sm text-muted">No matching items.</p>}
            </div>
          </div>
          <aside className="relative border-border p-6 sm:p-10 lg:border-l">
            <button
              type="button"
              aria-label="Close add item"
              onClick={() => setAdding(false)}
              className="absolute right-4 top-4 p-2"
            >
              <X size={20} />
            </button>
            <ProductPreview product={product} compact />
            {product && (
              <>
                <div className="mt-7 flex justify-between gap-4 text-sm">
                  <span className="text-muted">Enter item count</span>
                  {invalid && (
                    <span role="alert" className="text-red-600">
                      {!Number.isSafeInteger(count) || count < 1
                        ? 'Enter a positive whole number'
                        : count > product.available_quantity
                          ? `Available quantity exceeded · ${product.available_quantity} at ${product.inventory_depot}`
                          : `Per order limit exceeded · Max ${product.max_order_quantity}`}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    className={`${button} rounded-xl`}
                    onClick={() => setCount(Math.max(1, count - 1))}
                  >
                    <Minus size={20} />
                  </button>
                  <input
                    autoComplete="off"
                    aria-label="Item quantity"
                    type="number"
                    min={1}
                    max={Math.min(
                      product.available_quantity,
                      product.max_order_quantity ?? Number.MAX_SAFE_INTEGER,
                    )}
                    step={1}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className={`${field} text-center ${invalid ? 'text-red-600' : ''}`}
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    className={`${button} rounded-xl`}
                    onClick={() => setCount(count + 1)}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={invalid}
                  className={`${button} mt-6 w-full rounded-2xl`}
                  onClick={() => {
                    setQuantities({ ...quantities, [product.id]: count });
                    setSelected(product.id);
                    setAdding(false);
                  }}
                >
                  Save item
                </button>
              </>
            )}
          </aside>
        </div>
      </dialog>
    </>
  );
}
