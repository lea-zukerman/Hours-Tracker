import { describe, it, expect } from 'vitest';
import { formatDate, formatTime24, formatMinutes } from './format.ts';

describe('formatDate', () => {
  it('renders an ISO day as DD-MM-YYYY', () => {
    expect(formatDate('2026-06-18')).toBe('18-06-2026');
  });
  it('returns the input unchanged when invalid', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatTime24', () => {
  it('renders a UTC instant as 24h local time in the zone', () => {
    // 07:00Z in summer (IDT, +3) → 10:00 local
    expect(formatTime24('2026-06-18T07:00:00.000Z', 'Asia/Jerusalem')).toBe('10:00');
  });
});

describe('formatMinutes', () => {
  it('formats whole and partial hours', () => {
    expect(formatMinutes(516)).toBe('8:36');
    expect(formatMinutes(60)).toBe('1:00');
    expect(formatMinutes(5)).toBe('0:05');
  });
  it('handles negatives (deficit)', () => {
    expect(formatMinutes(-90)).toBe('-1:30');
  });
});
