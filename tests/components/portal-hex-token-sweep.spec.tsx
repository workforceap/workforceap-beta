import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readCss, loadRootTokens, colorOf, contrast } from '@/lib/ui/cssTokenContrast.test-helpers';

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
 * Allowlist (each a deliberate keep, see the constants in SessionRunClient):
 *  - #0077b5: LinkedIn's brand blue — a third-party identity colour.
 *  - #2563eb / #1e40af: PortalVoiceSession derives `${accent}44` alpha strings
 *    from its accent prop, so it must be handed a 6-digit hex until that
 *    component moves to color-mix (owned by the portal-ui-refine branch).
 */
const ALLOWED_HEX = new Set(['#0077b5', '#2563eb', '#1e40af']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// jsdom normalises a bare hex in an inline style to `rgb(r, g, b)`, so an
// alpha-less rgb() in a style attribute is also a literal that bypassed the
// tokens. rgba() tints are left alone (they are how alpha is written).
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/g;
const ALLOWED_RGB = new Set(['rgb(0, 119, 181)']);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
// VoiceAgentSurface paints from lib/portal/voiceAgentSurfaces.ts, a separate
// surface outside this sweep (its CRIMSON literal is a follow-up); stub it so
// the assertion covers SessionRunClient's own chrome (children still render).
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
    // The voice sessions are handed the documented hex pair, nothing else.
    for (const btn of screen.getAllByRole('button', { name: /use voice/i })) fireEvent.click(btn);
    const voice = screen.getAllByTestId('voice-session');
    expect(voice.length).toBeGreaterThan(0);
    // (The interview card already passed the gold token pair before this
    // sweep; PortalVoiceSession's alpha concat on that value is a follow-up.)
    for (const v of voice) {
      expect(['#2563eb', 'var(--wa-gold)']).toContain(v.getAttribute('data-accent'));
      expect(['#1e40af', 'var(--wa-gold-dark)']).toContain(v.getAttribute('data-accent-dark'));
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
