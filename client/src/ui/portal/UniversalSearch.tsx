import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Search, Truck, X } from 'lucide-react';
import { request } from '../../api';

import type { OrderHit, TripHit, SearchTarget } from '../../types/search';
export type { SearchTarget } from '../../types/search';

function humanize(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function UniversalSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (target: SearchTarget) => void;
}) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (open) {
      setShowResults(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setInput('');
      setTerm('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const enabled = open && term.length > 0;
  const orders = useQuery({
    queryKey: ['universal-search', 'orders', term],
    enabled,
    retry: false,
    queryFn: ({ signal }) =>
      request<{ items: OrderHit[] }>(`/orders?limit=25&q=${encodeURIComponent(term)}`, {
        signal,
      }),
  });
  const trips = useQuery({
    queryKey: ['universal-search', 'trips'],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: ({ signal }) => request<{ items: TripHit[] }>(`/trips?limit=50`, { signal }),
  });

  if (!open) return null;

  const needle = term.toLowerCase();
  const orderHits = enabled ? (orders.data?.items ?? []) : [];
  const tripHits = enabled
    ? (trips.data?.items ?? []).filter((trip) =>
        [trip.id, trip.vehicle_id, `LDS-${trip.id.slice(0, 4)}`, `trip ${trip.trip_number}`]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : [];
  const loading = enabled && (orders.isFetching || trips.isFetching);
  const total = orderHits.length + tripHits.length;

  const orderRow = (order: OrderHit) => (
    <li key={order.id}>
      <button
        type="button"
        onClick={() => onSelect({ kind: 'order', id: order.id })}
        className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-left hover:bg-surface"
      >
        <ClipboardList size={18} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{order.public_reference}</span>
          <span className="block truncate text-xs text-muted">
            {[order.outlet_name, order.district_name, order.brand_name].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted">{humanize(order.status)}</span>
      </button>
    </li>
  );
  const tripRow = (trip: TripHit) => (
    <li key={trip.id}>
      <button
        type="button"
        onClick={() => onSelect({ kind: 'load', id: trip.id })}
        className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-left hover:bg-surface"
      >
        <Truck size={18} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            LDS-{trip.id.slice(0, 4).toUpperCase()}
          </span>
          <span className="block truncate text-xs text-muted">
            {trip.vehicle_id} · Trip {trip.trip_number}
            {trip.operating_date ? ` · ${trip.operating_date}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted">
          {humanize(trip.manifest_status ?? 'WAITING')}
        </span>
      </button>
    </li>
  );

  const section = (title: string, rows: React.ReactNode[], count: number) =>
    count > 0 && (
      <section className="mt-4">
        <h3 className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {title} ({count})
        </h3>
        <ul className="mt-1">{rows}</ul>
      </section>
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10dvh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={showResults ? 'Search results' : 'Search'}
        className="flex max-h-[80dvh] w-full max-w-2xl flex-col rounded-card border border-border bg-white shadow-2xl"
      >
        <form
          className="flex items-center gap-3 border-b border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim()) {
              setTerm(input.trim());
              setShowResults(true);
            }
          }}
        >
          {showResults ? (
            <button
              type="button"
              aria-label="Back to search"
              onClick={() => setShowResults(false)}
              className="rounded-full p-1.5 text-muted hover:bg-surface"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Search size={20} className="text-muted" />
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search orders, stores, loads…"
            aria-label="Universal search"
            className="min-h-11 flex-1 bg-transparent text-base outline-none"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted hover:bg-surface"
          >
            <X size={20} />
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!term && <p className="p-6 text-center text-sm text-muted">Start typing to search.</p>}
          {term && loading && total === 0 && (
            <p role="status" className="p-6 text-center text-sm text-muted">
              Searching…
            </p>
          )}
          {term && !loading && total === 0 && (
            <p className="p-6 text-center text-sm text-muted">No results for “{term}”.</p>
          )}
          {section(
            'Orders',
            (showResults ? orderHits : orderHits.slice(0, 4)).map(orderRow),
            orderHits.length,
          )}
          {section(
            'Loads',
            (showResults ? tripHits : tripHits.slice(0, 3)).map(tripRow),
            tripHits.length,
          )}
        </div>

        {term && total > 0 && !showResults && (
          <footer className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => setShowResults(true)}
              className="min-h-11 w-full rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
            >
              View all {total} results
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
