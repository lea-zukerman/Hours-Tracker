import { useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import { AUTH_ERROR_MESSAGES } from './messages.ts';

/** Second login step for users with 2FA enabled (session aal1 → aal2). */
export function MfaChallenge() {
  const { service, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await service.verifyMfa(code.trim());
      if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
      else await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <Card title="אימות דו-שלבי" className="auth-card">
        <form className="te-form" onSubmit={onSubmit}>
          <label className="te-field">
            קוד מאפליקציית האימות
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
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            אימות
          </Button>
        </form>
        <Button variant="ghost" onClick={() => void service.signOut()}>
          התנתקות
        </Button>
      </Card>
    </div>
  );
}
