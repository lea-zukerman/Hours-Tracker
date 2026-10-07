import type { AuthErrorCode } from './AuthService.ts';

const BY_CODE: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  weak_password: 'weak_password',
  mfa_verification_failed: 'invalid_code',
  mfa_challenge_expired: 'invalid_code',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
};

/** Supabase AuthError → our closed set of codes (UI maps them to Hebrew). */
export function mapAuthError(
  error: { code?: string; name?: string; status?: number } | null | undefined,
): AuthErrorCode {
  if (!error) return 'unknown';
  if (error.code && error.code in BY_CODE) return BY_CODE[error.code];
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  return 'unknown';
}
