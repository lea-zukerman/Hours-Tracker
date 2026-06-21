import { describe, it, expect } from 'vitest';
import { serialize, deserialize, migrate, CURRENT_SCHEMA_VERSION } from './serialization.ts';
import type { DatasetSnapshot } from './Repository.ts';
import {
  makeUser,
  makeSettings,
  makeEntry,
  makeShift,
  makeAbsence,
} from '../test/fixtures.ts';

function makeSnapshot(): DatasetSnapshot {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    user: makeUser(),
    settings: makeSettings(),
    entries: [
      makeEntry({
        date: '2026-06-18',
        shifts: [makeShift('2026-06-18T06:00:00.000Z', '2026-06-18T14:00:00.000Z')],
      }),
    ],
    absences: [makeAbsence()],
  };
}

describe('serialization', () => {
  it('round-trips a snapshot to JSON and back unchanged', () => {
    const original = makeSnapshot();
    const restored = deserialize(serialize(original));
    expect(restored).toEqual(original);
  });

  it('migrates an older (pre-versioned) snapshot to the current version', () => {
    // A v0 blob with no schemaVersion and a missing absences collection.
    const old = JSON.stringify({
      user: makeUser(),
      settings: makeSettings(),
      entries: [],
      // no `absences`, no `schemaVersion`
    });

    const restored = deserialize(old);

    expect(restored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(restored.absences).toEqual([]); // backfilled by the 0→1 migration
  });

  it('migrate() leaves a current-version snapshot untouched', () => {
    const current = makeSnapshot();
    expect(migrate({ ...current })).toEqual(current);
  });
});
