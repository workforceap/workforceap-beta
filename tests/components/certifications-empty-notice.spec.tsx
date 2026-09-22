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
 * Review 2026-09-22: My Certificates first said Coursera certificates "sync
 * automatically" when nothing did (#2471 made the copy truthful), and since
 * item 4 a Coursera-reported completion does create a pending certificate
 * (lib/certifications/pendingFromCompletion.ts). Both empty states (mobile
 * row and desktop PortalEmptyState) must describe that behaviour exactly:
 * pending on report, verified by the team before it counts, self-add still
 * available, and no claim that a certificate is earned or synced on its own.
 */
describe('My Certificates empty state', () => {
  it('mobile notice tells the member how certificates actually get recorded', () => {
    render(<CertificationsEmptyNotice />);
    const notice = screen.getByText(/No certificates are recorded yet/);
    expect(notice).toHaveTextContent(/When Coursera reports a completed course we add it here as a pending certificate/);
    expect(notice).toHaveTextContent(/our team verifies it before it counts as earned/);
    expect(notice).toHaveTextContent(/you can also add a certificate you earned elsewhere/);
    expect(notice).not.toHaveTextContent(/automatically/i);
    expect(notice).not.toHaveTextContent(/sync/i);
    expect(screen.getByRole('link', { name: 'My program' })).toHaveAttribute('href', MEMBER_PROGRAM_HREF);
  });

  it('desktop empty state uses the same truthful description', () => {
    render(<PortalEmptyState title="No certificates yet" description={CERTIFICATES_EMPTY_DESCRIPTION} />);
    const description = screen.getByText(/No certificates are recorded yet/);
    expect(description).toHaveTextContent(/pending certificate; our team verifies it before it counts as earned/);
    expect(description).toHaveTextContent(/Completed Coursera courses show in My program, and you can also add a certificate you earned elsewhere/);
    expect(description).not.toHaveTextContent(/automatically/i);
    expect(description).not.toHaveTextContent(/sync/i);
  });
});
