# app/ — שכבה 3: Hooks וחיווט מצב

React Query כשכבת נתונים אחת ועקבית. מקשר רכיבים ↔ domain + repository.
מקור: DESIGN.md §7 · נבנה ב‑Milestone 3.

| נתיב | אחריות |
|------|---------|
| `App.tsx` | שורש האפליקציה (קיים — שלד) |
| `hooks/` | `useSettings`, `useTimeEntries`, `useAbsences`, `useMonthSummary`, `useClock` |
| `state/` | React Query client + app context (הזרקת ה‑Repository) |
| `routes.tsx` | ראוטינג (dashboard / reports / settings) |
