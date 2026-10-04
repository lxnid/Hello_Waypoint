import { Package } from 'lucide-react';
import type { Product } from '../../types/store-workspace';
export const panel = 'rounded-card border border-border bg-white/60 p-5';
export const field =
  'min-h-11 w-full rounded-[12px] border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black';
export const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[16px] bg-primary px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-35';
export const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) });
export function Temperature({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex min-w-24 justify-center rounded-full border border-border px-4 py-1 text-sm capitalize ${value === 'chilled' ? 'bg-[#cdeff0]' : 'bg-[#d2f1d3]'}`}
    >
      {value}
    </span>
  );
}
export function ProductPreview({
  product,
  compact = false,
}: {
  product: Product | undefined;
  compact?: boolean;
}) {
  if (!product)
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted">
        Select an item to see its details.
      </div>
    );
  return (
    <>
      <p className="mb-4 break-all font-semibold">{product.sku}</p>
      <div
        className={`flex aspect-square ${compact ? 'max-h-[min(34dvh,320px)]' : 'max-h-96'} items-center justify-center overflow-hidden rounded-control border border-border bg-white`}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <Package size={90} className="text-muted" />
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-3xl font-semibold">{product.name}</h2>
        <span
          className={`rounded-full border border-border px-4 text-sm ${product.available_quantity > 0 ? 'bg-[#cdeff0]' : 'bg-red-50 text-red-700'}`}
        >
          {product.available_quantity > 0 ? 'Available to order' : 'Out of stock'}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted">
        {product.description ?? `${product.ordering_unit} · ${product.temperature_requirement}`}
      </p>
      <p className="mt-4 text-sm font-medium">
        {product.available_quantity} {product.ordering_unit}
        <span className="ml-1 font-normal text-muted">available at {product.inventory_depot}</span>
      </p>
      <p className="mt-3 text-xs text-muted">
        Ordering unit: {product.ordering_unit}
        {product.max_order_quantity !== null
          ? ` · Maximum ${product.max_order_quantity} per order`
          : ''}
      </p>
    </>
  );
}
