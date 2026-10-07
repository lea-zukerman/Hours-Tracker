import type { LocalStorageRepository } from './LocalStorageRepository.ts';
import type { Repository } from './Repository.ts';

export interface LocalDataCounts {
  entries: number;
  absences: number;
}

const counts = (s: { entries: unknown[]; absences: unknown[] }): LocalDataCounts => ({
  entries: s.entries.length,
  absences: s.absences.length,
});

/**
 * Browser data worth offering to move (TASKS T16) — or null. Never offered when
 * the account already holds data: the move replaces the cloud dataset, and we
 * will not overwrite another device's work.
 */
export async function pendingLocalData(
  local: LocalStorageRepository,
  cloud: Repository,
): Promise<LocalDataCounts | null> {
  if (local.isMigrationDismissed()) return null;
  const mine = counts(await local.exportAll());
  if (mine.entries === 0 && mine.absences === 0) return null;
  const theirs = counts(await cloud.exportAll());
  if (theirs.entries > 0 || theirs.absences > 0) return null;
  return mine;
}

/**
 * Copy the browser dataset into the account (one atomic import), check the
 * account now holds the same number of rows, and only then clear the browser
 * copy — on any failure the browser data stays put.
 */
export async function migrateLocalToCloud(
  local: LocalStorageRepository,
  cloud: Repository,
): Promise<LocalDataCounts> {
  const snapshot = await local.exportAll();
  await cloud.importAll(snapshot);
  const moved = counts(snapshot);
  const stored = counts(await cloud.exportAll());
  if (stored.entries !== moved.entries || stored.absences !== moved.absences) {
    throw new Error('Migration verification failed: cloud counts differ');
  }
  local.clear();
  return moved;
}
