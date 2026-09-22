import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  colorOf,
  contrast,
  loadBlockTokens,
  loadRootTokens,
  over,
  parseColor,
  readCss,
  resolve,
  type Scheme,
} from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * Mobile / dark scout 2026-09-22, M3 M5 M6 M7 M8 M10 M11 — component-level
 * contrast, tint and size defects. Every case renders the real surface, reads
 * what reached the DOM (inline styles, class names) and resolves it through
 * the stylesheets the route loads (css/wa-brand-tokens.css, css/portal-tokens.css,
 * css/portal-kit.css, css/main.css) in both colour schemes, so a literal or a
 * fill hue creeping back in fails here rather than in the next scout.
 *
 *  - M3  member "Continue this course": the Astryx `<Button href>` anchor
 *        inherited body text on crimson (2.69:1). It is now the kit CTA.
 *  - M5  admin member-card chips: opaque light tints (#fef2f2 …) → kit pairs.
 *  - M6  at-risk filter chips: 36px tall, fill hues as 13px text → 40px, text tokens.
 *  - M7  employer match percentages: --wa-success / --wa-gold text → -dark twins.
 *  - M8  employer "Start voice session": white on --wa-info (2.36:1 dark) →
 *        --wa-info-dark under --wa-on-accent-control.
 *  - M10 messaging / voice eyebrows painted in the glow hex → badgeColor tokens.
 *  - M11 ApplicantTriageChip 0.72rem (11.52px) → --wa-type-meta (13px).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/members',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({
  logCourseraLaunchFromPortal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));
vi.mock('@/components/admin/BulkEmailModal', () => ({ default: () => null }));
vi.mock('@/components/admin/BulkUpdateModal', () => ({ default: () => null }));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));

import { MemberTrainingWorkspace } from '@/components/portal/kit/pages/member/MemberTrainingWorkspace';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';
import { PROGRAM_SYLLABI } from '@/shared/programSyllabi';
import MembersTable from '@/components/admin/MembersTable';
import ApplicantTriageChip from '@/components/admin/ApplicantTriageChip';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';
import EmployerMatchHistoryClient from '@/components/employer/EmployerMatchHistoryClient';
import EmployerPipelineClient from '@/components/employer/EmployerPipelineClient';
import EmployerKanban from '@/components/employer/EmployerKanban';
import PortalVoiceSession from '@/components/portal/PortalVoiceSession';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { employerVoiceSurface, employerVoiceSessionAccent } from '@/lib/portal/voice';
import { employerMessagingSurface, partnerMessagingSurface } from '@/lib/portal/messagingSurfaces';

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const AA = 4.5;
// jsdom normalises a bare hex in an inline style to `rgb(r, g, b)`; an
// alpha-less rgb() therefore means a literal bypassed the tokens.
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/;

/** Portal token layer: brand hues + portal neutrals (what every portal route loads). */
const portalTokens = () => loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));

/**
 * Portal tokens plus main.css's surface scale, which VoiceAgentSurface's card
 * reads (`--surface-container-lowest`: dark default in `:root`, light in
 * `html:not(.dark)`).
 */
function portalAndMainTokens(scheme: Scheme): Map<string, string> {
  const main = readCss('css/main.css');
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), main, readCss('css/portal-tokens.css'));
  if (scheme === 'light') for (const [k, v] of loadBlockTokens(main, 'html:not(.dark)')) tokens.set(k, v);
  return tokens;
}

/** The `prop: value;` declarations of the first `selector {` block in a stylesheet. */
function blockDeclarations(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Anchored at a line start so `.wa-kit-cta {` is the rule itself, not a nested `.x .wa-kit-cta {`.
  const start = clean.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const open = clean.indexOf('{', start);
  const body = clean.slice(open + 1, clean.indexOf('}', open));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/([a-z-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** Text over a (possibly translucent) fill that itself sits on `surface`. */
function textOnFill(text: string, fill: string, surface: string, tokens: Map<string, string>, scheme: Scheme): number {
  const bg = over(parseColor(resolve(fill, tokens, scheme)), colorOf(surface, tokens, scheme));
  return contrast(colorOf(text, tokens, scheme), bg);
}

beforeAll(() => {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── M3 ─────────────────────────────────────────────────────────────────────
describe('M3 member /dashboard/program: "Continue this course" is the kit CTA', () => {
  const programSlug = 'it-support-professional-certificate-ibm';
  const syllabus = PROGRAM_SYLLABI[programSlug];
  const courseSlug = (index: number) => `${programSlug}-course-${index + 1}`;
  const launchHref = `/api/member/coursera/launch?course=${courseSlug(0)}`;
  const workspace: TrainingWorkspace = {
    programSlug, programTitle: syllabus.title, curriculumVersion: 'test-syllabus-v1', weeklyHours: null,
    planStartDate: null, planUpdatedAt: null, totalEstimatedHours: syllabus.totalHours,
    publishedSyllabusHours: syllabus.totalHours,
    courses: syllabus.courses.map((course, index) => ({
      slug: courseSlug(index), name: course.name, estimatedHours: course.hours, description: course.description,
      kind: 'coursera', notes: '', artifactUrl: null, updatedAt: null,
    })),
  };

  it('renders an anchor carrying .wa-kit-cta (not the Astryx link atoms) whose token pair clears AA in both modes', () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <MemberTrainingWorkspace workspace={workspace} programTitle={workspace.programTitle} completedSlugs={[]} practiceMissions={[]}
        syllabusHours={160} syllabusBreakdown={syllabus.totalHoursLabel} destinations={[{ slug: courseSlug(0), launchHref }]} />,
    );
    const cta = screen.getByRole('link', { name: 'Continue this course' });
    expect(cta).toHaveAttribute('href', launchHref);
    expect(cta.classList.contains('wa-kit-cta')).toBe(true);
    expect(cta.classList.contains('astryx-button')).toBe(false);
    expect(cta.getAttribute('style') ?? '').not.toMatch(BARE_RGB);

    const decls = blockDeclarations(readCss('css/portal-kit.css'), '.wa-kit-cta');
    expect(decls.get('color')).toBe('var(--wa-on-accent-control)');
    expect(decls.get('background')).toBe('var(--wa-accent)');
    expect(Number.parseFloat(decls.get('min-height') ?? '0')).toBeGreaterThanOrEqual(40);

    const tokens = portalTokens();
    for (const scheme of SCHEMES) {
      const fill = colorOf(decls.get('background')!, tokens, scheme);
      expect(contrast(colorOf(decls.get('color')!, tokens, scheme), fill), `${scheme} CTA label`).toBeGreaterThanOrEqual(AA);
      // The defect: the anchor inherited --wa-text on the same crimson fill.
      expect(contrast(colorOf('var(--wa-text)', tokens, scheme), fill), `${scheme} inherited body text`).toBeLessThan(AA);
    }
  });
});

// ── M5 + M11 ───────────────────────────────────────────────────────────────
describe('M5 admin /admin/members: card chips read kit tone pairs', () => {
  const now = new Date().toISOString();
  const base = {
    email: 'm@example.com', phone: null, profile: null, enrolledProgram: 'it-support', enrolledAt: now,
    createdAt: '2025-01-01T00:00:00.000Z', staleTrainingDetectedAt: null, assessmentScorePct: null, assessmentCompleted: null,
    updatedAt: now, programTitle: 'IT Support', coursesCompleted: [], totalCourses: 5, liveTraining: null,
    partnerName: null, partnerId: null, enrollmentProgramSlugs: ['it-support'], enrollmentProgramTitleBySlug: { 'it-support': 'IT Support' },
  };
  const members = [
    { ...base, id: 'a', fullName: 'Ada Active', memberStatus: 'active', healthStatus: 'red' as const, fitScore: 3,
      applicantTriage: { bucket: 'missing_info' as const, label: 'Missing information', reasons: ['No intake screening'] } },
    { ...base, id: 'b', fullName: 'Bea Placed', memberStatus: 'placed', createdAt: now, fitScore: 6 },
    { ...base, id: 'c', fullName: 'Cy Inactive', memberStatus: 'inactive', fitScore: 9 },
  ];
  const props = {
    members, totalCount: 3, currentPage: 1, pageSize: 50, searchQuery: '', programFilter: '', statusFilter: '', partnerFilter: '',
    startDateFilter: '', endDateFilter: '', allPartnerOptions: [], allAssignablePrograms: [{ slug: 'it-support', title: 'IT Support' }],
    applicantTriageCopy: { filterLabel: 'Applicant triage', filterAll: 'All', buckets: { ready_to_review: 'Ready', missing_info: 'Missing information', needs_human: 'Needs review', not_eligible_signal: 'Not eligible' } },
  };

  /** Every M5 pill (50px radius inline chip) inside `root`: status, priority and fit score chips (the triage chip is M11). */
  const pills = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>('[style*="border-radius: 50px"]:not(.admin-applicant-triage-chip)'));

  it('status / priority / fit chips in the mobile list and the table paint token pairs that clear AA on the card in both modes', () => {
    const { container } = render(<MembersTable {...props} />);
    const list = screen.getByRole('list', { name: 'Members (mobile layout)' });
    const cardPills = pills(list);
    expect(cardPills.length).toBeGreaterThanOrEqual(6); // 3 status + 2 priority + 3 fit − none hidden
    expect(within(list).getByText('active')).toBeTruthy();
    expect(within(list).getByText('placed')).toBeTruthy();
    expect(within(list).getByText('inactive')).toBeTruthy();
    expect(within(list).getAllByText('Inactive').length).toBeGreaterThanOrEqual(2); // health badge + priority chip
    expect(within(list).getByText('New')).toBeTruthy(); // priority: new signup → info pair

    const tokens = portalTokens();
    for (const pill of pills(container)) {
      const style = pill.getAttribute('style') ?? '';
      expect(style, `literal in ${pill.textContent}`).not.toMatch(BARE_RGB);
      expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const { color, background } = pill.style;
      expect(color, pill.textContent ?? '').toMatch(/^var\(--wa-/);
      expect(background, pill.textContent ?? '').toMatch(/^var\(--wa-/);
      for (const scheme of SCHEMES) {
        expect(textOnFill(color, background, 'var(--wa-surface)', tokens, scheme), `${scheme} "${pill.textContent}" ${color} on ${background}`).toBeGreaterThanOrEqual(AA);
      }
      // The border is a color-mix of the text token, never a `${hex}20` suffix concat.
      expect(pill.style.border).toContain('color-mix(in srgb, var(--wa-');
    }
  });

  it('M11: the applicant triage chip text is the 13px chip size token, not 0.72rem', () => {
    const tokens = portalTokens();
    const meta = Number.parseFloat(tokens.get('--wa-type-meta') ?? '0');
    expect(meta).toBeGreaterThanOrEqual(12);
    for (const size of ['sm', 'md'] as const) {
      const { container } = render(<ApplicantTriageChip bucket="missing_info" label="Missing information" reasons={['No intake screening']} size={size} />);
      const chip = container.querySelector<HTMLElement>('.admin-applicant-triage-chip')!;
      const fontSize = chip.style.fontSize || ((chip.getAttribute('style') ?? '').match(/font-size:\s*([^;]+)/)?.[1] ?? '');
      expect(fontSize, size).toBe('var(--wa-type-meta, 13px)');
      // Both the token and its fallback sit on or above the 12px floor.
      expect(Number.parseFloat(fontSize.match(/,\s*([\d.]+)px/)?.[1] ?? '0')).toBeGreaterThanOrEqual(12);
      cleanup();
    }
    // And the chip is reachable from the members table card, where the scout measured 11.52px.
    render(<MembersTable {...props} />);
    const inCard = within(screen.getByRole('list', { name: 'Members (mobile layout)' })).getAllByText('Missing information');
    expect(inCard.length).toBeGreaterThan(0);
    for (const chip of inCard) expect(chip.style.fontSize).toBe('var(--wa-type-meta, 13px)');
  });
});

// ── M6 ─────────────────────────────────────────────────────────────────────
describe('M6 counselor /counselor/at-risk: severity + status filter chips', () => {
  const member = (id: string, overrides: Partial<AtRiskMember> = {}): AtRiskMember => ({
    userId: id, alertId: `alert-${id}`, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
    score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
    enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
    alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z',
    lastActivityAt: null, ...overrides,
  });
  const chips = () => screen.getAllByRole('button').filter((b) => / · \d+$/.test(b.textContent ?? ''));

  it('seven chips: 40px tap targets, 13px labels in text tokens that clear AA at rest and when active, both modes', () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    render(<AtRiskDashboard initialMembers={[member('a'), member('b', { score: 40, riskLevel: 'MEDIUM', status: 'acknowledged' })]} />);
    const all = chips();
    expect(all.map((c) => c.textContent)).toEqual([
      'Critical · 1', 'High · 0', 'Medium · 1', 'Low · 0', 'Open · 1', 'Acknowledged · 1', 'Resolved · 0',
    ]);
    const tokens = portalTokens();
    for (const chip of all) {
      const label = chip.textContent ?? '';
      expect(Number.parseFloat(chip.style.minHeight), `${label} min-height`).toBeGreaterThanOrEqual(40);
      expect(Number.parseFloat(chip.style.fontSize), `${label} font-size`).toBeGreaterThanOrEqual(12);
      expect(chip.getAttribute('style') ?? '').not.toMatch(BARE_RGB);
      expect(chip.style.color, label).toMatch(/^var\(--wa-(gold-dark|info-dark|success-dark|accent-text|danger-text|muted|text)\)$/);
      // At rest the chip sits on --wa-bg.
      expect(chip.style.background).toBe('var(--wa-bg)');
      for (const scheme of SCHEMES) {
        expect(contrast(colorOf(chip.style.color, tokens, scheme), colorOf('var(--wa-bg)', tokens, scheme)), `${scheme} ${label} at rest`).toBeGreaterThanOrEqual(AA);
      }
      // Active: the tone tints the fill (14% color-mix or --wa-success-soft) and draws the border; the label keeps its text token.
      fireEvent.click(chip);
      const active = chips().find((c) => c.textContent === label)!;
      expect(active.style.border).not.toContain('transparent');
      expect(active.style.color).toBe(chip.style.color);
      for (const scheme of SCHEMES) {
        expect(textOnFill(active.style.color, active.style.background, 'var(--wa-bg)', tokens, scheme), `${scheme} ${label} active`).toBeGreaterThanOrEqual(AA);
      }
      fireEvent.click(active); // toggle the filter back off
    }
  });
});

// ── M7 ─────────────────────────────────────────────────────────────────────
describe('M7 employer match percentages read the -dark text tokens', () => {
  const percents = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>('span')).filter((el) => /^\d{2,3}%$/.test(el.textContent ?? '') && el.style.color);

  function expectAaPercents(root: HTMLElement, expected: string[]) {
    const spans = percents(root);
    // The kit DataTable renders a table and a card list, so each value appears twice.
    expect(spans.length).toBeGreaterThanOrEqual(expected.length);
    expect([...new Set(spans.map((s) => s.textContent))]).toEqual(expected);
    const tokens = portalTokens();
    for (const span of spans) {
      expect(span.style.color, span.textContent ?? '').toMatch(/^var\(--wa-(success-dark|gold-dark|accent-text|muted)\)$/);
      expect(span.style.color).not.toMatch(/^var\(--wa-(success|gold)\)$/);
      for (const scheme of SCHEMES) {
        expect(contrast(colorOf(span.style.color, tokens, scheme), colorOf('var(--wa-surface)', tokens, scheme)), `${scheme} ${span.textContent} ${span.style.color}`).toBeGreaterThanOrEqual(AA);
      }
    }
  }

  it('/employer/matches FitBadge: success, gold and accent bands', () => {
    const row = (id: string, matchScore: number) => ({
      id, jobId: 'job-1', studentId: `s-${id}`, status: 'suggested', matchScore, createdAt: '2026-09-01T00:00:00.000Z',
      statusUpdatedAt: null, job: { id: 'job-1', title: 'Support Specialist' }, student: { id: `s-${id}`, fullName: `Candidate ${id}` }, applicationId: null,
    });
    const { container } = render(<EmployerMatchHistoryClient initialRows={[row('a', 0.9), row('b', 0.75), row('c', 0.65)]} />);
    expectAaPercents(container, ['90%', '75%', '65%']);
  });

  it('/employer/pipeline score and the Kanban card score', () => {
    const match = (id: string, matchScore: number) => ({
      id, jobId: 'job-1', jobTitle: 'Support Specialist', matchScore, matchReasons: ['Completed the program'], status: 'suggested',
      student: { id: `s-${id}`, fullName: `Candidate ${id}`, email: `${id}@example.com`, enrolledProgram: null },
    });
    const pipeline = render(<EmployerPipelineClient jobId="job-1" jobTitle="Support Specialist" initialMatches={[match('a', 0.82), match('b', 0.65)]} />);
    expectAaPercents(pipeline.container, ['82%', '65%']);
    cleanup();
    const kanban = render(<EmployerKanban initialMatches={[match('a', 0.82), match('b', 0.65)]} />);
    expectAaPercents(kanban.container, ['82%', '65%']);
  });

  it('the former fill hues fail AA as 13px text on the surface (why the twins exist)', () => {
    const tokens = portalTokens();
    const surface = (s: Scheme) => colorOf('var(--wa-surface)', tokens, s);
    expect(contrast(colorOf('var(--wa-success)', tokens, 'light'), surface('light'))).toBeLessThan(AA);
    expect(contrast(colorOf('var(--wa-gold)', tokens, 'light'), surface('light'))).toBeLessThan(AA);
  });
});

// ── M8 ─────────────────────────────────────────────────────────────────────
describe('M8 employer voice card: "Start voice session" fill / label pair', () => {
  const start = () => screen.getByRole('button', { name: 'Start voice session' });

  it('the employer accent props paint --wa-info-dark under --wa-on-accent-control: AA in both modes', () => {
    render(<PortalVoiceSession sessionEndpoint="/api/employer/voice-session" title="Employer assistant" description="Ask about postings." {...employerVoiceSessionAccent} />);
    const btn = start();
    expect(btn.style.background).toBe('var(--wa-info-dark)');
    expect(btn.style.color).toBe('var(--wa-on-accent-control)');
    const tokens = portalTokens();
    for (const scheme of SCHEMES) {
      expect(contrast(colorOf(btn.style.color, tokens, scheme), colorOf(btn.style.background, tokens, scheme)), `${scheme} start label`).toBeGreaterThanOrEqual(AA);
    }
    // The defect: the panel's white label on --wa-info, which lightens to #77ade6 in dark.
    expect(contrast(colorOf('var(--wa-sidebar-text)', tokens, 'dark'), colorOf('var(--wa-info)', tokens, 'dark'))).toBeLessThan(AA);
    // Both CTA tokens are brand tokens (css/wa-brand-tokens.css :root), so any route that
    // mounts the panel with this pair resolves them without the portal token layer.
    const brand = loadRootTokens(readCss('css/wa-brand-tokens.css'));
    expect(brand.has('--wa-info-dark')).toBe(true);
    expect(brand.has('--wa-on-accent-control')).toBe(true);
  });

  it('the default crimson panel (public /wioa-qualification mount) is unchanged and still AA', () => {
    render(<PortalVoiceSession sessionEndpoint="/api/voice/session" title="Screening" description="Talk it through." />);
    const btn = start();
    expect(btn.style.background).toBe('var(--wa-hero-crimson)');
    expect(btn.style.color).toBe('var(--wa-sidebar-text)');
    const tokens = portalTokens();
    for (const scheme of SCHEMES) {
      expect(contrast(colorOf(btn.style.color, tokens, scheme), colorOf(btn.style.background, tokens, scheme)), `${scheme} default start label`).toBeGreaterThanOrEqual(AA);
    }
  });
});

// ── M10 ────────────────────────────────────────────────────────────────────
describe('M10 messaging / voice surface eyebrows read text tokens, the glow keeps its hue', () => {
  it.each([
    ['partnerMessagingSurface', partnerMessagingSurface, 'var(--wa-gold-dark)'],
    ['employerMessagingSurface', employerMessagingSurface, 'var(--wa-info-dark)'],
    ['employerVoiceSurface', employerVoiceSurface, 'var(--wa-accent-text)'],
  ] as const)('%s badge is %s and clears AA on the card in both modes', (_name, surface, expected) => {
    const { container } = render(
      <VoiceAgentSurface {...surface}>
        <p>panel</p>
      </VoiceAgentSurface>,
    );
    const badge = screen.getByText(surface.badge);
    expect(badge.style.color).toBe(expected);
    expect(badge.style.color).not.toBe(surface.glowColor);
    const ring = container.firstElementChild as HTMLElement;
    expect(ring.style.boxShadow).toContain(surface.glowColor);
    const card = ring.firstElementChild as HTMLElement;
    expect(card.style.background).toBe('var(--surface-container-lowest)');
    for (const scheme of SCHEMES) {
      const tokens = portalAndMainTokens(scheme);
      const cardFill = colorOf(card.style.background, tokens, scheme);
      expect(cardFill.a).toBe(1);
      expect(contrast(colorOf(badge.style.color, tokens, scheme), cardFill), `${scheme} ${surface.badge}`).toBeGreaterThanOrEqual(AA);
    }
  });
});
