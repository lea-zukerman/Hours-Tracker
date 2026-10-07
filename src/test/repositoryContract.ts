import type { Repository } from '../data/Repository.ts';
import { defaultSettings } from '../data/LocalStorageRepository.ts';
import { makeAbsence, makeEntry, makeShift, makeUser } from './fixtures.ts';

export interface ContractSubject {
  repo: Repository;
  userId: string;
  email: string;
  /** An empty repository for the same user (import target). */
  fresh(): Repository;
}

const JUNE = { from: '2026-06-01', to: '2026-06-30' };

/** Behaviour every Repository implementation must share (DESIGN.md §5, §9.4). */
export function repositoryContract(name: string, make: () => ContractSubject) {
  describe(`${name} — Repository contract`, () => {
    let s: ContractSubject;
    beforeEach(() => {
      s = make();
    });
    const entry = (o: Parameters<typeof makeEntry>[0]) => makeEntry({ userId: s.userId, ...o });
    const absence = (o: Parameters<typeof makeAbsence>[0]) =>
      makeAbsence({ userId: s.userId, ...o });

    it('returns default settings for the user when none are stored', async () => {
      expect(await s.repo.getSettings()).toEqual(defaultSettings(s.userId));
    });

    it('round-trips settings', async () => {
      const settings = { ...defaultSettings(s.userId), jobPercent: 80 };
      await s.repo.saveSettings(settings);
      expect(await s.repo.getSettings()).toEqual(settings);
    });

    it('round-trips the user', async () => {
      const user = makeUser({ id: s.userId, email: s.email, name: 'לאה' });
      await s.repo.saveUser(user);
      expect(await s.repo.getUser()).toEqual(user);
    });

    it('round-trips a new entry (list + getById)', async () => {
      const e = entry({
        id: 'e1',
        date: '2026-06-18',
        shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z')],
      });
      await s.repo.upsertEntry(e);
      expect(await s.repo.listEntries(JUNE)).toEqual([e]);
      expect(await s.repo.getEntry('e1')).toEqual(e);
    });

    it('merges a second clock-in on the same date into one entry', async () => {
      await s.repo.upsertEntry(
        entry({
          id: 'e1',
          date: '2026-06-18',
          shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')],
        }),
      );
      await s.repo.upsertEntry(
        entry({
          id: 'e2',
          date: '2026-06-18',
          shifts: [makeShift('2026-06-18T11:00:00.000Z', null)],
        }),
      );
      const entries = await s.repo.listEntries(JUNE);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('e1');
      expect(entries[0].shifts).toHaveLength(2);
    });

    it('replaces an entry when upserting the same id', async () => {
      await s.repo.upsertEntry(entry({ id: 'e1', breakMinutes: 0 }));
      await s.repo.upsertEntry(entry({ id: 'e1', breakMinutes: 45 }));
      const entries = await s.repo.listEntries(JUNE);
      expect(entries).toHaveLength(1);
      expect(entries[0].breakMinutes).toBe(45);
    });

    it('filters entries by date range', async () => {
      await s.repo.upsertEntry(entry({ id: 'e1', date: '2026-05-30' }));
      await s.repo.upsertEntry(entry({ id: 'e2', date: '2026-06-15' }));
      await s.repo.upsertEntry(entry({ id: 'e3', date: '2026-07-02' }));
      expect((await s.repo.listEntries(JUNE)).map((e) => e.id)).toEqual(['e2']);
    });

    it('deletes an entry', async () => {
      await s.repo.upsertEntry(entry({ id: 'e1' }));
      await s.repo.deleteEntry('e1');
      expect(await s.repo.getEntry('e1')).toBeNull();
    });

    it('lists absences overlapping the range and deletes them', async () => {
      await s.repo.upsertAbsence(
        absence({ id: 'a1', dateFrom: '2026-06-28', dateTo: '2026-07-02' }),
      );
      await s.repo.upsertAbsence(
        absence({ id: 'a2', dateFrom: '2026-08-01', dateTo: '2026-08-01' }),
      );
      expect((await s.repo.listAbsences(JUNE)).map((a) => a.id)).toEqual(['a1']);
      await s.repo.deleteAbsence('a1');
      expect(await s.repo.listAbsences(JUNE)).toEqual([]);
    });

    it('exportAll then importAll into an empty repository restores the dataset', async () => {
      await s.repo.saveSettings({ ...defaultSettings(s.userId), jobPercent: 60 });
      await s.repo.upsertEntry(entry({ id: 'e1', date: '2026-06-18' }));
      await s.repo.upsertAbsence(absence({ id: 'a1' }));
      const snapshot = await s.repo.exportAll();

      const target = s.fresh();
      await target.importAll(snapshot);
      expect(await target.exportAll()).toEqual(snapshot);
    });

    it('importAll replaces existing entries and absences', async () => {
      await s.repo.upsertEntry(entry({ id: 'old', date: '2026-06-01' }));
      const snapshot = {
        ...(await s.repo.exportAll()),
        entries: [entry({ id: 'new', date: '2026-06-02' })],
      };
      await s.repo.importAll(snapshot);
      expect((await s.repo.listEntries(JUNE)).map((e) => e.id)).toEqual(['new']);
    });
  });
}
