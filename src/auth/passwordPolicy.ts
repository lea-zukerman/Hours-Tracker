/**
 * Client-side mirror of the Supabase Auth password policy (Dashboard →
 * Authentication → Providers → Email: min length 10, lowercase + uppercase +
 * digits + symbols). The server is the authority; this only gives instant feedback.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
