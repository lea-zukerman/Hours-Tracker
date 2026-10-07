import { act, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../data/database.types.ts';
import { AuthProvider } from '../../auth/AuthContext.tsx';
import { UserDataProviders } from './UserDataProviders.tsx';
import { useRepository } from './RepositoryContext.tsx';
import { FakeAuthService } from '../../test/fakeAuth.ts';
import { FakeSupabase } from '../../test/fakeSupabase.ts';

function SettingsOwner() {
  const repo = useRepository();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => repo.getSettings() });
  return <p>{data ? `owner:${data.userId}` : '…'}</p>;
}

describe('UserDataProviders', () => {
  it('gives each signed-in user a fresh repository and cache', async () => {
    const auth = new FakeAuthService({ signedInAs: 'a@b.co', users: { 'b@b.co': 'Ab1!xyzwvu' } });
    const client = new FakeSupabase() as unknown as SupabaseClient<Database>;
    render(
      <AuthProvider service={auth}>
        <UserDataProviders client={client}>
          <SettingsOwner />
        </UserDataProviders>
      </AuthProvider>,
    );
    expect(await screen.findByText('owner:user-a@b.co')).toBeInTheDocument();

    await act(() => auth.signOut());
    expect(screen.queryByText(/owner:/)).not.toBeInTheDocument();

    await act(async () => {
      await auth.signIn('b@b.co', 'Ab1!xyzwvu');
    });
    expect(await screen.findByText('owner:user-b@b.co')).toBeInTheDocument();
  });

  it('switches data when a different user signs in without signing out first', async () => {
    const auth = new FakeAuthService({ signedInAs: 'a@b.co', users: { 'b@b.co': 'Ab1!xyzwvu' } });
    const client = new FakeSupabase() as unknown as SupabaseClient<Database>;
    render(
      <AuthProvider service={auth}>
        <UserDataProviders client={client}>
          <SettingsOwner />
        </UserDataProviders>
      </AuthProvider>,
    );
    expect(await screen.findByText('owner:user-a@b.co')).toBeInTheDocument();

    await act(async () => {
      await auth.signIn('b@b.co', 'Ab1!xyzwvu');
    });
    expect(await screen.findByText('owner:user-b@b.co')).toBeInTheDocument();
    expect(screen.queryByText('owner:user-a@b.co')).not.toBeInTheDocument();
  });
});
