import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickWioaClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { loadBlockTokens, loadRootTokens, readCss } from '@/lib/ui/cssTokenContrast.test-helpers';
import styles from '@/components/portal/WioaQualificationClient.module.css';

/**
 * /wioa-qualification is a public Next route: app/layout.tsx loads main.css,
 * wa-brand-tokens.css and astryx-brand-bridge.css, never portal-tokens.css.
 * `WioaQualificationClient mode="public"` therefore carries a local `.public`
 * bridge that declares the few portal-only `--wa-*` neutrals its subtree
 * paints. PortalVoiceSession renders inside it and now reads
 * `--wa-sidebar-bg` / `--wa-sidebar-text` / `--wa-sidebar-border` (and, for
 * suggestion cards, `--wa-surface-2` / `--wa-muted`) instead of hex; without
 * the bridge those resolve to nothing on this route — transparent panel,
 * white copy on the page. This spec renders the real public-mode tree with
 * the real voice panel, collects every custom property that reached the DOM
 * in each phase, and proves the stylesheets this route actually loads (brand
 * tokens + the bridge) define all of them, with the bridge values copied
 * from portal-tokens.css verbatim.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/wioa-qualification' }));
// The route mounts the panel through next/dynamic; render the real component in its place.
vi.mock('@/components/portal/PortalVoiceSessionLazy', async () => ({
  default: (await import('@/components/portal/PortalVoiceSession')).default,
}));
type SessionCallbacks = { onConnect?: () => void; onMessage?: (event: unknown) => void };
vi.mock('@elevenlabs/client', () => ({
  Conversation: {
    startSession: async (cfg: SessionCallbacks) => {
      queueMicrotask(() => {
        cfg.onConnect?.();
        cfg.onMessage?.({ source: 'ai', role: 'agent', message: 'Which county do you live in?' });
        cfg.onMessage?.({ source: 'user', role: 'user', message: 'Harris County.' });
      });
      return { endSession: vi.fn(), sendContextualUpdate: vi.fn(), setVolume: vi.fn() };
    },
  },
}));

const BRIDGED_NEUTRALS = ['--wa-sidebar-bg', '--wa-sidebar-text', '--wa-sidebar-border', '--wa-surface-2', '--wa-muted'] as const;
const MODULE_CSS = 'components/portal/WioaQualificationClient.module.css';

/** Every `--wa-*` custom property referenced by an inline style under `root`. */
function paintedTokenNames(root: HTMLElement): Set<string> {
  const names = new Set<string>();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
    for (const m of (el.getAttribute('style') ?? '').matchAll(/var\((--wa-[\w-]+)/g)) names.add(m[1]);
  }
  return names;
}

/** What the public route can resolve: wa-brand-tokens.css `:root` plus the `.public` bridge. */
function publicRouteTokens(): Set<string> {
  const brand = loadRootTokens(readCss('css/wa-brand-tokens.css'));
  const bridge = loadBlockTokens(readCss(MODULE_CSS), '.public');
  return new Set([...brand.keys(), ...bridge.keys()]);
}

function expectResolvable(root: HTMLElement, mustInclude: readonly string[]) {
  const painted = paintedTokenNames(root);
  for (const name of mustInclude) expect([...painted], `panel paints ${name}`).toContain(name);
  const available = publicRouteTokens();
  const unresolved = [...painted].filter((name) => !available.has(name));
  expect(unresolved, 'custom properties the public route cannot resolve').toEqual([]);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPublic() {
  const view = render(
    <NextIntlClientProvider locale="en" messages={pickWioaClientMessages(en)} timeZone="America/New_York">
      <WioaQualificationClientLoader />
    </NextIntlClientProvider>,
  );
  const root = view.container.firstElementChild as HTMLElement;
  expect(root.className.split(' ')).toContain(styles.public);
  return { ...view, root };
}

// Imported after the mocks above are registered.
const { default: WioaQualificationClient } = await import('@/components/portal/WioaQualificationClient');
function WioaQualificationClientLoader() {
  return <WioaQualificationClient mode="public" initialSnapshot={null} />;
}

describe('public WIOA screening: the voice panel resolves every token it paints', () => {
  it('pre phase paints the dark session chrome from the bridged sidebar tokens', () => {
    const { root } = renderPublic();
    fireEvent.click(screen.getByRole('radio', { name: en.wioa.voiceMode }));
    expect(screen.getByRole('button', { name: /start voice session/i })).toBeInTheDocument();
    expectResolvable(root, ['--wa-sidebar-bg', '--wa-sidebar-text', '--wa-hero-crimson']);
  });

  it('error, active and done phases stay resolvable on this route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ signedUrl: 'wss://voice.example/session' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    // First attempt: no microphone in jsdom → the crimson error notice.
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const { root } = renderPublic();
    fireEvent.click(screen.getByRole('radio', { name: en.wioa.voiceMode }));
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
    await screen.findByRole('alert');
    expectResolvable(root, ['--wa-sidebar-bg', '--wa-hero-crimson']);

    // Second attempt with a microphone: live transcript, then End session.
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
    const end = await screen.findByRole('button', { name: /end session/i });
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('Harris County.'));
    expectResolvable(root, ['--wa-sidebar-bg', '--wa-sidebar-text', '--wa-sidebar-border']);
    fireEvent.click(end);
    await screen.findByRole('button', { name: /start again/i });
    expectResolvable(root, ['--wa-sidebar-bg', '--wa-sidebar-text']);
  });

  it('the .public bridge copies the five portal-only neutrals from portal-tokens.css verbatim', () => {
    const bridge = loadBlockTokens(readCss(MODULE_CSS), '.public');
    const portal = loadRootTokens(readCss('css/portal-tokens.css'));
    const brand = loadRootTokens(readCss('css/wa-brand-tokens.css'));
    for (const name of BRIDGED_NEUTRALS) {
      expect(brand.has(name), `${name} is portal-only, so the route needs the bridge`).toBe(false);
      expect(portal.get(name), `${name} in portal-tokens.css`).toBeTruthy();
      expect(bridge.get(name), `${name} in the .public bridge`).toBe(portal.get(name));
    }
  });
});
