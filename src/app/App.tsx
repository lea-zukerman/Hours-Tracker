import { he } from '../i18n/he.ts';
import { DevSandbox } from './DevSandbox.tsx';

export function App() {
  return (
    <main className="app-shell">
      <h1>{he.appTitle || 'מעקב שעות עבודה'}</h1>
      {/* TEMPORARY: dev sandbox for manual verification of M1–M2. Remove at M4. */}
      <DevSandbox />
    </main>
  );
}
