import type { SupabaseClient } from '@supabase/supabase-js';
import type { Absence, ID, IsoDate, Settings, TimeEntry, User } from '../domain/types.ts';
import type { Database, Json } from './database.types.ts';
import type { DatasetSnapshot, Repository } from './Repository.ts';
import { defaultSettings } from './LocalStorageRepository.ts';
import { mergeIntoDay } from './mergeIntoDay.ts';
import { CURRENT_SCHEMA_VERSION } from './serialization.ts';
import {
  fromAbsenceRow,
  fromEntryRow,
  fromSettingsRow,
  toAbsenceRow,
  toEntryRow,
  toSettingsRow,
} from './supabaseRows.ts';

export interface RepositorySession {
  userId: string;
  email: string;
}

const PAGE_SIZE = 1000;

/** Throws on a Supabase error so React Query surfaces it — never a silent loss. */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  return result.data;
}

/**
 * Repository over Supabase Postgres (DESIGN.md §9.3). Every query is scoped to
 * the session user and RLS enforces the same on the server; incoming `userId`
 * fields are ignored. Two devices editing the same row: last write wins
 * (updated_at is set by a database trigger).
 */
export class SupabaseRepository implements Repository {
  private readonly db: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly email: string;

  constructor(db: SupabaseClient<Database>, session: RepositorySession) {
    this.db = db;
    this.userId = session.userId;
    this.email = session.email;
  }

  // ----- user & settings -----
  async getUser(): Promise<User | null> {
    const row = unwrap(
      await this.db
        .from('profiles')
        .select('name, locale, timezone')
        .eq('user_id', this.userId)
        .maybeSingle(),
    );
    return row
      ? {
          id: this.userId,
          email: this.email,
          name: row.name,
          locale: row.locale,
          timezone: row.timezone,
        }
      : null;
  }

  async saveUser(user: User): Promise<void> {
    unwrap(
      await this.db
        .from('profiles')
        .update({ name: user.name, locale: user.locale, timezone: user.timezone })
        .eq('user_id', this.userId),
    );
  }

  async getSettings(): Promise<Settings> {
    const row = unwrap(
      await this.db.from('settings').select('*').eq('user_id', this.userId).maybeSingle(),
    );
    return row ? fromSettingsRow(row) : defaultSettings(this.userId);
  }

  async saveSettings(settings: Settings): Promise<void> {
    unwrap(
      await this.db
        .from('settings')
        .upsert(toSettingsRow(settings, this.userId), { onConflict: 'user_id' }),
    );
  }

  // ----- time entries -----
  async listEntries({ from, to }: { from: IsoDate; to: IsoDate }): Promise<TimeEntry[]> {
    const rows = unwrap(
      await this.db
        .from('time_entries')
        .select('*')
        .eq('user_id', this.userId)
        .gte('date', from)
        .lte('date', to)
        .order('date'),
    );
    return (rows ?? []).map(fromEntryRow);
  }

  async getEntry(id: ID): Promise<TimeEntry | null> {
    const row = unwrap(await this.entryWhere('id', id));
    return row ? fromEntryRow(row) : null;
  }

  /** Same semantics as LocalStorageRepository: same id → replace; else same date → merge. */
  async upsertEntry(entry: TimeEntry): Promise<void> {
    let toSave = entry;
    if (!(await this.getEntry(entry.id))) {
      const sameDay = unwrap(await this.entryWhere('date', entry.date));
      if (sameDay) toSave = mergeIntoDay(fromEntryRow(sameDay), entry);
    }
    unwrap(
      await this.db
        .from('time_entries')
        .upsert(toEntryRow(toSave, this.userId), { onConflict: 'id' }),
    );
  }

  async deleteEntry(id: ID): Promise<void> {
    unwrap(await this.db.from('time_entries').delete().eq('user_id', this.userId).eq('id', id));
  }

  // ----- absences -----
  async listAbsences({ from, to }: { from: IsoDate; to: IsoDate }): Promise<Absence[]> {
    const rows = unwrap(
      await this.db
        .from('absences')
        .select('*')
        .eq('user_id', this.userId)
        .lte('date_from', to)
        .gte('date_to', from)
        .order('date_from'),
    );
    return (rows ?? []).map(fromAbsenceRow);
  }

  async upsertAbsence(absence: Absence): Promise<void> {
    unwrap(
      await this.db
        .from('absences')
        .upsert(toAbsenceRow(absence, this.userId), { onConflict: 'id' }),
    );
  }

  async deleteAbsence(id: ID): Promise<void> {
    unwrap(await this.db.from('absences').delete().eq('user_id', this.userId).eq('id', id));
  }

  // ----- whole-dataset backup -----
  async exportAll(): Promise<DatasetSnapshot> {
    const [user, settings, entries, absences] = await Promise.all([
      this.getUser(),
      this.getSettings(),
      this.allEntries(),
      this.allAbsences(),
    ]);
    return { schemaVersion: CURRENT_SCHEMA_VERSION, user, settings, entries, absences };
  }

  /** One Postgres function call = one transaction: all replaced, or nothing changes. */
  async importAll(snapshot: DatasetSnapshot): Promise<void> {
    await this.importDataset(snapshot, false);
  }

  /** The emptiness check runs inside the same transaction, under a per-user lock. */
  async importIntoEmpty(snapshot: DatasetSnapshot): Promise<void> {
    await this.importDataset(snapshot, true);
  }

  private async importDataset(snapshot: DatasetSnapshot, requireEmpty: boolean): Promise<void> {
    unwrap(
      await this.db.rpc('import_dataset', {
        p_settings: toSettingsRow(snapshot.settings, this.userId) as unknown as Json,
        p_entries: snapshot.entries.map((e) => toEntryRow(e, this.userId)) as unknown as Json,
        p_absences: snapshot.absences.map((a) => toAbsenceRow(a, this.userId)) as unknown as Json,
        p_name: snapshot.user?.name ?? undefined,
        p_require_empty: requireEmpty,
      }),
    );
  }

  // PostgREST caps every response at the project's max-rows (1000 by default), so
  // whole-dataset reads page until an empty page; ordering by id keeps pages stable.
  private async allEntries(): Promise<TimeEntry[]> {
    const all: TimeEntry[] = [];
    for (;;) {
      const page = unwrap(
        await this.db
          .from('time_entries')
          .select('*')
          .eq('user_id', this.userId)
          .order('date')
          .order('id')
          .range(all.length, all.length + PAGE_SIZE - 1),
      );
      if (!page?.length) return all;
      all.push(...page.map(fromEntryRow));
    }
  }

  private async allAbsences(): Promise<Absence[]> {
    const all: Absence[] = [];
    for (;;) {
      const page = unwrap(
        await this.db
          .from('absences')
          .select('*')
          .eq('user_id', this.userId)
          .order('date_from')
          .order('id')
          .range(all.length, all.length + PAGE_SIZE - 1),
      );
      if (!page?.length) return all;
      all.push(...page.map(fromAbsenceRow));
    }
  }

  private entryWhere(column: 'id' | 'date', value: string) {
    return this.db
      .from('time_entries')
      .select('*')
      .eq('user_id', this.userId)
      .eq(column, value)
      .maybeSingle();
  }
}
