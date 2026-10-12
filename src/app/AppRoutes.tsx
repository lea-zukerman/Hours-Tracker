import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth/AuthGate.tsx';
import { PrivacyPage } from '../features/legal/PrivacyPage.tsx';
import { TermsPage } from '../features/legal/TermsPage.tsx';
import { AccessibilityPage } from '../features/legal/AccessibilityPage.tsx';

/** Public legal pages first; every other path requires a fully authenticated session. */
export function AppRoutes({ app }: { app: ReactNode }) {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/accessibility" element={<AccessibilityPage />} />
      <Route path="*" element={<AuthGate>{app}</AuthGate>} />
    </Routes>
  );
}
