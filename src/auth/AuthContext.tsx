import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthService, AuthSession } from './AuthService.ts';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'mfa_required'; session: AuthSession }
  | { status: 'signed_in'; session: AuthSession };

interface AuthContextValue {
  state: AuthState;
  service: AuthService;
  /** Re-reads session + assurance level; call after any auth action. */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth state machine (spec §3.2). A user with a verified 2FA factor whose
 * session is still aal1 is `mfa_required` — the database would refuse their
 * data anyway (restrictive RLS policies), so the UI asks for the code first.
 */
export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const session = await service.getSession();
    if (!session) {
      setState({ status: 'signed_out' });
      return;
    }
    const { current, next } = await service.getAssurance();
    setState(
      next === 'aal2' && current !== 'aal2'
        ? { status: 'mfa_required', session }
        : { status: 'signed_in', session },
    );
  }, [service]);

  useEffect(() => {
    // Sync with the external auth store; refresh() sets state only after awaiting it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return service.onSessionChange(() => void refresh());
  }, [service, refresh]);

  const value = useMemo(() => ({ state, service, refresh }), [state, service, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
}
