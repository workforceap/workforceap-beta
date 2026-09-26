// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
  getUser: async () => ({ data: { user: null }, error: null }),
  getSession: async () => ({ data: { session: null }, error: null }),
} }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { WAP_EXPLICIT_LOCALE_HEADER, WAP_LOCALE_HEADER } from '@/lib/i18n/config';

const forwarded = (response: Response, header: string) => response.headers.get(`x-middleware-request-${header}`);

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
