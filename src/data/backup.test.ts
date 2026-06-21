import { describe, it, expect, beforeEach } from 'vitest';
import { exportBackup, importBackup, parseBackup } from './backup.ts';
import { LocalStorageRepository } from './LocalStorageRepository.ts';
import { makeUser, makeEntry, makeAbsence } from '../test/fixtures.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

let repo: LocalStorageRepository;
beforeEach(async () => {
  repo = new LocalStorageRepository(memoryStorage());
  await repo.saveUser(makeUser());
  await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18' }));
  await repo.upsertAbsence(makeAbsence({ id: 'a1' }));
});

describe('backup', () => {
  it('export then import yields an identical dataset', async () => {
    const json = await exportBackup(repo);

    const fresh = new LocalStorageRepository(memoryStorage());
    await importBackup(fresh, json);

    expect(await fresh.exportAll()).toEqual(await repo.exportAll());
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBackup('not json{')).toThrow(/not valid JSON/);
  });

  it('rejects a well-formed JSON that is not a valid backup', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow(/missing settings/);
    expect(() => parseBackup('[1,2,3]')).toThrow(/expected an object/);
  });
});
