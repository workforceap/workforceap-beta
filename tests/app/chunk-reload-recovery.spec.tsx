import { beforeEach, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { runInNewContext } from 'node:vm';

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
import { headers } from 'next/headers';

type ScriptProps = { children?: ReactNode; dangerouslySetInnerHTML?: { __html: string } };
let source: string;
beforeEach(async () => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-nonce': 'synthetic-nonce' }) as never);
  const tree = await RootLayout({ children: <span>Test page</span> });
  source = '';
  const visit = (node: ReactNode) => Children.forEach(node, (child) => {
    if (!isValidElement<ScriptProps>(child)) return;
    const code = child.props.dangerouslySetInnerHTML?.__html;
    if (child.type === 'script' && code?.includes('wap:chunk-reload-once')) source = code;
    visit(child.props.children);
  });
  visit(tree);
  expect(source).not.toBe('');
});

function loadPage(store = new Map<string, string>(), unavailable?: 'read' | 'write') {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const reload = vi.fn();
  const sessionStorage = {
    getItem(key: string) { if (unavailable === 'read') throw new Error('Storage unavailable'); return store.get(key) ?? null; },
    setItem(key: string, value: string) { if (unavailable === 'write') throw new Error('Storage full'); store.set(key, value); },
    removeItem(key: string) { store.delete(key); },
  };
  runInNewContext(source, {
    sessionStorage,
    window: { location: { reload }, addEventListener: (name: string, handler: typeof handlers[string]) => { handlers[name] = handler; } },
  });
  return { handlers, reload, store };
}

it('reloads once for a chunk load error, not once per event', () => {
  const page = loadPage();
  page.handlers.error({ message: 'Loading chunk 123 failed' });
  page.handlers.error({ message: 'Loading chunk 456 failed' });
  expect(page.reload).toHaveBeenCalledTimes(1);
});

it('preserves the retry guard when the new document loads', () => {
  const store = new Map<string, string>();
  const first = loadPage(store);
  first.handlers.error({ message: 'ChunkLoadError' });
  expect(first.reload).toHaveBeenCalledTimes(1);
  const second = loadPage(store);
  second.handlers.error({ message: 'ChunkLoadError' });
  expect(second.reload).not.toHaveBeenCalled();
});

it.each(['read', 'write'] as const)('does not auto-reload when storage %s fails', (failure) => {
  const page = loadPage(new Map(), failure);
  page.handlers.error({ message: 'Loading chunk 123 failed' });
  expect(page.reload).not.toHaveBeenCalled();
});

it('leaves unrelated errors and rejections alone', () => {
  const page = loadPage();
  const preventDefault = vi.fn();
  page.handlers.error({ message: 'Request validation failed' });
  page.handlers.unhandledrejection({ reason: new Error('Request validation failed'), preventDefault });
  expect(page.reload).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});

it('only suppresses a failed import rejection when actually retrying', () => {
  const page = loadPage();
  const firstPrevent = vi.fn();
  page.handlers.unhandledrejection({ reason: { name: 'ChunkLoadError', message: 'Bundle unavailable' }, preventDefault: firstPrevent });
  expect(page.reload).toHaveBeenCalledTimes(1);
  expect(firstPrevent).toHaveBeenCalledTimes(1);
  const secondPrevent = vi.fn();
  page.handlers.unhandledrejection({ reason: 'Failed to fetch dynamically imported module', preventDefault: secondPrevent });
  expect(page.reload).toHaveBeenCalledTimes(1);
  expect(secondPrevent).not.toHaveBeenCalled();
});

it('recognizes a structured chunk error even with a generic message', () => {
  const page = loadPage();
  page.handlers.error({ message: 'Script error', error: { name: 'ChunkLoadError', message: 'Bundle unavailable' } });
  expect(page.reload).toHaveBeenCalledTimes(1);
});

it('does not swallow an import failure when a previous document already retried', () => {
  const page = loadPage(new Map([['wap:chunk-reload-once', '1']]));
  const preventDefault = vi.fn();
  page.handlers.unhandledrejection({ reason: 'Loading chunk 123 failed', preventDefault });
  expect(page.reload).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});
