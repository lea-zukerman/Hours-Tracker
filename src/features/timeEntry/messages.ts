import type { ValidationCode } from '../../domain/types.ts';

/**
 * Hebrew messages for validation codes (SPEC §3.2C, 5.3). The domain returns
 * codes only (DESIGN.md §6 validation.ts); this is the UI's mapping to text.
 * A complete Record over ValidationCode → adding a new code is a compile error
 * until a message is written here.
 */
export const validationMessage: Record<ValidationCode, string> = {
  out_before_in: 'שעת היציאה מוקדמת משעת הכניסה',
  break_exceeds_presence: 'ההפסקה ארוכה מזמן הנוכחות',
  clock_out_without_in: 'נרשמה יציאה ללא כניסה',
  invalid_input: 'קלט לא תקין',
  overlapping_shifts: 'יש חפיפה בין משמרות',
  future_worked_hours: 'לא ניתן לדווח שעות עבודה בעתיד',
};
