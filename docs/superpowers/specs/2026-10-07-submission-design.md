# Submission Phase — Design

| | |
|---|---|
| **Date** | 07/10/2026 |
| **Deadline** | ~14/10/2026 (one week) |
| **Status** | Approved in brainstorming; awaiting written-spec review |
| **Builds on** | [SPEC.md](../../SPEC.md), [DESIGN.md §9](../../DESIGN.md), [TASKS.md T13–T16](../../TASKS.md) |

## 1. Goal

Take the working local-first Hours Tracker to a deployable, submission-ready product for the vibe-coding course:

1. Live on **Vercel**.
2. Cloud data and login on **Supabase** (the already-planned sync phase, T13–T16).
3. **Security** aligned with Israeli privacy law — beyond what the law strictly requires for this database.
4. **Email** — monthly report and shortfall reminders.
5. **Payments** — a "Pro" upgrade via Stripe (test mode) with an auto-generated invoice.
6. **MCP** — used as development tooling; a small read-only product MCP server only if time remains.

### Priority if time runs short
Cut in this order: product MCP server → Pro reminders (keep the monthly report) → nothing else. Vercel, Supabase and security are not negotiable.

## 2. Architecture

```
Browser (React SPA)  ──HTTPS──►  Vercel
   │                              ├─ static site (Vite build)
   │                              └─ /api/*  serverless functions (Node + TS)
   │                                   • stripe-checkout, stripe-webhook
   │                                   • send-report (Gmail SMTP via nodemailer)
   │                                   • cron (daily reminders)
   │                                   • mcp (optional, read-only)
   └──► Supabase (EU region — Frankfurt)
          • Auth (email + password, email verification, TOTP 2FA)
          • Postgres + RLS + audit triggers
```

**Decision:** server code runs as **Vercel functions in `/api`**, not Supabase Edge Functions — one repo, one language/runtime, one test runner (vitest), one place for environment variables. Supabase is used only for the database and auth.

**Unchanged:** the `Repository` interface, the domain layer and the component tree (DESIGN.md §9.4). `SupabaseRepository` is added alongside `LocalStorageRepository`.

## 3. Security

### 3.1 Legal framing
The app holds personal data (work hours, sick leave, vacation), so it is subject to the **Privacy Protection Law, 1981** (incl. **Amendment 13**, in force since August 2025) and the **Privacy Protection Regulations (Data Security), 2017**. Under the regulations' tiers this database would be classified **basic / medium**; the "high" tier applies to very large or very sensitive databases. We implement **high-tier controls wherever they are technical**, and the security documentation states both the legal classification and what we exceeded.

### 3.2 Controls

| Area | Implementation |
|---|---|
| Identification & access | Supabase Auth; email verification; **TOTP 2FA** (Supabase MFA); minimum password policy |
| Data isolation | **RLS on every table** (`user_id = auth.uid()`); an automated test proving user B cannot read user A's rows |
| Encryption | HTTPS everywhere (Vercel); encryption at rest (Supabase); EU region — a permitted transfer destination from Israel |
| Audit log | `audit_log` table filled by Postgres triggers (login via a trigger on `auth.sessions`; insert/update/delete on user data); users can read only their own entries and cannot write or alter them |
| Data-subject rights | Full data export (existing JSON backup); **account deletion** (cascades all rows); privacy-policy page; explicit consent at sign-up |
| Web hardening | Security headers in `vercel.json` (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy); service-role and secret keys only server-side; **zod** validation of every `/api` input; rate limiting on `/api` |
| Payments | Stripe-hosted Checkout — card data never reaches our servers (PCI DSS SAQ-A); webhook **signature verification** |
| Supply chain / process | `npm audit`, Dependabot, `/security-review` before merging |
| Documentation | `docs/security/DATABASE-DEFINITION.md` (מסמך הגדרות מאגר) and `docs/security/SECURITY-PROCEDURE.md` (נוהל אבטחת מידע) |

**Out of scope (documented, not implemented):** formal risk survey and external penetration test — organizational processes that a production deployment would add.

## 4. Data model additions

On top of DESIGN.md §9.2 (`settings`, `time_entries`, `absences`):

```sql
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  consent_at timestamptz not null,
  email_reports boolean not null default true,
  stripe_customer_id text
);

create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  action text not null,          -- 'login' | 'insert' | 'update' | 'delete'
  table_name text,
  row_id text,
  at timestamptz not null default now()
);

create table payments (
  id text primary key,           -- Stripe checkout session id
  user_id uuid not null references auth.users on delete cascade,
  amount int not null, currency text not null,
  invoice_url text,
  created_at timestamptz not null default now()
);
```

All user-data foreign keys use `on delete cascade` so account deletion removes everything. `profiles.plan` and `payments` are written **only** by the server (service role, from the Stripe webhook) — RLS grants users `select` only.

## 5. Features

### 5.1 Email (Gmail SMTP)
- **Transport:** `nodemailer` over Gmail SMTP (`smtp.gmail.com:465`) from a dedicated project Gmail account, authenticated with a Google **App Password** (requires 2-Step Verification on that account). Delivers to any recipient, free.
- **Monthly report** (Pro): on the 1st, a Vercel Cron job sends the previous month's summary (worked / required / balance, absences) to each Pro user with `email_reports = true`. Reuses the existing domain functions (`buildMonthSummary`).
- **Shortfall reminder** (Pro): daily cron, within the existing alert lead-days window, if the user is behind the quota.
- **Auth emails:** Supabase Auth custom SMTP points at the same Gmail account (sign-up verification, password reset), avoiding Supabase's default rate limit.
- **Limitations:** ~500 recipients/day; sender is the `@gmail.com` address, not an app domain — sufficient for the submission; stated in the README.
- **Security:** the App Password lives only in Vercel environment variables / Supabase SMTP settings; it is revocable without changing the account password.
- **Not used:** Google Cloud offers no free sending domain and blocks outbound SMTP from its VMs; Google Workspace (custom domain) is paid.

### 5.2 Payments (Stripe, test mode)
- "Upgrade to Pro" → `POST /api/stripe-checkout` creates a Checkout Session (one-time payment, `invoice_creation.enabled = true`).
- `POST /api/stripe-webhook` verifies the signature, on `checkout.session.completed` sets `profiles.plan = 'pro'` and records the payment with the invoice URL.
- Settings shows the plan and a link to the invoice.
- README notes that a production Israeli deployment would swap in a local provider (Morning / Cardcom / iCount) for a legal tax invoice (חשבונית מס).

### 5.3 MCP
- **Development (required):** Supabase MCP and Vercel MCP connected to Claude Code; used for migrations and deployments. Documented in the README as part of the vibe-coding workflow.
- **Product (optional, day 7):** `/api/mcp` exposing read-only tools (`get_month_summary`, `list_entries`) authenticated with the user's Supabase token.

## 6. Error handling
- Supabase unreachable → the existing React Query error states; no silent fallback to local storage after login.
- Webhook failures return non-2xx so Stripe retries; handler is idempotent (`payments.id` primary key).
- Email send failures are logged and do not fail the cron run for other users.

## 7. Testing
- Existing hook/UI tests run unchanged against `SupabaseRepository` (TASKS T15 DoD).
- RLS isolation test with two real test users against the Supabase project.
- Unit tests for `/api` handlers: input validation, webhook signature rejection, idempotency.
- Manual end-to-end checklist before submission: sign-up → 2FA → log hours → second device → upgrade → invoice → email received → delete account.

## 8. Schedule

| Day | Work | Done when |
|---|---|---|
| 1 | Connect Supabase + Vercel MCP; first Vercel deploy; security headers | Live URL |
| 2 | Schema, RLS, audit triggers, isolation test (T13); login + 2FA (T14) | Login works |
| 3 | `SupabaseRepository` (T15); local → cloud migration (T16) | Same data on two devices |
| 4 | Account deletion, privacy policy + consent, rate limiting, security documents | Security complete |
| 5 | Monthly report + reminder emails | Real email received |
| 6 | Stripe Checkout, webhook, invoice, Pro gating | Test payment end-to-end |
| 7 | Buffer; optional product MCP; `/security-review`; README; presentation | Ready to submit |

## 9. Accounts and secrets (owner: user)
GitHub (exists), Vercel, Supabase (Frankfurt region), Stripe (test mode), a dedicated Gmail account with 2-Step Verification + App Password. Secrets are entered by the user into Vercel environment variables and a git-ignored `.env.local` — never pasted into chat or committed.
