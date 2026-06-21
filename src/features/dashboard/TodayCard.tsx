import { DateTime } from 'luxon';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { ProgressRing } from '../../ui/ProgressRing.tsx';
import { formatMinutes, formatClock } from '../../ui/format.ts';
import { entryWorkedMinutes } from '../../domain/time.ts';
import { useSettings } from '../../app/hooks/useSettings.ts';
import { useTimeEntries } from '../../app/hooks/useTimeEntries.ts';
import { useClock } from '../../app/hooks/useClock.ts';

const DEFAULT_ZONE = 'Asia/Jerusalem';

/**
 * Today's progress (DESIGN.md §8). The dial shows worked-vs-daily-target; the
 * center shows the live session clock while running. Start/Stop drives useClock
 * (3.5). Manual entry is 5.2 (out of scope here).
 *
 * `today`/`zone`/`now` are injectable for deterministic tests.
 */
export function TodayCard({
  zone = DEFAULT_ZONE,
  now,
  today,
}: {
  zone?: string;
  now?: () => DateTime;
  today?: string;
}) {
  const resolvedToday = today ?? (now ? now() : DateTime.now().setZone(zone)).toISODate()!;
  const month = resolvedToday.slice(0, 7);

  const { settings } = useSettings();
  const { entries } = useTimeEntries(month);
  const { isRunning, isPaused, elapsedSeconds, start, pause, resume, stop } = useClock({ zone, now });

  if (!settings) return <Card title="היום">…</Card>;

  const todayEntry = entries.find((e) => e.date === resolvedToday);
  const finalized = todayEntry ? entryWorkedMinutes(todayEntry, settings, zone) : 0;
  const live = isRunning ? Math.floor(elapsedSeconds / 60) : 0;
  const worked = finalized + live;

  const target = settings.dailyTargetMinutes;
  const remaining = Math.max(0, target - worked);
  const ratio = target > 0 ? worked / target : 0;
  const done = remaining === 0;

  const ringColor = isRunning ? 'var(--warn)' : done ? 'var(--positive)' : 'var(--accent)';

  return (
    <Card title="היום">
      <div className="today">
        <ProgressRing value={ratio} color={ringColor} label="התקדמות היום">
          <div>
            <div className="num today__big">{formatMinutes(worked)}</div>
            <div className="label">
              {isRunning
                ? isPaused
                  ? `מושהה · ${formatClock(elapsedSeconds)}`
                  : `רץ · ${formatClock(elapsedSeconds)}`
                : 'עבדת היום'}
            </div>
          </div>
        </ProgressRing>

        <div className="today__side">
          <p className="today__remaining">
            {done ? (
              <span className="today__done">השלמת את היעד להיום 🎉</span>
            ) : (
              <>
                נשאר <span className="num">{formatMinutes(remaining)}</span> להיום
              </>
            )}
          </p>
          {isRunning ? (
            <div className="today__controls">
              <Button variant="danger" onClick={() => void stop()}>
                ■ עצור
              </Button>
              <Button variant="ghost" onClick={() => (isPaused ? resume() : pause())}>
                {isPaused ? '▶ המשך' : '⏸ הפסקה'}
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => void start()}>
              ▶ התחל
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
