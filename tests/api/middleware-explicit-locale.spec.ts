// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
  getUser: auth.user,
  getSession: auth.session,
} }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { WAP_EXPLICIT_LOCALE_HEADER, WAP_LOCALE_HEADER } from '@/lib/i18n/config';

const forwarded = (response: Response, header: string) => response.headers.get(`x-middleware-request-${header}`);

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.mockResolvedValue({ data: { user: null }, error: null });
  auth.session.mockResolvedValue({ data: { session: null }, error: null });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-not-a-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('explicit locale forwarded by middleware', () => {
  it.each(['en', 'es', 'fr', 'pt'])('preserves an explicit /%s URL prefix', async (locale) => {
    const request = new NextRequest(`https://www.workforceap.org/${locale}/about`, {
      headers: { host: 'www.workforceap.org' },
    });
    const response = await middleware(request);
    expect(forwarded(response, WAP_EXPLICIT_LOCALE_HEADER)).toBe(locale);
    expect(forwarded(response, WAP_LOCALE_HEADER)).toBe(locale);
  });

  it('does not treat a locale cookie or forged header as an explicit URL prefix', async () => {
    const request = new NextRequest('https://www.workforceap.org/api/health', {
      headers: {
        host: 'www.workforceap.org',
        cookie: 'wap-locale=es',
        [WAP_EXPLICIT_LOCALE_HEADER]: 'pt',
      },
    });
    const response = await middleware(request);
    expect(forwarded(response, WAP_EXPLICIT_LOCALE_HEADER)).toBeNull();
    expect(forwarded(response, WAP_LOCALE_HEADER)).toBe('es');
  });
});

describe('localized Astro homepage selection', () => {
  it.each(['es', 'fr', 'pt'])('serves the emitted %s homepage with and without a trailing slash', async (locale) => {
    for (const slash of ['', '/']) {
      const request = new NextRequest(`https://www.workforceap.org/${locale}${slash}?ref=synthetic%2Fpartner&utm_source=fixture&lang=en`, {
        headers: { host: 'www.workforceap.org', accept: 'text/html' },
      });
      const response = await middleware(request);
      const destination = new URL(response.headers.get('x-middleware-rewrite')!);
      expect(destination.pathname).toBe(`/${locale}/index.html`);
      expect(destination.search).toBe(request.nextUrl.search);
      expect(forwarded(response, WAP_EXPLICIT_LOCALE_HEADER)).toBe(locale);
      expect(forwarded(response, WAP_LOCALE_HEADER)).toBe(locale);
      expect(response.headers.get('x-request-id')).toBeTruthy();
      expect(response.headers.get('content-security-policy-report-only')).toContain('report-to');
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it.each(['/en', '/en/'])('keeps %s as the English root alias', async (path) => {
    const response = await middleware(new NextRequest(`https://www.workforceap.org${path}?source=fixture`));
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://www.workforceap.org/?source=fixture');
  });

  it('retains localized static selection when a refreshed session rebuilds response headers', async () => {
    auth.session.mockResolvedValue({ data: { session: { user: { id: 'synthetic-member' } } }, error: null });
    const response = await middleware(new NextRequest('https://www.workforceap.org/es/?source=fixture', {
      headers: { cookie: 'sb-fixture-auth-token=synthetic-cookie', accept: 'text/html' },
    }));
    expect(auth.session).toHaveBeenCalledOnce();
    expect(auth.user).not.toHaveBeenCalled();
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://www.workforceap.org/es/index.html?source=fixture');
    expect(forwarded(response, 'x-wap-user-id')).toBe('synthetic-member');
    expect(forwarded(response, WAP_LOCALE_HEADER)).toBe('es');
    expect(response.headers.get('content-security-policy-report-only')).toContain('report-to');
  });

  it.each([
    ['/es/about', '/about'],
    ['/fr/blog', '/blog'],
    ['/pt/programs/cloud', '/programs/cloud'],
    ['/es/apply', '/apply'],
    ['/fr/login', '/login'],
    ['/pt/signup', '/signup'],
    ['/es/mentor/apply', '/mentor/apply'],
    ['/pt/api/health', '/api/health'],
  ])('retains the existing Next/untranslated-leaf contract for %s', async (path, expected) => {
    const request = new NextRequest(`https://www.workforceap.org${path}?source=fixture&ref=synthetic`);
    const response = await middleware(request);
    const destination = new URL(response.headers.get('x-middleware-rewrite')!);
    expect(destination.pathname).toBe(expected);
    expect(destination.search).toBe(request.nextUrl.search);
  });

  it.each(['/es/dashboard/profile', '/fr/admin/users', '/pt/counselor/students'])('keeps anonymous portal protection for %s', async (path) => {
    const request = new NextRequest(`https://www.workforceap.org${path}?source=fixture`);
    const response = await middleware(request);
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(307);
    expect(destination.pathname).toBe(`/${path.split('/')[1]}/login`);
    expect(destination.searchParams.get('redirectTo')).toBe(`${path}?source=fixture`);
  });

  it('keeps the authenticated tenant API backstop on a prefixed request', async () => {
    const response = await middleware(new NextRequest('https://www.workforceap.org/es/api/member/profile?source=fixture'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});


describe('legacy apply locale redirect', () => {
  const program = 'it-support-professional-certificate-ibm';

  it.each(['en', 'es', 'fr', 'pt'])('retains the selected program and supported attribution for %s', async (locale) => {
    const request = new NextRequest(`https://www.workforceap.org/apply?lang=${locale}&program=${program}&ref=partner%26other%3D1&utm_source=google&utm_medium=organic&utm_campaign=career&utm_content=ibm&utm_term=it&redirectTo=https%3A%2F%2Fevil.example&token=private&unknown=1`);
    const response = await middleware(request);
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(308);
    expect(destination.origin).toBe('https://www.workforceap.org');
    expect(destination.pathname).toBe(`/${locale}/apply`);
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      program, ref: 'partner&other=1', utm_source: 'google', utm_medium: 'organic',
      utm_campaign: 'career', utm_content: 'ibm', utm_term: 'it',
    });
    expect(response.cookies.get('wap-locale')?.value).toBe(locale);
    const rewritten = await middleware(new NextRequest(destination));
    const rewrite = new URL(rewritten.headers.get('x-middleware-rewrite')!);
    expect(rewrite.pathname).toBe('/apply');
    expect(rewrite.search).toBe(destination.search);
    expect(forwarded(rewritten, WAP_EXPLICIT_LOCALE_HEADER)).toBe(locale);
  });

  it.each([
    { lang: 'bogus', headers: new Headers(), locale: 'en' },
    { lang: 'bogus', headers: new Headers({ cookie: 'wap-locale=es' }), locale: 'es' },
    { lang: 'bogus', headers: new Headers({ 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' }), locale: 'es' },
    { lang: '', headers: new Headers({ cookie: 'wap-locale=pt' }), locale: 'pt' },
    { lang: null, headers: new Headers(), locale: 'en' },
  ])('filters apply inputs when lang=$lang falls back to $locale', async ({ lang, headers, locale }) => {
    const query = new URLSearchParams({
      program, ref: 'partner&other=1', utm_source: 'google', utm_medium: 'organic',
      utm_campaign: 'career', utm_content: 'ibm', utm_term: 'it',
      token: 'synthetic-private', redirectTo: 'https://evil.example', unknown: '1',
    });
    if (lang !== null) query.set('lang', lang);
    const response = await middleware(new NextRequest(`https://www.workforceap.org/apply?${query}`, { headers }));
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(308);
    expect(destination.origin).toBe('https://www.workforceap.org');
    expect(destination.pathname).toBe(`/${locale}/apply`);
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      program, ref: 'partner&other=1', utm_source: 'google', utm_medium: 'organic',
      utm_campaign: 'career', utm_content: 'ibm', utm_term: 'it',
    });
    expect(response.cookies.get('wap-locale')).toBeUndefined();
    const rewritten = await middleware(new NextRequest(destination));
    expect(rewritten.headers.get('location')).toBeNull();
    const rewrite = new URL(rewritten.headers.get('x-middleware-rewrite')!);
    expect(rewrite.pathname).toBe('/apply');
    expect(rewrite.search).toBe(destination.search);
  });

  it.each(['es', 'bogus'])('keeps first allowlisted values encoded as data for lang=%s', async (lang) => {
    const hostileLookingProgram = '//evil.example/?x=1&token=synthetic';
    const query = new URLSearchParams({ lang, program: hostileLookingProgram, token: 'synthetic-private' });
    query.append('program', 'second-program');
    const response = await middleware(new NextRequest(`https://www.workforceap.org/apply?${query}`));
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(308);
    expect(destination.origin).toBe('https://www.workforceap.org');
    expect(destination.pathname).toBe(`/${lang === 'es' ? 'es' : 'en'}/apply`);
    expect([...destination.searchParams]).toEqual([['program', hostileLookingProgram]]);
  });

  it('keeps bare Spanish apply generic and drops unknown or navigation parameters', async () => {
    const response = await middleware(new NextRequest('https://www.workforceap.org/apply?lang=es&redirectTo=%2Fadmin&token=private'));
    expect(response.headers.get('location')).toBe('https://www.workforceap.org/es/apply');
  });

  it('keeps existing non-apply locale-query redirects unchanged', async () => {
    const response = await middleware(new NextRequest('https://www.workforceap.org/login?lang=es&program=ignored&ref=ignored'));
    expect(response.headers.get('location')).toBe('https://www.workforceap.org/es/login');
  });
});
