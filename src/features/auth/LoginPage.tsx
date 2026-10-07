import { useState, type FormEvent } from 'react';
import { Card } from '../../ui/Card.tsx';
import { Button } from '../../ui/Button.tsx';
import { useAuth } from '../../auth/AuthContext.tsx';
import { isStrongPassword } from '../../auth/passwordPolicy.ts';
import {
  AUTH_ERROR_MESSAGES,
  CONFIRM_EMAIL_NOTICE,
  CONSENT_LABEL,
  PASSWORD_RULES,
} from './messages.ts';

type Mode = 'signin' | 'signup';

/** Sign-in and sign-up (spec §3.2: verified email, password policy, explicit consent). */
export function LoginPage() {
  const { service, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && !isStrongPassword(password)) {
      setError(AUTH_ERROR_MESSAGES.weak_password);
      return;
    }
    setPending(true);
    try {
      if (mode === 'signin') {
        const result = await service.signIn(email.trim(), password);
        if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
        else await refresh();
      } else if (consent) {
        const result = await service.signUp({
          email: email.trim(),
          password,
          privacyConsent: true,
        });
        if (!result.ok) setError(AUTH_ERROR_MESSAGES[result.error]);
        else if (result.value.needsEmailConfirmation) setNotice(CONFIRM_EMAIL_NOTICE);
        else await refresh();
      }
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setNotice(null);
  }

  const isSignup = mode === 'signup';
  return (
    <div className="auth-page">
      <Card title={isSignup ? 'הרשמה' : 'התחברות'} className="auth-card">
        <form className="te-form" onSubmit={onSubmit}>
          <label className="te-field">
            אימייל
            <input
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="te-field">
            סיסמה
            <input
              type="password"
              dir="ltr"
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {isSignup && (
            <>
              <p className="auth-hint">{PASSWORD_RULES}</p>
              <label className="te-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {CONSENT_LABEL}
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="auth-notice">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={pending || (isSignup && !consent)}>
            {isSignup ? 'יצירת חשבון' : 'התחברות'}
          </Button>
        </form>
        <Button variant="ghost" onClick={switchMode}>
          {isSignup ? 'כבר יש לך חשבון? להתחברות' : 'אין לך חשבון? להרשמה'}
        </Button>
      </Card>
    </div>
  );
}
