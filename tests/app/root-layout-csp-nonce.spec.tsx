// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'synthetic-font' }) }));
vi.mock('next/script', () => ({ default: function Script() { return null; } }));
vi.mock('next-intl/server', () => ({ getMessages: async () => ({ cookieConsent: { label: 'Cookie preferences' } }) }));
vi.mock('next-intl', () => ({ NextIntlClientProvider: () => null }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => null) }));
vi.mock('@/lib/auth/roles', () => ({ getProfileRole: vi.fn() }));
vi.mock('@/lib/member/ensureCurrentAppUserProvisioned', () => ({ ensureCurrentAppUserProvisioned: vi.fn() }));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({ resolveOrgFromRequest: vi.fn(async () => 'synthetic-public-org') }));
vi.mock('@/lib/platform/defaultOrgTheme', () => ({ getRequestOrgBranding: async () => ({}) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/components/JsonLd', () => ({ default: () => null }));
vi.mock('@/components/ConditionalMarketingNav', () => ({ default: () => null }));
vi.mock('@/components/platform/OrgBrandingStyle', () => ({ default: () => null }));
vi.mock('@/components/marketing/UtmCapture', () => ({ default: () => null }));
vi.mock('@/components/DeferredRootChrome', () => ({ default: () => null }));
vi.mock('@/components/observability/SentrySetUser', () => ({ default: () => null }));

import RootLayout from '@/app/layout';
import Script from 'next/script';
import ThemeInitScript from '@/components/theme/ThemeInitScript';
import { headers } from 'next/headers';

type ScriptProps = { nonce?: string; id?: string; children?: ReactNode };

/** Every executable script the root layout renders: raw <script>, ThemeInitScript, and next/script. */
async function collectScripts(requestHeaders: Headers) {
  vi.mocked(headers).mockResolvedValue(requestHeaders as never);
  const tree = await RootLayout({ children: <div>page</div> });
  const scripts: ReactElement<ScriptProps>[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<ScriptProps>(child)) return;
      if (child.type === 'script' || child.type === Script || child.type === ThemeInitScript) scripts.push(child);
      visit(child.props.children);
    });
  }
  visit(tree);
  return scripts;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it('stamps the middleware nonce on every inline script the root layout renders (WAP-36 phase 1)', async () => {
  const scripts = await collectScripts(new Headers({ 'x-nonce': 'synthetic-nonce-value-0001' }));
  const kinds = scripts.map((s) => (s.type === 'script' ? (s.props.id ? `script#${s.props.id}` : 'script') : s.type === Script ? `Script:${s.props.id}` : 'ThemeInitScript'));
  expect(kinds).toEqual(expect.arrayContaining(['ThemeInitScript', 'script', 'script#gtm-consent-default', 'Script:sw-register', 'Script:gtm']));
  for (const script of scripts) expect(script.props.nonce, kinds[scripts.indexOf(script)]).toBe('synthetic-nonce-value-0001');

  // The theme bootstrap forwards the nonce onto the real <script> element.
  const theme = scripts.find((s) => s.type === ThemeInitScript)!;
  const rendered = ThemeInitScript(theme.props) as ReactElement<ScriptProps>;
  expect(rendered.type).toBe('script');
  expect(rendered.props.nonce).toBe('synthetic-nonce-value-0001');
});

it('omits the nonce attribute when middleware forwarded none (non-document render)', async () => {
  const scripts = await collectScripts(new Headers());
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script.props.nonce).toBeUndefined();
  expect((ThemeInitScript({}) as ReactElement<ScriptProps>).props.nonce).toBeUndefined();
});
