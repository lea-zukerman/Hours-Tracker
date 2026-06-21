import { he } from '../i18n/he.ts';

export function App() {
  return (
    <main className="app-shell">
      <h1>{he.appTitle || 'מעקב שעות עבודה'}</h1>
    </main>
  );
}
