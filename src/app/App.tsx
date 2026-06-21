import { he } from '../i18n/he.ts';
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx';

export function App() {
  return (
    <main className="app-shell">
      <h1>{he.appTitle}</h1>
      <DashboardPage />
    </main>
  );
}
