import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import { ProgressBar, ProgressRing, StageTrack, SegmentedProgress, RankBars, type RankDatum } from '@/components/portal/kit';
import { statusToKitTone } from '@/components/portal/kit/pages/admin-subviews/SystemHealthKit';

// Same literal detectors as portal-hex-token-sweep.spec.tsx: a hex or a bare
// rgb() (jsdom's normalisation of an inline hex) that reached the DOM bypassed
// the tokens. #0077b5 is LinkedIn's brand blue, the one deliberate keep.
const ALLOWED_HEX = new Set(['#0077b5']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/g;
const ALLOWED_RGB = new Set(['rgb(0, 119, 181)']);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
// The admin dashboard's MFA banner fetches its own status; the funnel test below only reads the RankBars.
vi.mock('@/components/admin/MfaStatusBanner', () => ({ default: () => null }));
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

/**
 * Kit tone follow-ups (wave 13 #2409 / #2464 leftovers): the progress and
 * rank primitives take a `KitTone` only. The deprecated categorical `color`
 * prop is gone from ProgressBar, ProgressRing, StageTrack and RankDatum, and
 * SegmentedProgress moved from `color` onto the same tone contract. Every
 * assertion here reads the rendered DOM: the container declares
 * `.wa-kit-tone--<tone>` and the fill / stroke is `var(--wa-kit-tone)`.
 *
 * These cases live apart from `portal-hex-token-sweep.spec.tsx` on purpose:
 * three of them `await import(...)` whole page kits (AdminDashboardKit,
 * MemberHomeKit, StaffMemberResumePanel), and sharing a worker with the
 * sweep's SessionRunClient case pushed that case past its 5 s budget in CI.
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
          firstName="Alex" coursePercent={100} activeJobs={1} certs={0} points={100}
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
