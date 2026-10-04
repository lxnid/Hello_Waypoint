import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Product } from '../../types/store-workspace';
import { field, panel, ProductPreview, Temperature } from './store-ui';
export function StoreCatalog({ products }: { products: Product[] }) {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState('');
  const visible = products.filter((p) =>
    `${p.sku} ${p.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const product = products.find((p) => p.id === selected) ?? visible[0];
  return (
    <section className={`${panel} grid min-h-[75vh] gap-6 lg:grid-cols-[1.6fr_1fr]`}>
      <div>
        <h1 className="mb-6 text-xl font-semibold">
          Item catalogue <span className="font-normal text-muted">· {products[0]?.brand_id}</span>
        </h1>
        <label className="relative block">
          <input
            aria-label="Search catalogue"
            placeholder="Search item or SKU"
            className={`${field} pr-12`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="absolute right-4 top-3" size={20} />
        </label>
        <p className="my-6 text-sm text-muted">{visible.length} products</p>
        <div className="space-y-3">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`grid min-h-20 w-full grid-cols-2 items-center gap-3 rounded-control border border-border px-4 py-3 text-left transition-colors sm:grid-cols-[1fr_1.2fr_auto] ${product?.id === p.id ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}
            >
              <strong className="break-all text-sm">{p.sku}</strong>
              <span>{p.name}</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Temperature value={p.temperature_requirement} />
                <span className="text-xs text-muted">
                  {p.available_quantity} {p.ordering_unit}
                </span>
              </div>
            </button>
          ))}
          {!visible.length && <p className="text-sm text-muted">No matching products.</p>}
        </div>
      </div>
      <aside className="border-border lg:border-l lg:pl-8">
        <ProductPreview product={product} />
      </aside>
    </section>
  );
}
