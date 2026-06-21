# Implementation Tasks
## Employee Hours Tracker Web Application

| | |
|---|---|
| **Version** | 3.0 |
| **Date** | 21/06/2026 |
| **Companion docs** | [SPEC.md](SPEC.md) v1.1 · [DESIGN.md](DESIGN.md) v1.0 |
| **Progress** | 6 of 16 done · 1 partial · 119 tests passing |

> 16 consolidated tasks. Related functions are grouped into one task instead of one-per-function. Each task lists what it **Covers**, links to its **Design** section, and states **Edge** cases + **DoD**. Task numbers are planning labels only — code is organized by [DESIGN.md](DESIGN.md) structure, so renumbering never requires code changes. SPEC → DESIGN → TASK.

**Fields:** `Goal` · `Covers` the functions/items inside · `Design` the contract · `Edge` cases & errors to test · `DoD` acceptance · `Deps` · `Out of scope`. **Status:** `[x]` done · `[~]` partial · `[ ]` todo.

---

## Phase A — Foundation

- [x] **T1 — Project setup**
  - **Goal:** scaffold a working, RTL React + TypeScript app with tooling
  - **Covers:** Vite + React + TS (strict); `react-router-dom`, `luxon`, `@tanstack/react-query`; ESLint + Prettier; Vitest + Testing Library + jsdom; folder skeleton (`domain/ data/ app/ features/ ui/ i18n/`); `dir="rtl"` + `lang="he"` shell + date/time format helpers
  - **Design:** [DESIGN.md §2, §3, §8.1](DESIGN.md)
  - **DoD:** `npm run dev` serves an RTL app; `npm run test` + `npm run lint` pass ✅
  - **Deps:** —
  - **Out of scope:** Supabase client (Phase C)

- [x] **T2 — Domain: types + time math**
  - **Goal:** the data model and per-day time calculations (pure)
  - **Covers:** `types.ts` (all model types); `netShiftMinutes`; `autoBreakMinutes`; `entryWorkedMinutes`
  - **Design:** [DESIGN.md §4, §6 (time.ts)](DESIGN.md)
  - **Edge:** `Shift.end: null` running clock; midnight crossing; DST 23h/25h; out=in→0; **timezone/travel (same UTC instants → same duration)**; auto-break disabled / under / over threshold; single shift; multiple shifts; manual-only entry; break + auto-break deduction
  - **DoD:** one named test per edge — `time.test.ts`, `entryWorkedMinutes.test.ts` ✅
  - **Deps:** T1
  - **Out of scope:** month aggregation (T3)

- [x] **T3 — Domain: month calculations & summary**
  - **Goal:** roll a month up into a `MonthSummary` (pure)
  - **Covers:** `workedMonthMinutes`, `paidAbsenceMinutes`, `creditedMinutes`, `balanceMinutes` + status, `effectiveQuota`, `remainingWorkdays`, `missingWorkdays`, `requiredPerDay`, `buildMonthSummary`
  - **Design:** [DESIGN.md §6 (calculations.ts), §4 (MonthSummary)](DESIGN.md)
  - **Edge:** empty month; mixed manual+shift; **quota=0 (no ÷0)**; part-time %; mid-month % pro-rata; full-day absence; **partial-day absence + work (no double-count)**; holiday credit; **unpaid (no credit)**; surplus / deficit / exactly zero; **full-month absence → balance 0**; **surplus does NOT roll over**; Feb 28/29; leap; month-edge weekend; missing / covered / absence / future days; **0 days + deficit → cannot_complete**; surplus → 0
  - **DoD:** UC-2 integration test (143:20 / 182:00, deficit 38:40, 6 days, ≈6:27/day) + per-edge tests ✅ (`buildMonthSummary`, `balance`, `remainingWorkdays`, `requiredPerDay`, `missingWorkdays`, `calculations`)
  - **Deps:** T2
  - **Out of scope:** alerts (T4)

- [x] **T4 — Domain: absences, alerts & validation**
  - **Goal:** accrual balance, alert derivation, and entry validation (pure)
  - **Covers:** `absenceBalance` ✅ · `validateEntry` ✅ · `deriveAlerts` ✅ (`alerts.ts` — `AlertContext` widened beyond the DESIGN signature; see in-file NOTE)
  - **Design:** [DESIGN.md §6 (absences.ts, alerts.ts, validation.ts)](DESIGN.md)
  - **Edge:** accrual over months / usage beyond balance → negative + flag / zero accrual ✅; validation: out<in, break>presence, out with no in, invalid input, overlap, future worked-hours ✅; alerts: all types (end_of_month, overtime day+month, logging_reminder via `missingWorkdays`, suspicious_outlier >12h, cannot_complete, absence_balance_low) + `alertsEnabled` toggle-off ✅
  - **DoD:** `absenceBalance.test`, `absenceCredit.test`, `validation.test`, `alerts.test` (9 tests) ✅
  - **Deps:** T3
  - **Out of scope:** UI rendering (T9, T12)

- [x] **T5 — Data layer**
  - **Goal:** storage behind one interface, local-first
  - **Covers:** `Repository` + `DatasetSnapshot`; `serialization.ts` (schemaVersion + migration); `LocalStorageRepository` (async, namespaced, **upsert merges by date**); two-tab `storage` sync; `backup.ts` (export/import all)
  - **Design:** [DESIGN.md §5, §4 (design notes)](DESIGN.md)
  - **Edge:** `getUser` may return null; range filtering; **merge by date** — two clock-ins on one date → one entry's `shifts[]` (§6.3.19); two-tab consistency (§6.5.27); export→import round-trip + malformed import rejected; migration on version bump
  - **DoD:** `LocalStorageRepository.test`, `serialization.test`, `backup.test` ✅
  - **Deps:** T2
  - **Out of scope:** Supabase repo (T15)

- [x] **T6 — Hooks & state wiring**
  - **Goal:** connect UI to domain + repository via React Query
  - **Covers:** Query provider + repository context (injectable); `useSettings` (defaults 182h/8:36/Sun–Thu); `useTimeEntries` + `useAbsences` (mutate + invalidate); `useMonthSummary`; `useClock` (1s ticker, persist on start/stop, midnight split)
  - **Design:** [DESIGN.md §7](DESIGN.md)
  - **Edge:** write invalidates the month query → immediate recompute (§6.3.17); ticker doesn't write per tick; reads defaults on first run
  - **DoD:** `useSettings.test`, `useTimeEntries.test`, `useMonthSummary.test`, `useClock.test`, `RepositoryContext.test` ✅
  - **Deps:** T3, T5
  - **Out of scope:** visual components (Phase B)

---

## Phase B — UI (MVP)

- [~] **T7 — Dashboard**
  - **Goal:** the at-a-glance status screen
  - **Covers:** UI primitives ✅ (`Card`, `ProgressRing`, `ProgressBar`, `Button`, `BalanceBadge`, `format`); `TodayCard` ✅; `MonthCard` ✅; **`AbsencesSummaryCard` ❌**; **empty state ❌**
  - **Design:** [DESIGN.md §8](DESIGN.md)
  - **Edge:** running clock live update ✅; UC-2 display ✅; no-remaining-days final state; **no-data empty state ("Start logging") — REMAINING**
  - **DoD:** primitives + Today + Month tested ✅; **absences card + empty state pending**
  - **Deps:** T6
  - **Out of scope:** alerts banner (T12); responsiveness/a11y (T8)
  - **➡ Remaining:** `AbsencesSummaryCard` + empty state + wire into a dashboard page

- [ ] **T8 — Responsive & accessibility**
  - **Goal:** usable on mobile and by keyboard/screen-reader
  - **Covers:** fluid layout, cards stack < ~640px, usable to 320px, tap targets ≥44px; keyboard nav + visible focus + tab order; ARIA labels on icon buttons; `role="alert"`; contrast
  - **Design:** [DESIGN.md §8.1](DESIGN.md)
  - **Edge:** no horizontal scroll at 320px; every action keyboard-reachable
  - **DoD:** verified at 320 / 768 / 1280; keyboard-only walkthrough works
  - **Deps:** T7
  - **Out of scope:** full WCAG AA audit (post-MVP)

- [ ] **T9 — Time entry**
  - **Goal:** log time via clock or manual entry
  - **Covers:** live clock (Start/Stop + Pause/Resume accumulating break); manual form (date + in/out + break, add/remove **multiple shifts**, or total-hours mode); inline validation (wires `validateEntry`, Hebrew messages); edit/delete
  - **Design:** [DESIGN.md §7, §8](DESIGN.md)
  - **Edge:** pause adds to break; multi-shift day; each validation case shows a message; delete → dashboard updates
  - **DoD:** create/edit/delete a multi-shift day end-to-end
  - **Deps:** T6, T4
  - **Out of scope:** the validation rules themselves (T4, done)

- [ ] **T10 — Absences (UI)**
  - **Goal:** report absences and manage accrual
  - **Covers:** report-absence modal (type + range + full/partial day); accrual settings + balance display + low-balance warning
  - **Design:** [DESIGN.md §8, §6 (absenceBalance)](DESIGN.md)
  - **Edge:** vacation range credits each work day (UC-3); half-day sick (UC-4); warning near/below zero
  - **DoD:** UC-3 and UC-4 work; balance updates live
  - **Deps:** T6, T4
  - **Out of scope:** —

- [ ] **T11 — Reports & export**
  - **Goal:** view, navigate, and export monthly data
  - **Covers:** month table (day-by-day: date/in/out/break/net/absence/note + summary row); month navigation / history; CSV export (incl. summary); JSON backup/restore UI + browser-cleanup warning
  - **Design:** [DESIGN.md §8, §5 (backup)](DESIGN.md)
  - **Edge:** CSV opens with Hebrew (UTF-8 BOM); export→import restores state (§6.5.28)
  - **DoD:** UC-7 (CSV + JSON backup) works end-to-end
  - **Deps:** T6, T5
  - **Out of scope:** PDF (phase 2)

- [ ] **T12 — Settings & alerts (UI)**
  - **Goal:** the settings screen and the live alerts banner
  - **Covers:** settings page (quota/job%, target, work days, break policy, format, accruals, alert toggles + lead days); `AlertsBanner` (renders `deriveAlerts`, `role="alert"`, recompute on change)
  - **Design:** [DESIGN.md §8, §8.1](DESIGN.md)
  - **Edge:** setting changes affect calculations live; UC-5 banner appears; deleting data clears stale alerts (§6.5.29)
  - **DoD:** settings persist + affect math; alerts fire under defined conditions
  - **Deps:** T6, T4 (incl. `deriveAlerts`)
  - **Out of scope:** alert logic (T4)

---

## Phase C — Sync (Supabase) — *post-MVP*

> Only after the local MVP is solid. Nothing in Phases A–B changes except adding one repository + auth. · **Design:** [DESIGN.md §9](DESIGN.md)

- [ ] **T13 — Supabase project + schema**
  - **Goal:** create the cloud database with security
  - **Covers:** tables (settings, time_entries, absences) + RLS (`user_id = auth.uid()`) + `unique(user_id, date)`
  - **Design:** [DESIGN.md §9.2](DESIGN.md)
  - **Edge:** RLS blocks cross-user reads
  - **DoD:** tables exist; a second user cannot read another's rows
  - **Deps:** —
  - **Out of scope:** app wiring

- [ ] **T14 — Auth**
  - **Goal:** login gating the app
  - **Covers:** `<AuthGate>` + login screen (Supabase Auth email/password)
  - **Design:** [DESIGN.md §9.1](DESIGN.md)
  - **Edge:** unauthenticated → login; authenticated → app
  - **DoD:** login/logout works; `userId` becomes `auth.uid()`
  - **Deps:** T13
  - **Out of scope:** migration (T16)

- [ ] **T15 — `SupabaseRepository`**
  - **Goal:** implement the `Repository` interface against Supabase
  - **Covers:** all `Repository` methods over Postgres; `updated_at` last-write-wins
  - **Design:** [DESIGN.md §9.3, §9.4](DESIGN.md)
  - **Edge:** RLS-scoped reads; offline → queue/error
  - **DoD:** the **same** hook/UI tests pass with this repo injected
  - **Deps:** T5, T13
  - **Out of scope:** field-level conflict merge (future)

- [ ] **T16 — Local → cloud migration**
  - **Goal:** carry existing local data into the cloud account
  - **Covers:** first-login prompt → `exportAll()` (local) → `importAll()` (Supabase)
  - **Design:** [DESIGN.md §9.3](DESIGN.md)
  - **Edge:** data visible on a second device after migration
  - **DoD:** local data appears in the cloud account; cross-device verified
  - **Deps:** T5, T15
  - **Out of scope:** —

---

## Definition of Done (whole project) — mirrors [SPEC.md §7](SPEC.md)

- [x] Every calculation rule (T2–T4) implemented + unit-tested.
- [ ] Every [SPEC.md §6](SPEC.md) edge case handled or explicitly marked out of scope.
- [ ] Dashboard correctly shows "left today / left this month"; alerts fire under defined conditions.
- [ ] CSV export and JSON backup work end-to-end.
- [ ] *(Sync phase)* Login + same data on two devices + local→cloud migration.
