# data/ — שכבה 2: אחסון מאחורי ממשק אחד

הגבול הקבוע שהופך local-first → Supabase להחלפה של שכבה אחת.
מקור: DESIGN.md §5 · נבנה ב‑Milestone 2.

| קובץ | אחריות |
|------|---------|
| `Repository.ts` | הממשק (החוזה) + `DatasetSnapshot` |
| `LocalStorageRepository.ts` | מימוש מעל LocalStorage עם מפתחות עם namespace |
| `serialization.ts` | (de)serialize של הנתונים + `schemaVersion` + מיגרציות |
| `backup.ts` | ייצוא/ייבוא של כל מערך הנתונים |
| `SupabaseRepository.ts` | *(Milestone 9 — post-MVP)* |
