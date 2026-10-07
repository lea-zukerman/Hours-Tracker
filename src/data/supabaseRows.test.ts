import {
  fromAbsenceRow,
  fromEntryRow,
  fromSettingsRow,
  toAbsenceRow,
  toEntryRow,
  toSettingsRow,
  type AbsenceRow,
  type EntryRow,
  type SettingsRow,
} from './supabaseRows.ts';
import { defaultSettings } from './LocalStorageRepository.ts';
import { makeAbsence, makeEntry, makeShift } from '../test/fixtures.ts';

const UID = 'user-1';
const STAMP = { updated_at: '2026-10-08T00:00:00Z' };

describe('supabase row mappers', () => {
  it('round-trips a time entry and always stamps the session user', () => {
    const entry = makeEntry({
      userId: 'local',
      shifts: [makeShift('2026-06-18T06:00:00.000Z', null)],
      manualMinutes: 30,
      note: 'הערה',
    });
    const row = toEntryRow(entry, UID);
    expect(row.user_id).toBe(UID);
    expect(row).not.toHaveProperty('updated_at');
    expect(fromEntryRow({ ...row, ...STAMP } as EntryRow)).toEqual({ ...entry, userId: UID });
  });

  it('maps null optional columns to absent fields', () => {
    const entry = fromEntryRow({
      id: 'e1',
      user_id: UID,
      date: '2026-06-18',
      shifts: [],
      break_minutes: 0,
      manual_minutes: null,
      note: null,
      ...STAMP,
    });
    expect(entry.manualMinutes).toBeUndefined();
    expect(entry.note).toBeUndefined();
  });

  it('round-trips an absence', () => {
    const absence = makeAbsence({ userId: 'local', partialMinutes: 120, note: 'רופא' });
    const row = toAbsenceRow(absence, UID);
    expect(fromAbsenceRow({ ...row, ...STAMP } as AbsenceRow)).toEqual({ ...absence, userId: UID });
  });

  it('round-trips settings', () => {
    const settings = { ...defaultSettings('local'), jobPercent: 80 };
    const row = toSettingsRow(settings, UID);
    expect(fromSettingsRow({ ...row, ...STAMP } as SettingsRow)).toEqual({
      ...settings,
      userId: UID,
    });
  });
});
