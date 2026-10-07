import { useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../data/database.types.ts';
import type { AuthSession } from '../../auth/AuthService.ts';
import { useAuth } from '../../auth/AuthContext.tsx';
import { SupabaseRepository } from '../../data/SupabaseRepository.ts';
import { AppProviders } from './AppProviders.tsx';
import { createQueryClient } from './queryClient.ts';

/**
 * Cloud data for the signed-in user (DESIGN.md §9.3). Keyed by user id, so a
 * different account on the same browser gets a new repository AND a new React
 * Query cache — nothing from the previous session can be shown.
 */
export function UserDataProviders({
  client,
  children,
}: {
  client: SupabaseClient<Database>;
  children: ReactNode;
}) {
  const { state } = useAuth();
  if (state.status !== 'signed_in') return null;
  return (
    <UserScope key={state.session.userId} client={client} session={state.session}>
      {children}
    </UserScope>
  );
}

function UserScope({
  client,
  session,
  children,
}: {
  client: SupabaseClient<Database>;
  session: AuthSession;
  children: ReactNode;
}) {
  const [repository] = useState(() => new SupabaseRepository(client, session));
  const [queryClient] = useState(createQueryClient);
  return (
    <AppProviders repository={repository} queryClient={queryClient}>
      {children}
    </AppProviders>
  );
}
