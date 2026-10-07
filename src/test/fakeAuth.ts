import type {
  AssuranceLevel,
  AuthResult,
  AuthService,
  AuthSession,
  MfaEnrollment,
  SignUpInput,
} from '../auth/AuthService.ts';

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });

/** In-memory AuthService for component tests. The valid 2FA code is always 123456. */
export class FakeAuthService implements AuthService {
  static readonly VALID_CODE = '123456';
  readonly users = new Map<string, string>();
  session: AuthSession | null = null;
  mfaEnrolled: boolean;
  lastSignUp: SignUpInput | null = null;
  private mfaPassed = false;
  private pendingFactorId: string | null = null;
  private readonly listeners = new Set<(s: AuthSession | null) => void>();
  /** When set, signIn waits for this promise (to observe pending UI). */
  signInGate: Promise<void> | null = null;

  constructor(
    opts: {
      users?: Record<string, string>;
      signedInAs?: string;
      mfaEnrolled?: boolean;
      mfaPassed?: boolean;
    } = {},
  ) {
    for (const [email, pw] of Object.entries(opts.users ?? {})) this.users.set(email, pw);
    if (opts.signedInAs)
      this.session = { userId: `user-${opts.signedInAs}`, email: opts.signedInAs };
    this.mfaEnrolled = opts.mfaEnrolled ?? false;
    this.mfaPassed = opts.mfaPassed ?? false;
  }

  async getSession() {
    return this.session;
  }

  onSessionChange(listener: (s: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Simulates the session ending outside the app (expiry, sign-out in another tab). */
  expireSession() {
    this.session = null;
    this.mfaPassed = false;
    this.emit();
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    if (this.signInGate) await this.signInGate;
    if (this.users.get(email) !== password) return { ok: false, error: 'invalid_credentials' };
    this.session = { userId: `user-${email}`, email };
    this.mfaPassed = false;
    this.emit();
    return ok(null);
  }

  async signUp(input: SignUpInput) {
    this.lastSignUp = input;
    this.users.set(input.email, input.password);
    return ok({ needsEmailConfirmation: true });
  }

  async signOut() {
    this.expireSession();
  }

  async getAssurance(): Promise<{ current: AssuranceLevel; next: AssuranceLevel }> {
    return {
      current: this.mfaEnrolled && this.mfaPassed ? 'aal2' : 'aal1',
      next: this.mfaEnrolled ? 'aal2' : 'aal1',
    };
  }

  async verifyMfa(code: string): Promise<AuthResult> {
    if (!this.mfaEnrolled || code !== FakeAuthService.VALID_CODE) {
      return { ok: false, error: 'invalid_code' };
    }
    this.mfaPassed = true;
    return ok(null);
  }

  async hasMfa() {
    return this.mfaEnrolled;
  }

  async startMfaEnrollment(): Promise<AuthResult<MfaEnrollment>> {
    this.pendingFactorId = 'factor-1';
    return ok({
      factorId: 'factor-1',
      qrCodeSvg: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
      secret: 'JBSWY3DPEHPK3PXP',
    });
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<AuthResult> {
    if (factorId !== this.pendingFactorId || code !== FakeAuthService.VALID_CODE) {
      return { ok: false, error: 'invalid_code' };
    }
    this.mfaEnrolled = true;
    this.mfaPassed = true;
    return ok(null);
  }

  async disableMfa(): Promise<AuthResult> {
    this.mfaEnrolled = false;
    this.mfaPassed = false;
    return ok(null);
  }

  private emit() {
    for (const listener of this.listeners) listener(this.session);
  }
}
