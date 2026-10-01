import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readCss, loadRootTokens, loadBlockTokens, colorOf, contrast, luminance, over, parseColor, resolve, splitTopLevel, type Scheme,
} from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * UI follow-ups 2026-09-22 (lane B glow-hex badges + #2479 / #2481 leftovers).
 *
 * 1. Glow hexes. The voice and messaging VoiceAgentSurface presets carried
 *    their glow hue as a bare hex (`#8c0f37`, `#ea580c`, `#4f46e5`, `#c026d3`,
 *    `#475569`, brand gold `#a47f38`, blue `#2b7bb9`) and their CTA shadows
 *    as `rgba()` literals; the PortalVoiceSession panel shadow was
 *    `rgba(0,0,0,0.25)`; the "✓ SMS" mark on /admin/members was `#16a34a`
 *    (3.3:1 on white). VoiceAgentSurface color-mixes the glow into the ring
 *    shadow and icon tile and paints the badge in it where no `badgeColor` is
 *    set, so a constant hex never followed dark mode. Everything now reads a
 *    `--wa-*` token: the brand hues (`--wa-gold`, `--wa-info`,
 *    `--wa-accent-text`) where one fits and the new `--wa-glow-*` hues in
 *    css/wa-brand-tokens.css where none did; badge text on the card goes
 *    through the tone text tokens.
 *
 * 2. `--wa-on-accent-control` on a `--color-accent` fill (webhook-events
 *    Apply, B4B bindings "Load suggestions"). `--color-accent` is the org
 *    accent (OrgBrandingStyle, default #ad2c4d) and does not follow dark
 *    mode, while `--wa-on-accent-control` flips to dark ink (#2a0d16) in
 *    dark: 2.78:1. The fills keep the org accent, like `.btn-primary` and
 *    the other 22 `--color-accent` buttons, and paint `--wa-on-accent`
 *    (white): 6.47:1 in both modes.
 *
 * 3. The #2491 follow-ups: the messaging ring gradients (five sets of literal
 *    hex stops) and the mock-interview ring's `#5e1426` plum stop now derive
 *    from their glow / hero token with color-mix; the VoiceStudioKit card
 *    shadows (`rgba(120,20,38|120,93,38|0,0,0, …)`) tint `--wa-accent`,
 *    `--wa-gold`, the panel chrome or read `--wa-shadow`; and the accent
 *    `rgba(173, 44, 77, …)` shadows and gradient stops in css/portal.css
 *    (`.mobile-fab`, `.portal-profile-avatar`, `.portal-app-progress__bar--current`,
 *    `.job-app-card--editing`, `.portal-card--gradient-accent`,
 *    `.portal-profile-hero`) are color-mixes of `--color-accent`, the token
 *    OrgBrandingStyle overrides with the seeded org accent.
 *
 * The specs render each surface in the light and the dark scheme, read the
 * computed style of the fixed element and fail on any hex or rgb()/rgba()
 * literal; every `var(--wa-*)` they find must resolve through the real
 * token files for that scheme. The portal.css rules are read from the
 * stylesheet text and resolved through the same token chain with the org
 * accent modelled on `:root`.
 */

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin/members',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/admin/BulkEmailModal', () => ({ default: () => null }));
vi.mock('@/components/admin/BulkUpdateModal', () => ({ default: () => null }));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));
vi.mock('@elevenlabs/client', () => ({ Conversation: { startSession: vi.fn() } }));
// §3e renders the In-office sessions index (an async server component whose one read is mocked)
// and /find-your-path (whose funnel tracker is mocked).
vi.mock('@/lib/db/prisma', () => ({ prisma: { memberEvent: { findMany: vi.fn(async () => []) } } }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
// §3e renders the First 90 Days card, whose check-in server action is never called here.
vi.mock('@/app/(portal)/dashboard/first90DaysAction', () => ({ submitFirst90DaysCheckIn: vi.fn() }));

import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import VoiceCoachLauncherCard from '@/components/portal/VoiceCoachLauncherCard';
import VoiceCoachesPromo from '@/components/portal/VoiceCoachesPromo';
import MembersTable from '@/components/admin/MembersTable';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import {
  careerBusinessVoiceSurface, counselorStaffVoiceSurface, employerVoiceSurface, mockInterviewVoiceSurface,
  partnerVoiceSurface, readinessVoiceSurface, resumeCoachVoiceSurface, studentCounselorVoiceSurface,
} from '@/lib/portal/voice';
import {
  adminMessagingSurface, counselorStaffMessagingSurface, employerMessagingSurface, memberMessagingSurface, partnerMessagingSurface,
} from '@/lib/portal/messagingSurfaces';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import YouthDashboardNotice from '@/components/portal/YouthDashboardNotice';
import MotivatingRecapClient from '@/app/(portal)/dashboard/weekly-recap/MotivatingRecapClient';
import FindYourPathClient from '@/app/(decision-journey)/find-your-path/FindYourPathClient';
import SessionsIndexBody from '@/components/portal/sessions/SessionsIndexBody';
import First90DaysCard from '@/components/portal/First90DaysCard';

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const AA = 4.5;
/** A colour literal in a style value: bare hex, or rgb()/rgba() (jsdom normalises hex to rgb()). */
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const WA_VAR = /var\((--wa-[\w-]+)\)/g;

/** Portal token layer plus main.css's surface scale (VoiceAgentSurface's card reads --surface-container-lowest). */
function tokensFor(scheme: Scheme): Map<string, string> {
  const main = readCss('css/main.css');
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), main, readCss('css/portal-tokens.css'));
  if (scheme === 'light') for (const [k, v] of loadBlockTokens(main, 'html:not(.dark)')) tokens.set(k, v);
  return tokens;
}

/** Flip the document into a scheme the way ThemeInitScript does, then render. */
function renderIn<T>(scheme: Scheme, ui: React.ReactElement): ReturnType<typeof render> {
  document.documentElement.classList.toggle('dark', scheme === 'dark');
  document.documentElement.setAttribute('data-theme', scheme);
  return render(ui) as unknown as ReturnType<typeof render> & T;
}

/** The computed value of one paint property, falling back to the inline declaration jsdom does not cascade. */
function computed(el: Element, prop: 'box-shadow' | 'color' | 'background' | 'background-color'): string {
  const value = getComputedStyle(el).getPropertyValue(prop);
  return value || (el as HTMLElement).style.getPropertyValue(prop);
}

/**
 * The inline declaration that reached the DOM. jsdom's computed `border`
 * shorthand cannot hold a color-mix() and reports its initial value
 * (`medium none rgb(0, 0, 0)`), so the tile border is read as painted.
 */
function inline(el: Element, prop: 'border' | 'background'): string {
  const style = el.getAttribute('style') ?? '';
  return style.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim() ?? '';
}

/** Every `--wa-*` token in a value must be defined for the scheme; colour tokens must resolve to a colour. */
function expectTokensResolve(value: string, scheme: Scheme, label: string) {
  const tokens = tokensFor(scheme);
  const names = Array.from(value.matchAll(WA_VAR), (m) => m[1]);
  expect(names.length, `${label}: reads a --wa-* token`).toBeGreaterThan(0);
  for (const name of names) {
    expect(tokens.has(name), `${label}: ${name} is defined`).toBe(true);
    const resolved = resolve(`var(${name})`, tokens, scheme);
    if (!/^\d/.test(resolved)) parseColor(resolved); // throws on an unresolvable colour
  }
}

function expectNoLiteral(value: string, label: string) {
  expect(value, label).not.toMatch(LITERAL);
}

/** The colour stops of a `linear-gradient(<angle>, …)` value, split at top-level commas. */
function gradientStops(gradient: string): string[] {
  expect(gradient).toMatch(/^linear-gradient\([\s\S]*\)$/);
  return splitTopLevel(gradient.slice('linear-gradient('.length, -1)).slice(1);
}
/** The helper parses hex / rgb() only; color-mix() stops mix toward the named black / white. */
function named(value: string): string {
  return value.replace(/\bblack\b/g, '#000000').replace(/\bwhite\b/g, '#ffffff');
}
/** The nearest ancestor (or the element) that paints an inline box-shadow. */
function shadowHost(el: Element): HTMLElement {
  let node: Element | null = el;
  while (node && !(node as HTMLElement).style?.boxShadow) node = node.parentElement;
  expect(node, 'an ancestor paints a box-shadow').not.toBeNull();
  return node as HTMLElement;
}
/** Every inline box-shadow that reached the DOM under `root` is literal-free. */
function expectNoLiteralShadows(root: HTMLElement, label: string) {
  const shadows = Array.from(root.querySelectorAll<HTMLElement>('[style]')).map((el) => el.style.boxShadow).filter(Boolean);
  expect(shadows.length, `${label}: inline shadows found`).toBeGreaterThan(0);
  for (const shadow of shadows) expectNoLiteral(shadow, `${label} inline box-shadow "${shadow}"`);
}
/** The bodies of every `selector { … }` rule in a stylesheet (comments stripped; a selector may repeat under media queries). */
function ruleBodies(css: string, selector: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  for (let start = src.indexOf(`${selector} {`); start > -1; start = src.indexOf(`${selector} {`, start + 1)) {
    const open = start + selector.length + 2;
    bodies.push(src.slice(open, src.indexOf('}', open)));
  }
  expect(bodies.length, `${selector} is declared`).toBeGreaterThan(0);
  return bodies;
}
/** The single `prop: value;` declaration for a selector across its rule bodies, whitespace collapsed. */
function declaration(css: string, selector: string, prop: 'box-shadow' | 'background'): string {
  const values = ruleBodies(css, selector).flatMap((body) => Array.from(body.matchAll(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+);`, 'g')), (m) => m[1]));
  expect(values, `${selector} declares ${prop} once`).toHaveLength(1);
  return values[0].replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

beforeAll(() => {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});

// ── 1a. messaging surfaces ─────────────────────────────────────────────────
const MESSAGING = [
  { name: 'memberMessagingSurface', surface: memberMessagingSurface, glow: 'var(--wa-accent-text)' },
  { name: 'partnerMessagingSurface', surface: partnerMessagingSurface, glow: 'var(--wa-glow-ember)' },
  { name: 'employerMessagingSurface', surface: employerMessagingSurface, glow: 'var(--wa-glow-indigo)' },
  { name: 'counselorStaffMessagingSurface', surface: counselorStaffMessagingSurface, glow: 'var(--wa-glow-fuchsia)' },
  { name: 'adminMessagingSurface', surface: adminMessagingSurface, glow: 'var(--wa-glow-slate)' },
];

describe('messaging surfaces glow from --wa-* tokens, never a hex', () => {
  for (const scheme of SCHEMES) {
    it.each(MESSAGING)(`${scheme}: $name ring shadow, icon tile and badge carry no literal and the glow is $glow`, ({ surface, glow }) => {
      expect(surface.glowColor).toBe(glow);
      const { container } = renderIn(scheme, <VoiceAgentSurface {...surface}><p>panel</p></VoiceAgentSurface>);
      const ring = container.firstElementChild as HTMLElement;
      const card = ring.firstElementChild as HTMLElement;
      const badge = screen.getByText(surface.badge);
      const tile = badge.parentElement!.previousElementSibling as HTMLElement;

      const shadow = computed(ring, 'box-shadow');
      expectNoLiteral(shadow, `${scheme} ${surface.badge} ring shadow "${shadow}"`);
      expect(shadow).toContain(`color-mix(in srgb, ${glow} 16%, transparent)`);
      expectTokensResolve(shadow, scheme, `${surface.badge} ring shadow`);

      for (const prop of ['background', 'border'] as const) {
        const value = inline(tile, prop);
        expectNoLiteral(value, `${scheme} ${surface.badge} icon tile ${prop} "${value}"`);
        expect(value).toContain(`color-mix(in srgb, ${glow} `);
        expectTokensResolve(value, scheme, `${surface.badge} icon tile ${prop}`);
      }

      const text = computed(badge, 'color');
      expectNoLiteral(text, `${scheme} ${surface.badge} badge colour "${text}"`);
      expectTokensResolve(text, scheme, `${surface.badge} badge`);
      const tokens = tokensFor(scheme);
      const cardFill = colorOf(computed(card, 'background'), tokens, scheme);
      expect(cardFill.a).toBe(1);
      expect(contrast(colorOf(text, tokens, scheme), cardFill), `${scheme} "${surface.badge}" ${text} on the card`).toBeGreaterThanOrEqual(AA);
    });
  }

  it('the --wa-glow-* hues are light-dark() pairs whose dark step is the lighter one (they glow on a dark card)', () => {
    const brand = loadRootTokens(readCss('css/wa-brand-tokens.css'));
    const glows = [...brand.keys()].filter((k) => k.startsWith('--wa-glow-'));
    expect(glows.sort()).toEqual(['--wa-glow-ember', '--wa-glow-fuchsia', '--wa-glow-indigo', '--wa-glow-slate']);
    for (const name of glows) {
      expect(brand.get(name), name).toMatch(/^light-dark\(/);
      const light = colorOf(`var(${name})`, brand, 'light');
      const dark = colorOf(`var(${name})`, brand, 'dark');
      expect(light).not.toEqual(dark);
      expect(contrast(dark, parseColor('#0c0e10')), `${name} dark step on the dark card`).toBeGreaterThan(contrast(light, parseColor('#0c0e10')));
    }
  });
});

// ── 1b. voice surfaces + CTA shadows ───────────────────────────────────────
/** Glow hue and the badge text token each voice surface reads (the badge is 13px copy on the card). */
const VOICE = [
  { name: 'readinessVoiceSurface', surface: readinessVoiceSurface, glow: 'var(--wa-gold)', badge: 'var(--wa-gold-dark)' },
  { name: 'partnerVoiceSurface', surface: partnerVoiceSurface, glow: 'var(--wa-gold)', badge: 'var(--wa-gold-dark)' },
  { name: 'counselorStaffVoiceSurface', surface: counselorStaffVoiceSurface, glow: 'var(--wa-info)', badge: 'var(--wa-info-dark)' },
  { name: 'studentCounselorVoiceSurface', surface: studentCounselorVoiceSurface, glow: 'var(--wa-info)', badge: 'var(--wa-info-dark)' },
  { name: 'resumeCoachVoiceSurface', surface: resumeCoachVoiceSurface, glow: 'var(--wa-hero-crimson)', badge: 'var(--wa-accent-text)' },
  { name: 'employerVoiceSurface', surface: employerVoiceSurface, glow: 'var(--wa-hero-crimson)', badge: 'var(--wa-accent-text)' },
  { name: 'mockInterviewVoiceSurface', surface: mockInterviewVoiceSurface, glow: 'var(--wa-hero-crimson)', badge: 'var(--wa-accent-text)' },
  { name: 'careerBusinessVoiceSurface', surface: careerBusinessVoiceSurface, glow: 'var(--wa-hero-crimson)', badge: 'var(--wa-accent-text)' },
];

describe('voice surfaces glow and cast their CTA shadow from --wa-* tokens', () => {
  for (const scheme of SCHEMES) {
    it.each(VOICE)(`${scheme}: $name glow is $glow, badge $badge; ring shadow, badge and CTA shadow carry no literal`, ({ surface, glow, badge: badgeToken }) => {
      expect(surface.glowColor).toBe(glow);
      expect(surface.badgeColor).toBe(badgeToken);
      expect(surface.ctaShadow, 'ctaShadow is a color-mix of the glow hue').toMatch(/^0 8px 24px color-mix\(in srgb, var\(--wa-[\w-]+\) \d+%, transparent\)$/);
      const { container } = renderIn(
        scheme,
        <VoiceCoachLauncherCard {...surface} title={`${surface.badge} title`} description="d" href="/dashboard" ctaLabel="Start" ctaGradient={surface.ctaGradient} ctaShadow={surface.ctaShadow} />,
      );
      const ring = container.firstElementChild as HTMLElement;
      const shadow = computed(ring, 'box-shadow');
      expectNoLiteral(shadow, `${scheme} ${surface.badge} ring shadow "${shadow}"`);
      expect(shadow).toContain(glow);
      expectTokensResolve(shadow, scheme, `${surface.badge} ring shadow`);

      const cta = screen.getByRole('link', { name: 'Start' });
      const ctaShadow = computed(cta, 'box-shadow');
      expectNoLiteral(ctaShadow, `${scheme} ${surface.badge} CTA shadow "${ctaShadow}"`);
      expect(ctaShadow).toBe(surface.ctaShadow);
      expectTokensResolve(ctaShadow, scheme, `${surface.badge} CTA shadow`);

      const badge = screen.getByText(surface.badge);
      const text = computed(badge, 'color');
      expect(text).toBe(badgeToken);
      expectNoLiteral(text, `${scheme} ${surface.badge} badge colour "${text}"`);
      const tokens = tokensFor(scheme);
      const card = ring.firstElementChild as HTMLElement;
      const cardFill = colorOf(computed(card, 'background'), tokens, scheme);
      expect(contrast(colorOf(text, tokens, scheme), cardFill), `${scheme} "${surface.badge}" ${text} on the card`).toBeGreaterThanOrEqual(AA);
    });
  }

  it('the constant hero crimson the crimson badges used to paint is under AA on the dark card (why they read --wa-accent-text)', () => {
    const tokens = tokensFor('dark');
    expect(contrast(colorOf('var(--wa-hero-crimson)', tokens, 'dark'), colorOf('var(--surface-container-lowest)', tokens, 'dark'))).toBeLessThan(AA);
  });

  it('the blue voice surfaces keep constant gradient stops under white CTA copy and paint the badge from --wa-info-dark', () => {
    for (const surface of [counselorStaffVoiceSurface, studentCounselorVoiceSurface]) {
      expect(surface.badgeColor).toBe('var(--wa-info-dark)');
      expect(surface.gradient).toBe('linear-gradient(135deg, #2b7bb9, #1f5a87)');
      for (const scheme of SCHEMES) {
        expect(contrast(parseColor('#ffffff'), parseColor('#2b7bb9')), `${scheme} white on the light stop`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  for (const scheme of SCHEMES) {
    it(`${scheme}: the Elevator Introduction launcher cards glow brand gold and badge --wa-gold-dark (were #a47f38 on both)`, () => {
      for (const [Section, badge] of [[VoiceCoachesPromo, '10–20 SEC']] as const) {
        const { unmount } = renderIn(scheme, <Section />);
        const label = screen.getByText(badge);
        const text = computed(label, 'color');
        expect(text).toBe('var(--wa-gold-dark)');
        const ring = label.closest('.portal-card')!.parentElement as HTMLElement;
        const shadow = computed(ring, 'box-shadow');
        expectNoLiteral(shadow, `${scheme} ${badge} ring shadow "${shadow}"`);
        expect(shadow).toContain('var(--wa-gold)');
        const tokens = tokensFor(scheme);
        const card = ring.firstElementChild as HTMLElement;
        expect(contrast(colorOf(text, tokens, scheme), colorOf(computed(card, 'background'), tokens, scheme)), `${scheme} "${badge}"`).toBeGreaterThanOrEqual(AA);
        unmount();
      }
    });
  }
});

// ── 1c. PortalVoiceSession panel ───────────────────────────────────────────
describe('PortalVoiceSession panel casts its shadow as a color-mix of the panel chrome', () => {
  const PANEL_SHADOW = '0 20px 25px -5px color-mix(in srgb, var(--wa-sidebar-bg) 25%, transparent)';
  for (const scheme of SCHEMES) {
    it(`${scheme}: the pre-session panel box-shadow tints --wa-sidebar-bg (was rgba(0,0,0,0.25)) and resolves on the public WIOA route too`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ signedUrl: 'wss://voice.example/session' }), { status: 200 })));
      const { default: PortalVoiceSession } = await import('@/components/portal/PortalVoiceSession');
      const { container } = renderIn(scheme, <PortalVoiceSession sessionEndpoint="/api/voice/session" title="Interview coach" description="Practice out loud." />);
      const panel = container.firstElementChild as HTMLElement;
      expect(computed(panel, 'background')).toBe('var(--wa-sidebar-bg)');
      const shadow = computed(panel, 'box-shadow');
      expectNoLiteral(shadow, `${scheme} panel shadow "${shadow}"`);
      expect(shadow).toBe(PANEL_SHADOW);
      expectTokensResolve(shadow, scheme, 'panel shadow');
      // The panel is constant dark chrome, so its shadow is the same near-black tint in both schemes.
      const tint = parseColor(resolve('color-mix(in srgb, var(--wa-sidebar-bg) 25%, transparent)', tokensFor(scheme), scheme));
      expect(tint.a).toBeCloseTo(0.25, 2);
      expect(Math.max(tint.r, tint.g, tint.b)).toBeLessThan(40);
      // /wioa-qualification loads only the brand tokens and the module's `.public` bridge (see wioa-public-voice-tokens.spec).
      const publicRoute = new Set([
        ...loadRootTokens(readCss('css/wa-brand-tokens.css')).keys(),
        ...loadBlockTokens(readCss('components/portal/WioaQualificationClient.module.css'), '.public').keys(),
      ]);
      for (const name of Array.from(shadow.matchAll(WA_VAR), (m) => m[1])) expect(publicRoute.has(name), `${name} resolves on the public route`).toBe(true);
    });
  }
});

// ── 1d. /admin/members "✓ SMS" ─────────────────────────────────────────────
describe('/admin/members "✓ SMS" reads the text-on-success token', () => {
  const now = new Date().toISOString();
  const base = {
    email: 'm@example.com', phone: null, enrolledProgram: 'it-support', enrolledAt: now,
    createdAt: '2025-01-01T00:00:00.000Z', staleTrainingDetectedAt: null, assessmentScorePct: null, assessmentCompleted: null,
    updatedAt: now, programTitle: 'IT Support', coursesCompleted: [], totalCourses: 5, liveTraining: null,
    partnerName: null, partnerId: null, enrollmentProgramSlugs: ['it-support'], enrollmentProgramTitleBySlug: { 'it-support': 'IT Support' },
  };
  const members = [
    { ...base, id: 'a', fullName: 'Ada Active', memberStatus: 'active', fitScore: 3, profile: { profilePhone: '5551234567', smsOptIn: true } },
    { ...base, id: 'b', fullName: 'Bea Placed', memberStatus: 'placed', fitScore: 6, profile: { profilePhone: '5559876543', smsOptIn: false } },
  ];
  const props = {
    members, totalCount: 2, currentPage: 1, pageSize: 50, searchQuery: '', programFilter: '', statusFilter: '', partnerFilter: '',
    startDateFilter: '', endDateFilter: '', allPartnerOptions: [], allAssignablePrograms: [{ slug: 'it-support', title: 'IT Support' }],
    applicantTriageCopy: { filterLabel: 'Applicant triage', filterAll: 'All', buckets: { ready_to_review: 'Ready', missing_info: 'Missing information', needs_human: 'Needs review', not_eligible_signal: 'Not eligible' } },
  };

  for (const scheme of SCHEMES) {
    it(`${scheme}: the mark is var(--wa-success-dark) (was #16a34a, 3.3:1 on white) and clears AA on the surface`, () => {
      renderIn(scheme, <MembersTable {...(props as unknown as React.ComponentProps<typeof MembersTable>)} />);
      const marks = screen.getAllByText('✓ SMS');
      expect(marks.length).toBeGreaterThan(0);
      const tokens = tokensFor(scheme);
      for (const mark of marks) {
        const text = computed(mark, 'color');
        expectNoLiteral(text, `${scheme} ✓ SMS "${text}"`);
        expect(text).toBe('var(--wa-success-dark)');
        expect(contrast(colorOf(text, tokens, scheme), colorOf('var(--wa-surface)', tokens, scheme)), `${scheme} ✓ SMS on --wa-surface`).toBeGreaterThanOrEqual(AA);
      }
      // #16a34a itself never cleared AA on the light surface.
      expect(contrast(parseColor('#16a34a'), colorOf('var(--wa-surface)', tokens, 'light'))).toBeLessThan(AA);
    });
  }
});

// ── 2. --color-accent fills carry --wa-on-accent ───────────────────────────
describe('org-accent fills paint --wa-on-accent (white), not the dark-flipping --wa-on-accent-control', () => {
  const brand = readCss('css/wa-brand-tokens.css');
  const portal = readCss('css/portal-tokens.css');
  const main = readCss('css/main.css');
  /** Default org: OrgBrandingStyle sets `--org-accent` / `--color-accent` #ad2c4d on :root (prisma seed → OrgBrandingStyle). */
  const defaultOrg = new Map(loadRootTokens(brand, portal, main)).set('--org-accent', '#ad2c4d').set('--color-accent', 'var(--org-accent)');
  const ratio = (fg: string, bg: string, scheme: Scheme) => contrast(colorOf(fg, defaultOrg, scheme), colorOf(bg, defaultOrg, scheme));

  it('before: --wa-on-accent-control on the seeded org accent was 2.78:1 in dark; after: --wa-on-accent is 6.47:1 in both modes', () => {
    expect(ratio('var(--wa-on-accent-control)', 'var(--color-accent)', 'dark')).toBeCloseTo(2.78, 1);
    expect(ratio('var(--wa-on-accent-control)', 'var(--color-accent)', 'dark')).toBeLessThan(AA);
    for (const scheme of SCHEMES) {
      expect(ratio('var(--wa-on-accent)', 'var(--color-accent)', scheme), `${scheme}`).toBeCloseTo(6.47, 1);
      expect(ratio('var(--wa-on-accent)', 'var(--color-accent)', scheme)).toBeGreaterThanOrEqual(AA);
    }
  });

  for (const scheme of SCHEMES) {
    it(`${scheme}: webhook-events Apply keeps the --color-accent fill and reads --wa-on-accent`, async () => {
      const { default: WebhookEventsClient } = await import('@/app/admin/webhook-events/WebhookEventsClient');
      renderIn(
        scheme,
        <WebhookEventsClient events={[]} page={1} totalPages={1} pageSize={50} totalMatching={0} initialQ="" initialSource="" initialStatus=""
          initialDateFrom="" initialDateTo="" sources={[{ name: 'coursera', count: 5 }]} statuses={[{ name: 'failed', count: 1 }]} />,
      );
      const apply = screen.getByRole('button', { name: 'Apply' });
      expect(computed(apply, 'background')).toBe('var(--color-accent)');
      const text = computed(apply, 'color');
      expect(text).toBe('var(--wa-on-accent)');
      expectNoLiteral(text, `${scheme} Apply colour`);
      expect(ratio(text, computed(apply, 'background'), scheme), `${scheme} Apply`).toBeGreaterThanOrEqual(AA);
    });

    it(`${scheme}: B4B bindings "Load suggestions" keeps the --color-accent fill and reads --wa-on-accent`, async () => {
      // A request that never settles keeps the card in its loading state after the click below.
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
      const { default: Card } = await import('@/components/admin/B4BBindingsSuggestionsCard');
      const { container } = renderIn(scheme, <Card />);
      const button = container.querySelector('button')!;
      expect(computed(button, 'background')).toBe('var(--color-accent)');
      const text = computed(button, 'color');
      expect(text).toBe('var(--wa-on-accent)');
      expectNoLiteral(text, `${scheme} Load suggestions colour`);
      expect(ratio(text, computed(button, 'background'), scheme), `${scheme} Load suggestions`).toBeGreaterThanOrEqual(AA);
      // The loading state hands the fill back to the surface and the label to --wa-accent-text.
      fireEvent.click(button);
      await waitFor(() => expect(button.style.color).toBe('var(--wa-accent-text)'));
      expect(button.style.background).toBe('var(--surface-container)');
    });
  }
});

// ── 3a. messaging ring gradients ───────────────────────────────────────────
describe('messaging ring gradients derive every stop from the glow token (were literal hex stops)', () => {
  for (const scheme of SCHEMES) {
    it.each(MESSAGING)(`${scheme}: $name ring and corner blob paint a three-stop gradient of $glow with no literal`, ({ surface, glow }) => {
      const { container } = renderIn(scheme, <VoiceAgentSurface {...surface}><p>panel</p></VoiceAgentSurface>);
      const ring = container.firstElementChild as HTMLElement;
      const gradient = computed(ring, 'background');
      expectNoLiteral(gradient, `${scheme} ${surface.badge} ring "${gradient}"`);
      expect(gradient).toBe(surface.gradient);
      expectTokensResolve(gradient, scheme, `${surface.badge} ring`);
      const stops = gradientStops(gradient);
      expect(stops).toHaveLength(3);
      for (const stop of stops) expect(stop, `${surface.badge} stop "${stop}"`).toContain(glow);
      const tokens = tokensFor(scheme);
      const colours = stops.map((stop) => colorOf(named(stop), tokens, scheme));
      for (const colour of colours) expect(colour.a).toBe(1);
      // The band runs deep → light, like the literal stops did.
      expect(luminance(colours[0])).toBeLessThan(luminance(colours[1]));
      expect(luminance(colours[1])).toBeLessThan(luminance(colours[2]));
      // The blurred corner blob inside the card repeats the ring gradient.
      const blob = ring.querySelector('[aria-hidden]') as HTMLElement;
      expect(computed(blob, 'background')).toBe(gradient);
    });
  }

  it('each stop follows the theme: a different colour in light and dark', () => {
    for (const { surface } of MESSAGING) {
      for (const stop of gradientStops(surface.gradient)) {
        expect(colorOf(named(stop), tokensFor('light'), 'light'), `${surface.badge} "${stop}"`).not.toEqual(colorOf(named(stop), tokensFor('dark'), 'dark'));
      }
    }
  });
});

// ── 3b. mock-interview ring plum stop ──────────────────────────────────────
describe('mockInterviewVoiceSurface ring: the plum end stop is a color-mix of --wa-hero-crimson-dark (was #5e1426)', () => {
  const PLUM = 'color-mix(in srgb, var(--wa-hero-crimson-dark) 70%, black)';
  for (const scheme of SCHEMES) {
    it(`${scheme}: the ring carries no literal, reads the hero pair and lands within 10 channel steps of the old plum`, () => {
      const { container } = renderIn(scheme, <VoiceAgentSurface {...mockInterviewVoiceSurface}><p>panel</p></VoiceAgentSurface>);
      const gradient = computed(container.firstElementChild as HTMLElement, 'background');
      expectNoLiteral(gradient, `${scheme} PRACTICE ring "${gradient}"`);
      expect(gradient).toBe(`linear-gradient(135deg, var(--wa-hero-crimson-dark), ${PLUM})`);
      expectTokensResolve(gradient, scheme, 'PRACTICE ring');
      const tokens = tokensFor(scheme);
      const plum = colorOf(named(PLUM), tokens, scheme);
      const was = parseColor('#5e1426');
      for (const channel of ['r', 'g', 'b'] as const) expect(Math.abs(plum[channel] - was[channel]), channel).toBeLessThanOrEqual(10);
      // Text-bearing crimson rings keep constant stops, so the plum is the same in both schemes and darker than its start stop.
      const other: Scheme = scheme === 'light' ? 'dark' : 'light';
      expect(plum).toEqual(colorOf(named(PLUM), tokensFor(other), other));
      expect(luminance(plum)).toBeLessThan(luminance(colorOf('var(--wa-hero-crimson-dark)', tokens, scheme)));
    });
  }
});

// ── 3c. VoiceStudioKit card shadows ────────────────────────────────────────
describe('VoiceStudioKit cards cast their shadow from tokens (were rgba(120,20,38 | 120,93,38 | 0,0,0, …) literals)', () => {
  const ACCENT_SHADOW = '0 10px 15px -3px color-mix(in srgb, var(--wa-accent) 15%, transparent)';
  const GOLD_SHADOW = '0 10px 15px -3px color-mix(in srgb, var(--wa-gold) 15%, transparent)';
  const CARDS = [
    { badge: 'READINESS', shadow: GOLD_SHADOW },
    { badge: 'RESUME', shadow: ACCENT_SHADOW },
    { badge: 'PRACTICE', shadow: ACCENT_SHADOW },
    { badge: 'LILLEY', shadow: 'var(--wa-shadow)' },
    { badge: 'ADVANCED', shadow: ACCENT_SHADOW },
    { badge: '10–20 SEC', shadow: 'var(--wa-shadow)' },
  ];

  for (const scheme of SCHEMES) {
    it(`${scheme}: every coach card shadow is its token value and no inline box-shadow on the Coaches tab carries a literal`, () => {
      const { container } = renderIn(scheme, <VoiceStudioKit />);
      for (const { badge, shadow } of CARDS) {
        const card = screen.getByText(badge).closest('.vs-hero-card') as HTMLElement | null;
        expect(card, `${badge} card`).not.toBeNull();
        const value = computed(card!, 'box-shadow');
        expectNoLiteral(value, `${scheme} ${badge} card shadow "${value}"`);
        expect(value, badge).toBe(shadow);
        expectTokensResolve(value, scheme, `${badge} card shadow`);
      }
      expectNoLiteralShadows(container, `${scheme} Coaches tab`);
    });

    it(`${scheme}: the Resume Studio banner and the "Resume coach" card tint --wa-accent under their --wa-accent gradient`, () => {
      // The "Resume coach" card renders once a resume is on file and scored.
      const { container } = renderIn(scheme, <VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: true, structuralScore: 72, issues: [] }} />);
      const banner = shadowHost(screen.getByRole('heading', { name: 'Resume Studio' }));
      expect(computed(banner, 'background')).toContain('var(--wa-accent)');
      expect(computed(banner, 'box-shadow')).toBe(ACCENT_SHADOW);
      const coach = screen.getByText('Resume coach').closest('a') as HTMLElement;
      expect(computed(coach, 'background')).toContain('var(--wa-accent)');
      expect(computed(coach, 'box-shadow')).toBe(ACCENT_SHADOW);
      expectTokensResolve(ACCENT_SHADOW, scheme, 'accent card shadow');
      const tokens = tokensFor(scheme);
      const tint = parseColor(resolve('color-mix(in srgb, var(--wa-accent) 15%, transparent)', tokens, scheme));
      const accent = colorOf('var(--wa-accent)', tokens, scheme);
      expect(tint).toEqual({ r: accent.r, g: accent.g, b: accent.b, a: 0.15 });
      expectNoLiteralShadows(container, `${scheme} Resume tab`);
    });
  }

  it('the accent tint follows the theme (the literal never did)', () => {
    const mix = 'color-mix(in srgb, var(--wa-accent) 15%, transparent)';
    expect(resolve(mix, tokensFor('light'), 'light')).not.toBe(resolve(mix, tokensFor('dark'), 'dark'));
  });
});

// ── 3d. css/portal.css accent shadows and tints ────────────────────────────
describe('css/portal.css accent shadows and gradient stops are color-mixes of --color-accent (were rgba(173, 44, 77, …) literals)', () => {
  const portalCss = readCss('css/portal.css');
  const SEEDED = '#ad2c4d';
  const OTHER_ORG = '#1d4ed8';
  /** The portal token chain with OrgBrandingStyle's `:root { --org-accent; --color-accent }` override modelled. */
  const withOrg = (scheme: Scheme, accent: string) => new Map(tokensFor(scheme)).set('--org-accent', accent).set('--color-accent', 'var(--org-accent)');
  const SHADOWS = [
    { selector: '.mobile-fab', geometry: '0 8px 24px', pct: 30 },
    { selector: '.job-app-card--editing', geometry: '0 8px 28px', pct: 20 },
    { selector: '.portal-profile-avatar', geometry: '0 4px 16px', pct: 35 },
    { selector: '.portal-app-progress__bar--current', geometry: '0 0 6px', pct: 50 },
  ];

  it.each(SHADOWS)('$selector: box-shadow is "$geometry color-mix(--color-accent $pct%)" and follows the seeded org accent', ({ selector, geometry, pct }) => {
    const shadow = declaration(portalCss, selector, 'box-shadow');
    expectNoLiteral(shadow, selector);
    expect(shadow).toBe(`${geometry} color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`);
    const mix = shadow.slice(geometry.length + 1);
    for (const scheme of SCHEMES) {
      // The seeded org: the exact colour and alpha the literal painted.
      expect(parseColor(resolve(mix, withOrg(scheme, SEEDED), scheme)), `${scheme} seeded org`).toEqual({ r: 173, g: 44, b: 77, a: pct / 100 });
      // Another org accent: the shadow follows it.
      expect(parseColor(resolve(mix, withOrg(scheme, OTHER_ORG), scheme)), `${scheme} other org`).toEqual({ r: 29, g: 78, b: 216, a: pct / 100 });
    }
    // Without an org override the chain's --color-accent is --wa-accent, so the shadow flips with the scheme.
    expect(tokensFor('light').get('--color-accent')).toBe('var(--wa-accent)');
    expect(resolve(mix, tokensFor('light'), 'light')).not.toBe(resolve(mix, tokensFor('dark'), 'dark'));
  });

  it('.portal-card--gradient-accent and .portal-profile-hero tint --color-accent (and --color-accent-dark) instead of rgba stops', () => {
    const card = declaration(portalCss, '.portal-card--gradient-accent', 'background');
    expectNoLiteral(card, '.portal-card--gradient-accent');
    expect(card).toBe('linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 15%, transparent) 0%, color-mix(in srgb, var(--color-accent-dark) 8%, transparent) 100%)');
    const hero = declaration(portalCss, '.portal-profile-hero', 'background');
    expectNoLiteral(hero, '.portal-profile-hero');
    expect(hero).toBe('linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%)');
    for (const scheme of SCHEMES) {
      const tokens = withOrg(scheme, SEEDED);
      expect(tokens.has('--color-accent-dark'), `${scheme}: --color-accent-dark is on the portal chain`).toBe(true);
      expect(parseColor(resolve('color-mix(in srgb, var(--color-accent) 15%, transparent)', tokens, scheme))).toEqual({ r: 173, g: 44, b: 77, a: 0.15 });
      expect(parseColor(resolve('color-mix(in srgb, var(--color-accent) 10%, transparent)', tokens, scheme))).toEqual({ r: 173, g: 44, b: 77, a: 0.1 });
      expect(parseColor(resolve('color-mix(in srgb, var(--color-accent-dark) 8%, transparent)', tokens, scheme)).a).toBeCloseTo(0.08, 5);
    }
  });

  it('.portal-progress-bar--gold fill ends on --color-gold-light (was #ffd54f), the gold gradient pair main.css already uses', () => {
    const fill = declaration(portalCss, '.portal-progress-bar--gold .portal-progress-bar__fill', 'background');
    expectNoLiteral(fill, '.portal-progress-bar--gold');
    expect(fill).toBe('linear-gradient(to right, var(--color-gold), var(--color-gold-light))');
    for (const scheme of SCHEMES) {
      const tokens = tokensFor(scheme);
      expect(luminance(colorOf('var(--color-gold-light)', tokens, scheme))).toBeGreaterThan(luminance(colorOf('var(--color-gold)', tokens, scheme)));
    }
  });

  it('no accent rgba() tint remains in any box-shadow or gradient in css/portal.css', () => {
    // The text-bearing `.portal-action-card-gradient--*` hero backdrops keep constant hex stops
    // under white copy (the hero-pair rule), so only the translucent accent tints are swept here.
    const src = portalCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const ACCENT_LITERAL = /rgba\(\s*173,\s*44,\s*77|rgba\(\s*139,\s*31,\s*56/;
    const declarations = (src.match(/(?:box-shadow|background)\s*:[^;]+;/g) ?? []).filter((d) => /box-shadow|gradient/.test(d));
    expect(declarations.length).toBeGreaterThan(10);
    for (const decl of declarations) expect(decl.replace(/\s+/g, ' ')).not.toMatch(ACCENT_LITERAL);
  });
});

// ── 3e. the last five accent shadow / gradient literals (#2503 inspection, §2 leftovers) ──
// Three render here; app/(portal)/partner/page.tsx:968 (the "next step" guidance card, ?ui=legacy only)
// needs the whole partner data layer mocked and is the same color-mix, reviewed by hand. The fifth,
// the YouthDashboardNotice band, is gone: the notice moved onto the kit home as a --wa-* kit card (3f).
describe('the leftover accent shadow / gradient literals are color-mixes of --color-accent (and --wa-gold)', () => {
  const SEEDED = '#ad2c4d';
  const OTHER_ORG = '#1d4ed8';
  /** The portal token chain with OrgBrandingStyle's `:root { --org-accent; --color-accent }` override modelled. */
  const withOrg = (scheme: Scheme, accent: string) => new Map(tokensFor(scheme)).set('--org-accent', accent).set('--color-accent', 'var(--org-accent)');
  /** The root-layout chain (/find-your-path): css/main.css + wa-brand-tokens, dark defaults on :root, light on html:not(.dark). */
  function rootChain(scheme: Scheme): Map<string, string> {
    const main = readCss('css/main.css');
    const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), main);
    for (const [k, v] of loadBlockTokens(main, scheme === 'light' ? 'html:not(.dark)' : 'html.dark')) tokens.set(k, v);
    return tokens;
  }
  /**
   * `color-mix(in srgb, var(--color-accent) N%, transparent)`: the seeded org paints the exact rgba the
   * literal did, another org's accent follows, and without an org override the tint flips with the scheme.
   */
  function expectAccentTint(mix: string, pct: number, label: string) {
    expect(mix, label).toBe(`color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`);
    for (const scheme of SCHEMES) {
      expect(parseColor(resolve(mix, withOrg(scheme, SEEDED), scheme)), `${label}: ${scheme} seeded org`).toEqual({ r: 173, g: 44, b: 77, a: pct / 100 });
      expect(parseColor(resolve(mix, withOrg(scheme, OTHER_ORG), scheme)), `${label}: ${scheme} other org`).toEqual({ r: 29, g: 78, b: 216, a: pct / 100 });
    }
    expect(resolve(mix, tokensFor('light'), 'light'), `${label}: flips without an org override`).not.toBe(resolve(mix, tokensFor('dark'), 'dark'));
  }
  const STORED_RESULTS = {
    version: 1,
    programSlugs: ['it-support-professional-certificate-ibm', 'it-support-and-entry-level-cyber-security-certificate', 'ai-practitioner-professional-certificate-aws'],
    careerMatch: null,
  };
  afterEach(() => { localStorage.clear(); });

  for (const scheme of SCHEMES) {
    it(`${scheme}: MotivatingRecapClient hero tints --color-accent 10% → 2% (was rgba(173,44,77,.10) → .02)`, () => {
      const { container } = renderIn(
        scheme,
        <MotivatingRecapClient recap={{ id: 'recap-1', readinessScoreSnapshot: 42 }} recapData={{ wins: [{ label: 'Applied to two roles' }] }} weekStart="2026-09-14" />,
      );
      const hero = container.querySelector('.portal-card') as HTMLElement;
      const gradient = computed(hero, 'background');
      expectNoLiteral(gradient, `${scheme} recap hero "${gradient}"`);
      expect(gradient).toBe('linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), color-mix(in srgb, var(--color-accent) 2%, transparent))');
      const [start, end] = gradientStops(gradient);
      expectAccentTint(start, 10, 'recap hero start stop');
      expectAccentTint(end, 2, 'recap hero end stop');
    });

    it(`${scheme}: the /find-your-path Career Wrapped card ends on --color-accent 8% over --surface-container-low (root chain, was rgba(173, 44, 77, 0.08))`, async () => {
      localStorage.setItem('find_your_path_results', JSON.stringify(STORED_RESULTS));
      renderIn(scheme, <NextIntlClientProvider locale="en" messages={en}><FindYourPathClient /></NextIntlClientProvider>);
      const heading = await screen.findByRole('heading', { name: 'Three story slides you can share' });
      const card = heading.closest('section') as HTMLElement;
      const gradient = computed(card, 'background');
      expectNoLiteral(gradient, `${scheme} career wrapped "${gradient}"`);
      expect(gradient).toBe('linear-gradient(135deg, var(--surface-container-low), color-mix(in srgb, var(--color-accent) 8%, transparent))');
      const [canvas, end] = gradientStops(gradient);
      // /find-your-path sits under app/(decision-journey), which imports no portal sheet: only css/main.css
      // (+ wa-brand-tokens) resolve here, where --color-accent is the constant #ad2c4d on :root.
      const root = rootChain(scheme);
      expect(root.has('--wa-surface'), 'portal neutral must not leak onto the root chain').toBe(false);
      expect(colorOf(canvas, root, scheme).a).toBe(1);
      expect(parseColor(resolve(end, root, scheme))).toEqual({ r: 173, g: 44, b: 77, a: 0.08 });
      expectAccentTint(end, 8, 'career wrapped end stop');
    });

    it(`${scheme}: the In-office sessions "Walk-in" card casts --color-accent 12% under its --color-accent border (was rgba(173,44,77,0.12))`, async () => {
      const body = await SessionsIndexBody({ actor: 'counselor', actorUserId: 'counselor-1' });
      const { container } = renderIn(scheme, body);
      const card = screen.getByRole('heading', { name: 'Walk-in' }).closest('a') as HTMLElement;
      expect(inline(card, 'border')).toBe('2px solid var(--color-accent)');
      const shadow = computed(card, 'box-shadow');
      expectNoLiteral(shadow, `${scheme} walk-in shadow "${shadow}"`);
      expect(shadow).toBe('0 8px 24px color-mix(in srgb, var(--color-accent) 12%, transparent)');
      expectAccentTint(shadow.slice('0 8px 24px '.length), 12, 'walk-in shadow');
      expectNoLiteralShadows(container, `${scheme} sessions index`);
    });
  }
});

// ── 3e'. First90DaysCard on the kit home (WAP-188, restyled WAP-194) ──────────
// WAP-188 took the seeded-crimson rgba() literals and the constant green off
// the card. WAP-194 finishes the move onto a kit card: `wa-kit-card`, lucide
// icons instead of Material Symbols, and `--wa-*` tokens for every paint (no
// `--color-*`), with its tints mixed from `--wa-accent` like the rest of the
// kit column. Copy and the check-in action are unchanged.
describe('First90DaysCard is a kit card on --wa-* tokens only', () => {
  const first90 = (currentStageResponse: 'going_well' | null) => (
    <NextIntlClientProvider locale="en" messages={en}>
      <First90DaysCard stage="day_30" daysSincePlacement={20} employerName="Acme Health" currentStageResponse={currentStageResponse} completedStages={['week_1']} variant="kit" />
    </NextIntlClientProvider>
  );
  const styleProp = (el: Element, prop: string) =>
    (el.getAttribute('style') ?? '').match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim() ?? '';
  const waAccentTint = (pct: number) => `color-mix(in srgb, var(--wa-accent) ${pct}%, transparent)`;

  for (const scheme of SCHEMES) {
    it(`${scheme}: kit card, lucide icons, every paint a defined --wa-* token (tints of --wa-accent / --wa-success)`, () => {
      const { container, unmount } = renderIn(scheme, first90(null));
      const section = container.querySelector('section') as HTMLElement;
      expect(section.getAttribute('style'), 'kit variant: no outer padding of its own').toBeNull();
      const card = section.firstElementChild as HTMLElement;
      expect(card.className).toContain('wa-kit-card');
      expect(card.className).not.toMatch(/portal-card/);
      expect(container.querySelector('.material-symbols-outlined'), 'no Material Symbols ligatures').toBeNull();
      expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThanOrEqual(5);

      const styles = Array.from(container.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '');
      expect(styles.length).toBeGreaterThan(5);
      for (const style of styles) {
        expectNoLiteral(style, `${scheme} first 90 "${style}"`);
        expect(style, `${scheme} first 90 "${style}"`).not.toMatch(/var\(--(?:color|surface-container|outline)-?/);
        if (style.includes('var(--wa-')) expectTokensResolve(style, scheme, `first 90 "${style}"`);
      }

      const tile = container.querySelector('section span[aria-hidden]') as HTMLElement;
      expect(styleProp(tile, 'background')).toBe(waAccentTint(14));
      const chips = screen.getAllByRole('listitem');
      const current = chips.find((li) => li.textContent?.includes('Day 30')) as HTMLElement;
      expect(styleProp(current, 'background')).toBe(waAccentTint(10));
      expect(styleProp(current, 'border')).toBe(`1px solid ${waAccentTint(30)}`);
      const doneTick = chips.find((li) => li.textContent?.includes('Week 1'))?.querySelector('svg') as SVGElement;
      expect(styleProp(doneTick, 'color')).toBe('var(--wa-success)');

      // The answers are the kit's 44px ghost pills.
      for (const name of [en.first90.responses.going_well, en.first90.responses.have_questions, en.first90.responses.having_trouble]) {
        const button = screen.getByRole('button', { name });
        expect(button.className).toContain('wa-kit-cta');
        expect(button.className).toContain('wa-kit-cta--ghost');
      }

      const quotes = Array.from(container.querySelectorAll('blockquote'));
      expect(quotes).toHaveLength(2);
      for (const quote of quotes) {
        expect(styleProp(quote, 'background')).toBe(waAccentTint(5));
        expect(styleProp(quote, 'border-left')).toBe(`3px solid ${waAccentTint(35)}`);
      }
      unmount();

      const thanks = renderIn(scheme, first90('going_well'));
      const box = screen.getByText(en.first90.thanks.going_well).parentElement as HTMLElement;
      expect(styleProp(box, 'background')).toBe('color-mix(in srgb, var(--wa-success) 8%, transparent)');
      expect(styleProp(box, 'border')).toBe('1px solid color-mix(in srgb, var(--wa-success) 20%, transparent)');
      expectTokensResolve(styleProp(box, 'background'), scheme, 'first 90 thanks box');
      for (const el of Array.from(thanks.container.querySelectorAll<HTMLElement>('[style]'))) expectNoLiteral(el.getAttribute('style') ?? '', `${scheme} first 90 thanks`);
    });
  }

  it('legacy variant keeps its section gutter; the card inside is the same kit card', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <First90DaysCard stage="week_1" daysSincePlacement={3} employerName="Acme" currentStageResponse={null} completedStages={[]} />
      </NextIntlClientProvider>,
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.padding).toBe('1rem 1.25rem 0px');
    expect((section.firstElementChild as HTMLElement).className).toContain('wa-kit-card');
  });
});

// ── 3f. YouthDashboardNotice on the kit home (WAP-188) ─────────────────────
// The notice now renders on the kit member home, so it left the legacy chain
// entirely: a kit card with the info edge, no gradient band, no --color-* and
// no rgba() literal anywhere in its tree (the icon tiles and the job-board box
// were rgba(173,44,77,.1) / rgba(240,205,131,.2) / rgba(255,255,255,.7)).
describe('YouthDashboardNotice is a kit card on --wa-* tokens only', () => {
  for (const scheme of SCHEMES) {
    it(`${scheme}: every inline paint reads a defined --wa-* token, never a literal or --color-*`, () => {
      const { container } = renderIn(scheme, <YouthDashboardNotice age={17} />);
      const card = container.firstElementChild as HTMLElement;
      expect(card.className).toContain('wa-kit-card');
      expect(card.className).toContain('wa-kit-tone--info');
      expect(card.className).toContain('wa-kit-tone-edge');
      expect(inline(card, 'background'), 'the band gradient is gone').toBe('');
      const styles = Array.from(container.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '');
      expect(styles.length).toBeGreaterThan(0);
      for (const style of styles) {
        expectNoLiteral(style, `${scheme} youth notice "${style}"`);
        expect(style, `${scheme} youth notice "${style}"`).not.toMatch(/var\(--(?:color|surface-container|radius)-/);
        if (style.includes('var(--wa-')) expectTokensResolve(style, scheme, `youth notice "${style}"`);
      }
    });
  }
});
