import type { Absence, ID, IsoDate, Settings, TimeEntry, User } from '../domain/types.ts';

/**
 * The storage contract — the fixed boundary that makes local-first → Supabase
 * a one-layer swap (DESIGN.md §5). The domain and UI know only this interface;
 * both LocalStorageRepository (2.3) and SupabaseRepository (9.3) satisfy it.
 *
 * Every method is async (returns a Promise) even in the MVP: LocalStorage is
 * synchronous but Supabase is not, so returning Promises from day one means
 * the sync-phase swap changes zero call sites.
 */
export interface Repository {
  // Settings & user
  getUser(): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  // Time entries
  listEntries(range: { from: IsoDate; to: IsoDate }): Promise<TimeEntry[]>;
  getEntry(id: ID): Promise<TimeEntry | null>;
  upsertEntry(entry: TimeEntry): Promise<void>;
  deleteEntry(id: ID): Promise<void>;

  // Absences
  listAbsences(range: { from: IsoDate; to: IsoDate }): Promise<Absence[]>;
  upsertAbsence(absence: Absence): Promise<void>;
  deleteAbsence(id: ID): Promise<void>;

  // Whole-dataset backup (DESIGN.md §5; SPEC §3.5, §4.2)
  exportAll(): Promise<DatasetSnapshot>;
  importAll(snapshot: DatasetSnapshot): Promise<void>;
  /**
   * Like importAll, but only into an account with no entries and no absences —
   * checked atomically with the write. Rejects with ACCOUNT_NOT_EMPTY otherwise.
   * Used by the browser → account move, which must never overwrite cloud data.
   */
  importIntoEmpty(snapshot: DatasetSnapshot): Promise<void>;
}

/** Error message (substring) for importIntoEmpty on an account that has data. */
export const ACCOUNT_NOT_EMPTY = 'account already has data';

/** A full point-in-time snapshot of the dataset, used for backup/restore. */
export interface DatasetSnapshot {
  schemaVersion: number;
  user: User | null;
  settings: Settings;
  entries: TimeEntry[];
  absences: Absence[];
}
