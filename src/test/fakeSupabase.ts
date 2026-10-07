/**
 * In-memory stand-in for the slice of supabase-js that SupabaseRepository uses:
 * from(t).select/upsert/update/delete with eq/gte/lte/order/maybeSingle, and
 * rpc('import_dataset'). Not a database: RLS and constraints are proven by the
 * SQL tests in supabase/tests/; this proves the repository's query logic.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };
type Op =
  | { kind: 'select' }
  | { kind: 'upsert'; row: Row; onConflict: string }
  | { kind: 'update'; patch: Row }
  | { kind: 'delete' };

const OK: Result = { data: null, error: null };

class FakeQuery implements PromiseLike<Result> {
  private readonly filters: Array<(row: Row) => boolean> = [];
  private single = false;
  private orderColumn: string | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
    private readonly op: Op,
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  lte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) <= value);
    return this;
  }
  order(column: string) {
    this.orderColumn = column;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private run(): Result {
    const failure = this.db.takeFailure();
    if (failure) return { data: null, error: { message: failure } };
    const rows = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    const op = this.op;
    switch (op.kind) {
      case 'select': {
        const out = rows.filter(match).map((r) => ({ ...r }));
        const col = this.orderColumn;
        if (col) out.sort((a, b) => String(a[col]).localeCompare(String(b[col])));
        if (!this.single) return { data: out, error: null };
        if (out.length > 1) return { data: null, error: { message: 'multiple rows returned' } };
        return { data: out[0] ?? null, error: null };
      }
      case 'upsert': {
        const i = rows.findIndex((r) => r[op.onConflict] === op.row[op.onConflict]);
        if (i >= 0) rows[i] = { ...rows[i], ...op.row };
        else rows.push({ ...op.row });
        return OK;
      }
      case 'update':
        for (const r of rows) if (match(r)) Object.assign(r, op.patch);
        return OK;
      case 'delete':
        this.db.setRows(
          this.table,
          rows.filter((r) => !match(r)),
        );
        return OK;
    }
  }
}

export class FakeSupabase {
  private readonly tables = new Map<string, Row[]>();
  private readonly failures: string[] = [];

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  setRows(table: string, rows: Row[]) {
    this.tables.set(table, rows);
  }

  /** The next query or rpc resolves with `{ error: { message } }`. */
  failNext(message: string) {
    this.failures.push(message);
  }

  takeFailure(): string | undefined {
    return this.failures.shift();
  }

  from(table: string) {
    return {
      select: (_columns?: string) => new FakeQuery(this, table, { kind: 'select' }),
      upsert: (row: Row, options: { onConflict: string }) =>
        new FakeQuery(this, table, { kind: 'upsert', row, onConflict: options.onConflict }),
      update: (patch: Row) => new FakeQuery(this, table, { kind: 'update', patch }),
      delete: () => new FakeQuery(this, table, { kind: 'delete' }),
    };
  }

  /** Mirrors public.import_dataset(): replace the caller's whole dataset. */
  async rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    const failure = this.takeFailure();
    if (failure) return { data: null, error: { message: failure } };
    if (fn !== 'import_dataset') return { data: null, error: { message: `unknown rpc ${fn}` } };
    const settings = args.p_settings as Row;
    const uid = settings.user_id;
    const replace = (table: string, incoming: Row[]) =>
      this.setRows(table, [
        ...this.rows(table).filter((r) => r.user_id !== uid),
        ...incoming.map((r) => ({ ...r })),
      ]);
    replace('time_entries', args.p_entries as Row[]);
    replace('absences', args.p_absences as Row[]);
    replace('settings', [settings]);
    if (typeof args.p_name === 'string') {
      for (const p of this.rows('profiles')) if (p.user_id === uid) p.name = args.p_name;
    }
    return OK;
  }
}
