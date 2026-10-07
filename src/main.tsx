import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App.tsx';
import { UserDataProviders } from './app/state/UserDataProviders.tsx';
import { supabase } from './data/supabaseClient.ts';
import { SupabaseAuthService } from './auth/SupabaseAuthService.ts';
import { AuthProvider } from './auth/AuthContext.tsx';
import { AuthGate } from './features/auth/AuthGate.tsx';
import './ui/tokens.css';
import './ui/primitives.css';
import './features/dashboard/dashboard.css';
import 'react-day-picker/style.css';
import './features/timeEntry/timeEntry.css';
import './features/timeEntry/calendar.css';
import './features/absences/absences.css';
import './features/alerts/alerts.css';
import './features/reports/reports.css';
import './features/auth/auth.css';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (!supabase) {
  root.render(
    <p className="auth-loading">
      חסרה הגדרת שרת: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
    </p>,
  );
} else {
  const authService = new SupabaseAuthService(supabase.auth);
  root.render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider service={authService}>
          <AuthGate>
            <UserDataProviders client={supabase}>
              <App />
            </UserDataProviders>
          </AuthGate>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
