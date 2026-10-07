import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { LoginPage } from './LoginPage.tsx';
import { MfaChallenge } from './MfaChallenge.tsx';

/** Renders the app only for a fully authenticated session (DESIGN.md §9.1). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <p className="auth-loading">טוען…</p>;
  if (state.status === 'signed_out') return <LoginPage />;
  if (state.status === 'mfa_required') return <MfaChallenge />;
  return <>{children}</>;
}
