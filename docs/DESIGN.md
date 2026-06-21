# Technical Design Document
## Employee Hours Tracker Web Application

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 18/06/2026 |
| **Status** | Draft for implementation |
| **Companion** | [SPEC.md](SPEC.md) v1.1 |

> This document translates the approved product requirements in [SPEC.md](SPEC.md) into a concrete technical design: architecture, layers, data model, the calculation API, the storage contract, the React component tree, and the planned Supabase sync. It is the blueprint developers implement against.

---

## 1. Design Principles

1. **Local-first, sync-ready.** Ship a fully working MVP backed by the browser, then add a server with no rewrite. Every storage call goes through one interface (§5).
2. **Pure domain core.** All calculation rules ([SPEC.md §3.0](SPEC.md)) live as side-effect-free functions, fully unit-tested, independent of React and of storage ([SPEC.md §4.1](SPEC.md)).
3. **Minutes are the unit of truth.** All internal math is in **integer minutes**; hours:minutes / decimal is a *display* concern only ([SPEC.md §3.0](SPEC.md)).
4. **Time is computed in absolute terms.** Durations are derived from UTC instants via Luxon to survive DST and time-zone changes ([SPEC.md §6.1](SPEC.md)).
5. **The UI never touches storage or does math.** Components call hooks → hooks call the domain + repository. This keeps the swap to Supabase isolated to one layer.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | **TypeScript** (strict) | Type-safe domain model; shared types client/server later |
| UI library | **React 18** | Per [SPEC.md §4.1](SPEC.md) |
| Build / dev server | **Vite** | Fast, simple for an SPA; no SSR needed (data is client-local) |
| Routing | **React Router** | A handful of client routes (dashboard, reports, settings) |
| Time / DST | **Luxon** | Mandatory per [SPEC.md §4.1](SPEC.md); robust zones + DST |
| State (server/async) | **React Query** (TanStack) | Caches repository reads; same API for Local & Supabase |
| State (UI-local) | React state / context | Running-clock ticker, modals, form state |
| Testing | **Vitest** + **Testing Library** | Unit tests for domain (required) + component tests |
| Formatting / lint | ESLint + Prettier | Consistency |
| Backend (sync phase) | **Supabase** | Managed Postgres + auth + sync (§9) |

**Why React Query matters here:** it gives us one consistent data-fetching layer. In the MVP it wraps synchronous LocalStorage reads; in the sync phase the *same* query keys wrap async Supabase calls. Components don't change.

---

## 3. Project Structure

```
src/
  domain/                 # Pure functions + types. No React, no storage.
    types.ts              # Core model types (§4)
    time.ts               # Duration math, midnight-crossing, DST (§6 SPEC)
    calculations.ts       # net_day, worked, credited, balance, forecast (§3.0 SPEC)
    absences.ts           # Accrual balance math (§3.6 SPEC)
    alerts.ts             # Pure alert derivation (§3.4 SPEC)
    validation.ts         # Entry validation rules (§3.2C, §6 SPEC)
    __tests__/            # Vitest specs — one per rule + edge case

  data/                   # Storage layer behind one interface (§5)
    Repository.ts         # The interface (the fixed boundary)
    LocalStorageRepository.ts
    SupabaseRepository.ts # Added in the sync phase
    serialization.ts      # JSON (de)serialize, schema version + migrations
    backup.ts             # Export / import all data (§3.5, §4.2 SPEC)

  app/
    hooks/                # useTimeEntries, useSettings, useMonthSummary, useClock
    state/                # React Query client, app context
    routes.tsx

  features/
    dashboard/            # Today, This Month, Absences cards, Alerts banner (§3.1)
    timeEntry/            # Live clock + manual entry forms (§3.2)
    absences/             # Report absence (§3.6)
    reports/              # Month table, history, CSV export (§3.5)
    settings/             # Profile & quota settings (§3.3)
    alerts/               # Alert derivation + banner (§3.4)

  ui/                     # Reusable presentational components (Card, Ring, Button…)
  i18n/                   # Hebrew strings; structure ready for more (§4.3 SPEC)
  main.tsx
```

---

## 4. Data Model (TypeScript)

This is the canonical data model for the project — moved here from the PRD per the SDD method (the data model is a design concern, not a product requirement). All durations are **integer minutes**. Dates that represent a *calendar day* are ISO `YYYY-MM-DD` strings (no time); instants are ISO 8601 UTC strings.

```ts
// ----- Identifiers -----
type ID = string;            // uuid
type IsoDate = string;       // 'YYYY-MM-DD'  (a calendar day, zone-independent)
type IsoInstant = string;    // ISO 8601 with offset, e.g. '2026-06-18T07:00:00.000Z'
type Minutes = number;       // integer

// ----- User & Settings -----
interface User {
  id: ID;
  name: string;
  email: string;
  locale: string;            // 'he-IL'
  timezone: string;          // IANA, e.g. 'Asia/Jerusalem'
}

interface Settings {
  userId: ID;
  monthlyQuotaMinutes: Minutes;       // default 182*60 = 10920
  dailyTargetMinutes: Minutes;        // default 8h36 = 516
  jobPercent: number;                 // 1..100; scales quota & target
  workDays: Weekday[];                // default [Sun..Thu]
  autoBreakEnabled: boolean;          // default false
  autoBreakThresholdMinutes: Minutes; // presence over which a break is deducted
  autoBreakDeductMinutes: Minutes;    // amount deducted
  hoursFormat: 'hm' | 'decimal';
  alertLeadDays: number;              // default 5 (end-of-month alert)
  alertsEnabled: Record<AlertType, boolean>;
  vacationAccrualPerMonth: number;    // days
  sickAccrualPerMonth: number;        // days
  vacationOpeningBalance: number;     // days
  sickOpeningBalance: number;         // days
}

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

// ----- Time entries -----
interface Shift {
  start: IsoInstant;
  end: IsoInstant | null;   // null while a live clock is running
}

interface TimeEntry {
  id: ID;
  userId: ID;
  date: IsoDate;            // the day this entry belongs to (start's local day)
  shifts: Shift[];          // supports multiple shifts/day (§3.2B)
  breakMinutes: Minutes;    // manual + auto-deducted breaks
  manualMinutes?: Minutes;  // total-hours-only entry (no exact times) (§3.2B)
  note?: string;
}

// ----- Absences -----
type AbsenceType = 'vacation' | 'sick' | 'holiday' | 'reserve' | 'unpaid';

interface Absence {
  id: ID;
  userId: ID;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  type: AbsenceType;
  partialMinutes?: Minutes; // set => partial day; absent => full day (§3.6, §6.2.10)
  note?: string;
}

// ----- Computed (never stored) -----
type MonthStatus = 'surplus' | 'deficit' | 'on_track' | 'cannot_complete';

interface MonthSummary {
  userId: ID;
  month: string;                  // 'YYYY-MM'
  workedMinutes: Minutes;
  creditedMinutes: Minutes;       // worked + paid absences
  quotaMinutes: Minutes;
  balanceMinutes: Minutes;        // credited - quota (negative = deficit)
  remainingWorkdays: number;
  hoursToCompleteMinutes: Minutes;
  requiredPerDayMinutes: Minutes | null; // null when no workdays remain
  status: MonthStatus;
}

type AlertType =
  | 'end_of_month' | 'overtime' | 'logging_reminder'
  | 'suspicious_outlier' | 'cannot_complete' | 'absence_balance_low';
```

**Design notes**
- **One `TimeEntry` per (userId, date), with multiple clock-ins held in `shifts[]`.** A day can have any number of clock-in/clock-out pairs ([SPEC.md §3.2B](SPEC.md)) — each is a `Shift` appended to the same day's entry, not a second entry. This delivers "multiple entries per day" while making "same day twice" ([SPEC.md §6.3.19](SPEC.md)) structurally impossible: `upsertEntry` merges shifts into the existing day rather than creating a duplicate. (In Supabase, enforced by a unique constraint on `(user_id, date)`.)
- `Shift.end: null` is the single source of truth for "clock is running" — no separate boolean to drift out of sync.
- `MonthSummary` is **always derived**, never persisted, so retroactive edits can't leave a stale summary ([SPEC.md §6.3.16](SPEC.md)).
- `partialMinutes` on `Absence` unifies full and half days and is what prevents double-counting in [SPEC.md §6.2.13](SPEC.md).

---

## 5. The Repository Interface — the fixed boundary

This is the contract that makes local-first → Supabase a one-layer swap. Both implementations satisfy it; the domain and UI know only this interface.

```ts
interface Repository {
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

  // Whole-dataset backup (§3.5, §4.2 SPEC)
  exportAll(): Promise<DatasetSnapshot>;
  importAll(snapshot: DatasetSnapshot): Promise<void>;
}

interface DatasetSnapshot {
  schemaVersion: number;
  user: User | null;
  settings: Settings;
  entries: TimeEntry[];
  absences: Absence[];
}
```

**Why every method is `async` even in the MVP:** LocalStorage is synchronous, but Supabase is not. Returning `Promise` from day one means the sync-phase swap changes *zero* call sites. `LocalStorageRepository` simply wraps results in `Promise.resolve`.

**`LocalStorageRepository`**
- Stores under namespaced keys, e.g. `ht:v1:settings`, `ht:v1:entries`, `ht:v1:absences`.
- Reads/writes whole collections, filtering by range in memory (dataset is small — one user).
- Listens to the `storage` event to keep two open tabs consistent ([SPEC.md §6.5.27](SPEC.md)).
- `serialization.ts` stamps a `schemaVersion`; bumping it runs a migration on load.

---

## 6. Domain Layer — calculation API

Pure functions implementing [SPEC.md §3.0](SPEC.md) and the §6 edge cases. Signatures (bodies covered by tests):

```ts
// time.ts
function netShiftMinutes(shift: Shift, zone: string): Minutes;      // handles midnight cross + DST (§6.1.1, §6.1.2)
function autoBreakMinutes(presenceMinutes: Minutes, settings: Settings): Minutes; // 0 when disabled; deducts if presence > threshold (§3.2B)
function entryWorkedMinutes(entry: TimeEntry, settings: Settings, zone: string): Minutes; // sum shifts - breaks - autoBreak, or manualMinutes

// calculations.ts
function workedMonthMinutes(entries: TimeEntry[], zone: string): Minutes;
function paidAbsenceMinutes(absences: Absence[], settings: Settings, month: string): Minutes;
function creditedMinutes(worked: Minutes, paidAbsence: Minutes): Minutes;
function balanceMinutes(credited: Minutes, quota: Minutes): Minutes;
function remainingWorkdays(today: IsoDate, month: string, settings: Settings, absences: Absence[]): number;
function missingWorkdays(today: IsoDate, month: string, settings: Settings, entries: TimeEntry[], absences: Absence[]): IsoDate[]; // past work days (Sun–Thu) with no entry and no absence → "missing" (§6.3.14)
function requiredPerDay(balance: Minutes, remainingWorkdays: number): Minutes | null; // null if 0 days (§6.4.21)
function effectiveQuota(settings: Settings, month: string): Minutes;  // job % + mid-month pro-rata (§6.4.23)
function buildMonthSummary(input: MonthInput): MonthSummary;          // orchestrates the above

// absences.ts
function absenceBalance(opening: number, accrualPerMonth: number, monthsElapsed: number, used: number): number; // (§3.6)

// alerts.ts
interface ActiveAlert { type: AlertType; params: Record<string, number | string>; }
function deriveAlerts(summary: MonthSummary, settings: Settings, entries: TimeEntry[], today: IsoDate): ActiveAlert[];
// covers all 5 alert types in §3.4: end_of_month, overtime, logging_reminder (§6.3.14), suspicious_outlier (>12h), cannot_complete, absence_balance_low

// validation.ts
function validateEntry(entry: TimeEntry, zone: string): ValidationResult; // §3.2C, §6.1.3-7, §6.3.15,18
```

**Edge-case ownership** — each [SPEC.md §6](SPEC.md) case maps to a function + a named test:
- Midnight crossing / DST → `netShiftMinutes` (compute from UTC instants, never wall-clock subtraction).
- Quota = 0 → `requiredPerDay` / `buildMonthSummary` guard against divide-by-zero (§6.4.20).
- Pro-rata mid-month quota change → `effectiveQuota` (§6.4.23).
- Sick/vacation beyond balance → still credited, `absenceBalance` goes negative + flag (§6.4.25).

---

## 7. State & Data Flow

```
Component  ──calls──►  Hook (React Query)  ──reads/writes──►  Repository
    ▲                       │                                     │
    └──────renders──────────┘                                     ▼
                         Domain (pure)  ◄──summary derived──  raw entries/absences
```

- **Reads:** `useMonthSummary(month)` → React Query fetches entries+absences for the month via the repository, then runs `buildMonthSummary` (pure) and returns the result. Query key: `['summary', month]`.
- **Writes:** `upsertEntry` → on success, invalidate `['summary', month]` and `['entries', month]`. The dashboard recomputes instantly — satisfying the "immediate recalculation" requirements ([SPEC.md §3.4, §6.3.17](SPEC.md)).
- **Live clock:** `useClock` keeps a 1-second ticker in UI-local state for the running display only; it does **not** write to storage every tick. A `TimeEntry` is persisted on Start (open shift, `end: null`) and finalized on Stop ([SPEC.md §3.2A](SPEC.md)). Midnight while running → `useClock` splits/flags per §6.1.1.

---

## 8. UI / Component Tree

```
<App>
 ├─ <DashboardPage>                         (§3.1)
 │   ├─ <AlertsBanner>                       (§3.4) ← renders deriveAlerts() output; no logic in the component
 │   ├─ <TodayCard>  ── <ProgressRing> <ClockButton>
 │   ├─ <MonthCard>  ── <ProgressBar> <BalanceBadge> <Forecast>
 │   └─ <AbsencesSummaryCard>
 ├─ <TimeEntryModal>  (live clock controls + manual form, multi-shift)  (§3.2)
 ├─ <ReportAbsenceModal>                     (§3.6)
 ├─ <ReportsPage>  ── <MonthTable> <MonthNavigator> <ExportCsvButton>   (§3.5)
 └─ <SettingsPage>  ── quota / breaks / absences / display / data mgmt  (§3.3)
```

- RTL + Hebrew throughout; `dir="rtl"`, DD/MM/YYYY, 24h ([SPEC.md §4.3](SPEC.md)).
- Empty state on first load (no data) → "Start logging" CTA ([SPEC.md §3.1](SPEC.md)).
- All user-facing strings come from `i18n/` (Hebrew now, structure ready for more).

### 8.1 Responsiveness & Accessibility ([SPEC.md §4.3](SPEC.md))
- **Responsive:** desktop-primary, single fluid layout. Cards stack to one column below a ~640px breakpoint; usable down to **320px** (no horizontal scroll, tap targets ≥ 44px).
- **Keyboard:** every action (Start/Stop, add shift, report absence, export) reachable and operable by keyboard; visible focus ring; logical tab order.
- **ARIA & contrast:** semantic landmarks, `aria-label`s on icon-only buttons (e.g. the clock toggle), `role="alert"` on the alerts banner so screen readers announce it; standard contrast ratios.

---

## 9. Sync Phase Appendix — Supabase (planned)

What changes when we move from local to server. **Nothing above this section changes except adding one file** (`SupabaseRepository.ts`) and wiring auth.

### 9.1 Authentication
- Supabase Auth (email + password, magic link optional).
- An `<AuthGate>` wraps the app: unauthenticated → login screen; authenticated → the existing app, now backed by `SupabaseRepository`.
- `userId` everywhere becomes the Supabase `auth.uid()`.

### 9.2 Database schema (Postgres)
```sql
-- Row-Level Security ON for every table; policy: user_id = auth.uid()
create table settings (
  user_id uuid primary key references auth.users,
  monthly_quota_minutes int, daily_target_minutes int, job_percent int,
  work_days int[], auto_break_enabled bool, auto_break_threshold_minutes int,
  auto_break_deduct_minutes int, hours_format text, alert_lead_days int,
  alerts_enabled jsonb, vacation_accrual_per_month numeric,
  sick_accrual_per_month numeric, vacation_opening_balance numeric,
  sick_opening_balance numeric
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  date date not null,
  shifts jsonb not null,            -- [{start, end}]
  break_minutes int not null default 0,
  manual_minutes int,
  note text,
  updated_at timestamptz not null default now(),
  unique (user_id, date)            -- one entry per day; shifts[] holds multiple clock-ins (§6.3.19)
);
create index on time_entries (user_id, date);

create table absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  date_from date not null, date_to date not null,
  type text not null, partial_minutes int, note text,
  updated_at timestamptz not null default now()
);
create index on absences (user_id, date_from);
```

### 9.3 Sync & conflict policy
- **Cross-device:** `SupabaseRepository` reads/writes these tables; RLS guarantees a user sees only their own rows. Same data on every device after login.
- **Conflicts:** `updated_at` enables last-write-wins for the MVP of sync; a later iteration can add field-level merge if needed.
- **Migration from local → cloud:** on first login, offer "import your local data" → calls `exportAll()` on the local repo and `importAll()` on the Supabase repo. The backup mechanism (§5) doubles as the migration path.

### 9.4 What stays identical
The `Repository` interface, every domain function, every hook query key, and the entire component tree. That is the whole point of the boundary in §5.

---

## 10. Testing Strategy

| Layer | What | Tool |
|-------|------|------|
| Domain | Every rule in §6 + every edge case in [SPEC.md §6](SPEC.md), one named test each | Vitest |
| Domain | Property/table tests for time math across DST boundaries | Vitest |
| Data | `LocalStorageRepository` round-trips, schema migration, two-tab `storage` event | Vitest + jsdom |
| Hooks | `useMonthSummary` recompute on write/delete (immediate recalculation) | Testing Library |
| Component | Dashboard renders deficit/surplus/empty states; RTL | Testing Library |

**Definition of Done alignment** — the test suite is the executable form of [SPEC.md §7](SPEC.md): 100% of calculation rules and edge cases covered.

---

## 11. Build Order (suggested)

1. `domain/types.ts` + `time.ts` + `calculations.ts` + tests → the trustworthy core.
2. `Repository` interface + `LocalStorageRepository` + serialization/backup.
3. Hooks + React Query wiring.
4. Dashboard (Today + This Month) → first visible, useful screen.
5. Time entry (clock + manual + multi-shift) and validation.
6. Absences + accrual balance.
7. Reports + CSV export + JSON backup.
8. Settings + alerts.
9. **Sync phase:** `<AuthGate>` + `SupabaseRepository` + local→cloud import.
