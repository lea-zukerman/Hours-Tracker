import type { DatasetSnapshot, Repository } from './Repository.ts';
import { serialize, migrate } from './serialization.ts';

/**
 * Whole-dataset backup as JSON (DESIGN.md §5; SPEC §3.5, §4.2). Essential in
 * the local MVP to survive a browser-storage wipe, and it doubles as the
 * local→cloud migration path (9.4). The backup UI is 7.4 (out of scope here).
 */

/** Export the entire dataset as a JSON string (for file download). */
export async function exportBackup(repo: Repository): Promise<string> {
  return serialize(await repo.exportAll());
}

/** Validate + migrate a JSON backup, then load it into the repository. */
export async function importBackup(repo: Repository, json: string): Promise<void> {
  await repo.importAll(parseBackup(json));
}

/**
 * Parse a backup string into a snapshot: JSON-parse, run schema migrations,
 * then validate the shape. Throws a clear Error on malformed input so the UI
 * (7.4) can reject a bad file instead of corrupting storage.
 */
export function parseBackup(json: string): DatasetSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Invalid backup: not valid JSON');
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid backup: expected an object');
  }

  const snapshot = migrate(raw as Record<string, unknown>);

  // migrate() backfills entries/absences to arrays, but cannot invent settings.
  if (typeof snapshot.settings !== 'object' || snapshot.settings === null) {
    throw new Error('Invalid backup: missing settings');
  }
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.absences)) {
    throw new Error('Invalid backup: missing entries/absences');
  }

  return snapshot;
}
