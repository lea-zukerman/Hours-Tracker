import { mapAuthError } from './mapAuthError.ts';

describe('mapAuthError', () => {
  it.each([
    ['invalid_credentials', 'invalid_credentials'],
    ['email_not_confirmed', 'email_not_confirmed'],
    ['weak_password', 'weak_password'],
    ['mfa_verification_failed', 'invalid_code'],
    ['mfa_challenge_expired', 'invalid_code'],
    ['over_request_rate_limit', 'rate_limited'],
    ['over_email_send_rate_limit', 'rate_limited'],
  ] as const)('maps Supabase code %s → %s', (code, expected) => {
    expect(mapAuthError({ code, status: 400, name: 'AuthApiError' })).toBe(expected);
  });

  it('treats fetch failures as network errors', () => {
    expect(mapAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
  });

  it('falls back to unknown for anything else, including no error object', () => {
    expect(mapAuthError({ code: 'unexpected_failure', status: 500 })).toBe('unknown');
    expect(mapAuthError(null)).toBe('unknown');
    expect(mapAuthError(undefined)).toBe('unknown');
  });
});
