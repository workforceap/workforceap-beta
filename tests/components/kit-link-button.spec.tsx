import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import { CounselorHomeKit } from '@/components/portal/kit/pages/counselor/CounselorHomeKit';
import { UsersKit } from '@/components/portal/kit/pages/admin-subviews/UsersKit';
import { PlacementsKit } from '@/components/portal/kit/pages/admin-subviews/PlacementsKit';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';

/**
 * WAP-252: a kit navigation action is ONE link, not an Astryx <Button> nested
 * in an Astryx <Link>. The nested form rendered <a><button>, which is invalid
 * HTML and gave keyboard and screen-reader users two tab stops with the same
 * name for every action.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Action = { name: string; href: string };

/** Each action is exactly one link with this name and href, and no same-named button. */
function expectSingleLinks(actions: Action[]) {
  for (const { name, href } of actions) {
    const links = screen.getAllByRole('link', { name });
    for (const link of links) expect(link).toHaveAttribute('href', href);
    expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
    for (const link of links) expect(link.querySelector('button, [role="button"]')).toBeNull();
  }
}

function renderNoNesting(ui: ReactElement) {
  const view = render(ui);
  expect(view.container.querySelectorAll('a button')).toHaveLength(0);
  expect(view.container.querySelectorAll('a [role="button"], a a')).toHaveLength(0);
  return view;
}

describe('kit navigation actions are one link each (WAP-252)', () => {
  it('CounselorHomeKit: each queue row "View" is one link to the member', () => {
    renderNoNesting(
      <CounselorHomeKit
        firstName="Dana"
        assignedCount={2}
        queueTotal={2}
        queueRows={[
          { memberId: 'm-1', memberName: 'Riley Park', bucket: 'critical', blockerReason: 'No activity 10+ days' },
          { memberId: 'm-2', memberName: 'Jordan Lee', bucket: 'warning', href: '/counselor/students/m-2?tab=messages' },
        ]}
      />,
    );
    const views = screen.getAllByRole('link', { name: 'View' });
    expect(views.map((a) => a.getAttribute('href'))).toEqual([
      '/counselor/students/m-1',
      '/counselor/students/m-2?tab=messages',
    ]);
    expect(screen.queryAllByRole('button', { name: 'View' })).toHaveLength(0);
  });

  it('UsersKit: "All accounts" and "Invite staff" are one link each', () => {
    renderNoNesting(<UsersKit users={[]} total={0} />);
    expectSingleLinks([
      { name: 'All accounts', href: '/admin/users?ui=legacy' },
      { name: 'Invite staff', href: '/admin/invites/new' },
    ]);
    expect(screen.getAllByRole('link', { name: 'All accounts' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Invite staff' })).toHaveLength(1);
  });

  it('PlacementsKit: the three header actions are one link each', () => {
    renderNoNesting(<PlacementsKit placements={[]} ytd={0} avgWage="—" retention90d="—" toConfirm={0} total={0} />);
    const actions = [
      { name: 'Record placement', href: '/admin/placements/new' },
      { name: 'Retention decisions due', href: '/admin/placements/retention' },
      { name: 'Open table view', href: '/admin/placements?ui=legacy' },
    ];
    expectSingleLinks(actions);
    for (const { name } of actions) expect(screen.getAllByRole('link', { name })).toHaveLength(1);
  });

  it('VoiceStudioKit resume tab: analysis, rewrite and fix actions are single links', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderNoNesting(
      <VoiceStudioKit
        initialTab="studio"
        resumeStudio={{
          hasResume: true,
          structuralScore: 72,
          issues: [{ title: 'Add numbers to your bullets', detail: 'Two bullets have no measurable result.' }],
        }}
      />,
    );
    expectSingleLinks([
      { name: 'Open full analysis', href: '/dashboard/ai-tools/resume-studio?view=score' },
      { name: 'Run full analysis', href: '/dashboard/ai-tools/resume-studio?view=score' },
      { name: 'Rewrite a bullet', href: '/dashboard/ai-tools/resume-rewriter' },
      { name: 'Fix with AI', href: '/dashboard/ai-tools/resume-rewriter' },
    ]);
  });

  it('VoiceStudioKit resume tab without a resume: "Add résumé" is one link', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderNoNesting(<VoiceStudioKit initialTab="studio" resumeStudio={{ hasResume: false }} />);
    expectSingleLinks([{ name: 'Add résumé', href: '/dashboard/ai-tools/resume-studio' }]);
  });
});

describe('KitLinkButton', () => {
  it('renders one focusable link, no button, with the kit focus ring and Astryx button styling', () => {
    const { container } = render(
      <KitLinkButton href="/admin/placements/new" label="Record placement" variant="primary" icon={<svg data-testid="lead-icon" aria-hidden />} />,
    );
    const link = screen.getByRole('link', { name: 'Record placement' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/admin/placements/new');
    expect(container.querySelectorAll('a, button')).toHaveLength(1);
    expect(link).toHaveClass('wa-kit-focus');
    expect(link).toHaveAttribute('data-variant', 'primary');
    expect(link).toHaveAttribute('data-size', 'sm');
    // The leading icon sits inside the link, before the label.
    const icon = screen.getByTestId('lead-icon');
    expect(link).toContainElement(icon);
    expect(icon.compareDocumentPosition(screen.getByText('Record placement')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('defaults to the secondary variant at size sm, and passes size md, className, style and data-* through', () => {
    render(
      <KitLinkButton href="/admin/users?ui=legacy" label="All accounts" size="md" className="caller" style={{ minHeight: 44 }} data-tour="all-accounts" />,
    );
    const link = screen.getByRole('link', { name: 'All accounts' });
    expect(link).toHaveAttribute('data-variant', 'secondary');
    expect(link).toHaveAttribute('data-size', 'md');
    expect(link).toHaveClass('wa-kit-focus', 'caller');
    expect(link).toHaveStyle({ minHeight: '44px' });
    expect(link).toHaveAttribute('data-tour', 'all-accounts');
  });
});
