import { isStrongPassword, MIN_PASSWORD_LENGTH } from './passwordPolicy.ts';

describe('isStrongPassword (mirrors the Supabase dashboard policy)', () => {
  it('requires at least 10 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(isStrongPassword('Ab1!xyzw')).toBe(false); // 8 chars
    expect(isStrongPassword('Ab1!xyzwvu')).toBe(true); // 10 chars
  });

  it.each([
    ['no uppercase', 'ab1!xyzwvu'],
    ['no lowercase', 'AB1!XYZWVU'],
    ['no digit', 'Abc!xyzwvu'],
    ['no symbol', 'Ab1cxyzwvu'],
  ])('rejects a password with %s', (_label, pw) => {
    expect(isStrongPassword(pw)).toBe(false);
  });
});
