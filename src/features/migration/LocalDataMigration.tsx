import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useRepository } from '../../app/state/RepositoryContext.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import {
  migrateLocalToCloud,
  pendingLocalData,
  type LocalDataCounts,
} from '../../data/migrateLocalToCloud.ts';

const browserData = new LocalStorageRepository();

type Phase =
  | { kind: 'hidden' }
  | { kind: 'offer'; counts: LocalDataCounts }
  | { kind: 'working'; counts: LocalDataCounts }
  | { kind: 'error'; counts: LocalDataCounts }
  | { kind: 'done'; counts: LocalDataCounts };

const summary = ({ entries, absences }: LocalDataCounts) =>
  `${entries} ימי דיווח ו-${absences} היעדרויות`;

/** One-time move of pre-login browser data into the account (TASKS T16). */
export function LocalDataMigration({ local = browserData }: { local?: LocalStorageRepository }) {
  const cloud = useRepository();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'hidden' });

  useEffect(() => {
    let active = true;
    pendingLocalData(local, cloud)
      .then((counts) => {
        if (active && counts) setPhase({ kind: 'offer', counts });
      })
      .catch(() => {}); // cannot reach the account → simply don't offer now
    return () => {
      active = false;
    };
  }, [local, cloud]);

  if (phase.kind === 'hidden') return null;

  async function move(counts: LocalDataCounts) {
    setPhase({ kind: 'working', counts });
    try {
      const moved = await migrateLocalToCloud(local, cloud);
      await queryClient.invalidateQueries();
      setPhase({ kind: 'done', counts: moved });
    } catch {
      setPhase({ kind: 'error', counts });
    }
  }

  function decline() {
    local.dismissMigration();
    setPhase({ kind: 'hidden' });
  }

  return (
    <Card title="נתונים מהדפדפן הזה">
      {phase.kind === 'done' ? (
        <p role="status">הועברו {summary(phase.counts)} לחשבון.</p>
      ) : (
        <>
          <p>
            נמצאו {summary(phase.counts)} שנשמרו בדפדפן הזה לפני ההתחברות. להעביר אותם לחשבון? אחרי
            ההעברה הם יהיו זמינים מכל מכשיר ויימחקו מהדפדפן.
          </p>
          {phase.kind === 'error' && (
            <p role="alert" className="auth-error">
              ההעברה נכשלה, ושום דבר לא נמחק מהדפדפן.
            </p>
          )}
          <Button onClick={() => void move(phase.counts)} disabled={phase.kind === 'working'}>
            {phase.kind === 'error' ? 'ניסיון נוסף' : 'העברה לחשבון'}
          </Button>
          {phase.kind === 'offer' && (
            <Button variant="ghost" onClick={decline}>
              לא, תודה
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
