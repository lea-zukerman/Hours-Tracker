/**
 * Hebrew UI strings. Single source of truth for all user-facing text
 * (DESIGN.md §8 — "All user-facing strings come from i18n/").
 * Structure is ready for additional locales later.
 *
 * Milestone 0: intentionally (almost) empty — strings are filled in as
 * features land. The shape is `Record<string, string>`.
 */
export const he = {
  appTitle: 'מעקב שעות עבודה',
} as const;

export type Strings = typeof he;
