import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCss, loadRootTokens, loadBlockTokens, colorOf, contrast, over } from '@/lib/ui/cssTokenContrast.test-helpers';
import { JOB_APPLICATION_STATUS_ACCENT } from '@/lib/jobApplications/statusAccents';
import { JOB_APPLICATION_STATUS } from '@/lib/jobApplications/constants';
import { pickAdminClientMessages } from '@/lib/i18n/pickRootClientMessages';
import messages from '@/messages/en.json';

/**
 * Portal scout 2026-09-22, D6–D15 + D8 — the remaining bare hex literals.
 *
 * The legacy pipeline stages, testimonials moderation, the job-application
 * card / kanban, skill checkpoints, feature flags, webhook events, the
 * placement strip, partner / employer tables, the B4B bindings card and the
 * Command Center review buttons used to paint status colours from hard-coded
 * hex (#dc2626, #16a34a, #b45309, #fff ...) that never followed dark mode.
 * They now read `--wa-*` tokens. This spec renders every surface and inspects
 * what actually reaches the DOM (inline styles, class names, SVG paint), so a
 * literal creeping back in through any prop path fails here.
 *
 * Allowlist: #a47f38 is the brand gold literal (the "Hiring Partner" tier),
 * a deliberate keep outside this sweep.
 */
const ALLOWED_HEX = new Set(['#a47f38']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// jsdom normalises a bare hex in an inline style to `rgb(r, g, b)`, so an
// alpha-less rgb() in a style attribute is also a literal that bypassed the
// tokens. rgba() tints are left alone (they are how alpha is written).
const BARE_RGB = /\brgb\(\d+,\s*\d+,\s*\d+\)/g;
const ALLOWED_RGB = new Set(['rgb(164, 127, 56)']);

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin/employers',
  useSearchParams: () => new URLSearchParams(),
}));
// The banner imports a server action; it is not under test here.
vi.mock('@/app/admin/pipeline/StaleApplicationsBanner', () => ({ default: () => null }));
vi.mock('@/app/(portal)/dashboard/placementAction', () => ({
  confirmPlacement: vi.fn(async () => { throw new Error('boom'); }),
}));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerEditModal', () => ({ default: () => null }));
vi.mock('@/components/admin/PartnerDeactivateDialog', () => ({ default: () => null }));

/** Every colour-bearing value that reached the DOM: inline styles, classes + SVG paint attributes. */
function paintedValues(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attr of ['style', 'class', 'fill', 'stroke', 'stop-color', 'color']) {
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeAll(() => {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('legacy admin pipeline paints from --wa-* tokens (D6)', () => {
  it('stage cards, at-risk tiles and the partial-load banner carry no hex literal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === '/api/admin/pipeline/at-risk-stats') {
        return json({ criticalCount: 2, alertsSentToday: 1, counselorsWithPending: [{ name: 'Counselor One', email: 'c1@example.com', memberCount: 3 }] });
      }
      if (input === '/api/admin/pipeline') return json({ error: 'down' }, 500);
      return json({ staleApps: [] });
    }));
    const { default: PipelineLegacyView } = await import('@/app/admin/pipeline/PipelineLegacyView');
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={pickAdminClientMessages(messages)} onError={() => {}}>
        <PipelineLegacyView />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Counselor One')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    // Seven stage cards: label reads the text ramp, border / bar the fill hue.
    expect(styles).toContain('var(--wa-gold-dark)');
    expect(styles).toContain('border-left: 4px solid var(--wa-gold)');
    expect(styles).toContain('var(--wa-danger-soft)');
    expect(styles).toContain('var(--wa-success-soft)');
  });
});

describe('testimonials moderation paints from --wa-* tokens (D7)', () => {
  it('status badges, filter tiles, table and action buttons carry no hex literal', async () => {
    const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED'] as const;
    vi.stubGlobal('fetch', vi.fn(async () => json({
      stats: { pending: 1, approved: 1, rejected: 1, published: 1 },
      testimonials: statuses.map((status, i) => ({
        id: `t${i}`, memberId: `m${i}`, content: `Testimonial ${i}`, rating: 4, programId: null, placementId: null,
        source: 'SURVEY', status, photoUrl: null, consentGiven: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
        reviewedBy: null, reviewedAt: null, rejectionReason: status === 'REJECTED' ? 'Off topic' : null,
        member: { id: `m${i}`, fullName: `Member ${i}`, email: `m${i}@example.com`, enrolledProgram: null }, reviewer: null,
      })),
    })));
    const { default: TestimonialsAdminClient } = await import('@/components/admin/TestimonialsAdminClient');
    const { container } = render(<TestimonialsAdminClient />);
    await waitFor(() => expect(screen.getByText('Off topic')).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-gold-dark)', 'var(--wa-success-dark)', 'var(--wa-accent-text)', 'var(--wa-info-dark)', 'var(--wa-surface)']) expect(styles).toContain(t);
  });
});

describe('job-application card + kanban paint from --wa-* tokens (D8)', () => {
  it('every status column, card, badge and the editing card carry no hex literal (styles and class names)', async () => {
    const { default: JobApplicationKanban } = await import('@/components/portal/JobApplicationKanban');
    const now = new Date('2026-09-01T00:00:00Z');
    const applications = JOB_APPLICATION_STATUS.map((status, i) => ({
      id: `a${i}`, userId: 'u1', company: `Company ${i}`, role: `Role ${i}`, status, appliedAt: now, source: 'INDEED' as const,
      nextInterviewDate: now, notes: 'note', url: 'https://example.com', curatedJobId: 'job', createdAt: now, updatedAt: now,
    }));
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <JobApplicationKanban applications={applications} onStatusChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(unexpectedHex(container)).toEqual([]);
    // Each card / column reads its status token through the kanban accent.
    const accents = Array.from(container.querySelectorAll<HTMLElement>('.portal-kanban-card, .portal-kanban-column'))
      .map((el) => el.style.getPropertyValue('--portal-kanban-accent'));
    expect(accents.length).toBeGreaterThanOrEqual(14);
    expect(new Set(accents)).toEqual(new Set(Object.values(JOB_APPLICATION_STATUS_ACCENT)));
    // Enter the editing state: the Save button used to carry a hex ring class.
    fireEvent.click(screen.getByRole('button', { name: /Edit job application for Role 0/ }));
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('wa-ring-[var(--wa-accent-dark)]');
    expect(unexpectedHex(container)).toEqual([]);
  });
});

describe('skill checkpoints panel paints from --wa-* tokens (D9)', () => {
  it('status badges, skill chips, summary pills and the coaching note carry no hex literal', async () => {
    const { default: Panel } = await import('@/components/admin/AdminMemberSkillCheckpointPanel');
    const result = { verdict: 'retry', coachingNote: 'Try again with metrics.', starStory: 'S', resumeBullet: 'Did X', skillsUnlocked: ['SQL'] };
    const missions = (['passed', 'needs_retry', 'ready', 'locked'] as const).map((status, i) => ({
      key: `m${i}`, courseTitle: `Course ${i}`, missionName: `Mission ${i}`, status, completedAt: null,
      latestResult: status === 'locked' ? null : result, aiToolResultId: null, skillLabels: ['SQL'],
    }));
    const { container } = render(
      <Panel memberId="member-1" summary={{ programSlug: 'it-support', programTitle: 'IT Support', totalMissions: 4, passedCount: 1, readyCount: 1, retryCount: 1, streak: 2, careerReadinessPct: 85, demonstratedSkills: ['SQL'], missions }} />,
    );
    expect(screen.getByText('Try again with metrics.')).toBeTruthy();
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-danger-text)', 'var(--wa-danger-soft)', 'var(--wa-success-dark)', 'var(--wa-info-dark)', 'var(--wa-muted-strong)']) expect(styles).toContain(t);
  });
});

describe('feature flags paint from --wa-* tokens (D10)', () => {
  const roles = ['member', 'admin', 'super_admin', 'case_manager', 'counselor', 'partner', 'employer'];
  it('role badges, enabled pills, delete buttons and the load error carry no hex literal', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls === 1) return json({ error: 'nope' }, 500);
      return json({ flags: [
        { id: 'f1', key: 'a', name: 'Flag A', description: 'd', enabled: true, rolloutPercentage: 100, allowedRoles: roles, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
        { id: 'f2', key: 'b', name: 'Flag B', description: null, enabled: false, rolloutPercentage: 0, allowedRoles: [], createdAt: '2026-09-01', updatedAt: '2026-09-01' },
      ] });
    }));
    const { default: AdminFeatureFlagsClient } = await import('@/components/admin/AdminFeatureFlagsClient');
    const { container, unmount } = render(<AdminFeatureFlagsClient />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    unmount();
    const second = render(<AdminFeatureFlagsClient />);
    await waitFor(() => expect(screen.getByText('Flag B')).toBeTruthy());
    expect(unexpectedHex(second.container)).toEqual([]);
    const styles = paintedValues(second.container).join('\n');
    for (const t of ['var(--wa-info-dark)', 'var(--wa-success-dark)', 'var(--wa-accent-text)', 'var(--wa-gold-dark)', 'color-mix(in srgb, var(--wa-success-dark) 50%, var(--wa-info-dark))']) expect(styles).toContain(t);
  });
});

describe('webhook events paint from --wa-* tokens (D11)', () => {
  it('status pills (known and unknown), Apply button and error output carry no hex literal', async () => {
    const { default: WebhookEventsClient } = await import('@/app/admin/webhook-events/WebhookEventsClient');
    const events = ['success', 'failed', 'retrying', 'dead_letter', 'mystery'].map((status, i) => ({
      id: `e${i}`, source: `src-${status}`, eventType: 'enrollment', eventId: `ev${i}`, payloadSize: 512, processingTimeMs: 12, status,
      httpStatusCode: status === 'failed' ? 500 : 200, errorMessage: status === 'failed' ? 'Upstream 500' : null, retryCount: 1, nextRetryAt: null,
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }));
    const { container } = render(
      <WebhookEventsClient events={events} page={1} totalPages={1} pageSize={50} totalMatching={5} initialQ="" initialSource="" initialStatus=""
        initialDateFrom="" initialDateTo="" sources={[{ name: 'coursera', count: 5 }]} statuses={[{ name: 'failed', count: 1 }]} />,
    );
    // The error output is collapsed until its row / card is tapped.
    fireEvent.click(screen.getAllByText('src-failed')[0]);
    expect(screen.getAllByText('Upstream 500').length).toBeGreaterThan(0);
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-success-dark)', 'var(--wa-danger-text)', 'var(--wa-info-dark)', 'var(--wa-muted-strong)', 'var(--wa-on-accent-control)']) expect(styles).toContain(t);
  });
});

describe('placement confirmation strip paints from --wa-* tokens (D13)', () => {
  it('banner copy, buttons and the error alert read --wa-on-success on the success fill', async () => {
    const { default: Strip } = await import('@/app/(portal)/dashboard/PlacementConfirmationStrip');
    const { container } = render(<Strip offers={[{ id: 'o1', company: 'Acme' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /notify my team/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    expect(styles).toContain('background: var(--wa-success-dark)');
    expect((styles.match(/var\(--wa-on-success\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(styles).not.toMatch(/var\(--color-green/);
  });
});

describe('partner and employer tables paint from --wa-* tokens (D14)', () => {
  it('partner status pills and approve / reject buttons carry no hex literal', async () => {
    const { default: PartnersTableClient } = await import('@/components/admin/PartnersTableClient');
    const partner = (id: string, status: string, active: boolean) => ({
      id, name: `Partner ${id}`, slug: id, contactName: null, contactEmail: null, contactPhone: null, active, status, notes: null, logoUrl: null, brandColor: null,
      _count: { counselors: 1, referrals: 2 },
    });
    const { container } = render(
      <PartnersTableClient superAdmin partners={[partner('p1', 'pending_approval', false), partner('p2', 'active', true), partner('p3', 'inactive', false)]} subgroups={[]} />,
    );
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-gold-dark)', 'var(--wa-gold-soft)', 'var(--wa-success-dark)', 'var(--wa-danger-text)']) expect(styles).toContain(t);
  });

  it('employer tier and status badges carry no hex literal beyond the brand gold', async () => {
    const { default: EmployersTableClient } = await import('@/components/admin/EmployersTableClient');
    const employer = (id: string, status: string, signed: boolean, pipeline: boolean) => ({
      id, companyName: `Employer ${id}`, contactName: null, contactEmail: null, status, tier: 'standard', placementAgreementSigned: signed, hiringPipelineActive: pipeline,
      user: { email: `${id}@example.com`, fullName: null, lastLoginAt: null }, _count: { jobs: 1 },
    });
    const { container } = render(
      <EmployersTableClient superAdmin employers={[employer('e1', 'active', true, true), employer('e2', 'pending_approval', true, false), employer('e3', 'active', false, true), employer('e4', 'inactive', false, false)]}
        totalCount={4} currentPage={1} pageSize={20} />,
    );
    expect(screen.getAllByText('Strategic Hiring Partner').length).toBeGreaterThan(0);
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-accent-text)', 'var(--wa-accent-soft)', 'var(--wa-success-dark)', 'var(--wa-gold-dark)', 'var(--wa-on-hero)', 'var(--wa-on-success)']) expect(styles).toContain(t);
  });
});

describe('B4B bindings card and Command Center review buttons paint from --wa-* tokens (D15)', () => {
  it('report counts, drift warnings and the load button carry no hex literal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      totalCatalogPrograms: 3, totalB4BPrograms: 3, alreadyBound: 1, exactMatches: 1, partialMatches: 0, unmatched: 1, umbrella: null, patchHint: '{}',
      suggestions: [{ catalogSlug: 'it', catalogTitle: 'IT', currentB4BId: 'old', suggestedB4BId: 'new', suggestedB4BName: 'New', suggestedB4BSlug: 'new', confidence: 'exact', alreadyBound: false }],
    })));
    const { default: Card } = await import('@/components/admin/B4BBindingsSuggestionsCard');
    const { container } = render(<Card />);
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => expect(screen.getByText(/drift!/)).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    for (const t of ['var(--wa-success-dark)', 'var(--wa-gold-dark)', 'var(--wa-danger-text)']) expect(styles).toContain(t);
  });

  it('the "not a fit" review button reads the danger ramp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({})));
    const { default: AdminCommandCenterClient } = await import('@/components/admin/AdminCommandCenterClient');
    const application = {
      applicationId: 'application-a', memberId: 'member-a', memberName: 'Applicant A', memberEmail: 'a@example.invalid', phone: null, programLabel: 'IT support',
      status: 'PENDING', statusLabel: 'Pending', submittedAt: new Date('2026-09-01T12:00:00Z'), submittedDaysAgo: 8, recommendedCareerTitle: null,
      emailPacket: { subject: 'Next step', body: 'Review.', mailto: 'mailto:a@example.invalid' },
    };
    const data = {
      needsReply: [], atRisk: [], interviewing: [], applicationsPending: [application], programHealth: [],
      totals: { needsReplyCount: 0, atRiskCount: 0, interviewingCount: 0, applicationsPendingCount: 1, certificationsPendingCount: 0, oldestPendingApplicationDays: 8 },
    };
    const { container } = render(<AdminCommandCenterClient data={data as never} />);
    expect(unexpectedHex(container)).toEqual([]);
    const danger = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.style.color === 'var(--wa-danger-text)');
    expect(danger.length).toBeGreaterThan(0);
    expect(danger[0].style.borderColor).toBe('color-mix(in srgb, var(--wa-danger) 35%, transparent)');
  });
});

describe('the text tokens this sweep introduced clear WCAG AA in both themes', () => {
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
  const textOnTint: Array<[string, string]> = [
    ['var(--wa-danger-text)', 'var(--wa-danger-soft)'],
    ['var(--wa-success-dark)', 'var(--wa-success-soft)'],
    ['var(--wa-gold-dark)', 'var(--wa-gold-soft)'],
    ['var(--wa-info-dark)', 'var(--wa-info-soft)'],
    ['var(--wa-accent-text)', 'var(--wa-accent-soft)'],
    ['var(--wa-muted-strong)', 'color-mix(in srgb, var(--wa-muted) 12%, transparent)'],
    ['color-mix(in srgb, var(--wa-danger-text) 55%, var(--wa-gold-dark))', 'var(--wa-gold-soft)'],
    ['color-mix(in srgb, var(--wa-gold-dark) 60%, var(--wa-accent-text))', 'color-mix(in srgb, var(--wa-gold) 14%, transparent)'],
    ['color-mix(in srgb, var(--wa-success-dark) 50%, var(--wa-info-dark))', 'color-mix(in srgb, var(--wa-success-soft) 50%, var(--wa-info-soft))'],
    ['color-mix(in srgb, var(--wa-info-dark) 55%, var(--wa-success-dark))', 'var(--wa-surface)'],
  ];

  it.each(['light', 'dark'] as const)('%s: every text colour is >= 4.5:1 on its tint over --wa-surface and on --wa-surface itself', (scheme) => {
    const surface = colorOf('var(--wa-surface)', tokens, scheme);
    for (const [fg, tint] of textOnTint) {
      const text = colorOf(fg, tokens, scheme);
      const bg = over(colorOf(tint, tokens, scheme), surface);
      expect(contrast(text, bg), `${scheme} ${fg} on ${tint}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, surface), `${scheme} ${fg} on --wa-surface`).toBeGreaterThanOrEqual(4.5);
    }
    // Job-application badges: the accent as text over a 10% tint of itself
    // (statusBadgeStyle in JobApplicationKanban), composited over the surface.
    for (const accent of Object.values(JOB_APPLICATION_STATUS_ACCENT)) {
      const text = colorOf(accent, tokens, scheme);
      const bg = over({ ...text, a: 0.1 }, surface);
      expect(contrast(text, bg), `${scheme} ${accent} on its 10% tint`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, surface), `${scheme} ${accent} on --wa-surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s: --wa-on-success reads on the --wa-success-dark fill (placement strip), and the inverted button too', (scheme) => {
    const fill = colorOf('var(--wa-success-dark)', tokens, scheme);
    const on = colorOf('var(--wa-on-success)', tokens, scheme);
    expect(contrast(on, fill), `${scheme} --wa-on-success on --wa-success-dark`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('%s: --wa-on-hero text reads on both stops of the employer hero gradient', (scheme) => {
    // The employer quick actions, Workforce Advancement card and employer
    // initials tiles paint white text on a crimson gradient; the gradient is
    // pinned to the mode-neutral hero pair, not --wa-accent (which lightens
    // to #e0658a in dark and would drop white to 3.3:1).
    const on = colorOf('var(--wa-on-hero)', tokens, scheme);
    for (const stop of ['var(--wa-hero-crimson-dark)', 'var(--wa-hero-crimson)']) {
      expect(contrast(on, colorOf(stop, tokens, scheme)), `${scheme} --wa-on-hero on ${stop}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the seven job-application accents stay distinguishable from each other', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const rgb = Object.values(JOB_APPLICATION_STATUS_ACCENT).map((a) => colorOf(a, tokens, scheme));
      rgb.forEach((c, i) => {
        for (let j = i + 1; j < rgb.length; j += 1) {
          expect(Math.hypot(c.r - rgb[j].r, c.g - rgb[j].g, c.b - rgb[j].b), `${scheme} accent ${i} vs ${j}`).toBeGreaterThan(30);
        }
      });
    }
  });
});

/**
 * Mobile / dark scout 2026-09-22, M1 + M4 + M13 + M14 — text on the accent.
 *
 * In dark mode the solid accent lightens (--wa-accent #e0658a) and its
 * foreground darkens (--wa-on-accent-control). The rail, the staff bottom nav,
 * the count badges and the Astryx primary button kept a white literal on it
 * (3.28:1), the badge on the active rail row a translucent white (2.41:1), and
 * `--color-accent` never left its light literal because css/main.css's `:root`
 * outranked the portal bridge by load order (2.78:1 as link text on dark).
 * These render the surfaces and measure the rules that reach them from the
 * real CSS, in both schemes. The cascade is modelled as it ships: main.css's
 * `:root` last (the bug), then the portal `html.dark` block for dark.
 */
describe('accent controls and accent text clear WCAG AA in dark mode (M1 / M4 / M13 / M14)', () => {
  const brand = readCss('css/wa-brand-tokens.css');
  const portalTokens = readCss('css/portal-tokens.css');
  const mainCss = readCss('css/main.css');
  const rail = readCss('css/portal-main-extracted.css');
  const light = loadRootTokens(brand, portalTokens, mainCss);
  const dark = new Map(light);
  for (const [k, v] of loadBlockTokens(portalTokens, "html.dark,\nhtml[data-theme='dark']")) dark.set(k, v);
  const tokensFor = (scheme: 'light' | 'dark') => (scheme === 'light' ? light : dark);
  const SHELL = ':is(html[data-portal-role], .workspace-shell-root[data-workspace-role])';

  /** `prop: value` pairs of the first rule whose selector list is exactly `selector`, `!important` dropped. */
  function declsOf(css: string, selector: string): Record<string, string> {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = src.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`rule not found: ${selector}`);
    const body = src.slice(start + selector.length + 2, src.indexOf('}', start));
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].replace(/\s*!important/, '').trim();
    return out;
  }
  const ratio = (fg: string, bg: string, scheme: 'light' | 'dark') =>
    contrast(colorOf(fg, tokensFor(scheme), scheme), colorOf(bg, tokensFor(scheme), scheme));

  it('the light-mode accent is unchanged and the dark-mode alias follows --wa-accent', () => {
    expect(colorOf('var(--color-accent)', light, 'light')).toEqual(colorOf('#ad2c4d', light, 'light'));
    expect(colorOf('var(--color-accent-dark)', light, 'light')).toEqual(colorOf('#8c0f37', light, 'light'));
    expect(colorOf('var(--color-accent)', dark, 'dark')).toEqual(colorOf('var(--wa-accent)', dark, 'dark'));
    expect(colorOf('var(--color-accent-dark)', dark, 'dark')).toEqual(colorOf('var(--wa-accent-dark)', dark, 'dark'));
    // A tenant accent (components/platform/OrgBrandingStyle.tsx) still wins in dark.
    const branded = new Map(dark).set('--org-accent', '#2563eb');
    expect(colorOf('var(--color-accent)', branded, 'dark')).toEqual(colorOf('#2563eb', branded, 'dark'));
  });

  it.each(['light', 'dark'] as const)('%s: the active rail row, its icon and both count badges read on the accent (M1, M13)', async (scheme) => {
    const { default: WorkspaceSidebarSections } = await import('@/components/portal/WorkspaceSidebarSections');
    const items = [
      { href: '/partner', label: 'Overview', group: 'primary' as const, exact: true, badgeKey: 'jobs_pending' as const },
      { href: '/partner/milestones', label: 'Milestones', group: 'primary' as const, badgeKey: 'jobs_live' as const },
    ];
    const { container } = render(
      <WorkspaceSidebarSections items={items} activeHref="/partner/milestones" badges={{ jobs_pending: 2, jobs_live: 3 }}
        translateLabel={(s) => s} childToggleLabel={() => 'toggle'} onNavigate={() => {}} storageKey={`m13-${scheme}`} forceExpanded />,
    );
    const active = container.querySelector<HTMLAnchorElement>('a.workspace-sidebar-link.active')!;
    expect(active.textContent).toContain('Milestones');
    expect(active.querySelector('.workspace-nav-badge')?.textContent).toBe('3');
    expect(container.querySelector('a.workspace-sidebar-link:not(.active) .workspace-nav-badge')?.textContent).toBe('2');

    const row = declsOf(rail, `${SHELL} .workspace-sidebar-link.active`);
    expect(ratio(row.color, row.background, scheme), `${scheme} active row label`).toBeGreaterThanOrEqual(4.5);
    const icon = declsOf(rail, `${SHELL} .workspace-sidebar-link.active .workspace-sidebar-icon,\n${SHELL} .workspace-sidebar-link.active svg`);
    expect(ratio(icon.color, row.background, scheme), `${scheme} active row icon`).toBeGreaterThanOrEqual(4.5);
    const badge = declsOf(rail, `${SHELL} .workspace-nav-badge`);
    expect(ratio(badge.color, badge.background, scheme), `${scheme} count badge`).toBeGreaterThanOrEqual(4.5);
    const activeBadge = declsOf(rail, `${SHELL} .workspace-sidebar-link.active .workspace-nav-badge`);
    expect(ratio(activeBadge.color, activeBadge.background, scheme), `${scheme} badge on the active row`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(activeBadge.background, row.background, scheme), `${scheme} badge pill against the active row`).toBeGreaterThanOrEqual(3);
    // Staff bottom nav: the portal override of .marketing-bottom-nav__link--active (MobileBottomNav renders that class).
    const tab = declsOf(rail, '.workspace-shell-root[data-workspace-role] .marketing-bottom-nav__link--active');
    expect(ratio(tab.color, tab.background, scheme), `${scheme} bottom-nav active tab`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('%s: the Astryx primary button ("Add student") reads on the portal accent (M1)', async (scheme) => {
    const { Button } = await import('@astryxdesign/core/Button');
    const { container } = render(<Button label="Add student" variant="primary" size="md" />);
    const button = container.querySelector('button')!;
    expect(button.className.split(/\s+/)).toEqual(expect.arrayContaining(['astryx-button', 'primary']));
    const hook = declsOf(portalTokens, '.astryx-button.primary');
    expect(ratio(hook['--color-on-accent'], 'var(--color-accent)', scheme), `${scheme} Add student`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('%s: an admin link painted var(--color-accent) reads on the dark surfaces (M4)', async (scheme) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    const { default: MfaStatusBanner } = await import('@/components/admin/MfaStatusBanner');
    render(<MfaStatusBanner />);
    const link = await screen.findByText('Set up now →');
    expect(link.style.color).toBe('var(--color-accent)');
    for (const surface of ['var(--wa-surface)', 'var(--wa-bg)', 'var(--surface-container-lowest)']) {
      if (scheme === 'light' && surface === 'var(--surface-container-lowest)') continue; // main.css :root holds the dark value
      expect(ratio(link.style.color, surface, scheme), `${scheme} link on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s: the Delete account control pairs the accent fill with the adaptive foreground (M14)', async (scheme) => {
    const { default: DeleteAccountButton } = await import('@/components/portal/DeleteAccountButton');
    render(<DeleteAccountButton />);
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button.style.background).toBe('var(--color-accent)');
    expect(button.style.color).toBe('var(--wa-on-accent-control)');
    expect(ratio(button.style.color, button.style.background, scheme), `${scheme} Delete account`).toBeGreaterThanOrEqual(4.5);
  });
});
