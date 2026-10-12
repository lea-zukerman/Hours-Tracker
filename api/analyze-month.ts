import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * POST /api/analyze-month — "ניתוח AI של החודש".
 *
 * The browser sends only the month's computed summary (numbers and enums — no
 * name, email, employer or notes; the schema rejects anything else), and the
 * server asks Google Gemini for a short Hebrew analysis. The Gemini key lives
 * only in the Vercel environment. Self-contained on purpose (no local imports):
 * Vercel bundles each function file on its own.
 */

const Minutes = z.number().int().min(-100_000).max(100_000);
const Days = z.number().min(0).max(31);

export const MonthInput = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  workedMinutes: Minutes,
  creditedMinutes: Minutes,
  quotaMinutes: Minutes,
  balanceMinutes: Minutes,
  remainingWorkdays: z.number().int().min(0).max(31),
  requiredPerDayMinutes: Minutes.nullable(),
  status: z.enum(['surplus', 'deficit', 'on_track', 'cannot_complete']),
  daysWorked: z.number().int().min(0).max(31),
  longDays: z.number().int().min(0).max(31),
  dailyTargetMinutes: z.number().int().min(0).max(1440),
  absenceDays: z.strictObject({
    vacation: Days,
    sick: Days,
    holiday: Days,
    reserve: Days,
    unpaid: Days,
  }),
});
export type MonthInputT = z.infer<typeof MonthInput>;

export interface AnalyzeDeps {
  /** Verified user id for a Supabase access token, or null. */
  verifyUser(token: string): Promise<string | null>;
  /** One hit against the per-user limit; true = allowed. */
  allow(userId: string): boolean;
  generate(prompt: string): Promise<string>;
}

const SYSTEM_INSTRUCTION = `אתה העוזר החכם של "כל שעה", אפליקציה שבה עובדים שכירים בישראל מתעדים את שעות העבודה שלהם.
תקבל סיכום מספרי של חודש עבודה אחד. כתוב בעברית פשוטה וחמה ניתוח קצר (עד 140 מילים) בשלוש פסקאות קצרות:
1. איך החודש נראה: שעות שבוצעו מול המכסה, והיתרה.
2. מה בולט: ימים ארוכים מהתקן, היעדרויות. אם יש ימים ארוכים מהתקן, ציין שייתכן שמגיע גמול שעות נוספות לפי חוק שעות עבודה ומנוחה (125% לשעתיים הראשונות ביום, 150% מעבר להן), ושכדאי לבדוק בתלוש ובאתר כל-זכות.
3. המלצה מעשית לימים שנותרו בחודש.
כללים: השתמש רק במספרים שבסיכום ואל תמציא נתונים. כתוב שעות בפורמט ש:דד. בלי כותרות, בלי Markdown, בלי כוכביות. פנה למשתמש בלשון רבים ("עבדתם"). זה אינו ייעוץ משפטי.`;

const STATUS_HE: Record<MonthInputT['status'], string> = {
  surplus: 'עודף שעות',
  deficit: 'חוסר שעות',
  on_track: 'בקצב',
  cannot_complete: 'לא ניתן להשלים את המכסה החודש',
};

/** Minutes → "ש:דד" (e.g. -4440 → "-74:00"). */
function hm(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/** The user-turn text: the summary only. */
export function buildPrompt(s: MonthInputT): string {
  const a = s.absenceDays;
  return [
    `חודש: ${s.month}`,
    `שעות שבוצעו: ${hm(s.workedMinutes)}`,
    `שעות שנזקפו (כולל היעדרויות בתשלום): ${hm(s.creditedMinutes)}`,
    `מכסה חודשית: ${hm(s.quotaMinutes)}`,
    `יתרה: ${hm(s.balanceMinutes)} (${STATUS_HE[s.status]})`,
    `ימי עבודה שנותרו: ${s.remainingWorkdays}`,
    `נדרש ביום כדי להשלים: ${s.requiredPerDayMinutes === null ? 'אין ימים שנותרו' : hm(s.requiredPerDayMinutes)}`,
    `ימים שבהם עבדו: ${s.daysWorked}`,
    `תקן יומי: ${hm(s.dailyTargetMinutes)}`,
    `ימים ארוכים מהתקן: ${s.longDays}`,
    `היעדרויות (ימים) — חופשה: ${a.vacation}, מחלה: ${a.sick}, חג: ${a.holiday}, מילואים: ${a.reserve}, ללא תשלום: ${a.unpaid}`,
  ].join('\n');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0 || text.length > 4096) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createAnalyzeHandler(deps: AnalyzeDeps) {
  return async function handle(request: Request): Promise<Response> {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
    const userId = match ? await deps.verifyUser(match[1]).catch(() => null) : null;
    if (!userId) return json(401, { error: 'unauthorized' });
    if (!deps.allow(userId)) return json(429, { error: 'rate_limited' });

    const input = MonthInput.safeParse(await readJson(request));
    if (!input.success) return json(400, { error: 'invalid_input' });

    try {
      const text = (await deps.generate(buildPrompt(input.data))).trim();
      if (!text) return json(503, { error: 'unavailable' });
      return json(200, { text });
    } catch (err) {
      console.error(
        'analyze-month: provider failed:',
        err instanceof Error ? err.message : 'unknown',
      );
      return json(503, { error: 'unavailable' });
    }
  };
}

// ---- production wiring -------------------------------------------------------

const LIMIT = 10; // analyses per user per hour (also protects the free Gemini quota)
const hits = new Map<string, number[]>();

/** Per-instance sliding window — enough for a demo; the Gemini quota is the hard cap. */
function allowInMemory(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

function productionDeps(): AnalyzeDeps {
  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!url || !publishableKey || !geminiKey) throw new Error('Server misconfigured');

  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  return {
    verifyUser: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    allow: allowInMemory,
    generate: async (prompt) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION, maxOutputTokens: 4096 }, // room for the model's own thinking
      });
      return response.text ?? '';
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  let deps: AnalyzeDeps;
  try {
    deps = productionDeps();
  } catch (err) {
    console.error('analyze-month:', err instanceof Error ? err.message : 'unknown');
    return json(503, { error: 'unavailable' });
  }
  return createAnalyzeHandler(deps)(request);
}
