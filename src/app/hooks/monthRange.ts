import type { IsoDate } from '../../domain/types.ts';

/**
 * The inclusive date range covering a month ('YYYY-MM'), for repository range
 * queries. '-31' is a safe upper bound: dates compare lexicographically and no
 * real day exceeds it within the month.
 */
export function monthRange(month: string): { from: IsoDate; to: IsoDate } {
  return { from: `${month}-01`, to: `${month}-31` };
}
