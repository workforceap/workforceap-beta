import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readCss, loadRootTokens, colorOf, contrast } from '@/lib/ui/cssTokenContrast.test-helpers';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import { ProgressBar, ProgressRing, StageTrack, SegmentedProgress, RankBars, type RankDatum } from '@/components/portal/kit';
import { statusToKitTone } from '@/components/portal/kit/pages/admin-subviews/SystemHealthKit';

/**
 * Portal audit item 11 — hex literals onto design tokens.
 *
 * The session-run cards, the admin analytics charts and the certifications
 * "Earn more" card used to paint from hard-coded hex (#0891b2, #4a9b4f,
 * #ad2c4d, #fff ...), which never followed dark mode. They now read the
 * `--wa-*` tokens. This spec renders each surface and inspects what actually
 * reaches the DOM (inline styles and SVG fill / stroke / stop-color), so a
 * literal creeping back in through any prop path fails here.
 *
 * Allowlist (a deliberate keep, see the constants in SessionRunClient):
 *  - #0077b5: LinkedIn's brand blue — a third-party identity colour.
 * The former VOICE_ACCENT / VOICE_ACCENT_DARK pair (#2563eb / #1e40af) is now
 * var(--wa-info) / var(--wa-info-dark) and is asserted below, not allowed.
 */
const ALLOWED_HEX = new Set(['#0077b5']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// jsdom normalises a bare hex in an inline style to `rgb(r, g, b)`, so an
// alpha-less rgb() in a style attribute is also a literal that bypassed the
// tokens. rgba() tints are left alone (they are how alpha is written).
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/g;
const ALLOWED_RGB = new Set(['rgb(0, 119, 181)']);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
// The admin dashboard's MFA banner fetches its own status; the funnel test below only reads the RankBars.
vi.mock('@/components/admin/MfaStatusBanner', () => ({ default: () => null }));
// VoiceAgentSurface paints from lib/portal/voiceAgentSurfaces.ts and has its
// own describe below (rendered through vi.importActual); stub it here so this
// assertion covers SessionRunClient's own chrome (children still render).
vi.mock('@/components/portal/VoiceAgentSurface', () => ({ default: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
// PortalVoiceSession is owned by the portal-ui-refine branch; record the accent
// props it is handed instead of rendering it.
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({
  default: ({ accent, accentDark }: { accent?: string; accentDark?: string }) => (
    <div data-testid="voice-session" data-accent={accent} data-accent-dark={accentDark} />
  ),
}));
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  // jsdom has no layout: give the charts a size and skip the enter animation so
  // the series paths are emitted with their final attributes.
  const noAnim = (C: React.ComponentType<Record<string, unknown>>) => {
    const NoAnim = (props: Record<string, unknown>) => <C {...props} isAnimationActive={false} />;
    NoAnim.displayName = `NoAnim(${C.displayName ?? C.name ?? 'Chart'})`;
    return NoAnim;
  };
  return {
    ...actual,
    Area: noAnim(actual.Area as never),
    Bar: noAnim(actual.Bar as never),
    Pie: noAnim(actual.Pie as never),
    ResponsiveContainer: ({ children, height }: { children: React.ReactElement; height?: number }) =>
      React.cloneElement(children, { width: 900, height: height ?? 240 } as Record<string, unknown>),
  };
});

// PortalVoiceSession's real client is only reached in the describe below; the
// stub connects, emits one line per speaker and hands back an endable session.
type SessionCallbacks = { onConnect?: () => void; onMessage?: (event: unknown) => void };
const startVoiceSession = vi.fn(async (cfg: SessionCallbacks) => {
  queueMicrotask(() => {
    cfg.onConnect?.();
    cfg.onMessage?.({ source: 'ai', role: 'agent', message: 'Tell me about your last role.' });
    cfg.onMessage?.({ source: 'user', role: 'user', message: 'I led a four-person support desk.' });
  });
  return { endSession: vi.fn(), sendContextualUpdate: vi.fn(), setVolume: vi.fn() };
});
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: (cfg: SessionCallbacks) => startVoiceSession(cfg) } }));

/** Every colour-bearing value that reached the DOM: inline styles + SVG paint attributes. */
function paintedValues(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attr of ['style', 'fill', 'stroke', 'stop-color', 'color']) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

function unexpectedHex(root: HTMLElement): string[] {
  const values = paintedValues(root);
  return [
    ...values.flatMap((v) => v.match(HEX) ?? []).filter((h) => !ALLOWED_HEX.has(h.toLowerCase())),
    ...values.flatMap((v) => v.match(BARE_RGB) ?? []).filter((c) => !ALLOWED_RGB.has(c)),
  ];
}

/** No allowlist: every hex or bare rgb() that reached the DOM. */
function allLiterals(root: HTMLElement): string[] {
  const values = paintedValues(root);
  return [...values.flatMap((v) => v.match(HEX) ?? []), ...values.flatMap((v) => v.match(BARE_RGB) ?? [])];
}

function styleOf(el: Element | null): string {
  return el?.getAttribute('style') ?? '';
}

beforeAll(() => {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

describe('SessionRunClient paints from --wa-* tokens', () => {
  it('idle, done and error states carry no hex literal outside the allowlist', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const fail = String(url).includes('elevator-pitch');
      return new Response(
        JSON.stringify(fail ? { error: 'Tool failed' } : { output: 'sample', parsed: { rawText: 'Score 8/10' }, headlines: ['A'], questions: [{}], pitch: 'Hi' }),
        { status: fail ? 500 : 200, headers: { 'Content-Type': 'application/json' } },
      );
    }));
    const { default: SessionRunClient } = await import('@/components/portal/sessions/SessionRunClient');
    const { container } = render(
      <SessionRunClient memberId="m1" memberFullName="Ada Lovelace" memberEmail="ada@example.org" memberPhone={null}
        memberTargetRole="Data Analyst" sessionId="s1" existingResume={'Experienced analyst. '.repeat(20)} isFreshWalkIn />,
    );
    // Idle: tool grid + card icon tiles.
    expect(unexpectedHex(container)).toEqual([]);

    // Open every collapsed tool card, then run everything that is runnable.
    for (const label of ['Elevator Pitch', 'Resume Rewriter', 'Gap Analysis', 'Resume Analysis', 'Job Match Score', 'LinkedIn Headline', 'LinkedIn About', 'Cover Letter', 'Interview Prep', 'Salary Script']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }));
    }
    for (const btn of Array.from(container.querySelectorAll<HTMLButtonElement>('button'))) {
      if (!btn.disabled && /^(Analyze|Score|Generate|Write|Build|Rewrite)/i.test(btn.textContent?.trim() ?? '')) fireEvent.click(btn);
    }
    await waitFor(() => {
      expect((container.textContent?.match(/Re-run/g) ?? []).length).toBeGreaterThanOrEqual(4);
      expect(screen.queryAllByRole('alert').some((el) => el.textContent === 'Tool failed')).toBe(true);
    });

    // Done and error states rendered: still token-only.
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    // The "Done" pill is text on the success tint, so it reads the dark ramp.
    expect(styles).toContain('var(--wa-success-soft)');
    expect(styles).toContain('var(--wa-success-dark)');
    // The walk-in banner and done dots are fills on the base hue.
    expect(styles).toContain('var(--wa-success)');
    // The LinkedIn tiles keep the brand blue, deliberately (jsdom renders it as rgb).
    expect(styles).toContain('rgb(0, 119, 181)');
    // The voice sessions are handed token pairs only: the info pair on the
    // walk-through / resume / cover cards, the gold pair on the interview card.
    // PortalVoiceSession mixes its alpha steps with color-mix, so a var() is
    // a valid accent and no hex may be handed down any more. Only one card is
    // in voice mode at a time (the walk-through starts there on a fresh
    // walk-in), so record that mount, then open the other three one by one.
    const pairOf = (el: HTMLElement) => [el.getAttribute('data-accent'), el.getAttribute('data-accent-dark')] as const;
    const accents: Array<readonly [string | null, string | null]> = [pairOf(screen.getByTestId('voice-session'))];
    const useVoice = screen.getAllByRole('button', { name: /^use voice$/i });
    expect(useVoice.length).toBe(3);
    for (const btn of useVoice) {
      fireEvent.click(btn);
      accents.push(pairOf(screen.getByTestId('voice-session')));
    }
    expect(accents).toEqual([
      ['var(--wa-info)', 'var(--wa-info-dark)'],
      ['var(--wa-info)', 'var(--wa-info-dark)'],
      ['var(--wa-info)', 'var(--wa-info-dark)'],
      ['var(--wa-gold)', 'var(--wa-gold-dark)'],
    ]);
    for (const [accent, dark] of accents) {
      expect(accent).not.toMatch(HEX);
      expect(dark).not.toMatch(HEX);
    }
    // No legacy var(--color-green|error, #hex) fallbacks survive.
    expect(styles).not.toMatch(/var\(--color-(green|error|gold)/);
    vi.unstubAllGlobals();
  });
});

describe('AdminAnalyticsCharts paints from --wa-* tokens', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ date: `9/${i + 8}`, events: 5 + ((i * 7) % 11), aiTools: 2 + ((i * 3) % 6), applications: (i * 5) % 4 }));
  const programs = ['IT Support', 'Cybersecurity', 'Data Analytics', 'Project Mgmt', 'UX Design', 'Digital Marketing', 'Bookkeeping', 'Other'];

  it('series, gradients, ticks, legend and pie carry no hex literal', async () => {
    const { default: Charts } = await import('@/components/admin/AdminAnalyticsCharts');
    const { container } = render(
      <Charts dailyActivity={days} enrollmentByProgram={programs.map((program, i) => ({ program, count: 40 - i * 4 }))}
        placementStats={{ enrolled: 120, placed: 48, certifications: 77, placementRate: 40 }} inactive14Days={9} applicationsSubmitted={210} resourcesCompleted={512}
        aiToolStats={{ runsLastNDays: 88, trend: 12, totalRuns: 1400, breakdown: [{ toolType: 'cover_letter', count: 30 }, { toolType: 'gap_analyzer', count: 14 }] }} />,
    );
    // The series really rendered (not an empty ResponsiveContainer shell).
    expect(container.querySelectorAll('path.recharts-area-area').length).toBe(3);
    expect(container.querySelectorAll('stop').length).toBe(6);
    expect(unexpectedHex(container)).toEqual([]);

    const strokes = Array.from(container.querySelectorAll('path.recharts-area-curve')).map((p) => p.getAttribute('stroke'));
    expect(strokes).toEqual(['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-success)']);
    // Gradient stops read the same tokens as their series.
    const stops = Array.from(container.querySelectorAll('stop')).map((s) => s.getAttribute('stop-color'));
    expect(new Set(stops)).toEqual(new Set(['var(--wa-accent)', 'var(--wa-info)', 'var(--wa-success)']));
    // Axis ticks read the neutral muted token.
    expect(container.querySelector('.recharts-cartesian-axis-tick-value')?.getAttribute('fill')).toBe('var(--wa-muted)');
    // The donut remainder is the neutral track, not a legacy MD3 container.
    const pieFills = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((p) => p.getAttribute('fill'));
    expect(pieFills).toEqual(['var(--wa-success)', 'var(--wa-track)']);
  });

  it('keeps eight distinguishable categorical fills for the program bars', async () => {
    const { default: Charts } = await import('@/components/admin/AdminAnalyticsCharts');
    const { container } = render(
      <Charts dailyActivity={days} enrollmentByProgram={programs.map((program, i) => ({ program, count: 40 - i * 4 }))}
        placementStats={{ enrolled: 120, placed: 48, certifications: 77, placementRate: 40 }} inactive14Days={9} applicationsSubmitted={210} resourcesCompleted={512} />,
    );
    const fills = Array.from(container.querySelectorAll('.recharts-bar-rectangle path')).map((p) => p.getAttribute('fill') ?? '');
    expect(fills).toHaveLength(8);
    expect(new Set(fills).size).toBe(8);
    for (const fill of fills) expect(fill).toMatch(/^(var\(--wa-[a-z-]+\)|color-mix\(in srgb, var\(--wa-[a-z-]+\) \d+%, var\(--wa-[a-z-]+\)\))$/);

    // The eight hues stay apart from each other and readable as fills (3:1
    // graphics threshold) on the card surface in both themes — arithmetic
    // over the real token files, not a copy of them.
    const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
    for (const scheme of ['light', 'dark'] as const) {
      const surface = colorOf('var(--wa-surface)', tokens, scheme);
      const rgb = fills.map((f) => colorOf(f, tokens, scheme));
      rgb.forEach((c, i) => {
        expect(contrast(c, surface), `${scheme} ${fills[i]} on --wa-surface`).toBeGreaterThanOrEqual(3);
        for (let j = i + 1; j < rgb.length; j += 1) {
          const dist = Math.hypot(c.r - rgb[j].r, c.g - rgb[j].g, c.b - rgb[j].b);
          expect(dist, `${scheme} ${fills[i]} vs ${fills[j]}`).toBeGreaterThan(40);
        }
      });
    }
  });
});

describe('CertificationsEarnMoreCard paints from the hero tokens', () => {
  it('renders gradient, copy and white action from --wa-hero-* / --wa-on-hero with no hex', async () => {
    const { default: Card } = await import('@/components/portal/CertificationsEarnMoreCard');
    const { container } = render(<Card />);
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    expect(styles).toContain('var(--wa-hero-crimson)');
    expect(styles).toContain('var(--wa-hero-crimson-dark)');
    expect(styles).toContain('var(--wa-on-hero)');
    const action = screen.getByRole('link', { name: /view pathway/i });
    expect(action.getAttribute('style')).toContain('var(--wa-hero-action-bg)');
    expect(action.getAttribute('style')).toContain('var(--wa-hero-action-text)');
    expect(action).toHaveAttribute('href', '/dashboard/learning');
  });
});

/**
 * Follow-up to the sweep above: PortalVoiceSession carried ~31 hex literals
 * and derived its glow / transcript rule from `${accent}44` / `${accent}88`,
 * a string concat that only works for a 6-digit hex accent. Callers already
 * pass `var(--wa-gold)` (SessionRunClient interview card) and
 * `colorVar('accent')` (CareerBusinessCoachKit), which yielded the invalid
 * `var(--wa-gold)44`. The alpha steps are now `color-mix(in srgb, <accent>
 * 27% / 53%, transparent)`; the panel reads the constant `--wa-sidebar-*`
 * chrome. These tests drive the real component through pre, error, active
 * (live transcript) and done (suggestion cards) with the client, microphone
 * and endpoints mocked, and inspect the inline styles that reached the DOM.
 */
function mockEndpoints(suggestions: Array<{ original?: string; suggested: string; context: string }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = String(url).includes('suggestions') ? { suggestions } : { signedUrl: 'wss://voice.example/session' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

async function renderVoice(props: Record<string, unknown> = {}) {
  const { default: PortalVoiceSession } = await import('@/components/portal/PortalVoiceSession');
  return render(
    <PortalVoiceSession
      sessionEndpoint="/api/voice/session"
      suggestionsEndpoint="/api/voice/suggestions"
      title="Interview coach"
      description="Practice answering out loud."
      liveTranscriptCoachLabel="Interviewer"
      liveTranscriptYouLabel="You"
      {...props}
    />,
  );
}

describe('PortalVoiceSession paints from --wa-* tokens with a token accent', () => {
  const GOLD = { accent: 'var(--wa-gold)', accentDark: 'var(--wa-gold-dark)' };

  it('pre phase: no literal, and the start glow is a color-mix of the caller accent, never a hex-suffix concat', async () => {
    const { container } = await renderVoice(GOLD);
    expect(allLiterals(container)).toEqual([]);
    const start = screen.getByRole('button', { name: /start voice session/i });
    const style = styleOf(start);
    expect(style).toContain('background: var(--wa-gold)');
    expect(style).toContain('color: var(--wa-sidebar-text)');
    expect(style).toContain('box-shadow: 0 4px 20px color-mix(in srgb, var(--wa-gold) 27%, transparent)');
    expect(style).not.toContain('var(--wa-gold)44');
    // Panel chrome reads the constant sidebar set, so it is dark in both themes.
    expect(styleOf(container.firstElementChild)).toContain('background: var(--wa-sidebar-bg)');
    expect(styleOf(screen.getByRole('heading', { name: 'Interview coach' }))).toContain('color: var(--wa-sidebar-text)');
  });

  it('defaults to the brand crimson tokens when no accent is passed', async () => {
    const { container } = await renderVoice();
    expect(allLiterals(container)).toEqual([]);
    expect(styleOf(screen.getByRole('button', { name: /start voice session/i }))).toContain('background: var(--wa-hero-crimson)');
  });

  it('error notice: crimson tints and pink text as color-mix over the panel, no literal', async () => {
    // No mediaDevices in jsdom: the microphone request throws and the panel shows the alert.
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const { container } = await renderVoice(GOLD);
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Microphone: access is required/);
    const style = styleOf(alert);
    expect(style).toContain('background: color-mix(in srgb, var(--wa-hero-crimson) 15%, transparent)');
    expect(style).toContain('border: 1px solid color-mix(in srgb, var(--wa-hero-crimson) 40%, transparent)');
    expect(style).toContain('color: color-mix(in srgb, var(--wa-hero-crimson) 35%, var(--wa-sidebar-text))');
    expect(allLiterals(container)).toEqual([]);
  });

  it('active and done phases: transcript rule, speaking pill, wells and suggestion cards are token-only', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
    mockEndpoints([
      { original: 'Did support stuff.', suggested: 'Led a four-person support desk.', context: 'Quantify the team you led.' },
    ]);
    const { container } = await renderVoice(GOLD);
    fireEvent.click(screen.getByRole('button', { name: /start voice session/i }));

    // Active: End session button, the live transcript with both speakers.
    const end = await screen.findByRole('button', { name: /end session/i });
    expect(startVoiceSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('I led a four-person support desk.'));
    expect(allLiterals(container)).toEqual([]);
    const painted = paintedValues(container).join('\n');
    // The coach line's rule is the 53% accent step (was `${accent}88`).
    expect(painted).toContain('border-left: 2px solid color-mix(in srgb, var(--wa-gold) 53%, transparent)');
    expect(painted).not.toContain('var(--wa-gold)88');
    // Speaking / listening pill tints the accent instead of a fixed crimson rgba.
    expect(painted).toContain('background: color-mix(in srgb, var(--wa-gold) 18%, transparent)');
    // The transcript well is one step darker than the panel, bordered by the sidebar token.
    expect(styleOf(screen.getByRole('log'))).toContain('background: color-mix(in srgb, var(--wa-sidebar-bg) 70%, black)');
    expect(styleOf(screen.getByRole('log'))).toContain('border: 1px solid var(--wa-sidebar-border)');
    expect(styleOf(end)).toContain('background: var(--wa-gold)');

    // Done: suggestion cards (Before / After) from the mocked endpoint.
    fireEvent.click(end);
    await screen.findByText('Coach suggestions (1)');
    expect(allLiterals(container)).toEqual([]);
    const before = screen.getByText('Before').parentElement!;
    expect(styleOf(before)).toContain('background: var(--wa-surface-2)');
    expect(styleOf(before)).toContain('border: 1px solid var(--wa-border)');
    expect(styleOf(screen.getByText('Before'))).toContain('color: var(--wa-muted)');
    const after = screen.getByText('After').parentElement!;
    expect(styleOf(after)).toContain('background: var(--wa-success-soft)');
    expect(styleOf(after)).toContain('border: 1px solid color-mix(in srgb, var(--wa-success) 35%, transparent)');
    expect(styleOf(screen.getByText('After'))).toContain('color: var(--wa-success-dark)');
    expect(styleOf(screen.getByText('Led a four-person support desk.'))).toContain('color: var(--wa-success-dark)');
    expect(styleOf(screen.getByRole('button', { name: /approve/i }))).toContain('background: var(--wa-gold)');
    vi.unstubAllGlobals();
    startVoiceSession.mockClear();
  });
});

/**
 * Follow-up to #2463: lib/portal/voiceAgentSurfaces.ts painted its crimson
 * ring, glow and CTA gradient from `#ad2c4d` / `#8c0f37`. They now read the
 * `--wa-hero-crimson` pair (the same one CertificationsEarnMoreCard uses), so
 * white badge copy over the ring stays dark in both themes. Render the real
 * VoiceAgentSurface (the module is stubbed above for the SessionRunClient
 * sweep) with each surface that consumes the crimson constants.
 */
describe('voiceAgentSurfaces crimson surfaces paint from the hero tokens', () => {
  async function renderSurface(name: 'resumeCoachVoiceSurface' | 'employerVoiceSurface' | 'careerBusinessVoiceSurface' | 'mockInterviewVoiceSurface') {
    const { default: Surface } = await vi.importActual<typeof import('@/components/portal/VoiceAgentSurface')>('@/components/portal/VoiceAgentSurface');
    const surfaces = await import('@/lib/portal/voice');
    const surface = surfaces[name];
    const { container } = render(<Surface {...surface}><p>panel</p></Surface>);
    return { container, surface };
  }

  it.each(['resumeCoachVoiceSurface', 'employerVoiceSurface', 'careerBusinessVoiceSurface'] as const)(
    '%s: ring, glow, icon tile and badge carry no literal and read --wa-hero-crimson',
    async (name) => {
      const { container, surface } = await renderSurface(name);
      expect(allLiterals(container)).toEqual([]);
      const ring = styleOf(container.firstElementChild);
      expect(ring).toContain('background: linear-gradient(135deg, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))');
      expect(ring).toContain('box-shadow: 0 16px 48px color-mix(in srgb, var(--wa-hero-crimson) 16%, transparent)');
      expect(styleOf(screen.getByText(surface.badge))).toContain('color: var(--wa-hero-crimson)');
      // The CTA gradient callers paint from is the same token pair.
      expect(surface.ctaGradient).toBe('linear-gradient(135deg, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))');
      expect(surface.ctaGradient).not.toMatch(HEX);
      expect(surface.glowColor).toBe('var(--wa-hero-crimson)');
    },
  );

  it('mockInterviewVoiceSurface: glow and CTA read the hero tokens; the ring keeps only its plum stop', async () => {
    const { container, surface } = await renderSurface('mockInterviewVoiceSurface');
    // The ring's deep-plum end stop (#5e1426) has no `--wa-*` token yet and is
    // the one literal left on this surface; the crimson-dark start stop and
    // everything else read the tokens.
    expect(new Set(allLiterals(container))).toEqual(new Set(['#5e1426']));
    const ring = styleOf(container.firstElementChild);
    expect(ring).toContain('background: linear-gradient(135deg, var(--wa-hero-crimson-dark), #5e1426)');
    expect(ring).toContain('box-shadow: 0 16px 48px color-mix(in srgb, var(--wa-hero-crimson) 16%, transparent)');
    expect(styleOf(screen.getByText(surface.badge))).toContain('color: var(--wa-hero-crimson)');
    expect(surface.ctaGradient).toBe('linear-gradient(135deg, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))');
    expect(surface.glowColor).toBe('var(--wa-hero-crimson)');
  });
});

describe('VoiceCoachLauncherCard CTA shadow', () => {
  it('falls back to a color-mix of the glow colour when no ctaShadow is passed, never a hex-alpha suffix', async () => {
    const { default: Card } = await import('@/components/portal/VoiceCoachLauncherCard');
    const { ctaShadow: _omitted, ...surface } = (await import('@/lib/portal/voice')).resumeCoachVoiceSurface;
    void _omitted;
    const { container } = render(
      <Card {...surface} title="Resume coach" description="Line by line." href="/dashboard/resume-coach" ctaLabel="Open" />,
    );
    const cta = screen.getByRole('link', { name: /open/i });
    const style = styleOf(cta);
    expect(style).toContain('box-shadow: 0 8px 24px color-mix(in srgb, var(--wa-hero-crimson) 20%, transparent)');
    expect(style).not.toMatch(/\)33\b/);
    expect(style).toContain('background: linear-gradient(135deg, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))');
    // The white CTA text on the hero gradient is the one deliberate literal
    // here (jsdom normalises `#fff` to rgb); the shadow contributes none.
    expect(allLiterals(container)).toEqual(['rgb(255, 255, 255)']);
  });
});

describe('AdminAnalyticsCharts grid', () => {
  it('draws every CartesianGrid line from --wa-border so it resolves in light mode too', async () => {
    const { default: Charts } = await import('@/components/admin/AdminAnalyticsCharts');
    const days = Array.from({ length: 14 }, (_, i) => ({ date: `9/${i + 8}`, events: 5 + ((i * 7) % 11), aiTools: 2 + ((i * 3) % 6), applications: (i * 5) % 4 }));
    const programs = ['IT Support', 'Cybersecurity', 'Data Analytics', 'Project Mgmt'];
    const { container } = render(
      <Charts dailyActivity={days} enrollmentByProgram={programs.map((program, i) => ({ program, count: 40 - i * 4 }))}
        placementStats={{ enrolled: 120, placed: 48, certifications: 77, placementRate: 40 }} inactive14Days={9} applicationsSubmitted={210} resourcesCompleted={512}
        aiToolStats={{ runsLastNDays: 88, trend: 12, totalRuns: 1400, breakdown: [{ toolType: 'cover_letter', count: 30 }, { toolType: 'gap_analyzer', count: 14 }] }} />,
    );
    const grids = container.querySelectorAll('.recharts-cartesian-grid');
    expect(grids.length).toBe(3);
    const lines = Array.from(container.querySelectorAll('.recharts-cartesian-grid line'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.getAttribute('stroke')).toBe('var(--wa-border)');
    // The old `rgba(255,255,255,0.05)` was white-on-white in light mode.
    expect(lines.some((l) => /rgba\(255,\s*255,\s*255/.test(l.getAttribute('stroke') ?? ''))).toBe(false);
  });
});

/**
 * Kit tone follow-ups (wave 13 #2409 / #2464 leftovers): the progress and
 * rank primitives take a `KitTone` only. The deprecated categorical `color`
 * prop is gone from ProgressBar, ProgressRing, StageTrack and RankDatum, and
 * SegmentedProgress moved from `color` onto the same tone contract. Every
 * assertion here reads the rendered DOM: the container declares
 * `.wa-kit-tone--<tone>` and the fill / stroke is `var(--wa-kit-tone)`.
 */
describe('kit progress and rank primitives paint from tones', () => {
  it('ProgressBar / ProgressRing / StageTrack / SegmentedProgress: tone hook on the container, --wa-kit-tone fill, no literal', () => {
    const { container } = render(
      <>
        <ProgressBar pct={40} tone="ok" aria-label="Bar" />
        <ProgressRing pct={40} tone="warn" label="Ring" />
        <StageTrack index={2} total={3} tone="ok" />
        <SegmentedProgress pct={50} segments={4} tone="alert" label="Seg" />
      </>,
    );
    const bar = screen.getByRole('progressbar', { name: 'Bar' });
    expect(bar.className).toContain('wa-kit-tone--ok');
    expect(styleOf(bar.querySelector('.wa-kit-bar-fill'))).toContain('var(--wa-kit-tone)');

    const ring = screen.getByRole('progressbar', { name: 'Ring' });
    expect(ring.className).toContain('wa-kit-tone--warn');
    const arcs = ring.querySelectorAll('circle');
    expect(arcs[1].getAttribute('stroke')).toBe('var(--wa-kit-tone)');

    const track = container.querySelector<HTMLElement>('[aria-hidden].wa-kit-tone--ok');
    expect(track).not.toBeNull();
    const segments = Array.from(track!.querySelectorAll('span'));
    expect(segments).toHaveLength(3);
    expect(styleOf(segments[0])).toContain('var(--wa-kit-tone)');
    expect(styleOf(segments[2])).toContain('var(--wa-track)');

    const seg = screen.getByRole('progressbar', { name: 'Seg' });
    expect(seg.className).toContain('wa-kit-tone--alert');
    const segSpans = Array.from(seg.querySelectorAll('span'));
    expect(segSpans).toHaveLength(4);
    expect(styleOf(segSpans[0])).toContain('var(--wa-kit-tone)');
    expect(styleOf(segSpans[0])).not.toContain('var(--wa-accent)');
    expect(styleOf(segSpans[3])).toContain('var(--wa-track)');

    expect(allLiterals(container)).toEqual([]);
  });

  it('untoned, the primitives declare no tone hook and let the CSS default (accent) paint', () => {
    const { container } = render(
      <>
        <ProgressBar pct={40} aria-label="Bar" />
        <SegmentedProgress pct={50} segments={2} label="Seg" />
      </>,
    );
    expect(container.querySelector('[class*="wa-kit-tone--"]')).toBeNull();
    expect(styleOf(screen.getByRole('progressbar', { name: 'Bar' }).querySelector('.wa-kit-bar-fill'))).not.toContain('background');
    expect(styleOf(screen.getByRole('progressbar', { name: 'Seg' }).querySelector('span'))).toContain('var(--wa-accent)');
    expect(allLiterals(container)).toEqual([]);
  });

  it('RankBars: each row declares its tone and fills from --wa-kit-tone', () => {
    // /admin/health builds its uptime rows through this mapper (was statusToKitColor → success/gold/accent).
    expect(statusToKitTone('ok')).toBe('ok');
    expect(statusToKitTone('degraded')).toBe('warn');
    expect(statusToKitTone('fail')).toBe('alert');
    expect(statusToKitTone('unknown')).toBe('muted');
    const data: RankDatum[] = [
      { label: 'On track', value: 6, pct: 60, tone: 'ok' },
      { label: 'Lagging', value: 3, pct: 30, tone: 'warn' },
      { label: 'Needs a look', value: 1, pct: 10, tone: 'alert' },
      { label: 'Plain', value: 0, pct: 5 },
    ];
    const { container } = render(<RankBars data={data} />);
    for (const tone of ['ok', 'warn', 'alert']) {
      const row = container.querySelector<HTMLElement>(`.wa-kit-tone--${tone}`);
      expect(row, tone).not.toBeNull();
      expect(styleOf(row!.querySelector('.wa-kit-bar-fill'))).toContain('var(--wa-kit-tone)');
    }
    const plain = screen.getByText('Plain').closest('div')!.parentElement!;
    expect(plain.className).not.toContain('wa-kit-tone--');
    expect(styleOf(plain.querySelector('.wa-kit-bar-fill'))).not.toContain('background');
    expect(allLiterals(container)).toEqual([]);
  });

  it('the categorical `color` prop is no longer accepted (type-level: these lines error once `color` comes back)', () => {
    const rejected: unknown[] = [
      // @ts-expect-error ProgressBar takes `tone`, not a categorical `color`.
      <ProgressBar key="bar" pct={1} color="accent" />,
      // @ts-expect-error ProgressRing takes `tone`, not a categorical `color`.
      <ProgressRing key="ring" pct={1} color="gold" />,
      // @ts-expect-error StageTrack takes `tone`, not a categorical `color`.
      <StageTrack key="track" index={1} color="success" />,
      // @ts-expect-error SegmentedProgress takes `tone`, not a categorical `color`.
      <SegmentedProgress key="seg" pct={1} segments={2} label="x" color="accent" />,
      // @ts-expect-error RankDatum carries `tone`, not a categorical `color`.
      { label: 'x', value: 1, pct: 1, color: 'success' } satisfies RankDatum,
    ];
    expect(rejected).toHaveLength(5);
  });
});

describe('AdminDashboardKit funnel bars paint from tones', () => {
  it('rates ≥50 / ≥25 / <25 render ok / warn / alert rows filled from --wa-kit-tone, never a categorical var', async () => {
    const { AdminDashboardKit } = await import('@/components/portal/kit/pages/admin-subviews/AdminDashboardKit');
    const summary = {
      totalMembers: 120, enrolledMembers: 80, enrollmentRate: 66, assessmentRate: 40, activeDashboardUsers: 50,
      activationRate: 42, aiToolRuns: 300, totalPlacements: 12, avgPlacementSalary: null, placementRate: 10,
    };
    const funnels = [
      { name: 'Enrollment', current: 60, target: 100, rate: 60, description: 'Enrolled of applied' },
      { name: 'Assessment', current: 30, target: 100, rate: 30, description: 'Assessed of enrolled' },
      { name: 'Placement', current: 10, target: 100, rate: 10, description: 'Placed of assessed' },
    ];
    const { container } = render(
      <AdminDashboardKit summary={summary} funnels={funnels} signupData={[]} enrollmentData={[]} viewData={[]} />,
    );
    const expected: Array<[string, string]> = [['Enrollment', 'ok'], ['Assessment', 'warn'], ['Placement', 'alert']];
    for (const [name, tone] of expected) {
      const row = screen.getByText(name, { exact: true }).closest('div')!.parentElement!;
      expect(row.className, name).toContain(`wa-kit-tone--${tone}`);
      const fill = styleOf(row.querySelector('.wa-kit-bar-fill'));
      expect(fill, name).toContain('var(--wa-kit-tone)');
      expect(fill, name).not.toMatch(/var\(--wa-(success|gold|accent)\)/);
    }
    expect(unexpectedHex(container)).toEqual([]);
  });
});

describe('MemberHomeKit stat tiles are the kit StatSparkTile', () => {
  it('renders the four home tiles through the shared tile (kit stat label, tone hook, --wa-kit-tone line) with no literal', async () => {
    const { MemberHomeKit } = await import('@/components/portal/kit/pages/member/MemberHomeKit');
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberHomeKit
          firstName="Mike" coursePercent={100} activeJobs={1} certs={0} points={100}
          programTitle="IT Support Professional Certificate (IBM)" programStatus="In progress"
          currentStreak={0} longestStreak={0} goals={[]} pipeline={[]}
          pointsLedger={[{ label: 'Applied to a job', amount: 25 }, { label: 'Studied', amount: 5, tone: 'ok' }]}
          certModulesDone={0} certModulesTotal={9}
          programHref="/dashboard/program" resumeHref="/dashboard/program" coursesHref="/dashboard/program"
          toolkitHref="/dashboard/toolkit" jobsHref="/dashboard/jobs" doThisNext={null} ungatedDigitalBasicsHref={null}
          pointsSpark={{ series: [10, 40, 25, 75] }}
        />
      </NextIntlClientProvider>,
    );
    // The shared tile labels through `.wa-kit-stat-label`; the retired local tile styled its label inline.
    for (const label of ['Course', 'Active jobs', 'Certs']) {
      expect(screen.getByText(label, { exact: true }).className, label).toContain('wa-kit-stat-label');
    }
    // A finished course is `ok`: the tile declares the hook and its icon chip is the kit's tone icon.
    const courseTile = screen.getByText('Course', { exact: true }).closest('.wa-kit-tone--ok');
    expect(courseTile).not.toBeNull();
    expect(courseTile!.querySelector('.wa-kit-tone-icon')).not.toBeNull();
    // The points sparkline is the kit Sparkline (accent, untoned tile), not a hand-rolled polyline.
    const line = container.querySelector('svg[viewBox="0 0 100 28"] polyline');
    expect(line).not.toBeNull();
    expect(line!.getAttribute('stroke')).toBe('var(--wa-accent)');
    // Series-less tiles keep the opt-in "No trend yet" slot.
    expect(screen.getAllByText(messages.dashboard.noTrendYet).length).toBeGreaterThanOrEqual(3);
    expect(unexpectedHex(container)).toEqual([]);
  });
});

describe('StaffMemberResumePanel paints from --wa-* tokens', () => {
  const renderPanel = async () => {
    const { default: StaffMemberResumePanel } = await import('@/components/counselor/StaffMemberResumePanel');
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StaffMemberResumePanel memberId="m1" />
      </NextIntlClientProvider>,
    );
  };

  it('error state: the alert reads --wa-danger, not the legacy --color-accent hex fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const { container } = await renderPanel();
    const alert = await screen.findByRole('alert');
    expect(styleOf(alert)).toContain('var(--wa-danger)');
    expect(unexpectedHex(container)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('PDF preview: the iframe backdrop is a surface token, no hex', async () => {
    const meta = {
      hasOriginal: true, hasEnhanced: false, originalUrl: 'https://files.example/r.pdf', enhancedUrl: null, enhancedText: null,
      originalExt: 'pdf', enhancedExt: null, previewOriginalPath: '/api/counselor/members/m1/resume/preview?variant=original', previewEnhancedPath: null,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(meta), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const { container } = await renderPanel();
    const frame = await screen.findByTitle(/PDF preview/);
    expect(styleOf(frame)).toContain('var(--wa-surface-2)');
    // The "Larger view" dialog mounts the second (full-height) iframe on the same token.
    fireEvent.click(screen.getByRole('button', { name: 'Larger view' }));
    const large = screen.getByTitle('Resume PDF');
    expect(styleOf(large)).toContain('var(--wa-surface-2)');
    expect(unexpectedHex(container)).toEqual([]);
    expect(unexpectedHex(document.body)).toEqual([]);
    vi.unstubAllGlobals();
  });
});
