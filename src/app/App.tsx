import { NavLink, Route, Routes } from 'react-router-dom';
import { he } from '../i18n/he.ts';
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx';
import { ReportsPage } from '../features/reports/ReportsPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>{he.appTitle}</h1>
        <nav className="app-nav">
          <NavLink to="/">בית</NavLink>
          <NavLink to="/reports">דוחות</NavLink>
          <NavLink to="/settings">הגדרות</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </main>
  );
}
