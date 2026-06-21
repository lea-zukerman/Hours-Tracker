import type { Absence, ID, IsoDate, Settings, TimeEntry, User } from '../domain/types.ts';
import type { DatasetSnapshot, Repository } from './Repository.ts';
import { CURRENT_SCHEMA_VERSION } from './serialization.ts';

/** Single-user local id — Supabase replaces this with auth.uid() (9.1). */
export const LOCAL_USER_ID = 'local';

/** Product default settings (DESIGN.md §4: 182h, 8:36, Sun–Thu, breaks off). */
export function defaultSettings(userId: ID = LOCAL_USER_ID): Settings {
  return {
    userId,
    monthlyQuotaMinutes: 182 * 60, // 10920
    dailyTargetMinutes: 8 * 60 + 36, // 516
    jobPercent: 100,
    workDays: [0, 1, 2, 3, 4], // Sun–Thu
    autoBreakEnabled: false,
    autoBreakThresholdMinutes: 6 * 60,
    autoBreakDeductMinutes: 30,
    hoursFormat: 'hm',
    alertLeadDays: 5,
    alertsEnabled: {
      end_of_month: true,
      overtime: true,
      logging_reminder: true,
      suspicious_outlier: true,
      cannot_complete: true,
      absence_balance_low: true,
    },
    vacationAccrualPerMonth: 1.5,
    sickAccrualPerMonth: 1.5,
    vacationOpeningBalance: 0,
    sickOpeningBalance: 0,
  };
}

/**
 * Repository backed by namespaced LocalStorage keys (DESIGN.md §5).
 * Collections are read/written whole and filtered by range in memory — the
 * dataset is small (one user). Results are Promise-wrapped to match the async
 * contract that Supabase needs.
 *
 * Cross-tab `storage`-event consistency is handled in 2.4 (out of scope here).
 */
export class LocalStorageRepository implements Repository {
  private readonly keys: {
    user: string;
    settings: string;
    entries: string;
    absences: string;
  };

  constructor(
    private readonly storage: Storage = localStorage,
    namespace = 'ht:v1',
  ) {
    this.keys = {
      user: `${namespace}:user`,
      settings: `${namespace}:settings`,
      entries: `${namespace}:entries`,
      absences: `${namespace}:absences`,
    };
  }

  // ----- low-level JSON helpers -----
  private read<T>(key: string, fallback: T): T {
    const raw = this.storage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    this.storage.setItem(key, JSON.stringify(value));
  }

  // ----- user & settings -----
  getUser(): Promise<User | null> {
    return Promise.resolve(this.read<User | null>(this.keys.user, null));
  }

  saveUser(user: User): Promise<void> {
    this.write(this.keys.user, user);
    return Promise.resolve();
  }

  getSettings(): Promise<Settings> {
    const stored = this.read<Settings | null>(this.keys.settings, null);
    return Promise.resolve(stored ?? defaultSettings());
  }

  saveSettings(settings: Settings): Promise<void> {
    this.write(this.keys.settings, settings);
    return Promise.resolve();
  }

  // ----- time entries -----
  private allEntries(): TimeEntry[] {
    return this.read<TimeEntry[]>(this.keys.entries, []);
  }

  listEntries(range: { from: IsoDate; to: IsoDate }): Promise<TimeEntry[]> {
    const result = this.allEntries().filter((e) => e.date >= range.from && e.date <= range.to);
    return Promise.resolve(result);
  }

  getEntry(id: ID): Promise<TimeEntry | null> {
    return Promise.resolve(this.allEntries().find((e) => e.id === id) ?? null);
  }

  /**
   * Upsert with merge-by-date (DESIGN.md §4 design notes):
   * - same `id` → replace (an edit);
   * - else same `date` → merge the incoming shifts into that day's entry, so a
   *   second clock-in on a day lands in one entry's shifts[] (no duplicate day);
   * - else → append a new entry.
   */
  upsertEntry(entry: TimeEntry): Promise<void> {
    const entries = this.allEntries();

    const byId = entries.findIndex((e) => e.id === entry.id);
    if (byId >= 0) {
      entries[byId] = entry;
    } else {
      const byDate = entries.findIndex((e) => e.date === entry.date);
      if (byDate >= 0) {
        const existing = entries[byDate];
        entries[byDate] = {
          ...existing,
          shifts: [...existing.shifts, ...entry.shifts],
          breakMinutes: existing.breakMinutes + entry.breakMinutes,
          manualMinutes: entry.manualMinutes ?? existing.manualMinutes,
          note: entry.note ?? existing.note,
        };
      } else {
        entries.push(entry);
      }
    }

    this.write(this.keys.entries, entries);
    return Promise.resolve();
  }

  deleteEntry(id: ID): Promise<void> {
    this.write(this.keys.entries, this.allEntries().filter((e) => e.id !== id));
    return Promise.resolve();
  }

  // ----- absences -----
  private allAbsences(): Absence[] {
    return this.read<Absence[]>(this.keys.absences, []);
  }

  listAbsences(range: { from: IsoDate; to: IsoDate }): Promise<Absence[]> {
    // Any absence whose range overlaps [from, to].
    const result = this.allAbsences().filter(
      (a) => a.dateFrom <= range.to && a.dateTo >= range.from,
    );
    return Promise.resolve(result);
  }

  upsertAbsence(absence: Absence): Promise<void> {
    const absences = this.allAbsences();
    const idx = absences.findIndex((a) => a.id === absence.id);
    if (idx >= 0) absences[idx] = absence;
    else absences.push(absence);
    this.write(this.keys.absences, absences);
    return Promise.resolve();
  }

  deleteAbsence(id: ID): Promise<void> {
    this.write(this.keys.absences, this.allAbsences().filter((a) => a.id !== id));
    return Promise.resolve();
  }

  // ----- whole-dataset backup -----
  async exportAll(): Promise<DatasetSnapshot> {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      user: await this.getUser(),
      settings: await this.getSettings(),
      entries: this.allEntries(),
      absences: this.allAbsences(),
    };
  }

  importAll(snapshot: DatasetSnapshot): Promise<void> {
    this.write(this.keys.user, snapshot.user);
    this.write(this.keys.settings, snapshot.settings);
    this.write(this.keys.entries, snapshot.entries);
    this.write(this.keys.absences, snapshot.absences);
    return Promise.resolve();
  }
}
