import type { AuthErrorCode } from '../../auth/AuthService.ts';

export const PASSWORD_RULES = 'לפחות 10 תווים, כולל אות גדולה ואות קטנה באנגלית, ספרה וסימן';

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'אימייל או סיסמה שגויים',
  email_not_confirmed: 'יש לאשר את כתובת האימייל דרך הקישור שנשלח אליך',
  weak_password: `הסיסמה חלשה מדי: ${PASSWORD_RULES}`,
  invalid_code: 'הקוד שגוי או שפג תוקפו',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות',
  network: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט',
  unknown: 'משהו השתבש. נסו שוב',
};

export const CONSENT_LABEL =
  'אני מאשר/ת את מדיניות הפרטיות ואת שמירת נתוני שעות העבודה שלי בשרת מאובטח';

export const CONFIRM_EMAIL_NOTICE = 'נשלח אליך מייל לאישור הכתובת. אחרי האישור אפשר להתחבר.';
