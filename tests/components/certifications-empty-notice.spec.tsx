import type { AnchorHTMLAttributes } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

import CertificationsEmptyNotice, { CERTIFICATES_EMPTY_DESCRIPTION } from '@/components/portal/CertificationsEmptyNotice';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

afterEach(cleanup);

/**
 * Review 2026-09-22: My Certificates said Coursera certificates "sync
 * automatically", but no code path writes a UserCertification from a course
 * completion. Both empty states (mobile row and desktop PortalEmptyState) must
 * describe what happens today: members add, the team verifies, course
 * completions live in My program.
 */
describe('My Certificates empty state', () => {
  it('mobile notice tells the member how certificates actually get recorded', () => {
    render(<CertificationsEmptyNotice />);
    const notice = screen.getByText(/No certificates are recorded yet/);
    expect(notice).toHaveTextContent(/our team verifies it before it counts as earned/);
    expect(notice).toHaveTextContent(/not added here automatically yet/);
    expect(notice).not.toHaveTextContent(/sync automatically/i);
    expect(screen.getByRole('link', { name: 'My program' })).toHaveAttribute('href', MEMBER_PROGRAM_HREF);
  });

  it('desktop empty state uses the same truthful description', () => {
    render(<PortalEmptyState title="No certificates yet" description={CERTIFICATES_EMPTY_DESCRIPTION} />);
    const description = screen.getByText(/No certificates are recorded yet/);
    expect(description).toHaveTextContent(/Completed Coursera courses show in My program and are not added here automatically yet/);
    expect(description).not.toHaveTextContent(/sync automatically/i);
  });
});
