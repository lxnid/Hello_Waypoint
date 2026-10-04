import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Save } from 'lucide-react';
import type { Depot } from '@waypoint/contracts/workflows';
import { api } from '../../api';
import { button, field, panel, ProductPreview, Temperature } from '../store/store-ui';

const depots: Depot[] = ['Peliyagoda', 'Kandy'];
const brands = ['Fresh', 'Style', 'Tech'] as const;

export function CatalogWorkspace() {
  const cache = useQueryClient();
  const [depot, setDepot] = useState<Depot>('Peliyagoda');
  const [brand, setBrand] = useState<(typeof brands)[number]>('Fresh');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const inventory = useQuery({
    queryKey: ['catalog', 'dispatcher', depot],
    queryFn: () => api.catalog.list(depot),
  });
  const products = inventory.data ?? [];
  const brandItems = useMemo(
    () => products.filter((item) => item.brand_id === brand),
    [products, brand],
  );
  const visible = brandItems.filter((item) =>
    `${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  const product = products.find((item) => item.id === selected) ?? visible[0];
  const [quantity, setQuantity] = useState('');
  const update = useMutation({
    mutationFn: () => api.catalog.setAvailableQuantity(product!.id, depot, Number(quantity)),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['catalog', 'dispatcher'] });
      await cache.invalidateQueries({ queryKey: ['store'] });
    },
  });
  useEffect(() => {
    if (product) setQuantity(String(product.available_quantity));
  }, [product?.id, product?.available_quantity]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Product catalogue</h1>
          <p className="mt-1 text-sm text-muted">
            Browse products by brand and adjust depot availability.
          </p>
        </div>
        <label className="text-sm">
          Inventory depot
          <select
            aria-label="Inventory depot"
            className={`${field} mt-1 !w-44 bg-white`}
            value={depot}
            onChange={(event) => setDepot(event.target.value as Depot)}
          >
            {depots.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </header>
      {(inventory.error || update.error) && (
        <p role="alert" className="text-sm text-red-700">
          {(inventory.error ?? update.error)?.message}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        <section className={`${panel} min-h-[55vh] min-w-0 flex-1`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2" role="tablist" aria-label="Product brand">
              {brands.map((item) => (
                <button
                  key={item}
                  role="tab"
                  aria-selected={brand === item}
                  className={`min-h-10 rounded-control px-4 text-sm ${brand === item ? 'bg-primary text-white' : 'border border-border hover:bg-white'}`}
                  onClick={() => {
                    setBrand(item);
                    setSelected('');
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="relative min-w-48 flex-1 xl:max-w-sm">
              <input
                aria-label="Search product catalogue"
                placeholder="Search name or SKU"
                className={`${field} pr-10`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Search size={18} className="absolute right-3 top-3" />
            </label>
          </div>
          {inventory.isPending && <p role="status">Loading catalogue…</p>}
          <h2 className="mb-3 text-sm font-medium text-muted">
            {brand} items · {visible.length}
          </h2>
          <div className="space-y-2">
            {visible.map((item) => (
              <button
                key={item.id}
                className={`grid min-h-16 w-full grid-cols-[1fr_1.2fr_auto] items-center gap-3 rounded-control border border-border px-4 text-left transition-colors ${product?.id === item.id ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}
                onClick={() => setSelected(item.id)}
              >
                <span>
                  <strong className="break-all text-sm">{item.sku}</strong>
                  <span className="mt-1 block text-xs text-muted">
                    {item.available_quantity} {item.ordering_unit}
                  </span>
                </span>
                <span>{item.name}</span>
                <Temperature value={item.temperature_requirement} />
              </button>
            ))}
            {!visible.length && !inventory.isPending && (
              <p className="rounded-control border border-border p-5 text-sm text-muted">
                No items in this brand match your search.
              </p>
            )}
          </div>
        </section>
        <aside className={`${panel} w-full shrink-0 xl:w-[25rem]`}>
          <ProductPreview product={product} />
          {product && (
            <form
              className="mt-6 border-t border-border pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate();
              }}
            >
              <h2 className="font-semibold">Available quantity · {depot}</h2>
              <label className="mt-3 block text-sm text-muted">
                Units available
                <input
                  className={`${field} mt-2`}
                  aria-label="Available quantity"
                  type="number"
                  min="0"
                  max="10000000"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <button
                className={`${button} mt-4 w-full`}
                disabled={
                  update.isPending ||
                  !Number.isSafeInteger(Number(quantity)) ||
                  Number(quantity) < 0 ||
                  Number(quantity) > 10000000 ||
                  Number(quantity) === product.available_quantity
                }
              >
                <Save size={16} />
                {update.isPending ? 'Saving…' : 'Update quantity'}
              </button>
              {update.isSuccess && (
                <p role="status" className="mt-3 text-sm text-green-800">
                  Quantity updated.
                </p>
              )}
              <p className="mt-3 text-xs text-muted">
                This balance is used by store ordering and is checked again when an order is
                submitted.
              </p>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
