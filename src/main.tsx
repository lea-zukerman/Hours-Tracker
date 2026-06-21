import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App.tsx';
import { AppProviders } from './app/state/AppProviders.tsx';
import './ui/tokens.css';
import './ui/primitives.css';
import './features/dashboard/dashboard.css';
import './features/timeEntry/timeEntry.css';
import './features/absences/absences.css';
import './features/alerts/alerts.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
