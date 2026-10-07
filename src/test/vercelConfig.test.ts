import config from '../../vercel.json';

type Header = { key: string; value: string };

function globalHeaders(): Map<string, string> {
  const block = config.headers.find((h) => h.source === '/(.*)');
  expect(block, 'a header block for every path').toBeDefined();
  return new Map(block!.headers.map((h: Header) => [h.key.toLowerCase(), h.value]));
}

function csp(): Map<string, string> {
  const raw = globalHeaders().get('content-security-policy');
  expect(raw, 'CSP header').toBeDefined();
  return new Map(
    raw!
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values.join(' ')] as [string, string];
      }),
  );
}

describe('vercel.json security headers', () => {
  it('sets the baseline hardening headers', () => {
    const h = globalHeaders();
    expect(h.get('strict-transport-security')).toMatch(/max-age=\d{8,}; includeSubDomains/);
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('x-frame-options')).toBe('DENY');
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('permissions-policy')).toContain('camera=()');
    expect(h.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('CSP forbids inline/eval scripts and framing', () => {
    const p = csp();
    expect(p.get('default-src')).toBe("'self'");
    expect(p.get('script-src')).toBe("'self'");
    expect(p.get('object-src')).toBe("'none'");
    expect(p.get('frame-ancestors')).toBe("'none'");
    expect(p.get('base-uri')).toBe("'self'");
  });

  it('CSP allows exactly the third parties the app uses', () => {
    const p = csp();
    expect(p.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(p.get('font-src')).toContain('https://fonts.gstatic.com');
    expect(p.get('connect-src')).toContain('https://*.supabase.co');
    expect(p.get('connect-src')).toContain('wss://*.supabase.co');
    expect(p.get('form-action')).toContain('https://checkout.stripe.com');
  });

  it('CSP never loosens to unsafe-* keywords or bare scheme sources', () => {
    for (const [directive, sources] of csp()) {
      for (const source of sources.split(' ').filter(Boolean)) {
        // data: images are intentional (inline SVG icons, the 2FA QR code).
        if (directive === 'img-src' && source === 'data:') continue;
        expect(source, `${directive} must not allow ${source}`).not.toMatch(/^'unsafe-/);
        expect(source, `${directive} must not allow any host on ${source}`).not.toMatch(
          /^[a-z]+:$/,
        );
      }
    }
  });
});

describe('vercel.json SPA rewrite', () => {
  const rewrite = config.rewrites[0];
  const matches = (path: string) => new RegExp(`^${rewrite.source}$`).test(path);

  it('serves index.html for client-side routes (deep-link refresh)', () => {
    expect(rewrite.destination).toBe('/index.html');
    expect(matches('/')).toBe(true);
    expect(matches('/reports')).toBe(true);
    expect(matches('/settings/profile')).toBe(true);
  });

  it('never captures serverless functions under /api', () => {
    expect(matches('/api/stripe-webhook')).toBe(false);
    expect(matches('/api/mcp')).toBe(false);
  });
});
