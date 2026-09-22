import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readCss, loadRootTokens, loadBlockTokens, colorOf, contrast, over, parseColor, resolve, type Scheme,
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
 * The specs render each surface in the light and the dark scheme, read the
 * computed style of the fixed element and fail on any hex or rgb()/rgba()
 * literal; every `var(--wa-*)` they find must resolve through the real
 * token files for that scheme.
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

import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import VoiceCoachLauncherCard from '@/components/portal/VoiceCoachLauncherCard';
import VoiceCoachesPromo from '@/components/portal/VoiceCoachesPromo';
import MemberDashboardVoiceSection from '@/components/portal/MemberDashboardVoiceSection';
import MembersTable from '@/components/admin/MembersTable';
import {
  careerBusinessVoiceSurface, counselorStaffVoiceSurface, employerVoiceSurface, mockInterviewVoiceSurface,
  partnerVoiceSurface, readinessVoiceSurface, resumeCoachVoiceSurface, studentCounselorVoiceSurface,
} from '@/lib/portal/voice';
import {
  adminMessagingSurface, counselorStaffMessagingSurface, employerMessagingSurface, memberMessagingSurface, partnerMessagingSurface,
} from '@/lib/portal/messagingSurfaces';

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
      for (const [Section, badge] of [[VoiceCoachesPromo, '10–20 SEC'], [MemberDashboardVoiceSection, 'Introduction']] as const) {
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
    // The neighbouring rule: main.css .btn-primary pairs the same --color-accent fill with --wa-on-accent.
    const src = main.replace(/\/\*[\s\S]*?\*\//g, '');
    const selector = '.btn-primary,\na.btn-primary,\nbutton.btn-primary';
    const start = src.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start + selector.length + 2, src.indexOf('}', start));
    expect(body).toMatch(/background:\s*var\(--color-accent\);/);
    expect(body).toMatch(/color:\s*var\(--wa-on-accent\);/);
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
