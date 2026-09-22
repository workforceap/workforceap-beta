import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  colorOf,
  contrast,
  loadRootTokens,
  readCss,
  resolve,
} from '@/lib/ui/cssTokenContrast.test-helpers';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

import MentorSessionForm from '@/components/portal/MentorSessionForm';
import ElevatorPitchDeploymentLogger from '@/components/portal/tools/ElevatorPitchDeploymentLogger';
import AdminMemberWioaReviewPanel from '@/components/admin/AdminMemberWioaReviewPanel';
import AdminMemberEnrollmentFundingForm from '@/components/admin/AdminMemberEnrollmentFundingForm';
import AdminMemberSkillCheckpointPanel from '@/components/admin/AdminMemberSkillCheckpointPanel';
import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

/**
 * Review of #2478 (item 4) found nine portal/admin sites still painting from
 * `--color-surface`, a custom property no stylesheet on those routes defines
 * (css/main.css, css/wa-brand-tokens.css, css/portal-tokens.css and the rest
 * of the (portal)/admin chain only declare `--color-surface-*` siblings, never
 * the bare name). Used without a fallback, the declaration is invalid at
 * computed-value time and the fill renders transparent: inputs, a modal, a
 * popover and history rows all showed whatever sat behind them.
 *
 * Those sites now read `--wa-surface`, the kit's plain surface token. This spec
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
