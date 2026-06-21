import type { DatasetSnapshot } from './Repository.ts';

/**
 * Dataset (de)serialization with a schema version + migration hook
 * (DESIGN.md §5, §3). The stored JSON carries a `schemaVersion`; bumping
 * CURRENT_SCHEMA_VERSION and adding a migration step upgrades older data on
 * load, so persisted snapshots never become unreadable.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/** A parsed-but-not-yet-validated snapshot of unknown vintage. */
type RawSnapshot = Record<string, unknown> & { schemaVersion?: number };

/**
 * Migration steps, indexed by the version they upgrade FROM. Each returns the
 * data shaped for the next version (and stamps the new schemaVersion).
 *
 * The 0 → 1 step is the baseline: it tolerates pre-versioned snapshots by
 * ensuring the collections exist. Future structural changes append a step.
 */
const migrations: Record<number, (raw: RawSnapshot) => RawSnapshot> = {
  0: (raw) => ({
    ...raw,
    user: raw.user ?? null,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    absences: Array.isArray(raw.absences) ? raw.absences : [],
    schemaVersion: 1,
  }),
};

export function serialize(snapshot: DatasetSnapshot): string {
  return JSON.stringify({ ...snapshot, schemaVersion: CURRENT_SCHEMA_VERSION });
}

export function deserialize(json: string): DatasetSnapshot {
  return migrate(JSON.parse(json) as RawSnapshot);
}

/** Upgrade a raw snapshot to the current schema by walking the migration chain. */
export function migrate(raw: RawSnapshot): DatasetSnapshot {
  let data = raw;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) break; // no path forward — stop and stamp current below
    data = step(data);
    version = typeof data.schemaVersion === 'number' ? data.schemaVersion : version + 1;
  }

  return { ...data, schemaVersion: CURRENT_SCHEMA_VERSION } as unknown as DatasetSnapshot;
}
