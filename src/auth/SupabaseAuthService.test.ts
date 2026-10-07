import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthService } from './SupabaseAuthService.ts';

type AsyncMock = ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<unknown>>>;
const resolves = (value: unknown): AsyncMock =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => value);

function fakeAuth() {
  const unsubscribe = vi.fn();
  return {
    unsubscribe,
    getSession: resolves({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn<(...args: unknown[]) => unknown>(() => ({
      data: { subscription: { unsubscribe } },
    })),
    signInWithPassword: resolves({ data: {}, error: null }),
    signUp: resolves({ data: { session: null, user: { id: 'u1' } }, error: null }),
    signOut: resolves({ error: null }),
    refreshSession: resolves({ data: {}, error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: resolves({
        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        error: null,
      }),
      listFactors: resolves({ data: { all: [], totp: [] }, error: null }),
      enroll: resolves({
        data: {
          id: 'f-new',
          totp: {
            qr_code: 'data:image/svg+xml;utf-8,<svg/>',
            secret: 'SECRET',
            uri: 'otpauth://x',
          },
        },
        error: null,
      }),
      challengeAndVerify: resolves({ data: {}, error: null }),
      unenroll: resolves({ data: {}, error: null }),
    },
  };
}

const serviceFor = (auth: ReturnType<typeof fakeAuth>) =>
  new SupabaseAuthService(auth as unknown as SupabaseClient['auth']);

describe('SupabaseAuthService', () => {
  it('signs up with the privacy-consent metadata the database trigger requires', async () => {
    const auth = fakeAuth();
    const result = await serviceFor(auth).signUp({
      email: 'a@b.co',
      password: 'Ab1!xyzwvu',
      privacyConsent: true,
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'Ab1!xyzwvu',
      options: { data: { privacy_consent: true }, emailRedirectTo: window.location.origin },
    });
    expect(result).toEqual({ ok: true, value: { needsEmailConfirmation: true } });
  });

  it('maps a failed sign-in to a closed error code', async () => {
    const auth = fakeAuth();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' },
    });
    expect(await serviceFor(auth).signIn('a@b.co', 'wrong')).toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
  });

  it('maps the session to { userId, email }', async () => {
    const auth = fakeAuth();
    auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1', email: 'a@b.co' } } },
      error: null,
    });
    expect(await serviceFor(auth).getSession()).toEqual({ userId: 'u1', email: 'a@b.co' });
  });

  it('defers session-change listeners out of the Supabase callback and can unsubscribe', async () => {
    const auth = fakeAuth();
    const listener = vi.fn();
    const stop = serviceFor(auth).onSessionChange(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;

    callback('SIGNED_IN', { user: { id: 'u1', email: 'a@b.co' } });
    expect(listener).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(listener).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.co' });

    stop();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it('reports a null current level as aal1', async () => {
    const auth = fakeAuth();
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: null, nextLevel: 'aal2' },
      error: null,
    });
    expect(await serviceFor(auth).getAssurance()).toEqual({ current: 'aal1', next: 'aal2' });
  });

  it('verifies the login code against the first verified TOTP factor', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: 'f9' }] },
      error: null,
    });
    expect(await serviceFor(auth).verifyMfa('123456')).toEqual({ ok: true, value: null });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f9', code: '123456' });
  });

  it('fails verification without calling Supabase when no factor exists', async () => {
    const auth = fakeAuth();
    expect(await serviceFor(auth).verifyMfa('123456')).toEqual({ ok: false, error: 'unknown' });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('clears abandoned unverified factors before enrolling a new one', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: {
        all: [
          { id: 'stale', status: 'unverified' },
          { id: 'ok', status: 'verified' },
        ],
        totp: [],
      },
      error: null,
    });
    const result = await serviceFor(auth).startMfaEnrollment();
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Hours Tracker',
    });
    expect(result).toEqual({
      ok: true,
      value: { factorId: 'f-new', qrCodeSvg: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET' },
    });
  });

  it('disables 2FA by unenrolling the factor and refreshing the session', async () => {
    const auth = fakeAuth();
    auth.mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: 'f9' }] },
      error: null,
    });
    expect(await serviceFor(auth).disableMfa()).toEqual({ ok: true, value: null });
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f9' });
    expect(auth.refreshSession).toHaveBeenCalled();
  });
});
