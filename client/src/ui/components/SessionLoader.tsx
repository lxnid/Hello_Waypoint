import { Brand } from './Brand';

export function SessionLoader() {
  return (
    <main
      className="grid place-content-center justify-items-center gap-[18px] min-h-[100dvh] text-muted bg-surface text-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <Brand />
      <span>Checking your session…</span>
    </main>
  );
}
