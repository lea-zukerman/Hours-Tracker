import { mergeIntoDay } from './mergeIntoDay.ts';
import { makeEntry, makeShift } from '../test/fixtures.ts';

describe('mergeIntoDay', () => {
  it('keeps the existing id and appends shifts and breaks', () => {
    const existing = makeEntry({
      id: 'e1',
      shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T10:00:00.000Z')],
      breakMinutes: 10,
    });
    const incoming = makeEntry({
      id: 'e2',
      shifts: [makeShift('2026-06-18T11:00:00.000Z', null)],
      breakMinutes: 5,
    });
    const merged = mergeIntoDay(existing, incoming);
    expect(merged.id).toBe('e1');
    expect(merged.shifts).toHaveLength(2);
    expect(merged.breakMinutes).toBe(15);
  });

  it('prefers the incoming manual minutes and note when present', () => {
    const merged = mergeIntoDay(
      makeEntry({ manualMinutes: 60, note: 'old' }),
      makeEntry({ manualMinutes: 90, note: 'new' }),
    );
    expect(merged.manualMinutes).toBe(90);
    expect(merged.note).toBe('new');
    expect(mergeIntoDay(makeEntry({ note: 'old' }), makeEntry()).note).toBe('old');
  });
});
