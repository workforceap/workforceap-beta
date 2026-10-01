import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';

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
import ThemeInitScript from '@/components/theme/ThemeInitScript';
import { headers } from 'next/headers';

/**
 * Scout 2026-09-22 D17: every portal route logged "A tree hydrated but some
 * attributes of the server rendered HTML didn't match the client properties"
 * in a real browser. The captured diff was the CSP nonce on the root layout's
 * inline scripts: `+ nonce="<value>"` (client props) vs `- nonce=""` (DOM).
 * Browsers blank the `nonce` content attribute of every element once a
 * header-delivered Content Security Policy is present (the WAP-36 Report-Only
 * header), so the server markup and the client props can never agree on it.
 *
 * This spec renders each nonce-bearing inline script the layout emits, blanks
 * the attribute the way a CSP-aware browser does, then hydrates the same
 * element onto that markup and asserts React reports nothing.
 */

type ScriptProps = { nonce?: string; id?: string; children?: ReactNode; dangerouslySetInnerHTML?: { __html: string } };
const NONCE = 'synthetic-nonce-value-0001';

async function inlineNonceScripts(): Promise<ReactElement<ScriptProps>[]> {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-nonce': NONCE }) as never);
  const tree = await RootLayout({ children: <div>page</div> });
  const out: ReactElement<ScriptProps>[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<ScriptProps>(child)) return;
      if (child.type === 'script' && child.props.nonce) out.push(child);
      else if (child.type === ThemeInitScript) out.push(ThemeInitScript(child.props) as ReactElement<ScriptProps>);
      visit(child.props.children);
    });
  }
  visit(tree);
  return out;
}

const roots: Root[] = [];
let errors: string[] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  });
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('the root layout emits the three nonce-bearing inline scripts as plain <script> elements', async () => {
  const scripts = await inlineNonceScripts();
  const ids = scripts.map((s) => s.props.id ?? (s.props.dangerouslySetInnerHTML?.__html.includes("'wap-theme'") ? 'theme-init' : 'chunk-reload'));
  expect(ids.sort()).toEqual(['chunk-reload', 'gtm-consent-default', 'theme-init']);
  for (const s of scripts) expect(s.props.nonce).toBe(NONCE);
});

it('each inline script hydrates cleanly after the browser blanks its nonce under a CSP header', async () => {
  const scripts = await inlineNonceScripts();
  expect(scripts.length).toBeGreaterThan(0);
  for (const element of scripts) {
    const html = renderToString(element);
    expect(html).toContain(`nonce="${NONCE}"`);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    // Nonce hiding: with a header-delivered CSP the browser exposes nonce="" on the element.
    const script = host.querySelector('script')!;
    expect(script.getAttribute('nonce')).toBe(NONCE);
    script.setAttribute('nonce', '');
    errors = [];
    await act(async () => {
      roots.push(hydrateRoot(host, element));
    });
    const label = element.props.id ?? element.props.dangerouslySetInnerHTML?.__html.slice(0, 40);
    expect(errors.filter((e) => /hydrat|match the client|did not match/i.test(e)), `hydration report for ${label}`).toEqual([]);
  }
});
