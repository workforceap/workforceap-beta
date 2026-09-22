import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { MemberMentorsKit } from '@/components/portal/kit/pages/member/MemberMentorsKit';
import { MentorsDirectoryKit } from '@/components/portal/kit/pages/admin-subviews/MentorsDirectoryKit';
import { MENTORS_ADMIN_EMPTY, MENTORS_MEMBER_EMPTY } from '@/lib/member/mentorsEmptyState';

/**
 * Both mentors surfaces render the shared empty copy through KitEmptyState
 * when there is nothing to list. Rendering the kits (instead of reading
 * their source) is what proves the copy actually reaches the screen.
 */

afterEach(cleanup);

describe('member mentors kit empty state', () => {
  it('renders the shared member empty copy and CTAs, never "Check back soon"', () => {
    const { container } = render(<MemberMentorsKit mentors={[]} />);

    expect(screen.getByText(MENTORS_MEMBER_EMPTY.title)).toBeInTheDocument();
    expect(screen.getByText(MENTORS_MEMBER_EMPTY.description)).toBeInTheDocument();
    expect(screen.getByText(MENTORS_MEMBER_EMPTY.statusLabel)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: MENTORS_MEMBER_EMPTY.primaryCta.label })).toHaveAttribute(
      'href',
      MENTORS_MEMBER_EMPTY.primaryCta.href,
    );
    expect(screen.getByRole('link', { name: MENTORS_MEMBER_EMPTY.secondaryCta.label })).toHaveAttribute(
      'href',
      MENTORS_MEMBER_EMPTY.secondaryCta.href,
    );
    expect(container.textContent).not.toMatch(/check back soon/i);
  });
});

describe('admin mentors directory empty state', () => {
  it('renders the shared admin empty copy with the apply-path CTA', () => {
    render(<MentorsDirectoryKit mentors={[]} />);

    expect(screen.getByText(MENTORS_ADMIN_EMPTY.title)).toBeInTheDocument();
    expect(screen.getByText(MENTORS_ADMIN_EMPTY.description)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: MENTORS_ADMIN_EMPTY.primaryCta.label })).toHaveAttribute(
      'href',
      MENTORS_ADMIN_EMPTY.primaryCta.href,
    );
  });
});
