# domain/ — שכבה 1: ליבת החישובים (טהורה)

פונקציות טהורות בלבד. **אין React, אין אחסון.** כל המתמטיקה בדקות שלמות.
מקור: DESIGN.md §3, §6 · נבנה ב‑Milestone 1.

| קובץ | אחריות |
|------|---------|
| `types.ts` | מודל הנתונים (User, Settings, Shift, TimeEntry, Absence, MonthSummary…) |
| `time.ts` | משך משמרת, חציית חצות, DST |
| `calculations.ts` | worked, credited, balance, מכסה, תחזית, required-per-day |
| `absences.ts` | מאזן צבירת היעדרויות |
| `alerts.ts` | גזירת התראות פעילות ממצב החודש |
| `validation.ts` | בדיקת תקינות רשומת זמן |
| `*.test.ts` | טסטי Vitest co-located ליד כל מודול (עוזרי הטסט המשותפים ב-`src/test/`) |
