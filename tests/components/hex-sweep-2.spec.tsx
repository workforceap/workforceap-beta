import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCss, loadRootTokens, colorOf, contrast, over } from '@/lib/ui/cssTokenContrast.test-helpers';
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
    for (const t of ['var(--wa-success-dark)', 'var(--wa-danger-text)', 'var(--wa-info-dark)', 'var(--wa-muted-strong)', 'var(--wa-on-accent)']) expect(styles).toContain(t);
  });
});

describe('placement confirmation strip paints from --wa-* tokens (D13)', () => {
  // WAP-194 moved the strip off the solid success fill onto a kit card (the
  // success tone edge), so the D13 contract is now "--wa-* only, no hex".
  it('banner copy, buttons and the error alert read --wa-* tokens on a kit card', async () => {
    const { default: Strip } = await import('@/app/(portal)/dashboard/PlacementConfirmationStrip');
    const { container } = render(<Strip offers={[{ id: 'o1', company: 'Acme' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /notify my team/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(unexpectedHex(container)).toEqual([]);
    const styles = paintedValues(container).join('\n');
    expect(styles).toContain('color: var(--wa-success-dark)');
    expect(styles).toContain('color: var(--wa-danger-text)');
    expect(styles).not.toMatch(/var\(--color-green/);
    expect(container.querySelector('.wa-kit-card.wa-kit-tone--ok')).not.toBeNull();
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
 * Mobile / dark scout 2026-09-22, M1 + M4 + M13 + M14 — text on and in the accent.
 *
 * Two different fills are in play and they must not be confused:
 *  - `--wa-accent` follows light-dark() (#ad2c4d → #e0658a). Its foreground is
 *    `--wa-on-accent-control` (white → #2a0d16). The rail, the count badges, the
 *    staff bottom-nav tab and the solid `--wa-accent` controls read it (M1, M13, M14).
 *  - `--color-accent` does NOT follow dark mode: css/main.css's `:root` literal
 *    and the default org's `--org-accent` (prisma/seed.ts → OrgBrandingStyle) both
 *    hold it at #ad2c4d, so white on it is 6.47:1 in either mode and stays white.
 *    What failed was `--color-accent` as TEXT on dark surfaces (2.78:1); those
 *    consumers now read `--wa-accent-text` (#8c0f37 → #f39ab5) (M4).
 * The token maps below model both realities: the default org (`--org-accent`
 * #ad2c4d on :root) and an org with no accent, where whichever `:root` the
 * bundler emits last decides between main.css's literal and the portal bridge.
 */
describe('accent fills and accent text clear WCAG AA in both themes (M1 / M4 / M13 / M14)', () => {
  const brand = readCss('css/wa-brand-tokens.css');
  const portalTokens = readCss('css/portal-tokens.css');
  const mainCss = readCss('css/main.css');
  const rail = readCss('css/portal-main-extracted.css');
  /** main.css `:root` emitted last (the cascade the inspector measured live). */
  const mainLast = loadRootTokens(brand, portalTokens, mainCss);
  /** portal bridge emitted last: `--color-accent: var(--wa-accent)`. */
  const bridgeLast = loadRootTokens(brand, mainCss, portalTokens);
  /** default org: OrgBrandingStyle sets `--org-accent` / `--color-accent` #ad2c4d on :root. */
  const defaultOrg = new Map(mainLast).set('--org-accent', '#ad2c4d').set('--color-accent', 'var(--org-accent)');
  const cascades: Array<[string, Map<string, string>]> = [['default org', defaultOrg], ['no org accent, main.css last', mainLast], ['no org accent, bridge last', bridgeLast]];
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
  const ratio = (fg: string, bg: string, tokens: Map<string, string>, scheme: 'light' | 'dark') =>
    contrast(colorOf(fg, tokens, scheme), colorOf(bg, tokens, scheme));

  it('the pairs this fix relies on: --wa-on-accent-control on --wa-accent, --wa-accent-text on the surfaces', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(ratio('var(--wa-on-accent-control)', 'var(--wa-accent)', mainLast, scheme), `${scheme} control text`).toBeGreaterThanOrEqual(4.5);
      for (const surface of ['var(--wa-surface)', 'var(--wa-bg)', 'var(--wa-surface-2)', 'var(--wa-accent-soft)']) {
        const bg = over(colorOf(surface, mainLast, scheme), colorOf('var(--wa-surface)', mainLast, scheme));
        expect(contrast(colorOf('var(--wa-accent-text)', mainLast, scheme), bg), `${scheme} accent text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // the dark literal surfaces the scout measured against (#1e1417 card, #0c0e10 lowest)
    expect(ratio('var(--wa-accent-text)', '#0c0e10', mainLast, 'dark')).toBeGreaterThanOrEqual(4.5);
    // and the text this replaces really did fail there in dark
    expect(ratio('var(--color-accent)', 'var(--wa-surface)', defaultOrg, 'dark')).toBeLessThan(4.5);
  });

  it.each(['light', 'dark'] as const)('%s: the active rail row, its icon, both count badges and the bottom-nav tab read on --wa-accent (M1, M13)', async (scheme) => {
    const { default: WorkspaceSidebarSections } = await import('@/components/portal/WorkspaceSidebarSections');
    const items = [
      { href: '/partner', label: 'Overview', group: 'primary' as const, exact: true, badgeKey: 'jobs_pending' as const },
      { href: '/partner/milestones', label: 'Milestones', group: 'primary' as const, badgeKey: 'jobs_draft' as const },
    ];
    const { container } = render(
      <WorkspaceSidebarSections items={items} activeHref="/partner/milestones" badges={{ jobs_pending: 2, jobs_draft: 3 }}
        translateLabel={(s) => s} childToggleLabel={() => 'toggle'} onNavigate={() => {}} storageKey={`m13-${scheme}`} forceExpanded />,
    );
    const active = container.querySelector<HTMLAnchorElement>('a.workspace-sidebar-link.active')!;
    expect(active.textContent).toContain('Milestones');
    expect(active.querySelector('.workspace-nav-badge')?.textContent).toBe('3');
    expect(container.querySelector('a.workspace-sidebar-link:not(.active) .workspace-nav-badge')?.textContent).toBe('2');

    const row = declsOf(rail, `${SHELL} .workspace-sidebar-link.active`);
    expect(row.background).toContain('--wa-accent');
    const icon = declsOf(rail, `${SHELL} .workspace-sidebar-link.active .workspace-sidebar-icon,\n${SHELL} .workspace-sidebar-link.active svg`);
    const badge = declsOf(rail, `${SHELL} .workspace-nav-badge`);
    const activeBadge = declsOf(rail, `${SHELL} .workspace-sidebar-link.active .workspace-nav-badge`);
    const tab = declsOf(rail, '.workspace-shell-root[data-workspace-role] .marketing-bottom-nav__link--active');
    for (const [name, tokens] of cascades) {
      expect(ratio(row.color, row.background, tokens, scheme), `${scheme} ${name} active row label`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(icon.color, row.background, tokens, scheme), `${scheme} ${name} active row icon`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(badge.color, badge.background, tokens, scheme), `${scheme} ${name} count badge`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(activeBadge.color, activeBadge.background, tokens, scheme), `${scheme} ${name} badge on the active row`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(activeBadge.background, row.background, tokens, scheme), `${scheme} ${name} badge pill against the row`).toBeGreaterThanOrEqual(3);
      expect(ratio(tab.color, tab.background, tokens, scheme), `${scheme} ${name} bottom-nav active tab`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s: admin links painted as accent text read on the dark surfaces (M4)', async (scheme) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    const { default: MfaStatusBanner } = await import('@/components/admin/MfaStatusBanner');
    const { default: PartnersTableClient } = await import('@/components/admin/PartnersTableClient');
    render(<MfaStatusBanner />);
    const mfa = await screen.findByText('Set up now →');
    const partner = { id: 'p1', name: 'Partner p1', slug: 'p1', contactName: null, contactEmail: null, contactPhone: null, active: false, status: 'pending_approval', notes: null, logoUrl: null, brandColor: null, _count: { counselors: 1, referrals: 2 } };
    render(<PartnersTableClient superAdmin partners={[partner]} subgroups={[]} />);
    const review = screen.getByText('Review →') as HTMLElement;
    for (const link of [mfa, review]) {
      expect(link.style.color).toBe('var(--wa-accent-text)');
      for (const [name, tokens] of cascades) {
        for (const surface of ['var(--wa-surface)', 'var(--wa-bg)']) {
          expect(ratio(link.style.color, surface, tokens, scheme), `${scheme} ${name} ${link.textContent} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        if (scheme === 'dark') expect(ratio(link.style.color, '#0c0e10', tokens, scheme), `${name} ${link.textContent} on #0c0e10`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(['light', 'dark'] as const)('%s: white stays on the --color-accent fills (Delete account, .btn-primary) with the default org accent', async (scheme) => {
    const { default: DeleteAccountButton } = await import('@/components/portal/DeleteAccountButton');
    render(<DeleteAccountButton />);
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button.style.background).toBe('var(--color-accent)');
    expect(button.style.color).toBe('white');
    const white = '#ffffff'; // jsdom keeps the keyword; the helper resolves hex
    const btnPrimary = declsOf(mainCss, '.btn-primary,\na.btn-primary,\nbutton.btn-primary');
    expect(btnPrimary.background).toBe('var(--color-accent)');
    for (const [name, tokens] of [cascades[0], cascades[1]]) {
      expect(ratio(white, button.style.background, tokens, scheme), `${scheme} ${name} Delete account`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(btnPrimary.color, btnPrimary.background, tokens, scheme), `${scheme} ${name} .btn-primary`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s: a solid --wa-accent chip reads through --wa-on-accent-control (M14)', async (scheme) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ milestones: [{ id: 'm1', kind: 'placement_pending', label: 'Pending verification', memberId: 'u1', memberName: 'Ada', at: '2026-09-01T00:00:00Z' }] })));
    const { default: PartnerMilestonesMobile } = await import('@/components/partner/PartnerMilestonesMobile');
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}><PartnerMilestonesMobile /></NextIntlClientProvider>,
    );
    await screen.findByText('Pending Review');
    const chips = Array.from(container.querySelectorAll<HTMLElement>('[style]')).filter((el) => el.style.background === 'var(--wa-accent)');
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.style.color).toBe('var(--wa-on-accent-control)');
      expect(ratio(chip.style.color, chip.style.background, mainLast, scheme)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio('var(--wa-on-accent-control)', 'var(--wa-accent)', mainLast, scheme)).toBeGreaterThanOrEqual(4.5);
  });
});
