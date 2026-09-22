import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  colorOf,
  contrast,
  loadBlockTokens,
  loadRootTokens,
  luminance,
  readCss,
  resolve,
} from '@/lib/ui/cssTokenContrast.test-helpers';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

// /admin/employers?ui=legacy is an async server component: the session, tenant
// scope and the two employer reads are mocked so the tabs row renders here.
const adminPageMocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ id: 'admin-1' })),
  isSuperAdmin: vi.fn(async () => false),
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, isSuperAdmin: false, orgIds: ['org-1'], filters: {} })),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => unknown) =>
    fn({ employer: { findMany: async () => [], count: async () => 0 } }),
  ),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: adminPageMocks.getUser }));
vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSuperAdmin: adminPageMocks.isSuperAdmin,
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  inheritJobOrg: () => ({}),
  resolveAdminPageTenant: adminPageMocks.resolveAdminPageTenant,
  withAdminPageScope: adminPageMocks.withAdminPageScope,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async () => ({})) }));

import MentorSessionForm from '@/components/portal/MentorSessionForm';
import ElevatorPitchDeploymentLogger from '@/components/portal/tools/ElevatorPitchDeploymentLogger';
import AdminMemberWioaReviewPanel from '@/components/admin/AdminMemberWioaReviewPanel';
import AdminMemberEnrollmentFundingForm from '@/components/admin/AdminMemberEnrollmentFundingForm';
import AdminMemberSkillCheckpointPanel from '@/components/admin/AdminMemberSkillCheckpointPanel';
import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

// Follow-up sweep (#2482 left the `var(--color-surface, <literal>)` sites): the
// two tokenized public pages are async server components that only need the
// link validator and one prisma read, both mocked so the card renders here.
const publicPageMocks = vi.hoisted(() => ({
  validateTokenizedLink: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock('@/lib/tokenizedLink', () => ({ validateTokenizedLink: publicPageMocks.validateTokenizedLink }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: publicPageMocks.findUnique } } }));

import TriageNudgePanel from '@/components/portal/counselor/TriageNudgePanel';
import DashboardProgramSelector from '@/components/portal/DashboardProgramSelector';
import TrainingProgressClient from '@/components/admin/TrainingProgressClient';
import GuardianConsentForm from '@/app/consent/[token]/GuardianConsentForm';
import PublicEligibilityForm from '@/app/q/[token]/PublicEligibilityForm';
import GoalsModule from '@/components/portal/GoalsModule';
import GuardianConsentPage from '@/app/consent/[token]/page';
import PublicQuestionnairePage from '@/app/q/[token]/page';
import AdminCronsClient from '@/components/admin/AdminCronsClient';
import AdminEmployersPage from '@/app/admin/employers/page';
import MemberFeedbackModal from '@/components/portal/MemberFeedbackModal';
import DeleteAccountButton from '@/components/portal/DeleteAccountButton';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import AdminMemberQuickSummary from '@/components/admin/AdminMemberQuickSummary';

/**
 * Review of #2478 (item 4) found eleven inline styles across seven portal/admin
 * files still painting from `--color-surface`, a custom property no stylesheet on those routes defines
 * (css/main.css, css/wa-brand-tokens.css, css/portal-tokens.css and the rest
 * of the (portal)/admin chain only declare `--color-surface-*` siblings, never
 * the bare name). Used without a fallback, the declaration is invalid at
 * computed-value time and the fill renders transparent: inputs, a modal, a
 * popover and history rows all showed whatever sat behind them.
 *
 * Those sites now read `--wa-surface`, the kit's plain surface token (the /coach
 * page canvas reads `--wa-bg`, since its header band already sits on the
 * surface token). This spec
 * renders the real components, collects the inline styles that reach the DOM,
 * and resolves the fill through the stylesheets the (portal) and /admin
 * layouts actually load (css/portal.css @imports css/portal-tokens.css, which
 * @imports css/wa-brand-tokens.css): opaque in light and dark, distinct per
 * scheme, and readable under the `--color-on-surface` text the same controls
 * paint. It never reads component source — the DOM is the evidence.
 */
const NEVER_DEFINED = '--color-surface';
const FILL = 'var(--wa-surface)';
const TEXT = 'var(--color-on-surface)';

function paintedStyles(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '');
}
function backgroundOf(el: HTMLElement): string {
  return el.style.background || el.style.backgroundColor;
}
/** The (portal) and /admin routes both import css/portal.css → portal-tokens → wa-brand-tokens. */
function portalChainTokens(): Map<string, string> {
  return loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
}

function expectNoLegacyName(container: HTMLElement) {
  const styles = paintedStyles(container);
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) expect(style, `${NEVER_DEFINED} still painted: ${style}`).not.toContain(`var(${NEVER_DEFINED}`);
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('[style]'))) {
    const computed = getComputedStyle(el);
    expect(computed.getPropertyValue('background')).not.toContain(NEVER_DEFINED);
    expect(computed.getPropertyValue('background-color')).not.toContain(NEVER_DEFINED);
  }
}

function expectSurfaceFill(el: HTMLElement, label: string) {
  expect(backgroundOf(el), `${label} background`).toBe(FILL);
  expect(getComputedStyle(el).getPropertyValue('background')).not.toContain(NEVER_DEFINED);
}

const snapshot: WioaQualificationSnapshot = {
  version: 1,
  submittedAt: '2026-09-01T00:00:00Z',
  signal: 'likely',
  reasons: ['Staff review needed'],
  answers: {
    ageBracket: '25_54',
    countyOrZip: '30301',
    primaryBarrier: 'none',
    dislocatedWorker: false,
    lowIncomeSelfReport: false,
    trainingInterest: true,
    completedIntakeSelfReport: true,
  },
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ deployments: [] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('--wa-surface is a defined, opaque fill on the portal/admin token chain', () => {
  it('resolves in both schemes, differs between them, and carries --color-on-surface text at AA', () => {
    const tokens = portalChainTokens();
    expect(tokens.has(NEVER_DEFINED), `${NEVER_DEFINED} must stay undefined — the fix is to stop reading it`).toBe(false);
    expect(tokens.has('--wa-surface')).toBe(true);
    const light = colorOf(FILL, tokens, 'light');
    const dark = colorOf(FILL, tokens, 'dark');
    expect(light.a).toBe(1);
    expect(dark.a).toBe(1);
    expect(resolve(FILL, tokens, 'light')).not.toBe(resolve(FILL, tokens, 'dark'));
    expect(contrast(colorOf(TEXT, tokens, 'light'), light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf(TEXT, tokens, 'dark'), dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('MentorSessionForm controls', () => {
  it('paint the date and topic fields from --wa-surface, never --color-surface', () => {
    const { container } = render(<MentorSessionForm mentorId="mentor-1" />);
    expectNoLegacyName(container);
    const date = screen.getByLabelText('Preferred date and time');
    const topic = screen.getByLabelText(/topic or questions/i);
    expectSurfaceFill(date, 'date input');
    expectSurfaceFill(topic, 'topic textarea');
    expect(date.style.color).toBe(TEXT);
    expect(topic.style.color).toBe(TEXT);
  });
});

describe('ElevatorPitchDeploymentLogger modal', () => {
  it('paints the dialog card from --wa-surface over the scrim', async () => {
    const { container } = render(<ElevatorPitchDeploymentLogger />);
    fireEvent.click(screen.getByRole('button', { name: /log a use/i }));
    const heading = await screen.findByRole('heading', { name: 'Log a pitch use' });
    const card = heading.parentElement as HTMLElement;
    expectSurfaceFill(card, 'modal card');
    expect(heading.style.color).toBe(TEXT);
    expectNoLegacyName(container);
  });
});

describe('AdminMemberWioaReviewPanel decision history', () => {
  it('paints each history row from --wa-surface on the muted section', () => {
    const { container } = render(
      <AdminMemberWioaReviewPanel
        memberId="member-1"
        snapshot={snapshot}
        reviewStatus="pending"
        reviewedAt={null}
        reviewerName={null}
        reviewNotes={null}
        decisionHistory={[
          { id: 'snap-1', source: 'wioa_review', decision: 'eligible', notes: null, actorEmailSnapshot: null, actorRoleSnapshot: 'admin', createdAt: new Date('2026-09-19T12:00:00Z') },
          { id: 'snap-2', source: 'enrollment_funding', decision: 'GRANT', notes: 'PO 4411', actorEmailSnapshot: 'a@x.org', actorRoleSnapshot: 'admin', createdAt: new Date('2026-09-18T12:00:00Z') },
        ]}
      />,
    );
    expectNoLegacyName(container);
    const history = screen.getByRole('heading', { name: 'Decision history' }).parentElement as HTMLElement;
    const rows = within(history).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const row of rows) expectSurfaceFill(row, 'history row');
  });
});

describe('AdminMemberEnrollmentFundingForm controls', () => {
  it('paints the source select, notes textarea and workspace email from --wa-surface', () => {
    const { container } = render(
      <AdminMemberEnrollmentFundingForm
        memberId="member-1"
        initial={{ fundingSource: 'GRANT', fundingNotes: 'WIOA cohort 4', workspaceEmail: '', workspaceEmailProvisioned: false }}
        hasPrimaryEnrollment
      />,
    );
    expectNoLegacyName(container);
    const controls = [
      screen.getByLabelText('Funding Source'),
      screen.getByLabelText('Funding Notes'),
      screen.getByLabelText('Workspace Email'),
    ];
    for (const control of controls) {
      expectSurfaceFill(control, control.tagName.toLowerCase());
      expect(control.style.color).toBe(TEXT);
    }
  });
});

describe('AdminMemberSkillCheckpointPanel', () => {
  const summary = {
    programSlug: 'it-support',
    programTitle: 'IT Support',
    totalMissions: 2,
    passedCount: 0,
    readyCount: 0,
    retryCount: 1,
    streak: 0,
    careerReadinessPct: 10,
    demonstratedSkills: [],
    missions: [
      { key: 'm-retry', courseTitle: 'Networking', missionName: 'Diagnose a dropped link', status: 'needs_retry' as const, completedAt: null, latestResult: null, aiToolResultId: null, skillLabels: ['Troubleshooting'] },
      { key: 'm-locked', courseTitle: 'Security', missionName: 'Harden an account', status: 'locked' as const, completedAt: null, latestResult: null, aiToolResultId: null, skillLabels: [] },
    ],
  };

  it('paints unlocked mission cards and the override popover from --wa-surface; locked cards keep their muted fill', () => {
    const { container } = render(<AdminMemberSkillCheckpointPanel memberId="member-1" summary={summary} />);
    expectNoLegacyName(container);
    const cards = Array.from(container.querySelectorAll<HTMLElement>('article'));
    expect(cards).toHaveLength(2);
    const [retry, locked] = cards;
    expectSurfaceFill(retry, 'needs-retry mission card');
    expect(backgroundOf(locked)).toBe('var(--surface-container-highest)');

    fireEvent.click(within(retry).getByRole('button', { name: 'Override' }));
    const popover = retry.querySelector<HTMLElement>('[id^="override-dropdown-"]');
    expect(popover).not.toBeNull();
    expectSurfaceFill(popover as HTMLElement, 'override popover');
    expectNoLegacyName(container);
  });
});

/*
 * ---------------------------------------------------------------------------
 * With-fallback sites (follow-up to #2482).
 *
 * #2482 moved the bare `var(--color-surface)` fills; six more sites were
 * written as `var(--color-surface, #fff)` / `, white)` / `--color-surface-container,
 * #f5f5f5)`. The token is still undefined there, so the literal always won:
 * a white (or light-grey) slab in dark mode. A literal fallback on a surface
 * token defeats dark mode by construction, so the checks below fail on ANY
 * literal fallback for the surface family — in the styles the components
 * paint and in the stylesheets each route chain loads — and then pin the
 * token each site now reads:
 *
 *   - portal / admin chain (css/portal.css → portal-tokens → wa-brand-tokens):
 *     `--wa-surface` for the dashboard program popover and the training-progress
 *     toolbar, `--wa-surface-2` (the kit's subtle raised fill) for the nested
 *     triage nudge panel that used to fall back to #f5f5f5.
 *   - root-layout routes (/consent/[token], /q/[token] load only css/main.css +
 *     wa-brand-tokens, never portal-tokens, so `--wa-surface` does not exist
 *     there): `--surface-container-lowest`, the marketing card surface that
 *     css/main.css defines for both `html:not(.dark)` and `:root`/`html.dark`.
 * ---------------------------------------------------------------------------
 */

/**
 * `var(--<surface token>, <anything that is not another var()>)`. The surface
 * family: the never-defined `--color-surface*` names and the kit neutrals
 * `--wa-surface`, `--wa-surface-2`, `--wa-bg` and their `--color-background-card`
 * bridge. `--wa-surface-glass` is a translucent chrome token with its own
 * rgba fallback and is deliberately outside the family.
 */
const SURFACE_LITERAL_FALLBACK =
  /var\(\s*--(?:color-surface(?:-[\w-]+)?|wa-surface(?:-2)?|wa-bg|color-background-card)\s*,(?!\s*var\()\s*[^)]+\)/i;
/**
 * The tonal scale the public sites now read (`--surface-container-*`, css/main.css
 * on every chain, bridged to `--wa-surface(-2)` by css/portal-tokens.css). Guarded
 * on the inline styles the components paint: a literal fallback there is exactly
 * the `var(--surface-container-lowest, #fff)` regression #2496's review named.
 */
const SURFACE_CONTAINER_LITERAL_FALLBACK = /var\(\s*--surface-container(?:-[\w-]+)?\s*,(?!\s*var\()\s*[^)]+\)/i;
const PUBLIC_FILL = 'var(--surface-container-lowest)';
const RAISED_FILL = 'var(--wa-surface-2)';

/** Stylesheets the portal/admin layouts and the root layout actually load. */
const PORTAL_CHAIN_SHEETS = [
  'css/wa-brand-tokens.css',
  'css/portal-tokens.css',
  'css/portal.css',
  'css/portal-kit.css',
  'css/portal-ui-kit.css',
  'css/portal-main-extracted.css',
  'css/counselor.css',
  'css/portal-a11y.css',
  'css/mobile-dashboard-fixes.css',
];
const ROOT_CHAIN_SHEETS = ['css/main.css', 'css/marketing.css', 'css/marketing-depth.css', 'css/marketing-a11y.css', 'css/astryx-brand-bridge.css'];
/** CSS modules that border from the token family (PortalShell role switcher; the root-layout cookie banner). */
const BORDER_MODULE_SHEETS = ['components/portal/PortalRoleSwitcher.module.css', 'components/CookieConsentBanner.module.css'];
/** CSS modules on the portal chain that fill from the tonal scale (member dashboard hero, coach chat, insight card). */
const SURFACE_MODULE_SHEETS = ['components/portal/CoachChat.module.css', 'components/portal/TodayHero.module.css', 'components/portal/ProactiveInsightCard.module.css'];

/** The root layout chain: css/main.css keeps dark defaults on :root and light overrides on html:not(.dark). */
function rootChainTokens(scheme: 'light' | 'dark'): Map<string, string> {
  const main = readCss('css/main.css');
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), main);
  const overrides = loadBlockTokens(main, scheme === 'light' ? 'html:not(.dark)' : 'html.dark');
  for (const [name, value] of overrides) tokens.set(name, value);
  return tokens;
}

function expectNoLiteralSurfaceFallback(container: HTMLElement) {
  const styles = paintedStyles(container);
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) {
    expect(style, `literal fallback on a surface token: ${style}`).not.toMatch(SURFACE_LITERAL_FALLBACK);
    expect(style, `literal fallback on a surface-container token: ${style}`).not.toMatch(SURFACE_CONTAINER_LITERAL_FALLBACK);
  }
}

describe('no stylesheet on either route chain carries a literal fallback on a surface token', () => {
  it.each([...PORTAL_CHAIN_SHEETS, ...ROOT_CHAIN_SHEETS])('%s', (sheet) => {
    const css = readCss(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = css.split('\n').filter((line) => SURFACE_LITERAL_FALLBACK.test(line));
    expect(offenders, `${sheet} literal surface fallbacks`).toEqual([]);
  });
});

/*
 * #2501's body named the sheet-level `var(--surface-container-*, <literal>)` fallbacks as a separate
 * sweep. css/main.css defines the whole scale on `:root` and `html:not(.dark)` and loads on every
 * route, so on the portal chain each literal was dead weight that read as a live colour; the portal
 * sheets and the three portal CSS modules now read the token bare. css/main.css, css/marketing.css
 * and css/enroll-school.css keep theirs (root-chain sweep, out of this lane), so only the portal
 * chain is pinned here.
 */
describe('no stylesheet or CSS module on the portal chain carries a literal fallback on a surface-container token', () => {
  it.each([...PORTAL_CHAIN_SHEETS, ...SURFACE_MODULE_SHEETS])('%s', (sheet) => {
    const css = readCss(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = css.split('\n').filter((line) => SURFACE_CONTAINER_LITERAL_FALLBACK.test(line));
    expect(offenders, `${sheet} literal surface-container fallbacks`).toEqual([]);
  });
});

describe('--surface-container-lowest is the opaque card fill on the root-layout chain', () => {
  it('resolves in both schemes, differs between them, and carries the on-surface text at AA', () => {
    const light = rootChainTokens('light');
    const dark = rootChainTokens('dark');
    expect(light.has(NEVER_DEFINED)).toBe(false);
    expect(light.has('--wa-surface'), 'portal neutral must not leak onto the root chain').toBe(false);
    const lightFill = colorOf(PUBLIC_FILL, light, 'light');
    const darkFill = colorOf(PUBLIC_FILL, dark, 'dark');
    expect(lightFill.a).toBe(1);
    expect(darkFill.a).toBe(1);
    expect(resolve(PUBLIC_FILL, light, 'light')).not.toBe(resolve(PUBLIC_FILL, dark, 'dark'));
    for (const text of ['var(--color-on-surface)', 'var(--color-on-surface-variant)']) {
      expect(contrast(colorOf(text, light, 'light'), lightFill), `${text} light`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colorOf(text, dark, 'dark'), darkFill), `${text} dark`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('--wa-surface-2 is opaque, distinct per scheme and readable on the portal chain', () => {
    const tokens = portalChainTokens();
    const light = colorOf(RAISED_FILL, tokens, 'light');
    const dark = colorOf(RAISED_FILL, tokens, 'dark');
    expect(light.a).toBe(1);
    expect(dark.a).toBe(1);
    expect(resolve(RAISED_FILL, tokens, 'light')).not.toBe(resolve(RAISED_FILL, tokens, 'dark'));
    expect(contrast(colorOf(TEXT, tokens, 'light'), light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf(TEXT, tokens, 'dark'), dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('DashboardProgramSelector popover', () => {
  it('paints the listbox from --wa-surface with no literal fallback', () => {
    const { container } = render(
      <DashboardProgramSelector
        activeProgramSlug="it-support"
        options={[
          { id: 'e1', programSlug: 'it-support', programTitle: 'IT Support', isPrimary: true },
          { id: 'e2', programSlug: 'cyber', programTitle: 'Cybersecurity', isPrimary: false },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('dashboard-program-selector'));
    const listbox = screen.getByRole('listbox');
    expectSurfaceFill(listbox, 'program popover');
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
  });
});

describe('TrainingProgressClient toolbar', () => {
  it('paints the view/filter toolbar from --wa-surface with no literal fallback', () => {
    const { container } = render(<TrainingProgressClient curriculumRows={[]} rawRows={[]} canonicalCatalog={[]} />);
    const toolbar = screen.getByRole('tablist', { name: 'Training progress view' }).parentElement as HTMLElement;
    expectSurfaceFill(toolbar, 'training progress toolbar');
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
  });
});

describe('TriageNudgePanel', () => {
  it('paints the open nudge panel from --wa-surface-2, never the undefined --color-surface-container', () => {
    const { container } = render(
      <TriageNudgePanel
        memberId="m-1"
        memberName="Ada Lovelace"
        templates={[
          { id: 'check_in', label: 'Check in', preview: 'Hi Ada, checking in.' },
          { id: 'stalled_step', label: 'Stalled step', preview: 'Hi Ada, you are close.' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send nudge' }));
    const panel = screen.getByText('Nudge Ada Lovelace').parentElement as HTMLElement;
    expect(backgroundOf(panel), 'nudge panel background').toBe(RAISED_FILL);
    expect(getComputedStyle(panel).getPropertyValue('background')).not.toContain('--color-surface-container');
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
  });
});

describe('tokenized public pages (root layout, no portal tokens)', () => {
  beforeEach(() => {
    publicPageMocks.validateTokenizedLink.mockReset();
    publicPageMocks.findUnique.mockReset();
  });

  it('GuardianConsentPage message card paints from --surface-container-lowest', async () => {
    publicPageMocks.validateTokenizedLink.mockResolvedValue({ ok: false, reason: 'expired' });
    const { container } = render(await GuardianConsentPage({ params: Promise.resolve({ token: 'tok' }) }));
    const card = screen.getByRole('heading', { name: 'This link has expired' }).parentElement as HTMLElement;
    expect(backgroundOf(card), 'consent message card').toBe(PUBLIC_FILL);
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
    expect(publicPageMocks.findUnique).not.toHaveBeenCalled();
  });

  it('PublicQuestionnairePage message card paints from --surface-container-lowest', async () => {
    publicPageMocks.validateTokenizedLink.mockResolvedValue({ ok: false, reason: 'consumed' });
    const { container } = render(await PublicQuestionnairePage({ params: Promise.resolve({ token: 'tok' }) }));
    const card = screen.getByRole('heading', { name: 'This link has already been used' }).parentElement as HTMLElement;
    expect(backgroundOf(card), 'questionnaire message card').toBe(PUBLIC_FILL);
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
    expect(publicPageMocks.findUnique).not.toHaveBeenCalled();
  });

  it('GuardianConsentForm "Consent recorded" status card paints from --surface-container-lowest', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const { container } = render(
      <GuardianConsentForm
        token="tok"
        prefill={{ studentFirstName: 'Sam', guardianName: 'Pat Doe', guardianEmail: 'pat@example.org', guardianPhone: '' }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('checkbox').closest('form') as HTMLFormElement);
    const status = await screen.findByRole('status');
    expect(within(status).getByRole('heading', { name: 'Consent recorded' })).toBeTruthy();
    expect(backgroundOf(status), 'consent recorded card').toBe(PUBLIC_FILL);
    expectNoLiteralSurfaceFallback(container);
    expectNoLegacyName(container);
  });
});

/*
 * ---------------------------------------------------------------------------
 * Border-token sweep (follow-up named in #2496's body; inspection finding 4).
 *
 * `--color-outline`, `--color-outline-variant` and the bare `--outline` are
 * declared by no stylesheet on either chain (css/main.css only defines
 * `--outline-variant`; css/portal-tokens.css only `--wa-border` /
 * `--wa-control-border`; @astryxdesign/core declares neither). Every site
 * written `var(--color-outline, #e2e2e2)` therefore painted its literal: a
 * light-grey hairline that stays light grey in dark mode. The replacements,
 * with no literal fallback:
 *
 *   - portal / admin chain: `--wa-border` for decorative card / panel /
 *     toolbar borders, `--wa-control-border` for the text controls (the kit's
 *     own input border, css/portal-kit.css `.wa-kit-input`).
 *   - root-layout routes (/consent/[token], /q/[token]): `--outline-variant`,
 *     the M3 hairline css/main.css defines for `html:not(.dark)` and `:root`;
 *     the disabled submit fill that reached for the outline token reads the
 *     same token. `.mobile-nav-toggle:hover` (css/main.css) read the
 *     never-defined `--outline`; it now reads `--color-on-surface-variant`,
 *     the stronger ink the base state's `--outline-variant` steps up to.
 *
 * Excluded on purpose: `var(--outline-variant, …)` and `var(--color-border, …)`
 * sites — both tokens are defined on every chain (main.css; Astryx `:root`
 * bridged by portal-tokens), so their literals never paint; emails/ (inline
 * CSS, no route chain).
 * ---------------------------------------------------------------------------
 */

/**
 * `var(--<border token>, <anything that is not another var()>)`. The family:
 * the never-defined `--color-outline`, `--color-outline-variant`, `--outline`,
 * `--border-color`, `--color-divider`, plus the kit borders `--wa-border` and
 * `--wa-control-border`. `--outline-variant` and `--color-border` stay outside
 * (defined on both chains; a literal there is dead weight, not a dark-mode bug).
 */
const BORDER_LITERAL_FALLBACK =
  /var\(\s*--(?:color-outline(?:-variant)?|outline|border-color|color-divider|wa-border|wa-control-border)\s*,(?!\s*var\()\s*[^)]+\)/i;
const NEVER_DEFINED_BORDER_TOKENS = ['--color-outline', '--color-outline-variant', '--outline'];
/**
 * A bare read of a never-defined border token, `var(--outline)` with no
 * fallback, is worse than a literal fallback: the declaration is invalid at
 * computed-value time, so a `border` shorthand unsets and the edge vanishes
 * (inspection of #2501, finding 1: the /admin/crons filter selects and the
 * /admin/employers?ui=legacy tabs underline painted no border at all).
 */
const NEVER_DEFINED_BORDER_READ = /var\(\s*--(?:color-outline(?:-variant)?|outline)\s*[,)]/i;
const PORTAL_BORDER = 'var(--wa-border)';
const PORTAL_CONTROL_BORDER = 'var(--wa-control-border)';
const ROOT_BORDER = 'var(--outline-variant)';
const ROOT_HOVER_BORDER = 'var(--color-on-surface-variant)';
const HAIRLINE = (token: string) => `1px solid ${token}`;

function borderOf(el: HTMLElement): string {
  return el.style.border || el.style.borderColor;
}

function expectNoLiteralBorderFallback(container: HTMLElement) {
  const styles = paintedStyles(container);
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) {
    expect(style, `literal fallback on a border token: ${style}`).not.toMatch(BORDER_LITERAL_FALLBACK);
    expect(style, `bare read of a border token defined nowhere: ${style}`).not.toMatch(NEVER_DEFINED_BORDER_READ);
  }
}

/** Every literal-fallback check at once: surface family, tonal scale and border family. */
function expectNoLiteralTokenFallback(container: HTMLElement) {
  expectNoLiteralSurfaceFallback(container);
  expectNoLiteralBorderFallback(container);
}

describe('border tokens resolve per scheme on the chains that load them', () => {
  it('--wa-border / --wa-control-border: pinned light and dark values, visible on --wa-surface in both schemes', () => {
    const tokens = portalChainTokens();
    for (const name of NEVER_DEFINED_BORDER_TOKENS) {
      expect(tokens.has(name), `${name} must stay undefined — the fix is to stop reading it`).toBe(false);
    }
    expect(resolve(PORTAL_BORDER, tokens, 'light')).toBe('#e8e8e8');
    expect(resolve(PORTAL_BORDER, tokens, 'dark')).toBe('#372830');
    expect(resolve(PORTAL_CONTROL_BORDER, tokens, 'light')).toBe('#858585');
    expect(resolve(PORTAL_CONTROL_BORDER, tokens, 'dark')).toBe('#aa808d');
    for (const border of [PORTAL_BORDER, PORTAL_CONTROL_BORDER]) {
      // WCAG non-text contrast for the interactive boundary; the decorative hairline only has to be visible.
      const floor = border === PORTAL_CONTROL_BORDER ? 3 : 1.1;
      for (const scheme of ['light', 'dark'] as const) {
        const edge = colorOf(border, tokens, scheme);
        expect(edge.a, `${border} ${scheme} alpha`).toBe(1);
        expect(resolve(border, tokens, scheme), `${border} must differ from the fill it edges (${scheme})`).not.toBe(
          resolve(FILL, tokens, scheme),
        );
        expect(contrast(edge, colorOf(FILL, tokens, scheme)), `${border} on --wa-surface (${scheme})`).toBeGreaterThanOrEqual(floor);
      }
    }
    // The decorative hairline is a dark hairline in dark mode, not the light grey the literals painted;
    // the control border deliberately lightens there to keep its 3:1 on the dark surface.
    const hairlineDark = luminance(colorOf(PORTAL_BORDER, tokens, 'dark'));
    expect(hairlineDark).toBeLessThan(luminance(colorOf(PORTAL_BORDER, tokens, 'light')));
    expect(hairlineDark).toBeLessThan(0.1);
  });

  it('--outline-variant / --color-on-surface-variant: pinned per scheme on the root-layout chain, distinct from the card fill', () => {
    const light = rootChainTokens('light');
    const dark = rootChainTokens('dark');
    for (const name of NEVER_DEFINED_BORDER_TOKENS) {
      expect(light.has(name), `${name} light`).toBe(false);
      expect(dark.has(name), `${name} dark`).toBe(false);
    }
    expect(light.has('--wa-border'), 'portal border must not leak onto the root chain').toBe(false);
    expect(resolve(ROOT_BORDER, light, 'light')).toBe('#debfc2');
    expect(resolve(ROOT_BORDER, dark, 'dark')).toBe('#584144');
    expect(resolve(ROOT_HOVER_BORDER, light, 'light')).toBe('#584144');
    expect(resolve(ROOT_HOVER_BORDER, dark, 'dark')).toBe('#debfc2');
    expect(luminance(colorOf(ROOT_BORDER, dark, 'dark'))).toBeLessThan(luminance(colorOf(ROOT_BORDER, light, 'light')));
    expect(luminance(colorOf(ROOT_BORDER, dark, 'dark'))).toBeLessThan(0.1);
    expect(resolve(ROOT_BORDER, light, 'light')).not.toBe(resolve(PUBLIC_FILL, light, 'light'));
    expect(resolve(ROOT_BORDER, dark, 'dark')).not.toBe(resolve(PUBLIC_FILL, dark, 'dark'));
    // Hover steps up from the hairline in both schemes (more contrast against the card, never less).
    for (const [scheme, tokens] of [['light', light], ['dark', dark]] as const) {
      const fill = colorOf(PUBLIC_FILL, tokens, scheme);
      expect(contrast(colorOf(ROOT_HOVER_BORDER, tokens, scheme), fill)).toBeGreaterThan(
        contrast(colorOf(ROOT_BORDER, tokens, scheme), fill),
      );
    }
  });

  it('.mobile-nav-toggle:hover (css/main.css) reads --color-on-surface-variant, not the undefined --outline', () => {
    const css = readCss('css/main.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const hover = css.match(/\.mobile-nav-toggle:hover\s*\{([^}]*)\}/g) ?? [];
    expect(hover.length).toBeGreaterThan(0);
    // Every hover block that borders from a token reads the on-surface-variant ink; none reads the undefined --outline.
    const tokenised = hover.filter((block) => /border-color:\s*var\(/.test(block));
    expect(tokenised.length).toBeGreaterThan(0);
    for (const block of tokenised) expect(block).toContain(`border-color: ${ROOT_HOVER_BORDER};`);
    for (const block of hover) expect(block).not.toMatch(/var\(\s*--outline\s*[,)]/);
  });
});

describe('no stylesheet on either route chain carries a literal fallback on a border token', () => {
  it.each([...PORTAL_CHAIN_SHEETS, ...ROOT_CHAIN_SHEETS, ...BORDER_MODULE_SHEETS])('%s', (sheet) => {
    const css = readCss(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = css.split('\n').filter((line) => BORDER_LITERAL_FALLBACK.test(line));
    expect(offenders, `${sheet} literal border fallbacks`).toEqual([]);
  });
});

describe('no stylesheet on either route chain reads a border token that is defined nowhere', () => {
  it.each([...PORTAL_CHAIN_SHEETS, ...ROOT_CHAIN_SHEETS, ...BORDER_MODULE_SHEETS])('%s', (sheet) => {
    const css = readCss(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = css.split('\n').filter((line) => NEVER_DEFINED_BORDER_READ.test(line));
    expect(offenders, `${sheet} bare reads of --outline / --color-outline(-variant)`).toEqual([]);
  });
});

describe('AdminCronsClient filters', () => {
  it('edges both filter selects with --wa-control-border, not the undefined --outline', () => {
    const { container } = render(<AdminCronsClient initialExecutions={[]} jobNames={['nightly-sync']} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    for (const select of selects) expect(borderOf(select), 'crons filter select border').toBe(HAIRLINE(PORTAL_CONTROL_BORDER));
    expectNoLiteralTokenFallback(container);
  });
});

describe('AdminEmployersPage ?ui=legacy tabs', () => {
  it('underlines the tabs row with --wa-border, not the undefined --color-outline-variant', async () => {
    const { container } = render(
      await AdminEmployersPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }),
    );
    const tabsRow = screen.getByRole('link', { name: 'All' }).parentElement as HTMLElement;
    expect(within(tabsRow).getAllByRole('link')).toHaveLength(4);
    expect(tabsRow.style.borderBottom, 'employers tabs underline').toBe(HAIRLINE(PORTAL_BORDER));
    expectNoLiteralTokenFallback(container);
  });
});

describe('TriageNudgePanel borders', () => {
  it('edges the open panel with --wa-border and the reply textarea with --wa-control-border', () => {
    const { container } = render(
      <TriageNudgePanel
        memberId="m-1"
        memberName="Ada Lovelace"
        templates={[{ id: 'check_in', label: 'Check in', preview: 'Hi Ada, checking in.' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send nudge' }));
    const panel = screen.getByText('Nudge Ada Lovelace').parentElement as HTMLElement;
    expect(borderOf(panel), 'nudge panel border').toBe(HAIRLINE(PORTAL_BORDER));
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    const textarea = screen.getByRole('textbox');
    expect(borderOf(textarea), 'nudge textarea border').toBe(HAIRLINE(PORTAL_CONTROL_BORDER));
    expectNoLiteralTokenFallback(container);
  });
});

describe('GoalsModule active goal card', () => {
  it('edges each goal with --wa-border over the --surface-container-lowest fill, no literal fallback on either', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        goals: [
          {
            id: 'g-1',
            goalType: 'build_resume',
            title: 'Finish the resume draft',
            description: null,
            currentMetricValue: 0,
            targetMetricValue: null,
            status: 'ACTIVE',
            steps: [{ id: 's-1', text: 'Add the last role', done: false }],
          },
        ],
        suggestions: [],
      }),
    );
    const { container } = render(<GoalsModule />);
    const title = await screen.findByText('Finish the resume draft');
    const card = title.closest('li') as HTMLElement;
    expect(card).not.toBeNull();
    expect(borderOf(card), 'goal card border').toBe(HAIRLINE(PORTAL_BORDER));
    expect(backgroundOf(card), 'goal card fill').toBe(PUBLIC_FILL);
    expectNoLiteralTokenFallback(container);
  });
});

describe('TrainingProgressClient borders', () => {
  it('edges the toolbar with --wa-border and the filter field with --wa-control-border', () => {
    const { container } = render(<TrainingProgressClient curriculumRows={[]} rawRows={[]} canonicalCatalog={[]} />);
    const toolbar = screen.getByRole('tablist', { name: 'Training progress view' }).parentElement as HTMLElement;
    expect(borderOf(toolbar), 'toolbar border').toBe(HAIRLINE(PORTAL_BORDER));
    const filter = screen.getByPlaceholderText(/filter by learner/i);
    expect(borderOf(filter), 'filter field border').toBe(HAIRLINE(PORTAL_CONTROL_BORDER));
    expectNoLiteralTokenFallback(container);
  });
});

describe('tokenized public pages: borders read --outline-variant (root layout, no portal tokens)', () => {
  beforeEach(() => {
    publicPageMocks.validateTokenizedLink.mockReset();
    publicPageMocks.findUnique.mockReset();
  });

  it('GuardianConsentPage message card', async () => {
    publicPageMocks.validateTokenizedLink.mockResolvedValue({ ok: false, reason: 'expired' });
    const { container } = render(await GuardianConsentPage({ params: Promise.resolve({ token: 'tok' }) }));
    const card = screen.getByRole('heading', { name: 'This link has expired' }).parentElement as HTMLElement;
    expect(borderOf(card), 'consent message card border').toBe(HAIRLINE(ROOT_BORDER));
    expectNoLiteralTokenFallback(container);
  });

  it('PublicQuestionnairePage message card', async () => {
    publicPageMocks.validateTokenizedLink.mockResolvedValue({ ok: false, reason: 'consumed' });
    const { container } = render(await PublicQuestionnairePage({ params: Promise.resolve({ token: 'tok' }) }));
    const card = screen.getByRole('heading', { name: 'This link has already been used' }).parentElement as HTMLElement;
    expect(borderOf(card), 'questionnaire message card border').toBe(HAIRLINE(ROOT_BORDER));
    expectNoLiteralTokenFallback(container);
  });

  it('GuardianConsentForm text fields and the "Consent recorded" card', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const { container } = render(
      <GuardianConsentForm
        token="tok"
        prefill={{ studentFirstName: 'Sam', guardianName: 'Pat Doe', guardianEmail: 'pat@example.org', guardianPhone: '' }}
      />,
    );
    const fields = screen.getAllByRole('textbox');
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(borderOf(field), 'consent form field border').toBe(HAIRLINE(ROOT_BORDER));
    expectNoLiteralTokenFallback(container);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('checkbox').closest('form') as HTMLFormElement);
    const status = await screen.findByRole('status');
    expect(borderOf(status), 'consent recorded card border').toBe(HAIRLINE(ROOT_BORDER));
    expectNoLiteralTokenFallback(container);
  });

  it('PublicEligibilityForm text fields and the disabled submit fill', () => {
    const { container } = render(
      <PublicEligibilityForm
        token="tok"
        prefill={{ firstName: '', lastName: '', phone: '', email: '', ageGroup: '', city: '', state: '', zip: '', county: '', primaryBarriers: [] }}
      />,
    );
    const fields = screen.getAllByRole('textbox');
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(borderOf(field), 'eligibility field border').toBe(HAIRLINE(ROOT_BORDER));
    const submit = screen.getByRole('button', { name: 'Submit eligibility info' });
    expect(submit).toBeDisabled();
    expect(backgroundOf(submit), 'disabled submit fill').toBe(ROOT_BORDER);
    expectNoLiteralTokenFallback(container);
  });
});

/*
 * ---------------------------------------------------------------------------
 * Inline `var(--surface-container-*, <literal>)` sweep on the portal chain (#2501 inspection,
 * note 3 follow-up). Same family as the tonal-scale guard above: the token is defined on every
 * route, so the literal never painted; each site now reads it bare. The four surfaces below
 * render here; the remaining sites (NotificationBell badge ring, InterestProfilerClient chip,
 * MapToUserActions rows, the /admin/coursera notice and the AI-efficacy chart bar) are the same
 * defined-token cleanup and are covered by the family regex whenever a spec renders them.
 * ---------------------------------------------------------------------------
 */
describe('inline surface-container fills read the token bare (portal chain)', () => {
  it('MemberFeedbackModal card paints --surface-container-lowest', () => {
    const { container } = render(<MemberFeedbackModal open onClose={() => {}} />);
    const card = screen.getByRole('dialog').firstElementChild as HTMLElement;
    expect(backgroundOf(card), 'feedback modal card').toBe(PUBLIC_FILL);
    expectNoLiteralTokenFallback(container);
    expectNoLegacyName(container);
  });

  it('DeleteAccountButton confirm dialog paints --surface-container-low', () => {
    const { container } = render(<DeleteAccountButton />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const card = screen.getByRole('heading', { name: 'Delete account permanently?' }).parentElement as HTMLElement;
    expect(backgroundOf(card), 'delete confirm card').toBe('var(--surface-container-low)');
    expectNoLiteralTokenFallback(container);
    expectNoLegacyName(container);
  });

  it('MemberFirstCertProgressBar track paints --surface-container-high', () => {
    const { container } = render(
      <MemberFirstCertProgressBar progress={{ percent: 40, stageLabel: 'Midway', isComplete: false, stepsComplete: 2, stepsTotal: 5 }} />,
    );
    const track = screen.getByRole('progressbar');
    expect(backgroundOf(track), 'progress track').toBe('var(--surface-container-high)');
    expectNoLiteralTokenFallback(container);
    expectNoLegacyName(container);
  });

  it('AdminMemberQuickSummary result box paints --surface-container-low', async () => {
    fetchMock.mockResolvedValue(Response.json({ summary: 'Ada is on track: two courses done this month.' }));
    const { container } = render(<AdminMemberQuickSummary memberId="member-1" />);
    fireEvent.click(screen.getByRole('button'));
    const text = await screen.findByText('Ada is on track: two courses done this month.');
    const box = text.closest('div[style]') as HTMLElement;
    expect(backgroundOf(box), 'quick summary box').toBe('var(--surface-container-low)');
    expectNoLiteralTokenFallback(container);
    expectNoLegacyName(container);
  });
});
