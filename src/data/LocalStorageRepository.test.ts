import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageRepository, defaultSettings } from './LocalStorageRepository.ts';
import { makeUser, makeEntry, makeShift, makeAbsence } from '../domain/__tests__/fixtures.ts';

/** Minimal in-memory Storage so each test is fully isolated. */
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
beforeEach(() => {
  repo = new LocalStorageRepository(memoryStorage());
});

describe('LocalStorageRepository — user & settings', () => {
  it('round-trips the user', async () => {
    const user = makeUser({ name: 'לאה' });
    await repo.saveUser(user);
    expect(await repo.getUser()).toEqual(user);
  });

  it('returns default settings when none are stored', async () => {
    expect(await repo.getSettings()).toEqual(defaultSettings());
  });

  it('round-trips saved settings', async () => {
    const settings = defaultSettings();
    settings.jobPercent = 80;
    await repo.saveSettings(settings);
    expect(await repo.getSettings()).toEqual(settings);
  });
});

describe('LocalStorageRepository — entries', () => {
  it('round-trips a new entry (list + getById)', async () => {
    const entry = makeEntry({
      id: 'e1',
      date: '2026-06-18',
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z')],
    });
    await repo.upsertEntry(entry);

    expect(await repo.listEntries({ from: '2026-06-01', to: '2026-06-30' })).toEqual([entry]);
    expect(await repo.getEntry('e1')).toEqual(entry);
  });

  it('merges a second clock-in on the same date into one entry (no duplicate day)', async () => {
    await repo.upsertEntry(
      makeEntry({ id: 'e1', date: '2026-06-18', shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')] }),
    );
    await repo.upsertEntry(
      makeEntry({ id: 'e2', date: '2026-06-18', shifts: [makeShift('2026-06-18T11:00:00.000Z', '2026-06-18T14:00:00.000Z')] }),
    );

    const entries = await repo.listEntries({ from: '2026-06-01', to: '2026-06-30' });
    expect(entries).toHaveLength(1); // one entry for the day
    expect(entries[0].shifts).toHaveLength(2); // both clock-ins
  });

  it('replaces an entry when upserting the same id (edit)', async () => {
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18', breakMinutes: 0 }));
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18', breakMinutes: 45 }));

    const entries = await repo.listEntries({ from: '2026-06-01', to: '2026-06-30' });
    expect(entries).toHaveLength(1);
    expect(entries[0].breakMinutes).toBe(45);
  });

  it('filters entries by date range in memory', async () => {
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-05-30' }));
    await repo.upsertEntry(makeEntry({ id: 'e2', date: '2026-06-15' }));
    await repo.upsertEntry(makeEntry({ id: 'e3', date: '2026-07-02' }));

    const june = await repo.listEntries({ from: '2026-06-01', to: '2026-06-30' });
    expect(june.map((e) => e.id)).toEqual(['e2']);
  });

  it('deletes an entry', async () => {
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18' }));
    await repo.deleteEntry('e1');
    expect(await repo.getEntry('e1')).toBeNull();
  });
});

describe('LocalStorageRepository — absences', () => {
  it('round-trips and range-filters by overlap', async () => {
    await repo.upsertAbsence(makeAbsence({ id: 'a1', dateFrom: '2026-06-28', dateTo: '2026-07-02' }));
    await repo.upsertAbsence(makeAbsence({ id: 'a2', dateFrom: '2026-08-01', dateTo: '2026-08-01' }));

    const june = await repo.listAbsences({ from: '2026-06-01', to: '2026-06-30' });
    expect(june.map((a) => a.id)).toEqual(['a1']); // a1 overlaps June, a2 does not
  });

  it('deletes an absence', async () => {
    await repo.upsertAbsence(makeAbsence({ id: 'a1' }));
    await repo.deleteAbsence('a1');
    expect(await repo.listAbsences({ from: '2026-01-01', to: '2026-12-31' })).toEqual([]);
  });
});

describe('LocalStorageRepository — backup', () => {
  it('exportAll then importAll restores an identical dataset', async () => {
    await repo.saveUser(makeUser());
    await repo.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-18' }));
    await repo.upsertAbsence(makeAbsence({ id: 'a1' }));

    const snapshot = await repo.exportAll();

    const fresh = new LocalStorageRepository(memoryStorage());
    await fresh.importAll(snapshot);

    expect(await fresh.exportAll()).toEqual(snapshot);
  });
});
