# Implementation Tasks
## Employee Hours Tracker Web Application

| | |
|---|---|
| **Version** | 2.2 |
| **Date** | 18/06/2026 |
| **Companion docs** | [SPEC.md](SPEC.md) v1.1 · [DESIGN.md](DESIGN.md) v1.0 |

> Executable breakdown of [DESIGN.md](DESIGN.md). Work top-to-bottom. Each **domain** task carries the full 7-field block; **UI / setup** tasks use a shortened block (no In/Out — a component has no single return value).

**Task fields:** `Goal` what it achieves · `Design` the technical contract it implements (DESIGN) · `In`/`Out` input & output types · `Edge` edge cases & errors to cover · `DoD` acceptance criterion · `Deps` prerequisites · `Out of scope` what NOT to do here.

> **Traceability:** each task links to its **DESIGN** section (its direct parent). The product requirement is reached transitively — DESIGN already links to the relevant SPEC section. SPEC → DESIGN → TASK.

---

## Milestone 0 — Project Setup  *(shortened blocks)*

- [ ] **0.1 Scaffold the project**
  - **Goal:** Vite + React + TypeScript app skeleton
  - **Design:** [DESIGN.md §2](DESIGN.md)
  - **DoD:** `npm run dev` serves a blank app; `tsconfig` has `"strict": true`
  - **Deps:** —
  - **Out of scope:** any feature code, styling
- [ ] **0.2 Install core dependencies**
  - **Goal:** add `react-router-dom`, `luxon` (+types), `@tanstack/react-query`
  - **Design:** [DESIGN.md §2](DESIGN.md)
  - **DoD:** all imports resolve; app builds
  - **Deps:** 0.1
  - **Out of scope:** Supabase client (Milestone 9)
- [ ] **0.3 Set up tooling**
  - **Goal:** ESLint + Prettier; Vitest + Testing Library + jsdom
  - **Design:** [DESIGN.md §2, §10](DESIGN.md)
  - **DoD:** `npm run test` runs (0 tests OK); `npm run lint` passes
  - **Deps:** 0.1
  - **Out of scope:** CI pipeline
- [ ] **0.4 Folder skeleton**
  - **Goal:** create `domain/ data/ app/ features/ ui/ i18n/`
  - **Design:** [DESIGN.md §3](DESIGN.md)
  - **DoD:** structure exists; `i18n/he.ts` exports an empty strings object
  - **Deps:** 0.1
  - **Out of scope:** filling the folders
- [ ] **0.5 RTL + Hebrew shell**
  - **Goal:** `dir="rtl"`, `lang="he"`; base 24h / DD-MM-YYYY format helpers
  - **Design:** [DESIGN.md §8.1](DESIGN.md)
  - **DoD:** app renders RTL
  - **Deps:** 0.1
  - **Out of scope:** full i18n of all strings

---

## Milestone 1 — Domain Core  *(full 7-field blocks)*

> Pure functions only. No React, no storage. Every task ships with its tests. · **Design:** [DESIGN.md §6](DESIGN.md)

- [ ] **1.1 Core types**
  - **Goal:** implement `domain/types.ts` (the data model)
  - **Design:** [DESIGN.md §4](DESIGN.md)
  - **In:** —
  - **Out:** exported TS types (User, Settings, Shift, TimeEntry, Absence, MonthSummary, AlertType…)
  - **Edge:** `Shift.end: null` (running clock); optional `manualMinutes`, `partialMinutes`
  - **DoD:** compiles under strict; mirrors [DESIGN.md §4](DESIGN.md)
  - **Deps:** —
  - **Out of scope:** any logic — types only

- [ ] **1.2 `netShiftMinutes`**
  - **Goal:** duration of one shift, computed from UTC instants via Luxon
  - **Design:** [DESIGN.md §6 (time.ts)](DESIGN.md)
  - **In:** `(shift: Shift, zone: string)`
  - **Out:** `Minutes`
  - **Edge:** midnight crossing; DST 23h/25h day; out = in → 0; open shift (`end: null`); **different time zone / travel** — same UTC instants yield the same duration (§6.1.6)
  - **DoD:** named tests pass for every edge above
  - **Deps:** 1.1
  - **Out of scope:** breaks, auto-break, multi-shift summation

- [ ] **1.3 `autoBreakMinutes`**
  - **Goal:** compute auto-deducted break for a day's presence
  - **Design:** [DESIGN.md §6 (time.ts)](DESIGN.md)
  - **In:** `(presenceMinutes: Minutes, settings: Settings)`
  - **Out:** `Minutes` (0 when disabled)
  - **Edge:** disabled; presence under threshold; presence over threshold
  - **DoD:** 3 tests pass
  - **Deps:** 1.1
  - **Out of scope:** manual breaks (already on the entry)

- [ ] **1.4 `entryWorkedMinutes`**
  - **Goal:** net worked minutes for one day's entry
  - **Design:** [DESIGN.md §6 (time.ts)](DESIGN.md)
  - **In:** `(entry: TimeEntry, settings: Settings, zone: string)`
  - **Out:** `Minutes`
  - **Edge:** single shift; multiple shifts; manual-only entry; break + auto-break deduction
  - **DoD:** tests for all four cases
  - **Deps:** 1.2, 1.3
  - **Out of scope:** month aggregation

- [ ] **1.5 `workedMonthMinutes`**
  - **Goal:** sum of worked minutes across a month's entries
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(entries: TimeEntry[], zone: string)`
  - **Out:** `Minutes`
  - **Edge:** empty month; mixed manual + shift entries
  - **DoD:** tests pass
  - **Deps:** 1.4
  - **Out of scope:** absences, quota

- [ ] **1.6 `effectiveQuota`**
  - **Goal:** monthly quota adjusted for job % and mid-month change
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(settings: Settings, month: string)`
  - **Out:** `Minutes`
  - **Edge:** full-time; part-time %; mid-month % change (pro-rata); **quota = 0 (no divide-by-zero)**
  - **DoD:** tests for all four
  - **Deps:** 1.1
  - **Out of scope:** balance computation

- [ ] **1.7 `paidAbsenceMinutes` + `creditedMinutes`**
  - **Goal:** credit paid absences at the daily target; add to worked without double-count
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(absences, settings, month)` → minutes; `(worked, paidAbsence)` → credited
  - **Out:** `Minutes`
  - **Edge:** full-day absence; **partial day + work same day**; holiday credit; unpaid (no credit)
  - **DoD:** tests for all four
  - **Deps:** 1.1
  - **Out of scope:** accrual balance (1.13)

- [ ] **1.8 `balanceMinutes` + status**
  - **Goal:** balance = credited − quota; derive month status
  - **Design:** [DESIGN.md §6 (calculations.ts), §4 (MonthStatus)](DESIGN.md)
  - **In:** `(credited: Minutes, quota: Minutes)`
  - **Out:** `Minutes` + `MonthStatus`
  - **Edge:** surplus; deficit; exactly zero; **full-month absence → balance 0**; **surplus does NOT roll over** — each month computed standalone (§6.4.22)
  - **DoD:** tests for all four
  - **Deps:** 1.1
  - **Out of scope:** required-per-day, forecast

- [ ] **1.9 `remainingWorkdays`**
  - **Goal:** count Sun–Thu from today to month-end minus planned absences
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(today: IsoDate, month, settings, absences)`
  - **Out:** `number`
  - **Edge:** mid-month; Feb 28/29; leap year; month edges on a weekend
  - **DoD:** tests for all four
  - **Deps:** 1.1
  - **Out of scope:** required-per-day math

- [ ] **1.10 `missingWorkdays`**
  - **Goal:** past work days with no entry and no absence → "missing"
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(today, month, settings, entries, absences)`
  - **Out:** `IsoDate[]`
  - **Edge:** a missing day; a covered day; a day with an absence (not missing); future day (not missing)
  - **DoD:** tests for all four
  - **Deps:** 1.1
  - **Out of scope:** producing the alert (8.2)

- [ ] **1.11 `requiredPerDay`**
  - **Goal:** hours-to-complete ÷ remaining work days
  - **Design:** [DESIGN.md §6 (calculations.ts)](DESIGN.md)
  - **In:** `(balance: Minutes, remainingWorkdays: number)`
  - **Out:** `Minutes | null`
  - **Edge:** normal; **0 days + deficit → null (cannot_complete)**; surplus → 0
  - **DoD:** tests for all three
  - **Deps:** 1.8, 1.9
  - **Out of scope:** —

- [ ] **1.12 `buildMonthSummary`**
  - **Goal:** orchestrate 1.5–1.11 into a `MonthSummary`
  - **Design:** [DESIGN.md §6 (calculations.ts), §4 (MonthSummary)](DESIGN.md)
  - **In:** `(input: MonthInput)` (entries, absences, settings, today)
  - **Out:** `MonthSummary`
  - **Edge:** reproduce UC-2 numbers (143:20 / 182:00, deficit 38:40, 6 days, ≈6:27/day)
  - **DoD:** integration test matches UC-2 exactly
  - **Deps:** 1.5–1.11
  - **Out of scope:** alerts derivation

- [ ] **1.13 `absenceBalance`**
  - **Goal:** accrued balance = opening + accrual×months − used
  - **Design:** [DESIGN.md §6 (absences.ts)](DESIGN.md)
  - **In:** `(opening, accrualPerMonth, monthsElapsed, used)`
  - **Out:** `number` (days)
  - **Edge:** accrual over months; **usage beyond balance → negative + flag**; zero accrual
  - **DoD:** tests for all three
  - **Deps:** 1.1
  - **Out of scope:** the low-balance alert (8.2)

- [ ] **1.14 `validateEntry`**
  - **Goal:** validate a time entry against all input rules
  - **Design:** [DESIGN.md §6 (validation.ts)](DESIGN.md)
  - **In:** `(entry: TimeEntry, zone: string)`
  - **Out:** `ValidationResult`
  - **Edge:** out < in; break > presence; **clock-out with no clock-in**; invalid input (25:00, negatives, text); overlapping shifts; future worked-hours blocked
  - **DoD:** one named test per case
  - **Deps:** 1.1
  - **Out of scope:** UI rendering of errors (5.3)

---

## Milestone 2 — Data Layer  *(full 7-field blocks)*

> **Design:** [DESIGN.md §5](DESIGN.md)

- [ ] **2.1 `Repository` interface**
  - **Goal:** define the storage contract exactly as [DESIGN.md §5](DESIGN.md)
  - **Design:** [DESIGN.md §5](DESIGN.md)
  - **In:** —
  - **Out:** `Repository` + `DatasetSnapshot` interfaces (all methods `async`)
  - **Edge:** `getUser` may return null; range queries
  - **DoD:** compiles
  - **Deps:** 1.1
  - **Out of scope:** any implementation

- [ ] **2.2 `serialization.ts`**
  - **Goal:** (de)serialize the dataset with a `schemaVersion` + migration hook
  - **Design:** [DESIGN.md §5, §3 (serialization.ts)](DESIGN.md)
  - **In:** `DatasetSnapshot` ⇄ JSON string
  - **Out:** parsed snapshot / serialized string
  - **Edge:** round-trip equality; older `schemaVersion` triggers a migration
  - **DoD:** round-trip + migration tests pass
  - **Deps:** 2.1
  - **Out of scope:** the storage backend itself

- [ ] **2.3 `LocalStorageRepository`**
  - **Goal:** implement `Repository` over namespaced LocalStorage keys
  - **Design:** [DESIGN.md §5, §4 (design notes)](DESIGN.md)
  - **In:** `Repository` method calls
  - **Out:** `Promise`-wrapped results
  - **Edge:** range filtering in memory; **`upsertEntry` merges by date (one entry/day)** — two clock-ins on one date land in one entry's `shifts[]`
  - **DoD:** round-trip tests + the merge-by-date test pass
  - **Deps:** 2.1, 2.2
  - **Out of scope:** Supabase, cross-tab sync (2.4)

- [ ] **2.4 Two-tab consistency**
  - **Goal:** keep two open tabs consistent via the `storage` event
  - **Design:** [DESIGN.md §5 (LocalStorageRepository)](DESIGN.md)
  - **In:** browser `storage` event
  - **Out:** invalidated/refreshed cached reads
  - **Edge:** a write in tab A reflects in tab B
  - **DoD:** simulated `storage` event test passes
  - **Deps:** 2.3
  - **Out of scope:** real-time server sync (Milestone 9)

- [ ] **2.5 `backup.ts`**
  - **Goal:** export/import the whole dataset as JSON
  - **Design:** [DESIGN.md §5 (exportAll/importAll), §3 (backup.ts)](DESIGN.md)
  - **In:** `exportAll()` → snapshot; `importAll(snapshot)` → void
  - **Out:** `DatasetSnapshot` / restored state
  - **Edge:** export→import yields an identical dataset; malformed import rejected
  - **DoD:** round-trip test passes
  - **Deps:** 2.3
  - **Out of scope:** the backup UI (7.4)

---

## Milestone 3 — Hooks & State Wiring  *(shortened blocks)*

> **Design:** [DESIGN.md §7](DESIGN.md)

- [ ] **3.1 React Query provider + repository context**
  - **Goal:** inject one `Repository` instance app-wide
  - **Design:** [DESIGN.md §7, §9.4](DESIGN.md)
  - **DoD:** swapping the injected repo needs no component change
  - **Deps:** 2.1
  - **Out of scope:** the Supabase repo
- [ ] **3.2 `useSettings`**
  - **Goal:** read/write settings with defaults (182h, 8:36, Sun–Thu)
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **DoD:** reads defaults on first run
  - **Deps:** 3.1, 1.1
  - **Out of scope:** the settings UI (8.1)
- [ ] **3.3 `useTimeEntries(month)` + `useAbsences(month)`**
  - **Goal:** list + mutate (upsert/delete) with cache invalidation
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **DoD:** a write invalidates the month query
  - **Deps:** 3.1
  - **Out of scope:** summary computation (3.4)
- [ ] **3.4 `useMonthSummary(month)`**
  - **Goal:** compose entries+absences through `buildMonthSummary`
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **DoD:** edit/delete an entry → summary recomputes immediately
  - **Deps:** 1.12, 3.3
  - **Out of scope:** rendering
- [ ] **3.5 `useClock`**
  - **Goal:** 1s UI ticker; persist on Start (open shift), finalize on Stop; midnight split/flag
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **DoD:** ticker doesn't write per tick; entry persists on start/stop
  - **Deps:** 3.3
  - **Out of scope:** clock UI (5.1)

---

## Milestone 4 — Dashboard  *(shortened blocks)*

> **Design:** [DESIGN.md §8](DESIGN.md)

- [ ] **4.1 UI primitives** — `Card`, `ProgressRing`, `ProgressBar`, `Button`, `BalanceBadge`
  - **Goal:** reusable presentational components
  - **Design:** [DESIGN.md §8.1](DESIGN.md)
  - **DoD:** render in isolation; RTL-safe; visible focus ring (keyboard)
  - **Deps:** 0.5
  - **Out of scope:** business logic
- [ ] **4.2 `TodayCard`**
  - **Goal:** worked-today, remaining-to-target, ring, Start/Stop button
  - **Design:** [DESIGN.md §8](DESIGN.md)
  - **DoD:** shows live time while running; "X left for today"
  - **Deps:** 3.5, 4.1
  - **Out of scope:** manual entry form
- [ ] **4.3 `MonthCard`**
  - **Goal:** worked/quota, %, balance, forecast, required-per-day, days-left
  - **Design:** [DESIGN.md §8](DESIGN.md)
  - **DoD:** reproduces the UC-2 display
  - **Deps:** 3.4
  - **Out of scope:** history navigation
- [ ] **4.4 `AbsencesSummaryCard`**
  - **Goal:** used this month + remaining accrued balance + quick link
  - **Design:** [DESIGN.md §8](DESIGN.md)
  - **DoD:** shows vacation/sick balance
  - **Deps:** 1.13, 4.1
  - **Out of scope:** the report-absence flow (6.1)
- [ ] **4.5 Empty state**
  - **Goal:** first load with no data → "Start logging" CTA
  - **Design:** [DESIGN.md §8](DESIGN.md)
  - **DoD:** no-data render shows the CTA
  - **Deps:** 4.2
  - **Out of scope:** —
- [ ] **4.6 Responsive layout**
  - **Goal:** desktop-primary, fluid layout; cards stack to one column below ~640px; usable down to 320px
  - **Design:** [DESIGN.md §8.1](DESIGN.md)
  - **DoD:** no horizontal scroll at 320px; tap targets ≥ 44px; verified at 320 / 768 / 1280
  - **Deps:** 4.1
  - **Out of scope:** native app (web only)
- [ ] **4.7 Accessibility pass**
  - **Goal:** keyboard navigation, ARIA, and contrast across the app
  - **Design:** [DESIGN.md §8.1](DESIGN.md)
  - **DoD:** every action keyboard-reachable with visible focus + logical tab order; icon-only buttons have `aria-label`; alerts use `role="alert"`; standard contrast ratios
  - **Deps:** 4.1, 8.3
  - **Out of scope:** full WCAG AA audit (post-MVP)

---

## Milestone 5 — Time Entry  *(shortened blocks)*

> **Design:** [DESIGN.md §7, §8](DESIGN.md)

- [ ] **5.1 Live clock controls**
  - **Goal:** Start/Stop + Pause/Resume accumulating break time
  - **Design:** [DESIGN.md §7 (useClock), §8](DESIGN.md)
  - **DoD:** pause adds to breakMinutes; net excludes breaks
  - **Deps:** 3.5
  - **Out of scope:** manual entry
- [ ] **5.2 Manual entry form**
  - **Goal:** date + in/out + break; add/remove multiple shifts; or total-hours mode
  - **Design:** [DESIGN.md §8, §4 (TimeEntry/Shift)](DESIGN.md)
  - **DoD:** create/edit a multi-shift day; total-hours mode works
  - **Deps:** 1.4
  - **Out of scope:** validation messages (5.3)
- [ ] **5.3 Inline validation**
  - **Goal:** wire `validateEntry`; block/warn with Hebrew messages
  - **Design:** [DESIGN.md §6 (validation.ts), §8](DESIGN.md)
  - **DoD:** each validation case surfaces a clear message
  - **Deps:** 1.14
  - **Out of scope:** the validation rules themselves (1.14)
- [ ] **5.4 Edit/Delete**
  - **Goal:** every entry editable/deletable; month recalculates immediately
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **DoD:** delete → dashboard updates
  - **Deps:** 3.3
  - **Out of scope:** —

---

## Milestone 6 — Absences  *(shortened blocks)*

> **Design:** [DESIGN.md §6, §8](DESIGN.md)

- [ ] **6.1 Report-absence modal**
  - **Goal:** type + date range + full/partial day
  - **Design:** [DESIGN.md §8, §4 (Absence)](DESIGN.md)
  - **DoD:** vacation range credits each work day; half-day sick works
  - **Deps:** 1.7
  - **Out of scope:** accrual settings (6.2)
- [ ] **6.2 Accrual settings + balance display**
  - **Goal:** accrual/month, opening balance, low-balance warning
  - **Design:** [DESIGN.md §6 (absenceBalance), §8](DESIGN.md)
  - **DoD:** balance updates; warning near/below zero
  - **Deps:** 1.13
  - **Out of scope:** —

---

## Milestone 7 — Reports & Export  *(shortened blocks)*

> **Design:** [DESIGN.md §8](DESIGN.md)

- [ ] **7.1 Month table**
  - **Goal:** day-by-day rows (date, in, out, break, net, absence, note) + summary row
  - **Design:** [DESIGN.md §8 (ReportsPage)](DESIGN.md)
  - **DoD:** matches a month's data; RTL table
  - **Deps:** 3.4
  - **Out of scope:** export
- [ ] **7.2 Month navigation / history**
  - **Goal:** move between months, view archive
  - **Design:** [DESIGN.md §8 (MonthNavigator)](DESIGN.md)
  - **DoD:** navigating months reloads summaries
  - **Deps:** 7.1
  - **Out of scope:** —
- [ ] **7.3 CSV export**
  - **Goal:** month export incl. summary (worked/credited/quota/balance)
  - **Design:** [DESIGN.md §8 (ExportCsvButton)](DESIGN.md)
  - **DoD:** CSV opens with Hebrew (UTF-8 BOM)
  - **Deps:** 7.1
  - **Out of scope:** PDF (phase 2)
- [ ] **7.4 JSON backup/restore UI**
  - **Goal:** wire `exportAll`/`importAll` + browser-cleanup warning
  - **Design:** [DESIGN.md §5 (backup), §8](DESIGN.md)
  - **DoD:** export then import restores state
  - **Deps:** 2.5
  - **Out of scope:** cloud backup (Milestone 9)

---

## Milestone 8 — Settings & Alerts

> **Design:** [DESIGN.md §6, §8](DESIGN.md)

- [ ] **8.1 Settings page**  *(shortened)*
  - **Goal:** quota/job%, daily target, work days, break policy, hours format, accruals, alert toggles + lead days
  - **Design:** [DESIGN.md §8 (SettingsPage), §4 (Settings)](DESIGN.md)
  - **DoD:** changes persist and affect calculations live
  - **Deps:** 3.2
  - **Out of scope:** the alert logic (8.2)

- [ ] **8.2 `deriveAlerts`**  *(full 7-field — pure domain)*
  - **Goal:** derive active alerts from the month state
  - **Design:** [DESIGN.md §6 (alerts.ts)](DESIGN.md)
  - **In:** `(summary: MonthSummary, settings, entries, today: IsoDate)`
  - **Out:** `ActiveAlert[]`
  - **Edge:** end_of_month (≤ leadDays + deficit); overtime (day > target / month > quota); logging_reminder (uses `missingWorkdays`); suspicious_outlier (day > 12h); cannot_complete; absence_balance_low — and respect each toggle in `alertsEnabled`
  - **DoD:** one named test per alert type + a toggle-off test
  - **Deps:** 1.10, 1.12
  - **Out of scope:** rendering (8.3)

- [ ] **8.3 `AlertsBanner`**  *(shortened)*
  - **Goal:** render `deriveAlerts` output; `role="alert"`; recompute on data change
  - **Design:** [DESIGN.md §8, §8.1](DESIGN.md)
  - **DoD:** UC-5 banner appears; deleting data clears stale alerts
  - **Deps:** 8.2, 3.4
  - **Out of scope:** alert logic (8.2)

---

## Milestone 9 — Sync Phase (Supabase) — *post-MVP*

> Only after the local MVP is solid. Nothing above changes except adding one repository + auth. · **Design:** [DESIGN.md §9](DESIGN.md)

- [ ] **9.1 Supabase project + schema**  *(shortened)*
  - **Goal:** create tables + RLS + `unique(user_id, date)` per [DESIGN.md §9.2](DESIGN.md)
  - **Design:** [DESIGN.md §9.2](DESIGN.md)
  - **DoD:** tables exist; RLS blocks cross-user reads
  - **Deps:** —
  - **Out of scope:** app wiring
- [ ] **9.2 `<AuthGate>` + login screen**  *(shortened)*
  - **Goal:** Supabase Auth (email/password)
  - **Design:** [DESIGN.md §9.1](DESIGN.md)
  - **DoD:** unauthenticated → login; authenticated → app
  - **Deps:** 9.1
  - **Out of scope:** data migration (9.4)
- [ ] **9.3 `SupabaseRepository`**  *(full 7-field)*
  - **Goal:** implement the `Repository` interface against Supabase
  - **Design:** [DESIGN.md §9.3, §9.4](DESIGN.md)
  - **In:** `Repository` method calls
  - **Out:** `Promise`-wrapped results from Postgres
  - **Edge:** RLS-scoped reads; `updated_at` last-write-wins; offline → queue/error
  - **DoD:** the **same** hook/UI tests pass with this repo injected
  - **Deps:** 2.1, 9.1
  - **Out of scope:** conflict field-merge (future)
- [ ] **9.4 Local → cloud migration**  *(shortened)*
  - **Goal:** on first login, offer to import local data via `exportAll`/`importAll`
  - **Design:** [DESIGN.md §9.3](DESIGN.md)
  - **DoD:** local data appears in the cloud account; visible on a second device
  - **Deps:** 2.5, 9.3
  - **Out of scope:** —

---

## Definition of Done (whole project) — mirrors [SPEC.md §7](SPEC.md)

- [ ] Every calculation rule (Milestone 1) implemented + unit-tested.
- [ ] Every [SPEC.md §6](SPEC.md) edge case handled or explicitly marked out of scope.
- [ ] Dashboard correctly shows "left today / left this month"; alerts fire under defined conditions.
- [ ] CSV export and JSON backup work end-to-end.
- [ ] *(Sync phase)* Login + same data on two devices + local→cloud migration.
