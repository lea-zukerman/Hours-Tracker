/**
 * The authentication boundary (spec §3.2 "Identification & access"). Components
 * talk to this interface only — SupabaseAuthService implements it over
 * supabase.auth, FakeAuthService (src/test/fakeAuth.ts) drives UI tests — the
 * same seam pattern as data/Repository.ts.
 */
export interface AuthSession {
  userId: string;
  email: string;
}

export type AssuranceLevel = 'aal1' | 'aal2';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'invalid_code'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export type AuthResult<T = null> = { ok: true; value: T } | { ok: false; error: AuthErrorCode };

export interface MfaEnrollment {
  factorId: string;
  qrCodeSvg: string; // data: URL, rendered as <img>
  secret: string; // for manual entry in the authenticator app
}

/** `privacyConsent: true` is a type-level guarantee the UI collected consent. */
export interface SignUpInput {
  email: string;
  password: string;
  privacyConsent: true;
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  /** Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult<{ needsEmailConfirmation: boolean }>>;
  signOut(): Promise<void>;
  /** current: what this session proved; next: what the account requires. */
  getAssurance(): Promise<{ current: AssuranceLevel; next: AssuranceLevel }>;
  verifyMfa(code: string): Promise<AuthResult>;
  hasMfa(): Promise<boolean>;
  startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>>;
  confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult>;
  disableMfa(): Promise<AuthResult>;
}
