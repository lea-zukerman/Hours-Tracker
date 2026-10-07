import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { SupabaseRepository } from './SupabaseRepository.ts';
import { FakeSupabase } from '../test/fakeSupabase.ts';
import { repositoryContract } from '../test/repositoryContract.ts';
import { makeEntry } from '../test/fixtures.ts';

const SESSION = { userId: 'user-1', email: 'lea@example.com' };

function newRepo() {
  const fake = new FakeSupabase();
  // The sign-up trigger creates the profile row in the real database.
  fake
    .rows('profiles')
    .push({ user_id: SESSION.userId, name: '', locale: 'he-IL', timezone: 'Asia/Jerusalem' });
  return {
    fake,
    repo: new SupabaseRepository(fake as unknown as SupabaseClient<Database>, SESSION),
  };
}

repositoryContract('SupabaseRepository', () => ({
  repo: newRepo().repo,
  userId: SESSION.userId,
  email: SESSION.email,
  fresh: () => newRepo().repo,
}));

describe('SupabaseRepository specifics', () => {
  it('stores rows under the session user, whatever userId the caller passes', async () => {
    const { fake, repo } = newRepo();
    await repo.upsertEntry(makeEntry({ id: 'e1', userId: 'local' }));
    expect(fake.rows('time_entries')[0].user_id).toBe(SESSION.userId);
    expect((await repo.getEntry('e1'))?.userId).toBe(SESSION.userId);
  });

  it('throws on a Supabase error instead of failing silently', async () => {
    const { fake, repo } = newRepo();
    fake.failNext('connection lost');
    await expect(
      repo.upsertAbsence({
        id: 'a1',
        userId: 'x',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-01',
        type: 'sick',
      }),
    ).rejects.toThrow('Supabase: connection lost');
    fake.failNext('connection lost');
    await expect(repo.listEntries({ from: '2026-06-01', to: '2026-06-30' })).rejects.toThrow(
      'Supabase: connection lost',
    );
  });

  it('exports every row even when the API caps each response (PostgREST max-rows)', async () => {
    const { fake, repo } = newRepo();
    fake.maxRows = 3;
    for (let day = 1; day <= 7; day++) {
      await repo.upsertEntry(makeEntry({ id: `e${day}`, date: `2026-06-0${day}` }));
    }
    const { entries } = await repo.exportAll();
    expect(entries.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
  });

  it('returns the profile with the session email as the user', async () => {
    const { repo } = newRepo();
    expect(await repo.getUser()).toEqual({
      id: SESSION.userId,
      email: SESSION.email,
      name: '',
      locale: 'he-IL',
      timezone: 'Asia/Jerusalem',
    });
  });
});
