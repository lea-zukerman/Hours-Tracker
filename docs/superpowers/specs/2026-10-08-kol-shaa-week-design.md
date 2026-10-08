# "כל שעה" — Submission Week Design (rights checker, AI, compliance, email, payments)

| | |
|---|---|
| **Date** | 08/10/2026 |
| **Deadline** | Wednesday 14/10/2026 (submission). Work days: Fri 9, Sun 11, Mon 12, Tue 13, Wed 14 morning (no Saturday). |
| **Status** | Approved section by section in brainstorming; awaiting written-spec review |
| **Supersedes** | [2026-10-07-submission-design.md](2026-10-07-submission-design.md) §5 (features) and §8 (schedule). Its §2 architecture, §3 security and §4 data model still hold; changes below are additive. |
| **Graded on** | The live site + a presentation (no video). Course requires "connected to an MCP": met by the Supabase and Vercel MCP servers used for development (README). A product MCP server is **not** required and is out of scope. |

---

## 1. Product and positioning

**Name:** **כל שעה**. **Slogan:** "כל שעה נחשבת". The app is still `hours-tracker` in code and URLs. Only the visible brand changes (title, header, landing page, emails, manifest name, documents).

**What it is:** an employee's **own** time tracker (not the employer's), with an add-on that turns the hours already logged into the rights they create under Israeli labour law. **Hour tracking is the core; rights are the differentiator.** Copy always leads with tracking.

**Audience:** all salaried employees in Israel. Copy is gender-inclusive plural ("תדעו", "עובדים ועובדות"). Examples rotate between personas (shift worker, student, full-time office employee).

**Problem:** employees rarely know how much overtime they accrued, what sick days pay, or whether recuperation pay is due. Payslips are opaque and mistakes happen. Without one's own record of hours, a dispute has no evidence.

**Differentiation (presentation slide):**

| Exists today | What it lacks |
|---|---|
| Employer time clocks (Hilan, Synel) | Owned by the employer; the employee sees what the employer shows |
| One-off calculators (JobCalc etc.) | Manual input every time; no history |
| Kol-Zchut | General rules; knows nothing about *your* hours |
| Spreadsheet / phone notes | No law, no calculation, no backup |

One line: "שעון הנוכחות שלכם, לא של הבוס, שגם יודע מה מגיע לכם."

**Business model:** freemium. Tracking and the rights checker (all calculations, ₪ amounts) are free. **Pro** = AI assistant (unlimited within fair-use limits), monthly email report, shortfall reminders, report-to-employer. **14.90 ₪/month or 149 ₪/year**, Stripe, test mode.

**Go-to-market (presentation slide):** search content answering "כמה מגיע לי על שעות נוספות" queries; student unions and employee Facebook groups; partnerships with worker organisations (Histadrut, Koach La'Ovdim); word of mouth ("the app found I was owed 600 ₪").

**Vision (presentation slide only, not built):** "כל שעה לעסקים": teams, manager approval, compliance check per employee; more languages (Arabic, Russian, English); multiple employers per account; 6-day work week.

---

## 2. Scope

**In (must ship):** rights checker; AI chat (Pro + 3 free questions/month); legal pages (terms, privacy, accessibility statement) and consent; accessibility pass with automated axe tests and our own accessibility menu; Gmail email (auth emails, monthly report, report-to-employer); Stripe subscriptions (monthly + yearly) with customer portal; landing page; dark mode; demo account; presentation; everything in the existing Day 4 plan (account deletion, rate limiting, security documents, hardening).

**Stretch (only after all "In" items work in production), in this order:** payslip comparison ("you were paid X, the law says Y, gap Z"), AI letter to employer (Pro), free-text time entry via AI.

**Cut order if behind (first cut first):** shortfall reminder email → report-to-employer → yearly plan → dark mode → accessibility menu (the accessibility *pass* and statement are never cut). Never cut: rights checker, AI chat, monthly report email, Stripe monthly subscription, legal pages, landing page.

**Out:** product MCP server, PWA/install, multiple employers, 6-day week, minors (service is 18+), languages other than Hebrew, collective agreements / extension orders beyond the general law, organisation/multi-tenant mode.

---

## 3. Rights checker (free)

### 3.1 Inputs

Existing: time entries (shifts, breaks, manual minutes), absences (vacation, sick, holiday, reserve, unpaid), settings (job percent, daily target, accruals).

New settings (all optional, stored in `settings`, owner-only via existing RLS):

| Field | Column | Notes |
|---|---|---|
| Employment start date | `employment_start date` | Seniority for vacation and recuperation |
| Wage type | `wage_type text check (wage_type in ('hourly','monthly'))` | |
| Wage amount (₪) | `wage_amount numeric check (wage_amount > 0 and wage_amount < 1000000)` | Monthly wage → hourly = monthly ÷ 182 (full-time divisor), scaled by job percent |
| Global overtime in contract | `global_overtime boolean not null default false` | When true, overtime hours are shown but ₪ amounts are replaced by an explanation of when global overtime does not cover actual hours |

Without a wage, every card shows hours/days/percentages and a prompt "הזינו שכר בהגדרות כדי לראות סכומים".

### 3.2 Rules (general law, 5-day week, adults)

All numbers live in one module (`src/domain/rights/rules.ts`) with the source URL and "verified on" date beside each constant. Values below were checked on 08/10/2026; the implementation task re-verifies each against Kol-Zchut / gov.il and records the source.

| Right | Rule implemented |
|---|---|
| **Overtime (daily, then weekly)** | Day standard 8.6 h (one shorter day of 7.6 h is not modelled; the user's `daily_target` setting is used, default 8:36). Hours above the day standard: first 2 at 125%, the rest at 150%. Then, per Sun–Sat week, regular hours above **42** count as overtime at 125% (only hours not already counted daily). |
| **Night shift** | A shift with ≥ 2 hours between 22:00 and 06:00 has a **7-hour** day standard; overtime starts after 7 h. |
| **Rest-day work** | Hours on Saturday or on an official holiday: at least 150%. Shown separately. |
| **Breaks** | A day with ≥ 6 h worked and < 45 min break is flagged (informational: "the law requires a 45-minute break, of which 30 consecutive; some workplaces are exempt"). |
| **Weekly rest** | A week without 36 consecutive hours of rest (from the shifts' timestamps) is flagged. |
| **Weekly overtime cap** | Weeks above the legal weekly overtime maximum are flagged (value per rules module after verification). |
| **Sick pay** | Per consecutive sick run: day 1 0%, days 2–3 50%, day 4+ 100%, while the accrued balance lasts (1.5 days/month, max 90). |
| **Annual vacation** | Entitlement by seniority per the law's minimum table for a 5-day week (net days), compared with the user's accrual setting. When sources disagree, the law minimum is shown with "ייתכן שמגיע יותר לפי צו הרחבה או הסכם". |
| **Recuperation pay (havra'a)** | After the first year: days by seniority (5/6/7/8/9/10) × 451.5 ₪ (private sector, 2026) × job percent. |
| **Holidays** | Israeli holiday calendar 2026–2027 is a static list in code; holidays reduce the monthly quota (as absences of type `holiday` do today) and are marked in the calendar, but are not written to the database. |

### 3.3 Output and UI

New tab **"הזכויות שלי"** with a month/year toggle.
- One card per right: a headline number ("6.5 שעות נוספות · כ-412 ₪"), a per-day/per-run breakdown, a "מה אומר החוק" line and a link to the Kol-Zchut source.
- **Year view:** total overtime and ₪, sick and vacation days used versus entitlement, and recuperation pay.
- A permanent disclaimer: "חישוב לפי החוק הכללי בלבד, לשבוע עבודה של 5 ימים. הסכם קיבוצי, צו הרחבה או חוזה אישי עשויים להיטיב. אין באמור ייעוץ משפטי."

### 3.4 Architecture

- Pure domain functions in `src/domain/rights/` with no I/O, consumed by a `useRights(period)` hook.
- Output type `RightsSummary`, a plain JSON-serialisable object. It is the **only** data the AI layer receives (§4.3).
- Heavy unit tests per rule, including the boundary cases (exactly 2 overtime hours, a shift crossing midnight, a night shift, a sick run crossing a month boundary, a week spanning two months).

---

## 4. AI assistant "שאלו על הזכויות שלכם" (Pro; 3 free questions/month)

### 4.1 UX

- **Placement:** a chat panel under the rights cards, with suggestion chips ("כמה מגיע לי על השעות הנוספות החודש?", "מה מגיע לי על 3 ימי מחלה?", "מתי מגיעים לי דמי הבראה?", "מגיעה לי הפסקה?").
- **Responses:** answers stream in. Each answer ends with a source link when one applies.
- **Free users:** see "נותרו X מתוך 3 שאלות החודש". After that, an upgrade CTA.
- **Consent:**
  - On first use, a dialog appears: "התשובות מופקות באמצעות Google Gemini בשכבה החינמית. Google עשויה להשתמש בשאלות ובתשובות לשיפור שירותיה, וייתכן שבודקים אנושיים יקראו אותן. לכן נשלחים רק נתוני סיכום אנונימיים — בלי שם, אימייל, מעסיק או הערות. אל תכתבו פרטים מזהים בשאלה."
  - Buttons: "אני מסכים/ה" / "לא עכשיו".
  - Consent is stored as `profiles.ai_consent_at timestamptz`, revocable in Settings (sets it to null).
- **Session-only history:** the conversation lives in the page only. It is not stored on the server and is cleared on reload.

### 4.2 Provider

**Google Gemini API, free tier**, via the official Google Gen AI SDK, server-side only.
- **Model:** set by the env var `GEMINI_MODEL`, chosen on implementation day: the current recommended *Flash* model available on the free tier, verified in AI Studio.
- **Key:** `GEMINI_API_KEY` (Vercel *Sensitive*).
- **Adapter:** the provider sits behind `api/_lib/ai.ts` (`streamAnswer(input): AsyncIterable<string>`), so a paid provider can replace it without touching anything else.
- **Never** use the user's personal Claude subscription credentials: it is against Anthropic's terms, insecure, and unreliable.

### 4.3 Data minimisation (required by the free tier terms)

Google's free-tier terms allow product-improvement use and human review, and advise against sending personal or sensitive information. Therefore:
- **The request body is validated by zod and contains only:**
  - `question` (≤ 500 chars).
  - `history` (≤ 6 prior turns, each ≤ 1500 chars).
  - `summary`: a `RightsSummary` limited to numbers, enums and ISO dates. It has no name, email, employer, notes or wage; ₪ amounts are rounded to whole shekels.
- **Scrubbing:** before sending, the server removes email addresses, Israeli phone numbers and 9-digit ID-like sequences from `question` and `history`, and replaces them with "[הוסר]".
- **Logging:** nothing from the request is logged. Only counts go to the rate-limit table.
- **Disclosure:** the privacy policy names Google as a processor for this feature, with the same disclosure as the consent dialog.

### 4.4 Server: `POST /api/ask`

- **Pipeline:** rate limit by IP → verify the caller → require `ai_consent_at` → check quota → validate → scrub → build the prompt → stream the response (`text/plain; charset=utf-8`).
- **Quota:**
  - Free users: 3 per calendar month (Asia/Jerusalem).
  - Pro users: 30 per hour and 300 per month (fair use).
  - All counters use the Day 4 `rate_limit_hit` function. The monthly key includes `YYYY-MM`.
- **Prompt:** a fixed system instruction plus a curated **knowledge base** (`api/_lib/knowledge/he-labor-rights.md`).
  - The knowledge base covers the rights in §3.2 plus holiday pay, travel expenses, pension, notice period, severance and minimum wage. Each item has its source URL and verification date.
  - Then comes the user's `RightsSummary` as JSON, then the conversation.
- **Instructions to the model:**
  - Answer in Hebrew.
  - Answer only about working hours and Israeli employment rights, and politely decline anything else.
  - Take numbers only from the summary or the knowledge base, never invent them.
  - Cite the source.
  - Say "כדאי לבדוק מול..." when unsure.
  - End advice-like answers with the disclaimer.
- **Errors (closed set):**
  - `401` not signed in.
  - `403 consent_required`.
  - `402 quota_exhausted` (free).
  - `429 rate_limited`.
  - `400 invalid_input`.
  - `503 unavailable` (provider error or limiter error, fail closed).
  - The UI maps each to Hebrew. A provider-side free-tier 429 maps to `503` with "השירות עמוס, נסו שוב בעוד דקה".

### 4.5 Quality check before wiring (no cost)

Before the endpoint is built, the system instruction, knowledge base and a sample `RightsSummary` are assembled into one text. The user pastes it into her own Claude or Gemini chat and asks the suggestion-chip questions. Iterate until answers are correct and well-cited. Automated tests use a fake provider.

---

## 5. Legal compliance (Israel)

| Requirement | Implementation |
|---|---|
| **Accessibility** (Equal Rights for Persons with Disabilities regulations; IS 5568, based on WCAG 2.0 AA) | Pass over every screen: keyboard operability, visible focus, "דלג לתוכן" skip link, landmarks, labels and `aria-describedby` errors, contrast ≥ 4.5:1, `prefers-reduced-motion`, 200% zoom without loss. **Automated axe checks** in the test suite for every page (`vitest-axe`). |
| **Accessibility menu** | Our own, no third-party overlay. A fixed "נגישות" button opens a panel with text size (3 steps), high contrast, link highlighting and stop animations. Settings are stored in localStorage and applied with root classes. |
| **Accessibility statement** | `/accessibility` (public): standard, level, what was done, known gaps, date, and an accessibility coordinator contact (same contact as privacy). |
| **Terms of use (תקנון)** | `/terms` (public): service description; 18+; account rules; no legal advice and limitation of liability; AI answers may be wrong; **subscription terms** (price, auto-renewal monthly/yearly, cancel any time online from Settings → "ניהול מנוי" via Stripe portal, effective at period end, no cancellation fee, the Consumer Protection Law's cancellation rights for remote transactions); governing law Israel; contact. |
| **Privacy policy** | `/privacy` (Day 4 plan) extended with: optional wage data, Gemini processing (§4.3), Stripe as payment processor (card data never reaches us), Gmail for email, report-to-employer (sent only on the user's click, to the address she entered). |
| **Consent at sign-up** | Checkbox: "קראתי ואני מסכים/ה ל[תקנון] ול[מדיניות הפרטיות], ואני בן/בת 18 ומעלה". Required in the UI and enforced by the existing DB trigger (consent flag). |
| **Footer** | On every page, including landing and login: links to terms, privacy, accessibility statement; contact email. |
| **Anti-spam (Communications Law §30A)** | Monthly report and reminders go only to users with `email_reports = true` (opt-in toggle in Settings, default **off** for new users). Every such email has a one-click unsubscribe link (signed token, `GET /api/unsubscribe`). Report-to-employer is a one-off message initiated by the user, sent with `Reply-To` = the user's address and a line "נשלח ביוזמת <email> דרך כל שעה". |

Owner name and contact email are user-chosen values in `src/features/legal/contact.ts` (the Day 4 plan's `privacyContact.ts` moves here). The contact is the project Gmail.

---

## 6. Email (Gmail SMTP)

- **Transport:** `nodemailer` over `smtp.gmail.com:465` from a dedicated project Gmail with 2-Step Verification + App Password. Env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME="כל שעה"`.
- **Auth emails:** Supabase Auth → custom SMTP pointed at the same account (user configures it in the dashboard), with Hebrew templates for confirm sign-up and reset password.
- **Templates:** HTML + text, RTL, inline styles, brand header, footer with unsubscribe (where applicable) and contact. Built by pure functions (`api/_lib/email/templates.ts`) with snapshot tests.
- **Monthly report (Pro, `email_reports = true`):** sent on the 1st at 08:00 Asia/Jerusalem for the previous month. Contents: worked vs required, balance, absences, and rights summary (overtime, sick pay, flags). In Settings, a **"שלחו לי את הדוח עכשיו"** button sends the current month on demand (rate-limited 3/day).
- **Shortfall reminder (Pro):** sent daily inside the existing alert lead-days window when behind quota, at most once per month per user.
- **Report to employer (Pro):**
  - Settings holds `profiles.manager_email`, and the user can update it.
  - Reports has a button "שליחת דוח למעסיק", which shows a preview and a checkbox "לצרף סיכום שעות נוספות" (default off), then sends.
  - Rate-limited to 5/day per user.
- **Scheduling:** one Vercel Cron job (`vercel.json` `crons`), daily at 05:00 UTC, calls `GET /api/cron-daily` with `Authorization: Bearer ${CRON_SECRET}`.
  - It sends monthly reports on the 1st (Israel date) and reminders on other days.
  - Each user is handled independently; a failure is logged (user id only) and the run continues.
  - Idempotency: a `email_log(user_id, kind, period)` unique row is inserted before sending, so a re-run does not double-send.
- **Limits:** about 500 recipients per day (Gmail). The sender is `@gmail.com`; stated in the README.

---

## 7. Payments (Stripe, test mode)

- **Products:** one product "כל שעה Pro" with two prices, **14.90 ILS/month** and **149 ILS/year**, created in the Stripe dashboard. Their IDs are in env vars `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
- **`POST /api/stripe-checkout`** `{ interval: 'month' | 'year' }`: creates or reuses the Stripe customer (`profiles.stripe_customer_id`), then creates a Checkout Session in `mode: 'subscription'` with success and cancel URLs back to Settings, and returns the URL.
- **`POST /api/stripe-portal`:** creates a Billing Portal session for the customer and returns its URL. The portal is configured to allow cancellation at period end and to show invoices.
- **`POST /api/stripe-webhook`:**
  - Verifies the signature (`STRIPE_WEBHOOK_SECRET`) on the raw body.
  - Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted` and `invoice.paid`.
  - Writes server-only columns on `profiles`: `plan`, `subscription_status`, `subscription_interval`, `current_period_end`.
  - Idempotent via `stripe_events(id primary key)`.
  - Non-2xx on failure, so Stripe retries.
- **Pro check:** `plan = 'pro'` and `subscription_status in ('active','past_due')` and `current_period_end > now()`. Implemented once as the SQL function `public.is_pro(uuid)`, used by `/api` handlers.
- **UI:**
  - Pricing appears on the landing page and in Settings, with a monthly/yearly toggle.
  - Settings shows the plan, renewal date and "ניהול מנוי" (portal), which covers invoices and cancel.
- **Invoices:** Stripe-generated per payment. The README and presentation note that production in Israel would use a local provider (Morning / Cardcom / iCount) for a legal tax invoice.
- **Account availability:** Stripe accounts are not offered in every country. Test mode only needs a test account. If Israel is not selectable, the account is created under a supported country for **test mode only**; this is documented as a deployment note.
- **Account deletion (Day 4):** extended to cancel an active subscription immediately before deleting the user.

---

## 8. Design, landing page, demo

- **Landing page:**
  - **Where:** at `/` when signed out; the login and sign-up form moves to `/login`.
  - **Hero:** "כל שעה נחשבת", with a sub-line about tracking, plus rights in shekels.
  - **Features:** three features (tracking · rights checker · AI assistant).
  - **Visuals:** app screenshots rendered from the demo account.
  - **Pricing:** free vs Pro, with a monthly/yearly toggle.
  - **Footer:** the legal links.
- **Visual polish:**
  - Consistent spacing and typography across every screen.
  - Loading skeletons, empty states and error states.
  - Icons.
  - Mobile layout checked at 375 px.
  - "הזכויות שלי" is the flagship page.
- **Dark mode:**
  - Follows `prefers-color-scheme`, with a toggle stored in localStorage.
  - Implemented by redefining the existing tokens in `src/ui/tokens.css`.
  - Both themes are checked by axe for contrast.
- **Demo account:**
  - `supabase/seed/demo.sql` fills **an existing** account (looked up by email; the user signs it up first) with 3 months of realistic data: overtime days, one night shift, a 3-day sick run, a vacation week, a short-break day, a Saturday shift, a holiday, plus wage and start date.
  - The user runs it in the SQL Editor.
  - It is re-runnable: it deletes that account's entries/absences first, so the presentation starts clean.
- **Presentation:** a slide deck covering problem, solution, a live demo script (step-by-step clicks with the demo account and Stripe test card), architecture, security and privacy under Israeli law, how it was built with Claude Code + MCP, business model, and vision. It is produced on Wednesday morning.

---

## 9. Architecture deltas

**Vercel functions (`api/`):**

| Function | Purpose |
|---|---|
| `delete-account` | Day 4 |
| `ask` | AI chat |
| `stripe-checkout` | Start a subscription |
| `stripe-portal` | Manage subscription |
| `stripe-webhook` | Subscription state |
| `send-report` | `{ to: 'me' \| 'employer' }` on-demand reports |
| `cron-daily` | Monthly reports + reminders |
| `unsubscribe` | One-click opt-out |

All share `api/_lib/` (http, caller, rate limit, admin client) from the Day 4 plan, plus `ai.ts`, `email/`, `stripe.ts`, and `rights` (the server imports the domain rights module for emails: see note).

> **Note — sharing domain code with `api/`:** email reports need the rights calculation server-side. The domain modules are pure TS but import siblings with `.ts` extensions. The implementation plan must decide one of: (a) the email endpoints receive no precomputed data and the server recomputes using the domain module, made importable by switching `src/domain` imports to extensionless/`.js` style under a shared tsconfig; or (b) a build step bundles `api/` with esbuild. (a) is preferred. The plan's first API task proves it with a deployed smoke test before anything depends on it.

**Data model (one migration per feature day):**
- `settings`: `employment_start`, `wage_type`, `wage_amount`, `global_overtime`.
- `profiles`:
  - User-writable: `ai_consent_at` and `manager_email` (column grants extended).
  - Server-only: `subscription_status`, `subscription_interval`, `current_period_end`.
  - `email_reports` default changes to `false` for new rows.
- New tables:
  - `stripe_events(id text primary key, received_at)`, server-only.
  - `email_log(user_id, kind, period, sent_at, unique(user_id, kind, period))`, server-only.
- New function: `public.is_pro(uuid)`.
- RLS and SQL tests extended for every new column and table: users cannot write server-only columns; other users cannot read them.

**Env vars (all entered by the user in Vercel; never in chat or git):** `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET`.

**CSP (`vercel.json`):** `connect-src` stays `'self'` + Supabase (AI and Stripe calls go through our `/api`). `form-action` already allows `checkout.stripe.com`. The Stripe portal and Checkout are full-page redirects.

---

## 10. Testing

- **Rights rules:** unit tests per rule and boundary (§3.4). This is the largest test addition.
- **`/api` handlers:** validation, auth, quota/rate limit, fail-closed, Stripe signature rejection and idempotency, cron idempotency. Fakes for Gemini, Stripe, SMTP and Supabase admin.
- **Accessibility:** axe on every page component in both themes.
- **SQL tests:** new columns/tables/grants and `is_pro`.
- **Production E2E checklist (Wednesday morning):**
  - Landing → sign up (consent) → log hours → rights page.
  - 3 free AI questions → upgrade (test card) → Pro chat.
  - "send me the report now" → email received.
  - Report to employer → received.
  - Portal cancel.
  - Accessibility menu, dark mode.
  - Delete a throwaway account.

---

## 11. Schedule

| Day | Work | Done when |
|---|---|---|
| **Fri 9/10** (short day) | Day 4 plan (hardening, `/api` foundation, account deletion, privacy, auth robustness, safe restore, security docs) + `/terms` and `/accessibility` pages + footer + rename to "כל שעה" | Deletion works in prod; legal pages live |
| **Sun 11/10** | Rights checker: rules module + tests, settings fields + migration, "הזכויות שלי" page (month/year), holidays, night shift | Rights page correct on demo data |
| **Mon 12/10** | AI quality check (§4.5) → `/api/ask` + chat UI + consent + quota; Gmail transport + templates + "send me now" + report-to-employer + cron + unsubscribe | Real AI answer and real email received in prod |
| **Tue 13/10** | Stripe subscriptions + portal + webhook + Pro gating; accessibility pass + axe + menu; landing page; dark mode; demo seed | Test payment end-to-end; axe clean |
| **Wed 14/10 (morning)** | Presentation, README, full E2E checklist, submit | Submitted |

**Accounts the user opens on Friday morning** (so no day is blocked):
1. A project Gmail (2-Step Verification + App Password).
2. A Google AI Studio API key.
3. A Stripe test account.

Each comes with step-by-step guidance; NetFree unblocks may be needed.

**Process per day:** one implementation plan per day (writing-plans), executed inline on `main`, a fresh-reviewer pass at the end of the day, and a push only after the user approves.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Too much for 4.5 days | Cut order §2; stretch items only after "In" ships |
| Gemini free tier: data use / human review | §4.3 minimisation, scrubbing, honest consent + privacy text |
| Gemini free-tier quota or model changes | Model from env var; 503 with a friendly message; quality test early Monday |
| Legal numbers wrong | Single rules module with sources and dates; tests; permanent disclaimer; "law minimum" when sources disagree |
| `api/` cannot import domain code on Vercel | Proven by a deployed smoke test in the first API task (§9 note) |
| NetFree blocks a service | Accounts opened Friday morning; ask for unblocks early |
| Stripe country availability | Test-mode account under a supported country if needed; documented |
