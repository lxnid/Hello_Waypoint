import { Brand } from './Brand';

export function SessionLoader() {
  return (
    <main className="session-loader" aria-live="polite" aria-busy="true">
      <Brand />
      <span>Checking your session…</span>
    </main>
  );
}
