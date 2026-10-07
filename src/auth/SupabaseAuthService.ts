import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type {
  AssuranceLevel,
  AuthResult,
  AuthService,
  AuthSession,
  MfaEnrollment,
  SignUpInput,
} from './AuthService.ts';
import { mapAuthError } from './mapAuthError.ts';

type SupabaseAuth = SupabaseClient['auth'];

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const fail = (error: Parameters<typeof mapAuthError>[0]): AuthResult<never> => ({
  ok: false,
  error: mapAuthError(error),
});
const level = (l: string | null | undefined): AssuranceLevel => (l === 'aal2' ? 'aal2' : 'aal1');

function toSession(session: Session | null): AuthSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? '' } : null;
}

/** AuthService over Supabase Auth (email + password, TOTP MFA). */
export class SupabaseAuthService implements AuthService {
  private readonly auth: SupabaseAuth;

  constructor(auth: SupabaseAuth) {
    this.auth = auth;
  }

  async getSession(): Promise<AuthSession | null> {
    const { data } = await this.auth.getSession();
    return toSession(data.session);
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    // Supabase warns that calling auth methods inside this callback can deadlock;
    // defer so listeners may call getSession()/getAssurance() freely.
    const { data } = this.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => listener(toSession(session)), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.auth.signInWithPassword({ email, password });
    return error ? fail(error) : ok(null);
  }

  async signUp({ email, password, privacyConsent }: SignUpInput) {
    const { data, error } = await this.auth.signUp({
      email,
      password,
      options: {
        data: { privacy_consent: privacyConsent }, // required by private.handle_new_user()
        emailRedirectTo: window.location.origin,
      },
    });
    return error ? fail(error) : ok({ needsEmailConfirmation: !data.session });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  async getAssurance() {
    const { data } = await this.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: level(data?.currentLevel), next: level(data?.nextLevel) };
  }

  async verifyMfa(code: string): Promise<AuthResult> {
    const factorId = await this.verifiedFactorId();
    if (!factorId) return fail(null);
    const { error } = await this.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? fail(error) : ok(null);
  }

  async hasMfa(): Promise<boolean> {
    return (await this.verifiedFactorId()) !== null;
  }

  async startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>> {
    // A previous enrollment abandoned before its code was confirmed would block
    // a new one with the same friendly name.
    const { data: factors } = await this.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === 'unverified') await this.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await this.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Hours Tracker',
    });
    if (error || !data) return fail(error);
    return ok({ factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret });
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult> {
    const { error } = await this.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? fail(error) : ok(null);
  }

  async disableMfa(): Promise<AuthResult> {
    const factorId = await this.verifiedFactorId();
    if (!factorId) return ok(null);
    const { error } = await this.auth.mfa.unenroll({ factorId });
    if (error) return fail(error);
    await this.auth.refreshSession(); // drop aal2 now, not at the next token refresh
    return ok(null);
  }

  private async verifiedFactorId(): Promise<string | null> {
    const { data } = await this.auth.mfa.listFactors();
    return data?.totp[0]?.id ?? null; // `totp` lists verified factors only
  }
}
