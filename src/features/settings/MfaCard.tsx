import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { MfaEnrollment } from '../../auth/AuthService.ts';
import { AUTH_ERROR_MESSAGES } from '../auth/messages.ts';

type View =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'enrolling'; enrollment: MfaEnrollment }
  | { kind: 'on' };

/**
 * Optional TOTP 2FA (spec §3.2). Once on, the database itself requires an aal2
 * session for this user's rows (restrictive RLS), not just the UI.
 */
export function MfaCard() {
  const { service, refresh } = useAuth();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void service.hasMfa().then((on) => {
      if (active) setView({ kind: on ? 'on' : 'off' });
    });
    return () => {
      active = false;
    };
  }, [service]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  const start = () =>
    run(async () => {
      const result = await service.startMfaEnrollment();
      if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
      else setView({ kind: 'enrolling', enrollment: result.value });
    });

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (view.kind !== 'enrolling') return;
    void run(async () => {
      const result = await service.confirmMfaEnrollment(view.enrollment.factorId, code.trim());
      if (!result.ok) {
        setError(AUTH_ERROR_MESSAGES[result.error]);
        return;
      }
      setCode('');
      setView({ kind: 'on' });
      await refresh();
    });
  };

  const disable = () =>
    run(async () => {
      const result = await service.disableMfa();
      if (!result.ok) {
        setError(AUTH_ERROR_MESSAGES[result.error]);
        return;
      }
      setView({ kind: 'off' });
      await refresh();
    });

  return (
    <Card title="אימות דו-שלבי">
      {view.kind === 'loading' && <p>…</p>}

      {view.kind === 'off' && (
        <>
          <p>הגנה נוספת על החשבון: בכל התחברות יידרש גם קוד מאפליקציית אימות בטלפון.</p>
          <Button onClick={() => void start()} disabled={pending}>
            הפעלת אימות דו-שלבי
          </Button>
        </>
      )}

      {view.kind === 'enrolling' && (
        <form className="te-form" onSubmit={confirm}>
          <p>
            סרקו את הקוד באפליקציית אימות (Google Authenticator, Microsoft Authenticator) והקלידו את
            הקוד בן 6 הספרות.
          </p>
          <img
            src={view.enrollment.qrCodeSvg}
            alt="קוד QR לאפליקציית האימות"
            width={180}
            height={180}
          />
          <p>
            או הקלידו ידנית: <code dir="ltr">{view.enrollment.secret}</code>
          </p>
          <label className="te-field">
            קוד אימות
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={pending}>
            אישור והפעלה
          </Button>
        </form>
      )}

      {view.kind === 'on' && (
        <>
          <p role="status">אימות דו-שלבי פעיל</p>
          <Button variant="danger" onClick={() => void disable()} disabled={pending}>
            כיבוי אימות דו-שלבי
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </Card>
  );
}
