import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MentorsDirectoryKit, type MentorCard } from '@/components/portal/kit/pages/admin-subviews/MentorsDirectoryKit';

/**
 * WAP-193 slice 1: approving and deactivating mentors used to exist only in
 * the ?ui=legacy view. The default kit directory now posts each card's review
 * action to the page's server action.
 */

afterEach(cleanup);

const mentor = (over: Partial<MentorCard>): MentorCard => ({
  id: 'm1',
  name: 'Maria Gonzalez',
  initials: 'MG',
  role: 'RN',
  company: "St. David's",
  mentees: 0,
  isActive: false,
  isApproved: false,
  ...over,
});

const MENTORS: MentorCard[] = [
  mentor({ id: 'pending', name: 'Pending Person', isApproved: false, isActive: false }),
  mentor({ id: 'active', name: 'Active Person', isApproved: true, isActive: true }),
  mentor({ id: 'inactive', name: 'Inactive Person', isApproved: true, isActive: false }),
];

function formFields(button: HTMLElement) {
  const form = button.closest('form');
  expect(form).not.toBeNull();
  return {
    mentorId: (form!.querySelector('input[name="mentorId"]') as HTMLInputElement | null)?.value,
    action: (button as HTMLButtonElement).value,
  };
}

describe('MentorsDirectoryKit review actions (WAP-193)', () => {
  it('offers approve, deactivate and reactivate by mentor state', () => {
    render(<MentorsDirectoryKit mentors={MENTORS} mentorAction={vi.fn(async () => {})} />);

    expect(formFields(screen.getByRole('button', { name: 'Approve Pending Person' }))).toEqual({
      mentorId: 'pending',
      action: 'approve',
    });
    expect(formFields(screen.getByRole('button', { name: 'Deactivate Active Person' }))).toEqual({
      mentorId: 'active',
      action: 'deactivate',
    });
    expect(formFields(screen.getByRole('button', { name: 'Reactivate Inactive Person' }))).toEqual({
      mentorId: 'inactive',
      action: 'activate',
    });
  });

  it('renders no review controls without a server action (showcase use)', () => {
    render(<MentorsDirectoryKit mentors={MENTORS} />);
    expect(screen.queryByRole('button', { name: /^(Approve|Deactivate|Reactivate) / })).toBeNull();
  });
});
