import { useState } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useSettings } from '../../app/hooks/useSettings.ts';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { useAbsences } from '../../app/hooks/useAbsences.ts';
import { useMonthSummary } from '../../app/hooks/useMonthSummary.ts';
import {
  buildInsightInput,
  requestInsight,
  type InsightInput,
  type InsightResult,
} from './aiInsight.ts';

const ERRORS: Record<Exclude<InsightResult, { ok: true }>['error'], string> = {
  rate_limited: 'הגעתם למכסת הניתוחים לשעה. נסו שוב מאוחר יותר.',
  unavailable: 'שירות ה-AI עמוס כרגע. נסו שוב בעוד דקה.',
  network: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט.',
  unauthorized: 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.',
};

/**
 * "ניתוח AI של החודש": sends the month's summary numbers (nothing identifying)
 * to /api/analyze-month and shows Gemini's short Hebrew analysis.
 */
export function AiInsightCard({
  month,
  today,
  zone,
  analyze = requestInsight,
}: {
  month: string;
  today: string;
  zone: string;
  analyze?: (input: InsightInput) => Promise<InsightResult>;
}) {
  const { settings } = useSettings();
  const { entries } = useTimeEntries(month);
  const { absences } = useAbsences(month);
  const { summary } = useMonthSummary(month, { today, zone });
  const [pending, setPending] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!summary || !settings) return;
    setPending(true);
    setError(null);
    try {
      const result = await analyze(buildInsightInput(summary, entries, absences, settings, zone));
      if (result.ok) setText(result.text);
      else setError(ERRORS[result.error]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="✨ ניתוח AI של החודש" className="ai-card">
      {text ? (
        <p className="ai-card__text" aria-live="polite">
          {text}
        </p>
      ) : (
        <p>קבלו סיכום חכם של החודש: איפה אתם עומדים, מה בולט, ומה כדאי לעשות בימים שנותרו.</p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <Button onClick={() => void run()} disabled={pending || !summary}>
        {pending ? 'מנתח…' : text ? 'ניתוח מחדש' : 'נתחו את החודש שלי'}
      </Button>
      <p className="auth-hint">
        נשלחים ל-Google Gemini רק נתוני סיכום מספריים, בלי שם, אימייל או הערות. זה אינו ייעוץ משפטי.
      </p>
    </Card>
  );
}
