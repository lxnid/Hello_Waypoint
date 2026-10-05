import { CheckCircle2, Clock3, LoaderCircle, Truck } from 'lucide-react';

export function LoadStatus({
  status,
  manifestStatus,
  draft = false,
}: {
  status: string;
  manifestStatus?: string | null | undefined;
  draft?: boolean;
}) {
  const state = draft
    ? 'Draft'
    : status === 'COMPLETED'
      ? 'Completed'
      : status === 'AWAITING_RETURN'
        ? 'Returning'
        : status === 'DISPATCHED'
          ? 'Dispatched'
          : manifestStatus === 'COMPLETED'
            ? 'Loaded'
            : manifestStatus === 'LOADING'
              ? 'Loading'
              : 'Assigned';
  const Icon =
    state === 'Loading'
      ? LoaderCircle
      : ['Dispatched', 'Returning'].includes(state)
        ? Truck
        : ['Loaded', 'Completed'].includes(state)
          ? CheckCircle2
          : Clock3;
  const color = ['Loaded', 'Completed'].includes(state)
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : state === 'Loading'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : ['Dispatched', 'Returning'].includes(state)
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${color}`}
    >
      <Icon size={15} aria-hidden="true" />
      {state}
    </span>
  );
}
