import { vi } from 'vitest';
import { LocalStorageRepository } from './LocalStorageRepository.ts';
import { migrateLocalToCloud, pendingLocalData } from './migrateLocalToCloud.ts';
import { ACCOUNT_NOT_EMPTY } from './Repository.ts';
import { memoryStorage } from '../test/memoryStorage.ts';
import { makeAbsence, makeEntry } from '../test/fixtures.ts';

async function seeded() {
  const local = new LocalStorageRepository(memoryStorage());
  await local.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-01' }));
  await local.upsertEntry(makeEntry({ id: 'e2', date: '2026-06-02' }));
  await local.upsertAbsence(makeAbsence({ id: 'a1' }));
  return local;
}

describe('pendingLocalData', () => {
  it('reports browser data when the account is empty', async () => {
    const cloud = new LocalStorageRepository(memoryStorage());
    expect(await pendingLocalData(await seeded(), cloud)).toEqual({ entries: 2, absences: 1 });
  });

  it('offers nothing when the browser is empty, dismissed, or the account already has data', async () => {
    const cloud = new LocalStorageRepository(memoryStorage());
    expect(await pendingLocalData(new LocalStorageRepository(memoryStorage()), cloud)).toBeNull();

    const dismissed = await seeded();
    dismissed.dismissMigration();
    expect(await pendingLocalData(dismissed, cloud)).toBeNull();

    await cloud.upsertEntry(makeEntry({ id: 'c1' }));
    expect(await pendingLocalData(await seeded(), cloud)).toBeNull();
  });
});

describe('migrateLocalToCloud', () => {
  it('moves everything, verifies it, then clears the browser copy', async () => {
    const local = await seeded();
    const cloud = new LocalStorageRepository(memoryStorage());
    expect(await migrateLocalToCloud(local, cloud)).toEqual({ entries: 2, absences: 1 });
    expect((await cloud.exportAll()).entries).toHaveLength(2);
    expect((await local.exportAll()).entries).toEqual([]);
  });

  it('never overwrites data that reached the account after the offer was shown', async () => {
    const local = await seeded();
    const cloud = new LocalStorageRepository(memoryStorage());
    expect(await pendingLocalData(local, cloud)).not.toBeNull(); // offer shown
    await cloud.upsertEntry(makeEntry({ id: 'phone', date: '2026-06-20' })); // another device / a clock-in
    await expect(migrateLocalToCloud(local, cloud)).rejects.toThrow(ACCOUNT_NOT_EMPTY);
    expect((await cloud.exportAll()).entries.map((e) => e.id)).toEqual(['phone']);
    expect((await local.exportAll()).entries).toHaveLength(2);
  });

  it('refuses to run when the browser copy is already gone (second tab)', async () => {
    const cloud = new LocalStorageRepository(memoryStorage());
    await cloud.upsertEntry(makeEntry({ id: 'moved', date: '2026-06-01' }));
    const emptyLocal = new LocalStorageRepository(memoryStorage());
    await expect(migrateLocalToCloud(emptyLocal, cloud)).rejects.toThrow('nothing to move');
    expect((await cloud.exportAll()).entries.map((e) => e.id)).toEqual(['moved']);
  });

  it('keeps browser data when the move fails', async () => {
    const local = await seeded();
    const cloud = new LocalStorageRepository(memoryStorage());
    vi.spyOn(cloud, 'importIntoEmpty').mockRejectedValueOnce(
      new Error('Supabase: check violation'),
    );
    await expect(migrateLocalToCloud(local, cloud)).rejects.toThrow('check violation');
    expect((await local.exportAll()).entries).toHaveLength(2);
  });

  it('keeps browser data when the cloud copy does not match', async () => {
    const local = await seeded();
    const cloud = new LocalStorageRepository(memoryStorage());
    vi.spyOn(cloud, 'importIntoEmpty').mockResolvedValueOnce(); // pretends success, stores nothing
    await expect(migrateLocalToCloud(local, cloud)).rejects.toThrow('verification');
    expect((await local.exportAll()).entries).toHaveLength(2);
  });
});
