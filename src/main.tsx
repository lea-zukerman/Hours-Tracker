import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { AppProviders } from './app/state/AppProviders.tsx';
import './ui/tokens.css';
import './ui/primitives.css';
import './features/dashboard/dashboard.css';
import './features/timeEntry/timeEntry.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
