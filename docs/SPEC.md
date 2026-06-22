# Product Requirement Document & Technical Specification
## Employee Hours Tracker Web Application

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 18/06/2026 |
| **Status** | Approved for detailed design — updated with cross-device sync (Supabase) decision |
| **Author role** | Senior Product Manager & System Analyst |

> All open decisions have been resolved. The approved decisions are summarized in the table below.

### Approved Product Decisions
| Topic | Decision |
|-------|----------|
| Monthly quota | **182 hours** (full-time; configurable / job percentage) |
| Work days | **Sunday–Thursday** |
| Daily target | **8.6 hours** (8:36) |
| Storage | **LocalStorage** in MVP, then **Supabase** for cross-device sync — same Repository interface for both |
| Cross-device sync | **Planned** — data stored on a server (Supabase) so the user can access it from multiple devices |
| User authentication | **Planned** — required once data moves to the server (introduced in the sync phase) |
| Multiple shifts per day | **Supported** (multiple clock-in/clock-out pairs) |
| Automatic break deduction | **Configurable** — default: manual |
| Hours bank (surplus/deficit rollover) | **No** — each month stands on its own |
| Export | **CSV only** for MVP |
| Work month | **Calendar month** (1st to end of month) |
| Vacation/sick quotas | **Yes** — accrued balance tracking |
| Editing a closed month | **Always allowed** (no locking) |
| Offline / PWA | **No** — regular website (local data only) |
| Paid holiday | Credited as the daily target (no completion required) |
| Primary platform | **Desktop-primary**, with mobile support |

---

## 1. Introduction & Goals

### 1.1 Background
Many employees struggle to track their monthly work-hours status in real time: how much they have already worked, how much is left to complete, and how vacations and sick leave affect the quota. Tracking is usually done in a manual spreadsheet or from memory, leading to uncertainty and end-of-month surprises.

### 1.2 System Purpose
A web app focused on **immediate clarity** for the individual employee, enabling her to:

1. **Log daily** work hours — via a live clock (Start/Stop) or manual entry.
2. **See in real time** "how much is left today" and "how much is left this month" to meet the quota.
3. **Manage absences** — vacation, sick leave, holiday — and their effect on the quota.
4. **Receive proactive alerts** toward month-end about a gap to complete, as well as overtime and reminders.
5. **Generate reports and export** for personal records and submission to the employer.

### 1.3 Goals & Success Metrics
| Goal | Success metric |
|------|----------------|
| Immediate clarity | The user knows within < 3 seconds how many hours remain this month |
| Prevent end-of-month surprises | Reduction in months that close with an unexpected gap |
| Ease of logging | Logging a work day in < 10 seconds (live clock in one tap) |
| Calculation reliability | 100% of calculation rules and edge cases covered by tests |

### 1.4 Out of Scope (MVP)
- Pay and overtime rate calculation (125%/150%).
- Multiple employees, manager roles, and approval workflows.
- Integration with a physical attendance clock or a payroll system.
- Native app (the application is Web only).

---

## 2. Target Audience & Assumptions

### 2.1 Target Audience (Personas)
- **Primary user — a salaried employee (full or part time)** who needs to track her hours against a fixed monthly quota. Has basic digital literacy and **works mainly from a computer (desktop), with the option to use a mobile phone as well**.
- **Secondary user (future) — a manager** viewing reports. Out of scope for MVP (phase 2).

### 2.2 Assumptions
1. A single personal account per user — no sharing or multiple permissions. In the MVP (local) phase data lives on one device; in the sync phase the same account is accessed from multiple devices via login.
2. Fixed monthly quota: **182 hours** (configurable in settings, including job percentage).
3. Work days: **Sunday–Thursday**; daily target **8.6 hours** (≈ 8 hours 36 minutes).
4. The work month is a **calendar month** (1st to end of month).
5. Default time zone: **Asia/Jerusalem**; language: **Hebrew (RTL)**.
6. A paid absence (vacation/sick/holiday) is **credited** as hours toward the quota at the daily-target rate.

### 2.3 Technical Pre-conditions
- A modern browser supporting LocalStorage and ES2020 (recent Chrome, Safari, Edge, Firefox).
- An internet connection is required to load the site; after loading, data is stored locally in the browser (a regular website, no PWA/offline in MVP). In the sync phase (Supabase), an internet connection is also required for cross-device sync — the app remains usable offline but changes will not sync until reconnected.

---

## 3. Detailed Functional Requirements

### 3.0 Shared Calculation Definitions
All calculations are performed internally in **whole minutes (integer)**; display is in **hours:minutes** (e.g., 8:36) or decimal, per settings. The live "Today" clock additionally shows the **exact** elapsed time to the second (seconds precision is kept in the stored timestamps).

```
net_day_hours      = (clock_out − clock_in) − breaks
worked_hours (mo.) = Σ net_day_hours
credited_hours     = worked_hours + Σ(paid_absence × daily_target)
balance            = credited_hours − monthly_quota   // negative = deficit, positive = surplus
remaining_workdays = count of Sun–Thu from today to month-end − planned absences
hours_to_complete  = max(0, −balance)
required_rate_per_day = remaining_workdays > 0 ? hours_to_complete / remaining_workdays : ∞
```

---

### 3.1 Main Dashboard
The home screen. Its purpose is to give a complete status picture at a glance.

**Components:**

1. **"Today" Card**
   - Hours worked today so far (updates in real time if the clock is running).
   - Remaining hours until the daily target (8.6h) — "You have 2:15 left for today".
   - Visual indicator (ring / progress bar).
   - Primary button: **Start/Stop clock** (see 3.2).

2. **"This Month" Card**
   - Hours worked / monthly quota (e.g., "143:20 / 182:00").
   - Progress bar with completion percentage.
   - **Balance**: deficit (red) or surplus (green) in hours.
   - Forecast: "At the current pace you'll finish the month with a surplus/deficit of X hours".
   - "To meet the quota you need to work ≈K hours on each of the M remaining work days".
   - Counter of work days remaining in the month.

3. **"Absences" Summary Card**
   - Vacation days used this month **and remaining accrued balance** (see 3.6).
   - Sick days reported this month **and remaining accrued sick balance**.
   - Holiday days.
   - Quick link to "Report an absence".

4. **Alerts Banner** — see 3.4. Shown at the top of the dashboard when an alert is active.

**Display edge cases:** first load with no data → empty state with a call to action ("Start logging"); a month with no remaining work days → the forecast shows a final state.

---

### 3.2 Time Reporting (Clock & Manual Entry)
Two reporting paths, both leading to the same data model.

**A. Live Clock**
- A **Start** button records a clock-in timestamp; it becomes **Stop**, which records a clock-out.
- While the clock is running — a running timer is displayed on the dashboard.
- A **Pause/Resume** option that accumulates break time and deducts it from the net.
- On stop — a `TimeEntry` is created/updated for the current day.
- A clock left running past midnight → see edge case 6.1.1.

**B. Manual Entry**
- Select a date + clock-in time + clock-out time + break minutes.
- Alternatively: enter a **total number of hours** for the day without exact times.
- Support for **multiple shifts** on the same day (adding clock-in/clock-out pairs).
- Automatic break deduction is **configurable** (off by default; when enabled — e.g., 30 min over 6 hours of presence).

**C. Edit & Delete**
- Every entry can be edited/deleted; the month's calculations update immediately.
- Validations: clock-out < clock-in (detected as crossing midnight or an error), break > presence (blocked), invalid input (blocked with a message).

---

### 3.3 Profile Settings
- **User details:** name, email, language, time zone.
- **Quota settings:** monthly quota (hours) / job percentage; daily target; work days per week.
- **Break policy:** automatic deduction on/off + threshold (default: off).
- **Work month:** calendar month (1st to end of month).
- **Absence quotas:** monthly accrual of vacation and sick days + opening balance (see 3.6).
- **Display:** hours format (hours:minutes / decimal).
- **Alerts:** enable/disable per type, and the day threshold for the end-of-month alert (default 5).
- **Data management:** export backup / import / reset data (important for local storage).

A change to the quota or job percentage mid-month → pro-rata calculation (see edge case 6.4.23).

---

### 3.4 Notifications & Alerts
Alerts are shown In-App (banner/badge); email/push — phase 2.

| Alert type | Trigger | Content |
|-----------|---------|---------|
| **End of month** | X work days before month-end (default 5) and a negative balance | "You have N hours left to complete over M work days (≈K hours per day)" |
| **Overtime** | A day exceeding the daily target / a month exceeding the quota | "You worked 10:30 today — 1:54 over the target" |
| **Logging reminder** | A work day (Sun–Thu) ended with no logged hours/absence — holidays and already-reported absences do not trigger this | "No hours logged for yesterday — complete it?" |
| **Suspicious outlier** | A day over 12 hours | "Entry longer than usual — verify there's no mistake" |
| **Cannot complete** | No remaining work days and still a deficit | "The month will close with a deficit of N hours" |

Deleting/editing data that affected an alert → immediate recalculation.

---

### 3.5 Reports & Data Export
- **Month view:** a day-by-day table (date, clock-in, clock-out, break, net, absence type, note) + a summary row.
- **History navigation:** moving between months and viewing the archive.
- **Export:** **CSV** (for MVP); the export file includes a monthly summary (worked / credited / quota / balance). PDF — phase 2.
- **Full backup:** export/import JSON of all data — critical because storage is local (see section 4).

---

### 3.6 Absence Quota Management
Tracking an **accrued balance** of vacation and sick days (not just counting used days).

- **Monthly accrual:** the number of vacation/sick days accrued each month (set in settings; can be set to zero for an employee with no accrual).
- **Opening balance:** an initial balance the employee enters at setup.
- **Balance calculation:** `balance = opening_balance + Σ accrual − Σ days used`.
- **Display:** the dashboard's absence card (3.1) shows the current balance alongside this month's usage.
- **Alert:** a warning when the balance approaches zero or goes negative (usage beyond what's accrued).
- Sick leave beyond the accrued balance is flagged and handled per edge case 6.4.25.

---

## 4. Technical & Non-Functional Requirements

### 4.1 General Architecture
- **Type:** Single Page Application (SPA), client-side only in MVP.
- **Frontend:** React + TypeScript.
- **Time library:** `Luxon` or `date-fns-tz` — mandatory for correct handling of time zones and Daylight Saving Time (DST) transitions.
- **Domain layer:** all calculation rules as **pure functions** in a separate, well-tested layer decoupled from the UI — to cover all edge cases and enable a future move to a backend without a rewrite.
- **Data layer:** all storage access goes through a single **Repository interface** (see 4.2). MVP ships `LocalStorageRepository`; the sync phase adds `SupabaseRepository`. The UI and domain never call storage directly, so the backend swap is isolated to one layer.

### 4.2 Persistence
- **MVP:** **LocalStorage** (or IndexedDB if capacity is exceeded) — all data in the user's browser.
- A data-access layer behind a uniform **Repository interface**, so swapping the implementation from `LocalStorageRepository` to `SupabaseRepository` is a single, isolated change that does not affect the domain/UI.
- **Manual backup/restore** (JSON export/import) — essential to prevent data loss on a browser cleanup in the MVP (local) phase.
- **Sync phase (planned):** **Supabase** as the backend — managed Postgres database, built-in **authentication**, and **cross-device sync**. The user logs in and accesses the same data from any device. Chosen over a hand-written server to avoid building auth/DB/API infrastructure from scratch; the Repository interface is designed against this target in advance.
- **Development approach:** local-first. Build a working MVP on `LocalStorageRepository`, then introduce auth + `SupabaseRepository` without rewriting the domain or UI.

### 4.3 Non-Functional Requirements
| Category | Requirement |
|----------|-------------|
| **Responsiveness** | Desktop-primary; fully usable on a desktop, with a responsive layout that also works well on mobile (down to 320px) |
| **RTL & language** | Full RTL support; Hebrew; date format DD/MM/YYYY; 24-hour clock |
| **Accessibility** | Standard contrast, keyboard navigation, ARIA labels |
| **Performance** | Dashboard load < 2 seconds; calculation operations are instant |
| **Reliability** | Deterministic calculations; unit tests for every rule and edge case |
| **Privacy & security** | Hour data = personal information; HTTPS; with local storage — a warning about the browser-cleanup risk; encryption at rest in the future |
| **Browser compatibility** | Last 2 versions of Chrome, Safari, Edge, Firefox |
| **Internationalization** | Structure ready for multiple languages (i18n), even though MVP is Hebrew only |

---

## 5. Key Use Cases

**UC-1 — Logging a work day with the live clock**
1. The employee opens the app in the morning and clicks **Start**.
2. During the day she clicks **Pause** for lunch and **Resume** afterward.
3. At the end of the day she clicks **Stop**.
4. The system creates a `TimeEntry`, computes the net, and updates the "Today" and "This Month" cards.

**UC-2 — Checking "how much is left this month"**
1. The employee opens the dashboard.
2. She sees: 143:20 worked out of 182:00, a deficit of 38:40, 6 work days remaining.
3. The system shows: "You need to work ≈6:27 on each remaining day to meet the quota".

**UC-3 — Reporting vacation**
1. The employee opens "Report an absence", selects "Vacation" and a date range.
2. The system credits the daily target for each work day in the range and reduces those days from "remaining work days".
3. The absence card and the balance update.

**UC-4 — Reporting half a day of sick leave**
1. The employee reports half a day of sick leave + works half a day in practice.
2. The system credits half the daily target as an absence and sums it with the worked hours, without double counting (edge case 6.2.13).

**UC-5 — End-of-month alert**
1. 5 work days before month-end a deficit exists.
2. An alert banner appears: "You have 22 hours left to complete over 5 work days (≈4:24 per day)".

**UC-6 — Retroactive correction**
1. The employee discovers she forgot to log a day from last week.
2. She enters it manually; all month summaries and alerts are recalculated immediately.

**UC-7 — Exporting a monthly report and backup**
1. At month-end the employee exports CSV for submission to the employer.
2. She also performs a JSON backup export of all the data.

---

## 6. Edge Cases

### 6.1 Time & Clock
1. **Clock/shift crossing midnight** (in 22:00, out 06:00) → add 24 hours; require/detect the out date.
2. **Daylight Saving Time (DST) transition** → a 23- or 25-hour day; calculate by absolute time difference (UTC).
3. **Clock-out = clock-in** → 0 hours; warn.
4. **Clock-out before clock-in (not crossing midnight)** → validation error.
5. **Break > presence time** → block with an error message.
6. **Different time zone (travel)** → store in UTC with offset.
7. **Clock-out with no clock-in** → block with a validation error; cannot record an exit without a matching entry.

### 6.2 Dates & Calendar
8. **February / 28–29 days** → dynamic work-day count.
9. **Leap year.**
10. **Holiday mid-week** → a paid holiday day is credited as the daily target (no completion required).
11. **Holiday eve / half day** → partial daily target.
12. **Month starting/ending on a weekend.**
13. **A day with work + a partial absence** → correct summation without double counting.

### 6.3 Data & Entry
14. **Day with no entry** → "missing", appears in the reminder, not counted as work.
15. **Two overlapping entries** → detect the overlap and warn.
16. **Future entry** → allowed for a planned absence, blocked for worked hours.
17. **Editing a "closed" month** → retroactive editing is always allowed; all summaries and alerts recalculate immediately.
18. **Invalid input** (25:00, negative minutes, text) → clear validation.
19. **Same day twice** → prevent duplication / merge.

### 6.4 Calculation & Quota
20. **Quota = 0** (full unpaid leave) → avoid division by zero.
21. **No remaining work days + deficit** → "cannot complete" alert.
22. **Surplus hours** → shown as a surplus only; **no** rollover to the next month — each month stands on its own and the balance resets at its start.
23. **Job-percentage change mid-month** → pro-rata quota.
24. **Paid absence for the entire month** → full quota credited, balance 0.
25. **Sick leave/vacation beyond the accrued balance** → the day is still credited toward the quota but flagged as a "quota overage"; the balance goes negative and an alert is produced (see 3.6).

### 6.5 Technical
26. **Connection loss mid-use** → data is already local (LocalStorage) and is not lost; no network sync needed in MVP (no PWA).
27. **Two open tabs** → state consistency / prevent overwrite.
28. **Browser cleanup / LocalStorage deletion** → an advance warning + a backup mechanism (4.2).
29. **Deleting an absence that affected an alert** → immediate recalculation.

---

## 7. Definition of Done
- Every calculation rule (section 3.0) is implemented and covered by unit tests.
- Every edge case (section 6) is handled or explicitly documented as "out of scope".
- All product decisions are approved and documented in the decisions table at the top of the document.
- The dashboard correctly shows "how much is left today/this month" and the alerts fire under the defined conditions.
- Data export and backup work end to end.
- *(Sync phase)* A user can log in, access the same data from two different devices, and migrate existing local data to the cloud account.
