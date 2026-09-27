import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { MEMBERS_MANAGEMENT_HREF, TRAINING_PROGRESS_LEGACY_HREF } from '@/lib/admin/studentsRosterView';

afterEach(cleanup);

/**
 * WAP-277: the roster's view switcher rendered each action as an Astryx
 * <Button> inside an <AstryxLink>, i.e. invalid <a><button> with two tab
 * stops. Each action is now one link that looks like a button.
 */
describe('StudentsRosterKit view nav (WAP-277)', () => {
  it.each([
    ['roster', [['Training progress', null], ['Management hub', MEMBERS_MANAGEMENT_HREF]]],
    ['training', [['Roster', null], ['Detailed view', TRAINING_PROGRESS_LEGACY_HREF]]],
  ] as const)('%s view: every action is a single link, no <a><button>', (view, actions) => {
    const { container } = render(<StudentsRosterKit view={view} students={[]} total={0} />);
    expect(container.querySelectorAll('a button, button a').length).toBe(0);

    const nav = screen.getByRole('navigation', { name: 'Roster views' });
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent?.trim())).toEqual(actions.map(([label]) => label));
    for (const [label, href] of actions) {
      const link = within(nav).getByRole('link', { name: label });
      if (href) expect(link.getAttribute('href')).toBe(href);
      else expect(link.getAttribute('href')).toBeTruthy();
    }
  });
});
