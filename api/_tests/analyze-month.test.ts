// @vitest-environment node
import { vi } from 'vitest';
import { buildPrompt, createAnalyzeHandler, type AnalyzeDeps } from '../analyze-month.ts';

const INPUT = {
  month: '2026-10',
  workedMinutes: 6000,
  creditedMinutes: 6480,
  quotaMinutes: 10920,
  balanceMinutes: -4440,
  remainingWorkdays: 9,
  requiredPerDayMinutes: 494,
  status: 'deficit',
  daysWorked: 11,
  longDays: 3,
  dailyTargetMinutes: 516,
  absenceDays: { vacation: 1, sick: 0, holiday: 0, reserve: 0, unpaid: 0 },
};

function setup(overrides: Partial<AnalyzeDeps> = {}) {
  const deps = {
    verifyUser: vi.fn(async (token: string) => (token === 'good' ? 'u1' : null)),
    allow: vi.fn((_key: string) => true),
    generate: vi.fn(async (_prompt: string) => 'ניתוח לדוגמה'),
    ...overrides,
  };
  return { deps, handle: createAnalyzeHandler(deps) };
}

const request = (body: unknown, token: string | null = 'good') =>
  new Request('https://app.test/api/analyze-month', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/analyze-month', () => {
  it('returns the AI analysis for a valid month summary', async () => {
    const { deps, handle } = setup();
    const res = await handle(request(INPUT));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ text: 'ניתוח לדוגמה' });
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or invalid token with 401 and never calls the AI', async () => {
    const { deps, handle } = setup();
    expect((await handle(request(INPUT, null))).status).toBe(401);
    expect((await handle(request(INPUT, 'bad'))).status).toBe(401);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('rejects malformed or extra input (no free text can reach the AI)', async () => {
    const bodies = ['not json', {}, { ...INPUT, month: '2026-13' }, { ...INPUT, note: 'שמי רחל' }];
    for (const body of bodies) {
      const { deps, handle } = setup();
      const res = await handle(request(body));
      expect(res.status).toBe(400);
      expect(deps.generate).not.toHaveBeenCalled();
    }
  });

  it('rate-limits each user', async () => {
    const { deps, handle } = setup({ allow: vi.fn(() => false) });
    const res = await handle(request(INPUT));
    expect(res.status).toBe(429);
    expect(deps.allow).toHaveBeenCalledWith('u1');
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('returns 503 when the AI provider fails', async () => {
    const { handle } = setup({
      generate: vi.fn(async () => {
        throw new Error('quota');
      }),
    });
    const res = await handle(request(INPUT));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});

describe('buildPrompt', () => {
  it('formats minutes as hours and contains only the summary numbers', () => {
    const prompt = buildPrompt(INPUT as Parameters<typeof buildPrompt>[0]);
    expect(prompt).toContain('2026-10');
    expect(prompt).toContain('100:00'); // 6000 minutes worked
    expect(prompt).toContain('-74:00'); // balance
    expect(prompt).toContain('חופשה: 1');
  });
});
